import { beforeEach, expect, it } from 'vitest'
import { inflateRawSync } from 'node:zlib'
import { databaseFixture } from './database'
import { signedSamlResponse, encodedSaml, publicKey, persistent, samlIssuer } from './saml-fixture'
import { startSamlTransaction } from '../../../src/cloudflare/stage0/auth/saml/transactions'
import { handleSamlRequest, type SamlHttpDependencies } from '../../../src/cloudflare/stage0/auth/saml/routes'
import { resolveSession } from '../../../src/cloudflare/stage0/auth/sessions'
const origin = 'http://localhost:4173', key = new Uint8Array(32).fill(29)
const settings = { connectionId: 'saml-a', connectionVersion: 1, organizationId: 'org-a', issuer: samlIssuer, audience: 'https://ovelle.example.test/saml', signingKeys: [publicKey], nameIdFormat: persistent, entryPoint: 'https://identity.example.test/sso' }
let f: Awaited<ReturnType<typeof databaseFixture>>, now: number, deps: SamlHttpDependencies
beforeEach(async () => {
  f = await databaseFixture(); now = Date.now(); f.ctx.clock.now = () => now
  await f.execute("INSERT INTO identity_connections(id,organization_id,protocol,provider,issuer,created_at) VALUES('saml-a','org-a','saml','enterprise_saml',?,?)", samlIssuer, now).run()
  deps = { budgetKey: key, trustedIp: '127.0.0.1', turnstileSecret: 'fixture-only', getSettings: async () => settings }
})
async function enroll(extra: Partial<Parameters<typeof signedSamlResponse>[0]> = {}) {
  const started = await startSamlTransaction(f.ctx, settings, { purpose: 'login', ip: '127.0.0.1' }, key)
  const url = new URL(started.authorizationUrl), xml = inflateRawSync(Buffer.from(url.searchParams.get('SAMLRequest')!, 'base64')).toString(), requestId = /\bID="([^"]+)"/.exec(xml)![1]
  const body = new URLSearchParams({ RelayState: url.searchParams.get('RelayState')!, SAMLResponse: encodedSaml(signedSamlResponse({ now, callback: origin + '/api/v1/auth/saml/callback', requestId, responseId: '_r-' + requestId, assertionId: '_a-' + requestId, audience: settings.audience, subject: 'new-person-001', ...extra })) })
  const callback = () => handleSamlRequest(f.ctx, new Request(origin + '/api/v1/auth/saml/callback', { method: 'POST', body, headers: { Origin: 'https://identity.example.test', Cookie: 'ovelle_local_saml=saml-a.' + started.browserBinding } }), deps)
  const response = await callback()
  expect(response.status).toBe(303); expect(response.headers.get('Location')).toBe('/account/enroll')
  const line = response.headers.getSetCookie().find(x => x.startsWith('ovelle_local_saml_enrollment='))!
  expect(line).toContain('HttpOnly; SameSite=Strict'); expect(line).not.toContain('Domain=')
  const cookie = line.split(';')[0]
  const get = await call(cookie)
  expect(get.status).toBe(200)
  const csrf = (await get.json() as { csrfToken: string }).csrfToken
  return { cookie, csrf, callback, response, assertion: body.get('SAMLResponse')! }
}
function call(cookie: string, suffix = '', input?: unknown, csrf?: string, headers: Record<string, string> = {}) {
  return handleSamlRequest(f.ctx, new Request(origin + '/api/v1/auth/saml/enrollment' + suffix, { method: input === undefined ? 'GET' : 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...headers }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) }), deps)
}
async function nominate(e: Awaited<ReturnType<typeof enroll>>, email = 'new@example.test') {
  const result = await call(e.cookie, '/contact', { email, displayName: 'New Person' }, e.csrf)
  expect(result.status).toBe(202); expect(await result.json()).toEqual({ accepted: true })
  return result
}
const mailToken = (index = f.ctx.sent.length - 1) => new URLSearchParams(new URL(f.ctx.sent[index].url).hash.slice(1)).get('token')!
const confirm = (e: Awaited<ReturnType<typeof enroll>>, token = mailToken()) => call(e.cookie, '/confirm', { token }, e.csrf)
it('creates only bounded pending proof atomically with signed request/replay consumption, then verifies a nominated contact', async () => {
  const e = await enroll({ subject: 'a@example.test' })
  expect(await f.execute('SELECT count(*) AS n FROM accounts').first('n')).toBe(4)
  expect(await f.execute('SELECT count(*) AS n FROM external_identities').first('n')).toBe(0)
  expect(await f.execute('SELECT count(*) AS n FROM sessions').first('n')).toBe(0)
  expect(await f.execute('SELECT consumed_at FROM saml_transactions').first('consumed_at')).toBe(now)
  expect(await f.execute('SELECT count(*) AS n FROM saml_replays').first('n')).toBe(2)
  await nominate(e)
  const token = mailToken(), pending = JSON.stringify((await f.execute('SELECT * FROM saml_enrollments').all()).results)
  for (const secret of [token, e.cookie.split('=')[1].split('.')[1], e.assertion]) expect(pending).not.toContain(secret)
  expect(await f.execute('SELECT count(*) AS n FROM accounts').first('n')).toBe(4)
  const result = await confirm(e, token)
  expect(result.status).toBe(204); expect(await result.text()).toBe('')
  const session = result.headers.getSetCookie().find(x => x.startsWith('ovelle_local_session='))!.split(';')[0].split('=')[1]
  const principal = await resolveSession(f.ctx, session, 'browser')
  expect(principal).toMatchObject({ method: 'saml', assurance: 'authenticated', connectionId: 'saml-a', authenticatedAt: now, passkeyVerifiedAt: null })
  expect(await f.execute('SELECT email FROM accounts WHERE id=?', principal.accountId).first('email')).toBe('new@example.test')
  expect(await f.execute('SELECT saml_name_id_format FROM external_identities WHERE account_id=?', principal.accountId).first('saml_name_id_format')).toBe(persistent)
  expect(await f.execute('SELECT count(*) AS n FROM organization_memberships').first('n')).toBe(5)
  expect(await f.execute('SELECT count(*) AS n FROM organization_memberships WHERE account_id=?', principal.accountId).first('n')).toBe(0)
  expect((await f.execute('SELECT action FROM audit_events ORDER BY action').all()).results.map(x => x.action)).toEqual(['account.create', 'identity.link', 'session.issue'])
  expect(result.headers.getSetCookie().find(x => x.startsWith('ovelle_local_saml_enrollment='))).toContain('Max-Age=0')
  expect((await confirm(e, token)).status).toBe(401)
})
it('does not merge or email-match an existing account, including a matching SAML subject', async () => {
  const e = await enroll({ subject: 'a@example.test' })
  await nominate(e, ' A@EXAMPLE.TEST ')
  expect(f.ctx.sent).toHaveLength(0)
  expect((await confirm(e, 'x'.repeat(43))).status).toBe(401)
  expect(await f.execute('SELECT count(*) AS n FROM accounts').first('n')).toBe(4)
  expect(await f.execute('SELECT count(*) AS n FROM external_identities').first('n')).toBe(0)
  await nominate(e, 'separate@example.test')
  expect((await confirm(e)).status).toBe(204)
})
it('requires the initiating browser, exact Origin and independent CSRF for contact and confirmation', async () => {
  const e = await enroll()
  for (const change of [{ Origin: 'null' }, { Origin: 'https://foreign.example' }, { Authorization: 'Bearer token' }, { 'Sec-Fetch-Site': 'cross-site' }] as Record<string, string>[]) expect((await call(e.cookie, '/contact', { email: 'new@example.test', displayName: 'New' }, e.csrf, change)).status).toBe(403)
  expect((await call('', '/contact', { email: 'new@example.test', displayName: 'New' }, e.csrf)).status).toBe(401)
  expect((await call(e.cookie, '/contact', { email: 'new@example.test', displayName: 'New' })).status).toBe(403)
  expect(f.ctx.sent).toHaveLength(0)
  await nominate(e)
  expect((await call('', '/confirm', { token: mailToken() }, e.csrf)).status).toBe(401)
  expect((await call(e.cookie, '/confirm', { token: mailToken() })).status).toBe(403)
  expect((await confirm(e)).status).toBe(204)
})
it('keeps GET confirmation scanner-safe and invalidates old mail on resend', async () => {
  const e = await enroll(); await nominate(e); const old = mailToken(); await nominate(e)
  expect((await call(e.cookie, '/confirm')).status).toBe(405)
  expect((await confirm(e, old)).status).toBe(401)
  expect((await confirm(e)).status).toBe(204)
})
it('allows one concurrent contact confirmation to create one account, identity, session and audit set', async () => {
  const e = await enroll(); await nominate(e)
  const results = await Promise.all([confirm(e), confirm(e)])
  expect(results.filter(x => x.status === 204)).toHaveLength(1)
  expect(await f.execute('SELECT count(*) AS n FROM accounts').first('n')).toBe(5)
  for (const table of ['external_identities', 'sessions']) expect(await f.execute(`SELECT count(*) AS n FROM ${table}`).first('n')).toBe(1)
  expect(await f.execute('SELECT count(*) AS n FROM audit_events').first('n')).toBe(3)
})
it('rolls account, identity, session and pending consumption back together when audit fails', async () => {
  const e = await enroll(); await nominate(e)
  await f.execute("CREATE TRIGGER fail_enrollment_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT,'fixture_audit_failure'); END").run()
  expect((await confirm(e)).status).toBe(503)
  expect(await f.execute('SELECT count(*) AS n FROM accounts').first('n')).toBe(4)
  expect(await f.execute('SELECT count(*) AS n FROM external_identities').first('n')).toBe(0)
  expect(await f.execute('SELECT count(*) AS n FROM sessions').first('n')).toBe(0)
  expect(await f.execute('SELECT consumed_at FROM saml_enrollments').first('consumed_at')).toBeNull()
  await f.execute('DROP TRIGGER fail_enrollment_audit').run()
  expect((await confirm(e)).status).toBe(204)
})
it.each(['disable', 'version', 'profile'] as const)('rechecks current connection %s before accepting contact proof', async change => {
  const e = await enroll(); await nominate(e)
  if (change === 'disable') await f.execute("UPDATE identity_connections SET enabled=0,version=2 WHERE id='saml-a'").run()
  if (change === 'version') await f.execute("UPDATE identity_connections SET version=2 WHERE id='saml-a'").run()
  if (change === 'profile') deps.getSettings = async () => ({ ...settings, audience: 'https://foreign.example/sp' })
  expect((await confirm(e)).status).toBe(401)
  expect(await f.execute('SELECT count(*) AS n FROM accounts').first('n')).toBe(4)
})
it('preserves original SAML authentication time and signed IdP session ceiling through email enrollment', async () => {
  const authenticated = now - 60_000, ceiling = now + 600_000
  const e = await enroll({ authnInstant: authenticated, beforeSign: xml => xml.replace('SessionIndex="fixture-session"', `SessionIndex="fixture-session" SessionNotOnOrAfter="${new Date(ceiling).toISOString()}"`) })
  now += 120_000; await nominate(e)
  expect((await confirm(e)).status).toBe(204)
  expect(await f.execute('SELECT authenticated_at FROM sessions').first('authenticated_at')).toBe(authenticated)
  expect(await f.execute('SELECT expires_at FROM sessions').first('expires_at')).toBe(ceiling)
})
it('expires pending proof at the IdP ceiling rather than extending it for mail', async () => {
  const ceiling = now + 30_000
  const e = await enroll({ beforeSign: xml => xml.replace('SessionIndex="fixture-session"', `SessionIndex="fixture-session" SessionNotOnOrAfter="${new Date(ceiling).toISOString()}"`) })
  await nominate(e); now = ceiling
  expect((await confirm(e)).status).toBe(401)
  expect(await f.execute('SELECT count(*) AS n FROM accounts').first('n')).toBe(4)
})
it('never revives a disabled or unknown-format exact external identity as a new account', async () => {
  await f.execute("INSERT INTO external_identities(id,account_id,connection_id,issuer,subject,created_at) VALUES('existing','d','saml-a',?,'new-person-001',?)", samlIssuer, now).run()
  // Use the service start and signed HTTP callback, but the helper must fail its enrollment expectation.
  await expect(enroll()).rejects.toThrow()
  expect(await f.execute('SELECT count(*) AS n FROM saml_enrollments').first('n')).toBe(0)
  await f.execute("UPDATE external_identities SET disabled_at=?,version=2 WHERE id='existing'", now).run()
  await expect(enroll()).rejects.toThrow()
  expect(await f.execute('SELECT count(*) AS n FROM accounts').first('n')).toBe(4)
})
it('returns the same generic acknowledgment when mail fails, without returning the secret or provider detail', async () => {
  const e = await enroll(); f.ctx.mailer.send = async () => { throw new Error('private-delivery-detail') }
  const result = await nominate(e)
  expect(result.headers.getSetCookie().some(x => x.startsWith('ovelle_local_session='))).toBe(false)
  expect(await f.execute('SELECT delivery FROM saml_enrollments').first('delivery')).toBe('failed')
  expect(await f.execute('SELECT count(*) AS n FROM accounts').first('n')).toBe(4)
})
it('consumes the signed callback once even when it creates only pending enrollment', async () => {
  const e = await enroll()
  expect((await e.callback()).headers.get('Location')).toBe('/account/sign-in?result=failed')
  expect(await f.execute('SELECT count(*) AS n FROM saml_enrollments').first('n')).toBe(1)
})
it('identifies the verification flow in mail without putting the credential into the URL query', async () => {
  const e = await enroll(); await nominate(e)
  const url = new URL(f.ctx.sent[0].url)
  expect(url.search).toBe('')
  expect(new URLSearchParams(url.hash.slice(1)).get('flow')).toBe('saml')
})
it('does not exchange contact tokens across independently signed enrollment browsers', async () => {
  const a = await enroll(), b = await enroll({ subject: 'second-person' })
  await nominate(a, 'one@example.test'); const aToken = mailToken()
  await nominate(b, 'two@example.test'); const bToken = mailToken()
  expect((await confirm(a, bToken)).status).toBe(401)
  expect((await confirm(b, aToken)).status).toBe(401)
  expect((await confirm(a, aToken)).status).toBe(204)
  expect((await confirm(b, bToken)).status).toBe(204)
})
it.each(['connection', 'email', 'identity'] as const)('rechecks a competing %s change inside the final atomic enrollment batch', async change => {
  const e = await enroll(); await nominate(e)
  const db = f.ctx.db; let batches = 0
  f.ctx.db = new Proxy(db, { get(target, property) {
    if (property === 'batch') return async (statements: Parameters<typeof db.batch>[0]) => {
      if (++batches === 2) {
        if (change === 'connection') await f.execute("UPDATE identity_connections SET enabled=0,version=2 WHERE id='saml-a'").run()
        if (change === 'email') await f.execute("INSERT INTO accounts(id,email,display_name,email_verified_at,created_at) VALUES('competing','new@example.test','Other',?,?)", now, now).run()
        if (change === 'identity') await f.execute("INSERT INTO external_identities(id,account_id,connection_id,issuer,subject,saml_name_id_format,created_at) VALUES('competing','d','saml-a',?,'new-person-001',?,?)", samlIssuer, persistent, now).run()
      }
      return target.batch(statements)
    }
    const value = Reflect.get(target, property, target)
    return typeof value === 'function' ? value.bind(target) : value
  } })
  expect((await confirm(e)).status).toBe(401)
  expect(await f.execute('SELECT count(*) AS n FROM sessions').first('n')).toBe(0)
  expect(await f.execute('SELECT consumed_at FROM saml_enrollments').first('consumed_at')).toBeNull()
  expect(await f.execute('SELECT count(*) AS n FROM audit_events').first('n')).toBe(0)
})
it('rechecks exclusive pending expiry after asynchronous credential preparation', async () => {
  const e = await enroll(); await nominate(e)
  const deadline = await f.execute('SELECT expires_at FROM saml_enrollments').first<number>('expires_at')
  const db = f.ctx.db
  f.ctx.db = new Proxy(db, { get(target, property) {
    if (property === 'prepare') return (sql: string) => { if (sql.startsWith('INSERT INTO sessions')) now = deadline!; return target.prepare(sql) }
    const value = Reflect.get(target, property, target)
    return typeof value === 'function' ? value.bind(target) : value
  } })
  expect((await confirm(e)).status).toBe(401)
  expect(await f.execute('SELECT count(*) AS n FROM accounts').first('n')).toBe(4)
  expect(await f.execute('SELECT count(*) AS n FROM sessions').first('n')).toBe(0)
})
it('bounds pending enrollment by the original twelve-hour SSO age even without an IdP deadline', async () => {
  const authenticated = now - 43_140_000
  const e = await enroll({ authnInstant: authenticated })
  expect(await f.execute('SELECT expires_at FROM saml_enrollments').first('expires_at')).toBe(authenticated + 43_200_000)
  await nominate(e); now += 60_000
  expect((await confirm(e)).status).toBe(401)
})
it('consumes pending creation, request and replay atomically when the pending insert fails', async () => {
  await f.execute("CREATE TRIGGER fail_pending BEFORE INSERT ON saml_enrollments BEGIN SELECT RAISE(ABORT,'fixture_pending_failure'); END").run()
  await expect(enroll()).rejects.toThrow()
  expect(await f.execute('SELECT consumed_at FROM saml_transactions').first('consumed_at')).toBeNull()
  expect(await f.execute('SELECT count(*) AS n FROM saml_replays').first('n')).toBe(0)
  expect(await f.execute('SELECT count(*) AS n FROM saml_enrollments').first('n')).toBe(0)
})
it('limits contact sends and rejects malformed or extra fields before delivery', async () => {
  const e = await enroll()
  for (const email of ['bad', '\nnew@example.test', 'new@example.test\r']) expect((await call(e.cookie, '/contact', { email, displayName: 'New' }, e.csrf)).status).toBe(400)
  expect((await call(e.cookie, '/contact', { email: 'new@example.test', displayName: 'New', ip: '8.8.8.8' }, e.csrf)).status).toBe(400)
  expect(f.ctx.sent).toHaveLength(0)
  for (let i = 0; i < 5; i++) await nominate(e)
  expect((await call(e.cookie, '/contact', { email: 'new@example.test', displayName: 'New' }, e.csrf)).status).toBe(429)
  expect(f.ctx.sent).toHaveLength(5)
})
it('cannot create duplicate exact identities through different pending proofs and contacts', async () => {
  const a = await enroll(), b = await enroll()
  await nominate(a, 'first@example.test'); const first = mailToken()
  await nominate(b, 'second@example.test'); const second = mailToken()
  const results = await Promise.all([confirm(a, first), confirm(b, second)])
  expect(results.filter(x => x.status === 204)).toHaveLength(1)
  expect(await f.execute('SELECT count(*) AS n FROM external_identities').first('n')).toBe(1)
  expect(await f.execute('SELECT count(*) AS n FROM accounts').first('n')).toBe(5)
})
