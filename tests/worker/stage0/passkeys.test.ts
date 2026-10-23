import { beforeEach, expect, it } from 'vitest'
import { databaseFixture } from './database'
import { passkeyFixture } from './passkey-fixture'
import { issueSession, resolveSession } from '../../../src/cloudflare/stage0/auth/sessions'
import { beginPasskeyRegistration, finishPasskeyRegistration, beginPasskeyAuthentication, finishPasskeyAuthentication } from '../../../src/cloudflare/stage0/auth/passkeys/service'
const key = new Uint8Array(32).fill(11)
const ip = '127.0.0.1'
let f: Awaited<ReturnType<typeof databaseFixture>>
beforeEach(async () => { f = await databaseFixture() })
async function enroll(accountId = 'c') {
  const original = await issueSession(f.ctx, { accountId, method: 'password' }, 'browser')
  const start = await beginPasskeyRegistration(f.ctx, original.principal, ip, key)
  const fixture = await passkeyFixture()
  const result = await finishPasskeyRegistration(f.ctx, original.principal, start.flowToken, await fixture.registration(start.options.challenge), 'My passkey', ip, key)
  return { original, start, fixture, ...result }
}
it('registers only a credential/public key and rotates the session into UV assurance', async () => {
  const enrolled = await enroll()
  expect(enrolled.passkey).toMatchObject({ id: enrolled.fixture.id, name: 'My passkey' })
  expect((await resolveSession(f.ctx, enrolled.session.token, 'browser')).assurance).toBe('passkey')
  await expect(resolveSession(f.ctx, enrolled.original.token, 'browser')).rejects.toMatchObject({ code: 'unauthenticated' })
  const row = await f.execute('SELECT * FROM passkey_challenges').first()
  expect(JSON.stringify(row)).not.toContain(enrolled.start.flowToken)
  expect(JSON.stringify(row)).not.toContain(enrolled.start.options.challenge)
  expect(await f.execute('SELECT count(*) AS n FROM passkey_credentials').first('n')).toBe(1)
  await expect(finishPasskeyRegistration(f.ctx, enrolled.original.principal, enrolled.start.flowToken, await enrolled.fixture.registration(enrolled.start.options.challenge), 'Replay', ip, key)).rejects.toMatchObject({ code: 'unauthenticated' })
})
it('signs in discoverably with a real assertion and advances the counter atomically', async () => {
  const enrolled = await enroll()
  const start = await beginPasskeyAuthentication(f.ctx, null, ip, key)
  expect(start.options.allowCredentials).toEqual([])
  enrolled.fixture.state.counter = 1
  const signed = await finishPasskeyAuthentication(f.ctx, null, start.flowToken, await enrolled.fixture.authentication(start.options.challenge, enrolled.start.options.user.id), ip, key)
  expect((await resolveSession(f.ctx, signed.token, 'browser'))).toMatchObject({ accountId: 'c', method: 'passkey', assurance: 'passkey' })
  expect(await f.execute('SELECT counter FROM passkey_credentials').first('counter')).toBe(1)
  expect(await f.execute("SELECT count(*) AS n FROM audit_events WHERE action='passkey.authenticate'").first('n')).toBe(1)
})
it('denies additional enrollment from primary authentication and permits recent existing-passkey assurance', async () => {
  const enrolled = await enroll()
  const primary = await issueSession(f.ctx, { accountId: 'c', method: 'password' }, 'browser')
  await expect(beginPasskeyRegistration(f.ctx, primary.principal, ip, key)).rejects.toMatchObject({ code: 'forbidden' })
  const next = await beginPasskeyRegistration(f.ctx, enrolled.session.principal, ip, key)
  const other = await passkeyFixture()
  expect(next.options.excludeCredentials).toMatchObject([{ id: enrolled.fixture.id, transports: ['internal'] }])
  await finishPasskeyRegistration(f.ctx, enrolled.session.principal, next.flowToken, await other.registration(next.options.challenge), 'Second', ip, key)
  expect(await f.execute('SELECT count(*) AS n FROM passkey_credentials').first('n')).toBe(2)
})
it('binds registration to account, session, purpose and exclusive five-minute expiry', async () => {
  const original = await issueSession(f.ctx, { accountId: 'c', method: 'password' }, 'browser')
  const sameAccount = await issueSession(f.ctx, { accountId: 'c', method: 'password' }, 'browser')
  const foreign = await issueSession(f.ctx, { accountId: 'd', method: 'password' }, 'browser')
  const start = await beginPasskeyRegistration(f.ctx, original.principal, ip, key)
  const fixture = await passkeyFixture(); const response = await fixture.registration(start.options.challenge)
  for (const principal of [sameAccount.principal, foreign.principal]) await expect(finishPasskeyRegistration(f.ctx, principal, start.flowToken, response, 'Wrong', ip, key)).rejects.toMatchObject({ code: 'unauthenticated' })
  await expect(finishPasskeyAuthentication(f.ctx, original.principal, start.flowToken, await fixture.authentication(start.options.challenge, start.options.user.id), ip, key)).rejects.toMatchObject({ code: 'unauthenticated' })
  f.advance(300_000)
  await expect(finishPasskeyRegistration(f.ctx, original.principal, start.flowToken, response, 'Expired', ip, key)).rejects.toMatchObject({ code: 'unauthenticated' })
  await expect(beginPasskeyRegistration(f.ctx, sameAccount.principal, ip, key)).rejects.toMatchObject({ code: 'forbidden' })
})
it('invalidates an older pending registration when the browser starts again', async () => {
  const original = await issueSession(f.ctx, { accountId: 'c', method: 'password' }, 'browser')
  const first = await beginPasskeyRegistration(f.ctx, original.principal, ip, key)
  await beginPasskeyRegistration(f.ctx, original.principal, ip, key)
  const fixture = await passkeyFixture()
  await expect(finishPasskeyRegistration(f.ctx, original.principal, first.flowToken, await fixture.registration(first.options.challenge), 'Old', ip, key)).rejects.toMatchObject({ code: 'unauthenticated' })
})
it('allows at most one competing first enrollment, across different live primary sessions', async () => {
  const one = await issueSession(f.ctx, { accountId: 'c', method: 'password' }, 'browser')
  const two = await issueSession(f.ctx, { accountId: 'c', method: 'password' }, 'browser')
  const first = await beginPasskeyRegistration(f.ctx, one.principal, ip, key)
  const second = await beginPasskeyRegistration(f.ctx, two.principal, ip, key)
  const a = await passkeyFixture(); const b = await passkeyFixture()
  const results = await Promise.allSettled([
    finishPasskeyRegistration(f.ctx, one.principal, first.flowToken, await a.registration(first.options.challenge), 'One', ip, key),
    finishPasskeyRegistration(f.ctx, two.principal, second.flowToken, await b.registration(second.options.challenge), 'Two', ip, key),
  ])
  expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1)
  expect(await f.execute('SELECT count(*) AS n FROM passkey_credentials').first('n')).toBe(1)
})
it('rolls back registration and session rotation if the audit write fails', async () => {
  const original = await issueSession(f.ctx, { accountId: 'c', method: 'password' }, 'browser')
  const start = await beginPasskeyRegistration(f.ctx, original.principal, ip, key)
  await f.execute("CREATE TRIGGER fail_passkey_audit BEFORE INSERT ON audit_events WHEN NEW.action='passkey.register' BEGIN SELECT RAISE(ABORT,'fixture_audit_failure'); END").run()
  const fixture = await passkeyFixture()
  await expect(finishPasskeyRegistration(f.ctx, original.principal, start.flowToken, await fixture.registration(start.options.challenge), 'Mine', ip, key)).rejects.toThrow()
  expect(await f.execute('SELECT count(*) AS n FROM passkey_credentials').first('n')).toBe(0)
  expect((await resolveSession(f.ctx, original.token, 'browser')).accountId).toBe('c')
})
it('does not enroll after session/account revocation or grant assurance to an unverified account', async () => {
  const original = await issueSession(f.ctx, { accountId: 'c', method: 'password' }, 'browser')
  const start = await beginPasskeyRegistration(f.ctx, original.principal, ip, key)
  await f.execute("UPDATE accounts SET disabled_at=? WHERE id='c'", f.ctx.clock.now()).run()
  const fixture = await passkeyFixture()
  await expect(finishPasskeyRegistration(f.ctx, original.principal, start.flowToken, await fixture.registration(start.options.challenge), 'Revoked', ip, key)).rejects.toMatchObject({ code: 'unauthenticated' })
  await f.execute("UPDATE accounts SET email_verified_at=NULL WHERE id='d'").run()
  const unverified = await issueSession(f.ctx, { accountId: 'd', method: 'password' }, 'browser')
  await expect(beginPasskeyRegistration(f.ctx, unverified.principal, ip, key)).rejects.toMatchObject({ code: 'forbidden' })
})
it('denies a bad assertion, consumes its challenge, and retains durable failure capacity', async () => {
  const enrolled = await enroll()
  const start = await beginPasskeyAuthentication(f.ctx, null, ip, key)
  enrolled.fixture.state.counter = 1; enrolled.fixture.state.badSignature = true
  const response = await enrolled.fixture.authentication(start.options.challenge, enrolled.start.options.user.id)
  await expect(finishPasskeyAuthentication(f.ctx, null, start.flowToken, response, ip, key)).rejects.toMatchObject({ code: 'unauthenticated' })
  enrolled.fixture.state.badSignature = false
  await expect(finishPasskeyAuthentication(f.ctx, null, start.flowToken, await enrolled.fixture.authentication(start.options.challenge, enrolled.start.options.user.id), ip, key)).rejects.toMatchObject({ code: 'unauthenticated' })
  expect(await f.execute("SELECT max(used) AS n FROM auth_limits WHERE kind='challenge_pair'").first('n')).toBeGreaterThan(0)
})
it('revokes credential-derived sessions when the credential is disabled and prevents primary-only replacement', async () => {
  const enrolled = await enroll()
  await f.execute('UPDATE passkey_credentials SET disabled_at=?,version=version+1 WHERE id=?', f.ctx.clock.now(), enrolled.passkey.id).run()
  await expect(resolveSession(f.ctx, enrolled.session.token, 'browser')).rejects.toMatchObject({ code: 'unauthenticated' })
  const primary = await issueSession(f.ctx, { accountId: 'c', method: 'password' }, 'browser')
  await expect(beginPasskeyRegistration(f.ctx, primary.principal, ip, key)).rejects.toMatchObject({ code: 'forbidden' })
})
it('preserves federated provenance, original authentication time and absolute expiry on passkey step-up', async () => {
  const enrolled = await enroll()
  await f.execute("INSERT INTO identity_connections(id,protocol,provider,issuer,client_id,created_at) VALUES('google','oidc','google','https://accounts.google.com','fixture-client',1)").run()
  await f.execute("INSERT INTO external_identities(id,account_id,connection_id,issuer,subject,created_at) VALUES('identity','c','google','https://accounts.google.com','subject',1)").run()
  const primary = await issueSession(f.ctx, { accountId: 'c', method: 'oidc', externalIdentityId: 'identity', identityVersion: 1, connectionVersion: 1 }, 'browser')
  const expiry = await f.execute('SELECT expires_at FROM sessions WHERE id=?', primary.principal.sessionId).first('expires_at')
  f.advance(60_000)
  const start = await beginPasskeyAuthentication(f.ctx, primary.principal, ip, key)
  enrolled.fixture.state.counter = 1
  const stepped = await finishPasskeyAuthentication(f.ctx, primary.principal, start.flowToken, await enrolled.fixture.authentication(start.options.challenge, enrolled.start.options.user.id), ip, key)
  expect((await resolveSession(f.ctx, stepped.token, 'browser'))).toMatchObject({ method: 'oidc', connectionId: 'google', connectionVersion: 1, assurance: 'passkey', authenticatedAt: primary.principal.authenticatedAt })
  expect(await f.execute('SELECT expires_at FROM sessions WHERE id=?', stepped.principal.sessionId).first('expires_at')).toBe(expiry)
  await expect(resolveSession(f.ctx, primary.token, 'browser')).rejects.toMatchObject({ code: 'unauthenticated' })
  await f.execute("UPDATE identity_connections SET enabled=0,version=2 WHERE id='google'").run()
  await expect(resolveSession(f.ctx, stepped.token, 'browser')).rejects.toMatchObject({ code: 'unauthenticated' })
})

