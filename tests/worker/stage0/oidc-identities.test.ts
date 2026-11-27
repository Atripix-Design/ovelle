import { beforeEach, expect, it } from 'vitest'
import { databaseFixture } from './database'
import { callback, consumerTenant, microsoftIssuer, oidcProviderFixture, secrets, settings, tenant } from './oidc-protocol-fixture'
import { verifyOidcCode } from '../../../src/cloudflare/stage0/auth/oidc/protocol'
import { linkOidcIdentity, resolveOidcLogin } from '../../../src/cloudflare/stage0/auth/oidc/identities'
import { issueSession, resolveSession } from '../../../src/cloudflare/stage0/auth/sessions'

let f: Awaited<ReturnType<typeof databaseFixture>>
beforeEach(async () => {
  f = await databaseFixture()
  await f.execute("INSERT INTO identity_connections(id,protocol,provider,issuer,client_id,created_at) VALUES('google','oidc','google','https://accounts.google.com','fixture-client',1)").run()
  await f.execute("INSERT INTO identity_connections(id,protocol,provider,issuer,client_id,created_at) VALUES('microsoft','oidc','microsoft','https://login.microsoftonline.com/{tenantid}/v2.0','fixture-client',1)").run()
})
async function proof(provider: 'google' | 'microsoft' = 'google', purpose: 'login' | 'link' = 'link', tid = tenant) {
  const fixture = await oidcProviderFixture(provider)
  fixture.state.claims.email = 'a@example.test'
  fixture.state.claims.auth_time = Math.floor(f.ctx.clock.now() / 1000)
  if (provider === 'microsoft') { fixture.state.claims.tid = tid; fixture.state.claims.iss = microsoftIssuer(tid) }
  return verifyOidcCode(f.ctx, settings(provider), { ...secrets, createdAt: f.ctx.clock.now(), purpose }, callback(provider), fixture.fetcher)
}

it('links an exact verified identity to the freshly proved account and audits atomically', async () => {
  const session = await issueSession(f.ctx, { accountId: 'a', method: 'passkey' }, 'browser')
  const linked = await linkOidcIdentity(f.ctx, session.principal, await proof())
  expect(linked).toMatchObject({ provider: 'google', issuer: 'https://accounts.google.com', subject: 'exact-subject' })
  expect(await f.execute('SELECT account_id FROM external_identities WHERE id=?', linked.id).first('account_id')).toBe('a')
  const auth = await resolveOidcLogin(f.ctx, await proof('google', 'login'))
  expect(auth).toMatchObject({ accountId: 'a', method: 'oidc', externalIdentityId: linked.id, identityVersion: 1, connectionVersion: 1 })
  const login = await issueSession(f.ctx, auth, 'browser')
  expect(login.principal).toMatchObject({ accountId: 'a', method: 'oidc', assurance: 'authenticated' })
  expect(await f.execute("SELECT count(*) AS n FROM audit_events WHERE action='identity.link'").first('n')).toBe(1)
})

it('does not find or merge an unlinked account by matching email', async () => {
  await expect(resolveOidcLogin(f.ctx, await proof('google', 'login'))).rejects.toMatchObject({ code: 'unauthenticated' })
  expect(await f.execute('SELECT count(*) AS n FROM external_identities').first('n')).toBe(0)
  expect(await f.execute('SELECT count(*) AS n FROM accounts').first('n')).toBe(4)
})

it('requires fresh live existing-account proof and passkey step-up for administrators', async () => {
  const admin = await issueSession(f.ctx, { accountId: 'a', method: 'password' }, 'browser')
  await expect(linkOidcIdentity(f.ctx, admin.principal, await proof())).rejects.toMatchObject({ code: 'forbidden' })
  const ordinary = await issueSession(f.ctx, { accountId: 'd', method: 'password' }, 'browser')
  expect(await linkOidcIdentity(f.ctx, ordinary.principal, await proof())).toHaveProperty('id')
  const stale = await issueSession(f.ctx, { accountId: 'b', method: 'passkey' }, 'browser')
  f.advance(300_000)
  await expect(linkOidcIdentity(f.ctx, stale.principal, await proof())).rejects.toMatchObject({ code: 'forbidden' })
})

