import { beforeEach, expect, it } from 'vitest'
import { inflateRawSync } from 'node:zlib'
import { databaseFixture } from './database'
import { signedSamlResponse, encodedSaml, publicKey, persistent, samlIssuer } from './saml-fixture'
import { startSamlTransaction, completeSamlTransaction } from '../../../src/cloudflare/stage0/auth/saml/transactions'
import { issueSession, resolveSession } from '../../../src/cloudflare/stage0/auth/sessions'
import { getOrganization } from '../../../src/cloudflare/stage0/access/organizations'
import type { Principal } from '../../../src/cloudflare/stage0/contracts'
const settings = { connectionId: 'saml-a', connectionVersion: 1, organizationId: 'org-a', issuer: samlIssuer, audience: 'https://ovelle.example.test/saml', signingKeys: [publicKey], nameIdFormat: persistent, entryPoint: 'https://identity.example.test/sso' }
const key = new Uint8Array(32).fill(17)
let f: Awaited<ReturnType<typeof databaseFixture>>, now: number
beforeEach(async () => {
  f = await databaseFixture(); now = Date.now(); f.ctx.clock.now = () => now
  await f.execute("INSERT INTO identity_connections(id,organization_id,protocol,provider,issuer,created_at) VALUES('saml-a','org-a','saml','enterprise_saml',?,?)", samlIssuer, now).run()
  await f.execute("INSERT INTO external_identities(id,account_id,connection_id,issuer,subject,saml_name_id_format,created_at) VALUES('linked','d','saml-a',?,'stable-person-001',?,?)", samlIssuer, persistent, now).run()
})
async function flow(purpose: 'login' | 'link' = 'login', principal?: Principal) {
  const start = await startSamlTransaction(f.ctx, settings, { purpose, principal, ip: '127.0.0.1' }, key)
  const url = new URL(start.authorizationUrl), xml = inflateRawSync(Buffer.from(url.searchParams.get('SAMLRequest')!, 'base64')).toString()
  const requestId = /\bID="([^"]+)"/.exec(xml)![1]
  const response = (extra: Partial<Parameters<typeof signedSamlResponse>[0]> = {}) => encodedSaml(signedSamlResponse({ now, callback: f.ctx.config.origin + '/api/v1/auth/saml/callback', audience: settings.audience, requestId, responseId: '_response-' + requestId, assertionId: '_assertion-' + requestId, ...extra }))
  const input = { relayState: url.searchParams.get('RelayState')!, browserBinding: start.browserBinding, response: response() }
  return { start, input, response, requestId }
}
const finish = (input: Awaited<ReturnType<typeof flow>>['input']) => completeSamlTransaction(f.ctx, settings, input, '127.0.0.1', key)
it('binds an actual signed callback and atomically persists a bounded SSO session and two replay records', async () => {
  const attempt = await flow(), result = await finish(attempt.input)
  expect(result.kind).toBe('signed_in')
  if (result.kind !== 'signed_in') throw new Error('Expected login')
  expect(await resolveSession(f.ctx, result.session.token, 'browser')).toMatchObject({ accountId: 'd', method: 'saml', assurance: 'authenticated', connectionId: 'saml-a', passkeyVerifiedAt: null })
  expect(await f.execute('SELECT count(*) AS n FROM saml_replays').first('n')).toBe(2)
  expect(await f.execute('SELECT consumed_at FROM saml_transactions').first('consumed_at')).toBe(now)
  expect(await f.execute("SELECT count(*) AS n FROM audit_events WHERE action='session.issue'").first('n')).toBe(1)
  const persisted = JSON.stringify((await f.execute('SELECT * FROM saml_transactions').all()).results)
  for (const secret of [attempt.input.relayState, attempt.input.browserBinding, attempt.input.response]) expect(persisted).not.toContain(secret)
  await expect(finish(attempt.input)).rejects.toThrow()
})
it('allows exactly one concurrent callback to create a session and audit', async () => {
  const attempt = await flow()
  const results = await Promise.allSettled([finish(attempt.input), finish(attempt.input)])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(await f.execute('SELECT count(*) AS n FROM sessions').first('n')).toBe(1)
  expect(await f.execute('SELECT count(*) AS n FROM audit_events').first('n')).toBe(1)
})
it('rejects swapped browser, RelayState and signed request evidence without consuming the valid request', async () => {
  const a = await flow(), b = await flow()
  for (const input of [{ ...a.input, browserBinding: b.input.browserBinding }, { ...a.input, relayState: b.input.relayState }, { ...a.input, response: b.input.response }]) await expect(finish(input)).rejects.toThrow()
  expect((await finish(a.input)).kind).toBe('signed_in')
})
it('does not create or email-match an account or grant organization membership for an unlinked subject', async () => {
  const attempt = await flow()
  expect((await finish({ ...attempt.input, response: attempt.response({ subject: 'a@example.test' }) })).kind).toBe('enrollment')
  expect(await f.execute('SELECT count(*) AS n FROM accounts').first('n')).toBe(4)
  expect(await f.execute('SELECT count(*) AS n FROM sessions').first('n')).toBe(0)
  expect(await f.execute('SELECT consumed_at FROM saml_transactions').first('consumed_at')).toBe(now)
  expect(await f.execute('SELECT count(*) AS n FROM saml_enrollments').first('n')).toBe(1)
})
it('requires a fresh existing account and fresh new IdP authentication for explicit linking', async () => {
  const weak = await issueSession(f.ctx, { accountId: 'a', method: 'password' }, 'browser')
  await expect(flow('link', { ...weak.principal, assurance: 'passkey', passkeyVerifiedAt: now })).rejects.toMatchObject({ code: 'forbidden' })
  const strong = await issueSession(f.ctx, { accountId: 'a', method: 'passkey' }, 'browser')
  const attempt = await flow('link', strong.principal)
  await expect(finish({ ...attempt.input, response: attempt.response({ subject: 'new-subject', authnInstant: now - 300_000 }) })).rejects.toThrow()
  const result = await finish({ ...attempt.input, response: attempt.response({ subject: 'new-subject' }) })
  expect(result.kind).toBe('linked')
  expect(await f.execute("SELECT account_id FROM external_identities WHERE subject='new-subject'").first('account_id')).toBe('a')
  expect(await f.execute("SELECT count(*) AS n FROM audit_events WHERE action='identity.link'").first('n')).toBe(1)
})
it('never moves a foreign linked identity or revives a disabled one during linking', async () => {
  const principal = (await issueSession(f.ctx, { accountId: 'a', method: 'passkey' }, 'browser')).principal
  const attempt = await flow('link', principal)
  await expect(finish(attempt.input)).rejects.toMatchObject({ code: 'conflict' })
  await f.execute("UPDATE external_identities SET disabled_at=?,version=2 WHERE id='linked'", now).run()
  await expect(finish(attempt.input)).rejects.toMatchObject({ code: 'conflict' })
  expect(await f.execute("SELECT account_id FROM external_identities WHERE id='linked'").first('account_id')).toBe('d')
})
it('rolls back request consumption and replay records when session audit fails', async () => {
  const attempt = await flow()
  await f.execute("CREATE TRIGGER fail_saml_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT,'fixture_audit_failure'); END").run()
  await expect(finish(attempt.input)).rejects.toThrow('fixture_audit_failure')
  expect(await f.execute('SELECT consumed_at FROM saml_transactions').first('consumed_at')).toBeNull()
  expect(await f.execute('SELECT count(*) AS n FROM saml_replays').first('n')).toBe(0)
  expect(await f.execute('SELECT count(*) AS n FROM sessions').first('n')).toBe(0)
  await f.execute('DROP TRIGGER fail_saml_audit').run()
  expect((await finish(attempt.input)).kind).toBe('signed_in')
})
it.each(['audience', 'issuer', 'keys', 'endpoint', 'organization'] as const)('rejects a substituted reviewed %s profile even without a version bump', async kind => {
  const attempt = await flow()
  const changed = kind === 'audience' ? { audience: 'https://foreign.example.test/sp' } : kind === 'issuer' ? { issuer: 'https://foreign.example.test/idp' }
    : kind === 'keys' ? { signingKeys: [publicKey, publicKey] } : kind === 'endpoint' ? { entryPoint: 'https://identity.example.test/other' } : { organizationId: 'org-b' }
  await expect(completeSamlTransaction(f.ctx, { ...settings, ...changed }, attempt.input, '127.0.0.1', key)).rejects.toMatchObject({ code: 'unauthenticated' })
  expect(await f.execute('SELECT count(*) AS n FROM sessions').first('n')).toBe(0)
})
it.each(['connection-disabled', 'connection-version', 'identity-disabled', 'identity-version', 'account-disabled', 'account-epoch'] as const)('rechecks %s atomically immediately before issuance', async change => {
  const attempt = await flow(), db = f.ctx.db
  let batches = 0
  f.ctx.db = new Proxy(db, { get(target, property) {
    if (property === 'batch') return async (statements: Parameters<typeof db.batch>[0]) => {
      if (++batches === 2) {
        if (change.startsWith('connection')) await f.execute("UPDATE identity_connections SET enabled=?,version=2 WHERE id='saml-a'", change === 'connection-disabled' ? 0 : 1).run()
        else if (change.startsWith('identity')) await f.execute("UPDATE external_identities SET version=2,disabled_at=? WHERE id='linked'", change === 'identity-disabled' ? now : null).run()
        else if (change === 'account-disabled') await f.execute("UPDATE accounts SET disabled_at=? WHERE id='d'", now).run()
        else await f.execute("UPDATE accounts SET security_version=security_version+1 WHERE id='d'").run()
      }
      return target.batch(statements)
    }
    const value = Reflect.get(target, property, target)
    return typeof value === 'function' ? value.bind(target) : value
  } })
  await expect(finish(attempt.input)).rejects.toMatchObject({ code: 'conflict' })
  expect(await f.execute('SELECT count(*) AS n FROM sessions').first('n')).toBe(0)
  expect(await f.execute('SELECT count(*) AS n FROM saml_replays').first('n')).toBe(0)
  expect(await f.execute('SELECT consumed_at FROM saml_transactions').first('consumed_at')).toBeNull()
})
it('retains the IdP authentication time and independent session deadline through issuance and expiry', async () => {
  const attempt = await flow()
  const result = await finish({ ...attempt.input, response: attempt.response({ authnInstant: now - 60_000, beforeSign: xml => xml.replace('<saml:AuthnStatement ', `<saml:AuthnStatement SessionNotOnOrAfter="${new Date(now + 30_000).toISOString()}" `) }) })
  if (result.kind !== 'signed_in') throw new Error('Expected login')
  expect(result.expiresAt).toBe(now + 30_000)
  expect(result.session.principal.authenticatedAt).toBe(now - 60_000)
  now += 30_000
  await expect(resolveSession(f.ctx, result.session.token, 'browser')).rejects.toMatchObject({ code: 'unauthenticated' })
})
it('fails an expired request at the exclusive boundary without consuming evidence or issuing a session', async () => {
  const attempt = await flow()
  now += 300_000
  await expect(finish(attempt.input)).rejects.toMatchObject({ code: 'unauthenticated' })
  expect(await f.execute('SELECT count(*) AS n FROM saml_replays').first('n')).toBe(0)
})
it.each(['response', 'assertion'] as const)('prevents reuse of an issuer %s ID under a fresh signed request', async kind => {
  const first = await flow()
  expect((await finish(first.input)).kind).toBe('signed_in')
  const second = await flow()
  const duplicate = kind === 'response' ? { responseId: '_response-' + first.requestId } : { assertionId: '_assertion-' + first.requestId }
  await expect(finish({ ...second.input, response: second.response(duplicate) })).rejects.toMatchObject({ code: 'conflict' })
  expect(await f.execute('SELECT count(*) AS n FROM sessions').first('n')).toBe(1)
  expect(await f.execute('SELECT min(expires_at-created_at) AS n FROM saml_replays').first('n')).toBe(300_000)
})
it('keeps issuer replay records across connections and does not let an organization swap relabel a request', async () => {
  const first = await flow()
  await finish(first.input)
  await f.execute("INSERT INTO identity_connections(id,organization_id,protocol,provider,issuer,created_at) VALUES('saml-b','org-b','saml','enterprise_saml',?,?)", samlIssuer, now).run()
  await f.execute("INSERT INTO external_identities(id,account_id,connection_id,issuer,subject,saml_name_id_format,created_at) VALUES('linked-b','b','saml-b',?,'stable-person-001',?,?)", samlIssuer, persistent, now).run()
  const other = { ...settings, connectionId: 'saml-b', organizationId: 'org-b' }
  const started = await startSamlTransaction(f.ctx, other, { purpose: 'login', ip: '127.0.0.1' }, key)
  const url = new URL(started.authorizationUrl), xml = inflateRawSync(Buffer.from(url.searchParams.get('SAMLRequest')!, 'base64')).toString(), requestId = /\bID="([^"]+)"/.exec(xml)![1]
  const response = encodedSaml(signedSamlResponse({ now, callback: f.ctx.config.origin + '/api/v1/auth/saml/callback', audience: other.audience, requestId, responseId: '_new-response', assertionId: '_assertion-' + first.requestId }))
  await expect(completeSamlTransaction(f.ctx, other, { relayState: url.searchParams.get('RelayState')!, browserBinding: started.browserBinding, response }, '127.0.0.1', key)).rejects.toMatchObject({ code: 'conflict' })
  expect(await f.execute('SELECT count(*) AS n FROM sessions').first('n')).toBe(1)
})
it.each(['revoke', 'promote'] as const)('rechecks linking source %s inside the final batch', async change => {
  const source = await issueSession(f.ctx, { accountId: 'd', method: 'password' }, 'browser')
  const attempt = await flow('link', source.principal), db = f.ctx.db
  let batches = 0
  f.ctx.db = new Proxy(db, { get(target, property) {
    if (property === 'batch') return async (statements: Parameters<typeof db.batch>[0]) => {
      if (++batches === 2) {
        if (change === 'promote') await f.execute("UPDATE organization_memberships SET preset='admin',version=version+1 WHERE id='md-a'").run()
        else await f.execute('UPDATE sessions SET revoked_at=? WHERE id=?', now, source.principal.sessionId).run()
      }
      return target.batch(statements)
    }
    const value = Reflect.get(target, property, target)
    return typeof value === 'function' ? value.bind(target) : value
  } })
  await expect(finish({ ...attempt.input, response: attempt.response({ subject: 'new-subject' }) })).rejects.toMatchObject({ code: 'conflict' })
  expect(await f.execute("SELECT count(*) AS n FROM external_identities WHERE subject='new-subject'").first('n')).toBe(0)
})
it('bounds callback parsing attempts and leaves replayed or malformed evidence unprivileged', async () => {
  const attempt = await flow()
  for (let index = 0; index < 5; index++) await expect(finish({ ...attempt.input, response: encodedSaml('<malformed>') })).rejects.toMatchObject({ code: 'unauthenticated' })
  await expect(finish(attempt.input)).rejects.toMatchObject({ code: 'rate_limited' })
  expect(await f.execute('SELECT count(*) AS n FROM sessions').first('n')).toBe(0)
})
it('limits durable starts before creating additional pending requests', async () => {
  for (let index = 0; index < 5; index++) await flow()
  await expect(flow()).rejects.toMatchObject({ code: 'rate_limited' })
  expect(await f.execute('SELECT count(*) AS n FROM saml_transactions').first('n')).toBe(5)
})
it('rejects linking when existing account freshness ends during preparation of the final write', async () => {
  now -= 299_000
  const source = await issueSession(f.ctx, { accountId: 'd', method: 'password' }, 'browser')
  now += 299_000
  const attempt = await flow('link', source.principal), db = f.ctx.db
  f.ctx.db = new Proxy(db, { get(target, property) {
    if (property === 'prepare') return (sql: string) => {
      if (sql.startsWith('INSERT INTO external_identities')) now += 2000
      return target.prepare(sql)
    }
    const value = Reflect.get(target, property, target)
    return typeof value === 'function' ? value.bind(target) : value
  } })
  await expect(finish({ ...attempt.input, response: attempt.response({ subject: 'new-subject' }) })).rejects.toThrow()
  expect(await f.execute("SELECT count(*) AS n FROM external_identities WHERE subject='new-subject'").first('n')).toBe(0)
  expect(await f.execute('SELECT consumed_at FROM saml_transactions').first('consumed_at')).toBeNull()
})
it('retains organization SSO boundaries and never treats provider identity as organization authority', async () => {
  const ordinary = await issueSession(f.ctx, { accountId: 'd', method: 'password' }, 'browser')
  const attempt = await flow(), result = await finish(attempt.input)
  if (result.kind !== 'signed_in') throw new Error('Expected login')
  await f.execute("UPDATE organizations SET required_connection_id='saml-a',version=version+1 WHERE id='org-a'").run()
  await expect(getOrganization(f.ctx, ordinary.principal, 'org-a')).rejects.toMatchObject({ code: 'not_found' })
  expect((await getOrganization(f.ctx, result.session.principal, 'org-a')).name).toBe('A')
  await expect(getOrganization(f.ctx, result.session.principal, 'org-b')).rejects.toMatchObject({ code: 'not_found' })
  await f.execute("UPDATE organization_memberships SET state='revoked',version=version+1 WHERE id='md-a'").run()
  await expect(getOrganization(f.ctx, result.session.principal, 'org-a')).rejects.toMatchObject({ code: 'not_found' })
})
it('makes simultaneous linking of one exact subject to different accounts admit one winner', async () => {
  const a = (await issueSession(f.ctx, { accountId: 'a', method: 'passkey' }, 'browser')).principal
  const b = (await issueSession(f.ctx, { accountId: 'b', method: 'passkey' }, 'browser')).principal
  const left = await flow('link', a), right = await flow('link', b)
  const outcomes = await Promise.allSettled([finish({ ...left.input, response: left.response({ subject: 'contested-subject' }) }), finish({ ...right.input, response: right.response({ subject: 'contested-subject' }) })])
  expect(outcomes.filter(value => value.status === 'fulfilled')).toHaveLength(1)
  expect(await f.execute("SELECT count(*) AS n FROM external_identities WHERE subject='contested-subject'").first('n')).toBe(1)
  expect(await f.execute("SELECT count(*) AS n FROM audit_events WHERE action='identity.link'").first('n')).toBe(1)
  expect(await f.execute('SELECT count(*) AS n FROM saml_replays').first('n')).toBe(2)
})
it('does not duplicate an already linked own identity but still consumes the new request once', async () => {
  const source = await issueSession(f.ctx, { accountId: 'd', method: 'password' }, 'browser')
  const attempt = await flow('link', source.principal)
  expect(await finish(attempt.input)).toMatchObject({ kind: 'linked', identity: { id: 'linked' } })
  expect(await f.execute('SELECT count(*) AS n FROM external_identities').first('n')).toBe(1)
  expect(await f.execute('SELECT consumed_at FROM saml_transactions').first('consumed_at')).toBe(now)
  await expect(finish(attempt.input)).rejects.toThrow()
})
it('does not issue a session if its signed deadline passes while preparing credentials', async () => {
  const attempt = await flow(), db = f.ctx.db
  const response = attempt.response({ beforeSign: xml => xml.replace('<saml:AuthnStatement ', `<saml:AuthnStatement SessionNotOnOrAfter="${new Date(now + 30_000).toISOString()}" `) })
  f.ctx.db = new Proxy(db, { get(target, property) {
    if (property === 'prepare') return (sql: string) => { if (sql.startsWith('INSERT INTO sessions')) now += 30_000; return target.prepare(sql) }
    const value = Reflect.get(target, property, target)
    return typeof value === 'function' ? value.bind(target) : value
  } })
  await expect(finish({ ...attempt.input, response })).rejects.toMatchObject({ code: 'unauthenticated' })
  expect(await f.execute('SELECT count(*) AS n FROM sessions').first('n')).toBe(0)
})
it('requires new IdP authentication to remain recent at the final linking write', async () => {
  const source = await issueSession(f.ctx, { accountId: 'd', method: 'password' }, 'browser')
  const attempt = await flow('link', source.principal), db = f.ctx.db
  const response = attempt.response({ subject: 'new-subject', authnInstant: now - 59_000, notOnOrAfter: now + 300_000 })
  now += 240_000
  f.ctx.db = new Proxy(db, { get(target, property) {
    if (property === 'prepare') return (sql: string) => { if (sql.startsWith('INSERT INTO external_identities')) now += 2000; return target.prepare(sql) }
    const value = Reflect.get(target, property, target)
    return typeof value === 'function' ? value.bind(target) : value
  } })
  await expect(finish({ ...attempt.input, response })).rejects.toThrow()
  expect(await f.execute("SELECT count(*) AS n FROM external_identities WHERE subject='new-subject'").first('n')).toBe(0)
})
it.each([null, 'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified'])('does not authenticate an identity recorded under a different or unknown NameID format: %s', async format => {
  // Use an independently seeded identity, not a provider email or format fallback.
  await f.execute("DELETE FROM external_identities WHERE id='linked'").run()
  await f.execute("INSERT INTO external_identities(id,account_id,connection_id,issuer,subject,saml_name_id_format,created_at) VALUES('linked','d','saml-a',?,'stable-person-001',?,?)", samlIssuer, format, now).run()
  const attempt = await flow()
  await expect(finish(attempt.input)).rejects.toMatchObject({ code: 'unauthenticated' })
  expect(await f.execute('SELECT count(*) AS n FROM sessions').first('n')).toBe(0)
})