it('bounds registration starts before allocating more challenges', async () => {
  const original = await issueSession(f.ctx, { accountId: 'c', method: 'password' }, 'browser')
  for (let n = 0; n < 5; n++) await beginPasskeyRegistration(f.ctx, original.principal, ip, key)
  await expect(beginPasskeyRegistration(f.ctx, original.principal, ip, key)).rejects.toMatchObject({ code: 'rate_limited' })
  expect(await f.execute('SELECT count(*) AS n FROM passkey_challenges').first('n')).toBe(5)
})
it('commits at most one competing assertion with the same nonzero counter', async () => {
  const enrolled = await enroll()
  const first = await beginPasskeyAuthentication(f.ctx, null, ip, key)
  const second = await beginPasskeyAuthentication(f.ctx, null, ip, key)
  enrolled.fixture.state.counter = 1
  const one = await enrolled.fixture.authentication(first.options.challenge, enrolled.start.options.user.id)
  const two = await enrolled.fixture.authentication(second.options.challenge, enrolled.start.options.user.id)
  const results = await Promise.allSettled([
    finishPasskeyAuthentication(f.ctx, null, first.flowToken, one, ip, key),
    finishPasskeyAuthentication(f.ctx, null, second.flowToken, two, ip, key),
  ])
  expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1)
  expect(await f.execute('SELECT counter FROM passkey_credentials').first('counter')).toBe(1)
})
it('rolls back the assertion counter and new session when authentication audit fails', async () => {
  const enrolled = await enroll()
  const first = await beginPasskeyAuthentication(f.ctx, null, ip, key)
  await f.execute("CREATE TRIGGER fail_passkey_auth_audit BEFORE INSERT ON audit_events WHEN NEW.action='passkey.authenticate' BEGIN SELECT RAISE(ABORT,'fixture_audit_failure'); END").run()
  enrolled.fixture.state.counter = 1
  await expect(finishPasskeyAuthentication(f.ctx, null, first.flowToken, await enrolled.fixture.authentication(first.options.challenge, enrolled.start.options.user.id), ip, key)).rejects.toThrow()
  expect(await f.execute('SELECT counter FROM passkey_credentials').first('counter')).toBe(0)
  expect(await f.execute('SELECT count(*) AS n FROM sessions WHERE revoked_at IS NULL').first('n')).toBe(1)
})
it('never reassigns a credential that is already bound to another account', async () => {
  const enrolled = await enroll()
  const other = await issueSession(f.ctx, { accountId: 'd', method: 'password' }, 'browser')
  const first = await beginPasskeyRegistration(f.ctx, other.principal, ip, key)
  await expect(finishPasskeyRegistration(f.ctx, other.principal, first.flowToken, await enrolled.fixture.registration(first.options.challenge), 'Foreign', ip, key)).rejects.toMatchObject({ code: 'conflict' })
  expect(await f.execute('SELECT account_id FROM passkey_credentials').first('account_id')).toBe('c')
  expect((await resolveSession(f.ctx, other.token, 'browser')).assurance).toBe('authenticated')
})