it('does not trust forged principal assurance, serialized proofs or the wrong flow purpose', async () => {
  const admin = await issueSession(f.ctx, { accountId: 'a', method: 'password' }, 'browser')
  const verified = await proof()
  await expect(linkOidcIdentity(f.ctx, { ...admin.principal, assurance: 'passkey', passkeyVerifiedAt: f.ctx.clock.now() }, verified)).rejects.toMatchObject({ code: 'forbidden' })
  const strong = await issueSession(f.ctx, { accountId: 'a', method: 'passkey' }, 'browser')
  await expect(linkOidcIdentity(f.ctx, strong.principal, JSON.parse(JSON.stringify(await proof())))).rejects.toMatchObject({ code: 'unauthenticated' })
  await expect(linkOidcIdentity(f.ctx, strong.principal, await proof('google', 'login'))).rejects.toMatchObject({ code: 'unauthenticated' })
})

it.each([tenant, consumerTenant])('supports a pinned Microsoft tenant identity and session through common: %s', async tid => {
  const strong = await issueSession(f.ctx, { accountId: 'a', method: 'passkey' }, 'browser')
  const linked = await linkOidcIdentity(f.ctx, strong.principal, await proof('microsoft', 'link', tid))
  expect(await f.execute('SELECT tenant_id FROM external_identities WHERE id=?', linked.id).first('tenant_id')).toBe(tid)
  const auth = await resolveOidcLogin(f.ctx, await proof('microsoft', 'login', tid))
  const session = await issueSession(f.ctx, auth, 'desktop')
  expect((await resolveSession(f.ctx, session.token, 'desktop')).accountId).toBe('a')
  await f.execute("UPDATE identity_connections SET enabled=0,version=2 WHERE id='microsoft'").run()
  await expect(resolveSession(f.ctx, session.token, 'desktop')).rejects.toMatchObject({ code: 'unauthenticated' })
})

it('keeps equal Microsoft subjects in distinct tenants separate', async () => {
  const a = await issueSession(f.ctx, { accountId: 'a', method: 'passkey' }, 'browser')
  const b = await issueSession(f.ctx, { accountId: 'b', method: 'passkey' }, 'browser')
  await linkOidcIdentity(f.ctx, a.principal, await proof('microsoft', 'link', tenant))
  await linkOidcIdentity(f.ctx, b.principal, await proof('microsoft', 'link', consumerTenant))
  expect((await resolveOidcLogin(f.ctx, await proof('microsoft', 'login', tenant))).accountId).toBe('a')
  expect((await resolveOidcLogin(f.ctx, await proof('microsoft', 'login', consumerTenant))).accountId).toBe('b')
})

it('never reassigns an existing identity and cannot restore a disabled one by linking again', async () => {
  const a = await issueSession(f.ctx, { accountId: 'a', method: 'passkey' }, 'browser')
  const b = await issueSession(f.ctx, { accountId: 'b', method: 'passkey' }, 'browser')
  const linked = await linkOidcIdentity(f.ctx, a.principal, await proof())
  await expect(linkOidcIdentity(f.ctx, b.principal, await proof())).rejects.toMatchObject({ code: 'conflict' })
  await f.execute('UPDATE external_identities SET disabled_at=?,version=2 WHERE id=?', f.ctx.clock.now(), linked.id).run()
  await expect(linkOidcIdentity(f.ctx, a.principal, await proof())).rejects.toMatchObject({ code: 'conflict' })
  await expect(resolveOidcLogin(f.ctx, await proof('google', 'login'))).rejects.toMatchObject({ code: 'unauthenticated' })
})

it('rejects changed connection configuration both before linking and between login resolution and issuance', async () => {
  const a = await issueSession(f.ctx, { accountId: 'a', method: 'passkey' }, 'browser')
  await linkOidcIdentity(f.ctx, a.principal, await proof())
  const auth = await resolveOidcLogin(f.ctx, await proof('google', 'login'))
  const oldProof = await proof()
  await f.execute("UPDATE identity_connections SET client_id='other-client',version=2 WHERE id='google'").run()
  await expect(linkOidcIdentity(f.ctx, a.principal, oldProof)).rejects.toMatchObject({ code: 'forbidden' })
  await expect(issueSession(f.ctx, auth, 'browser')).rejects.toMatchObject({ code: 'unauthenticated' })
})

it('rolls back identity insertion if append-only audit cannot be written', async () => {
  const a = await issueSession(f.ctx, { accountId: 'a', method: 'passkey' }, 'browser')
  let calls = 0
  f.ctx.ids.next = () => ++calls === 1 ? 'new-identity' : 'duplicate-audit'
  await f.execute("INSERT INTO audit_events(id,actor_account_id,action,resource_id,request_id,created_at) VALUES('duplicate-audit','a','account.create','a','fixture',1)").run()
  await expect(linkOidcIdentity(f.ctx, a.principal, await proof())).rejects.toThrow()
  expect(await f.execute('SELECT count(*) AS n FROM external_identities').first('n')).toBe(0)
})

it('rejects consumed, expired and future-dated verification results', async () => {
  const a = await issueSession(f.ctx, { accountId: 'a', method: 'passkey' }, 'browser')
  const once = await proof()
  await linkOidcIdentity(f.ctx, a.principal, once)
  await expect(linkOidcIdentity(f.ctx, a.principal, once)).rejects.toMatchObject({ code: 'unauthenticated' })
  const stale = await proof()
  f.advance(60_000)
  await expect(linkOidcIdentity(f.ctx, a.principal, stale)).rejects.toMatchObject({ code: 'unauthenticated' })
  const future = await proof()
  f.advance(-1)
  await expect(linkOidcIdentity(f.ctx, a.principal, future)).rejects.toMatchObject({ code: 'unauthenticated' })
})

it('links at most one account under competing writes and preserves one audit event', async () => {
  const a = await issueSession(f.ctx, { accountId: 'a', method: 'passkey' }, 'browser')
  const b = await issueSession(f.ctx, { accountId: 'b', method: 'passkey' }, 'browser')
  const [pa, pb] = await Promise.all([proof(), proof()])
  const results = await Promise.allSettled([linkOidcIdentity(f.ctx, a.principal, pa), linkOidcIdentity(f.ctx, b.principal, pb)])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(await f.execute('SELECT count(*) AS n FROM external_identities').first('n')).toBe(1)
  expect(await f.execute("SELECT count(*) AS n FROM audit_events WHERE action='identity.link'").first('n')).toBe(1)
})

it.each(['disable_connection', 'revoke_session', 'disable_identity'])('rechecks %s immediately before the guarded write', async change => {
  const a = await issueSession(f.ctx, { accountId: 'a', method: 'passkey' }, 'browser')
  const linked = change === 'disable_identity' ? await linkOidcIdentity(f.ctx, a.principal, await proof()) : null
  const db = f.ctx.db
  f.ctx.db = new Proxy(db, { get(target, key) {
    if (key === 'batch') return async (statements: Parameters<typeof db.batch>[0]) => {
      if (change === 'disable_connection') await f.execute("UPDATE identity_connections SET enabled=0,version=2 WHERE id='google'").run()
      if (change === 'revoke_session') await f.execute('UPDATE sessions SET revoked_at=? WHERE id=?', f.ctx.clock.now(), a.principal.sessionId).run()
      if (linked) await f.execute('UPDATE external_identities SET disabled_at=?,version=2 WHERE id=?', f.ctx.clock.now(), linked.id).run()
      return target.batch(statements)
    }
    const value = Reflect.get(target, key)
    return typeof value === 'function' ? value.bind(target) : value
  } })
  await expect(linkOidcIdentity(f.ctx, a.principal, await proof())).rejects.toMatchObject({ code: 'conflict' })
  expect(await f.execute('SELECT count(*) AS n FROM external_identities').first('n')).toBe(linked ? 1 : 0)
})

it('requires tenant-scoped issuer pairs in SQL and keeps tenant identity immutable', async () => {
  const a = await issueSession(f.ctx, { accountId: 'a', method: 'passkey' }, 'browser')
  const linked = await linkOidcIdentity(f.ctx, a.principal, await proof('microsoft'))
  await expect(f.execute('UPDATE external_identities SET tenant_id=? WHERE id=?', consumerTenant, linked.id).run()).rejects.toThrow()
  await expect(f.execute("INSERT INTO external_identities(id,account_id,connection_id,issuer,subject,tenant_id,created_at) VALUES('wrong','b','microsoft',?,'subject',?,1)", microsoftIssuer(consumerTenant), tenant).run()).rejects.toThrow()
  await expect(f.execute("INSERT INTO external_identities(id,account_id,connection_id,issuer,subject,tenant_id,created_at) VALUES('wrong','b','google','https://accounts.google.com','subject',?,1)", tenant).run()).rejects.toThrow()
})
