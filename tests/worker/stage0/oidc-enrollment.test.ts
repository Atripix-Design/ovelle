import { beforeEach, expect, it } from 'vitest'
import { databaseFixture } from './database'
import { callback, oidcProviderFixture, secrets, settings } from './oidc-protocol-fixture'
import { verifyOidcCode } from '../../../src/cloudflare/stage0/auth/oidc/protocol'
import { beginOidcEnrollment, getOidcEnrollment, submitOidcContact, confirmOidcContact } from '../../../src/cloudflare/stage0/auth/oidc/enrollment'
import { resolveSession } from '../../../src/cloudflare/stage0/auth/sessions'
const key = new Uint8Array(32).fill(9)
let f: Awaited<ReturnType<typeof databaseFixture>>
beforeEach(async () => {
  f = await databaseFixture()
  await f.execute("INSERT INTO identity_connections(id,protocol,provider,issuer,client_id,created_at) VALUES('google','oidc','google','https://accounts.google.com','fixture-client',1)").run()
  await f.execute("INSERT INTO identity_connections(id,protocol,provider,issuer,client_id,created_at) VALUES('microsoft','oidc','microsoft','https://login.microsoftonline.com/{tenantid}/v2.0','fixture-client',1)").run()
})
async function proof(provider: 'google' | 'microsoft' = 'google') {
  const p = await oidcProviderFixture(provider)
  return verifyOidcCode(f.ctx, settings(provider), { ...secrets, createdAt: f.ctx.clock.now() }, callback(provider), p.fetcher)
}
async function start(provider: 'google' | 'microsoft' = 'google') { return beginOidcEnrollment(f.ctx, await proof(provider)) }
const contact = { email: 'new@example.test', displayName: 'New Person', ip: '127.0.0.1' }
const deliveredToken = (index = f.ctx.sent.length - 1) => new URLSearchParams(new URL(f.ctx.sent[index].url).hash.slice(1)).get('token')!

it('stores only a digest of the browser capability and returns safe hints without creating accounts or roles', async () => {
  const enrollment = await start()
  expect(enrollment.token).toMatch(/^[\w-]{43}$/)
  expect(JSON.stringify((await f.execute('SELECT * FROM oidc_enrollments').all()).results)).not.toContain(enrollment.token)
  expect(await getOidcEnrollment(f.ctx, enrollment.token)).toMatchObject({ emailHint: 'person@gmail.com', displayNameHint: 'Example Person', csrfToken: expect.stringMatching(/^[\w-]{43}$/) })
  expect(await f.execute('SELECT count(*) AS n FROM accounts').first('n')).toBe(4)
  expect(await f.execute('SELECT count(*) AS n FROM external_identities').first('n')).toBe(0)
})
it('uses authoritative Google contact only after explicit submission, and grants no organization access', async () => {
  const enrollment = await start()
  const session = await submitOidcContact(f.ctx, enrollment.token, { ...contact, email: ' Person@Gmail.com ' }, key)
  expect(session).not.toBeNull()
  const principal = await resolveSession(f.ctx, session!.token, 'browser')
  expect(principal).toMatchObject({ method: 'oidc', assurance: 'authenticated' })
  expect(await f.execute('SELECT email_verified_at FROM accounts WHERE id=?', principal.accountId).first('email_verified_at')).toBe(f.ctx.clock.now())
  expect(await f.execute('SELECT count(*) AS n FROM organization_memberships WHERE account_id=?', principal.accountId).first('n')).toBe(0)
  expect(f.ctx.sent).toHaveLength(0)
  await expect(getOidcEnrollment(f.ctx, enrollment.token)).rejects.toMatchObject({ code: 'unauthenticated' })
})
it('requires separate contact proof for Microsoft and for a different nominated Google address', async () => {
  for (const provider of ['microsoft', 'google'] as const) {
    const enrollment = await start(provider)
    const email = `${provider}@example.test`
    expect(await submitOidcContact(f.ctx, enrollment.token, { ...contact, email }, key)).toBeNull()
    const token = deliveredToken()
    expect(f.ctx.sent.at(-1)).toMatchObject({ to: email, kind: 'verification' })
    expect(new URL(f.ctx.sent.at(-1)!.url).search).toBe('')
    const row = JSON.stringify((await f.execute('SELECT * FROM oidc_enrollments').all()).results)
    expect(row).not.toContain(token)
    // Reading a status or an email landing page cannot consume the token.
    await getOidcEnrollment(f.ctx, enrollment.token)
    expect(await f.execute('SELECT count(*) AS n FROM accounts').first('n')).toBe(provider === 'microsoft' ? 4 : 5)
    const session = await confirmOidcContact(f.ctx, enrollment.token, token, contact.ip, key)
    expect((await resolveSession(f.ctx, session.token, 'browser')).method).toBe('oidc')
    await expect(confirmOidcContact(f.ctx, enrollment.token, token, contact.ip, key)).rejects.toMatchObject({ code: 'unauthenticated' })
  }
})
it('never links or modifies an existing account by email and does not disclose suppressed delivery', async () => {
  const enrollment = await start('microsoft')
  expect(await submitOidcContact(f.ctx, enrollment.token, { ...contact, email: 'a@example.test' }, key)).toBeNull()
  expect(f.ctx.sent).toHaveLength(0)
  expect(await getOidcEnrollment(f.ctx, enrollment.token)).not.toHaveProperty('delivery')
  expect(await f.execute('SELECT count(*) AS n FROM external_identities').first('n')).toBe(0)
  expect(await f.execute("SELECT display_name FROM accounts WHERE id='a'").first('display_name')).toBe('A')
  await expect(confirmOidcContact(f.ctx, enrollment.token, 'x'.repeat(43), contact.ip, key)).rejects.toMatchObject({ code: 'unauthenticated' })
})
it('rotates contact challenges on resend', async () => {
  const enrollment = await start('microsoft')
  await submitOidcContact(f.ctx, enrollment.token, contact, key)
  const old = deliveredToken()
  await submitOidcContact(f.ctx, enrollment.token, contact, key)
  await expect(confirmOidcContact(f.ctx, enrollment.token, old, contact.ip, key)).rejects.toMatchObject({ code: 'unauthenticated' })
  const current = deliveredToken()
  expect(current).not.toBe(old)
  expect(await confirmOidcContact(f.ctx, enrollment.token, current, contact.ip, key)).toHaveProperty('token')
})
it('keeps a delayed old delivery result from overwriting the current challenge', async () => {
  const enrollment = await start('microsoft')
  const send = f.ctx.mailer.send
  let release!: () => void
  let entered!: () => void
  const waiting = new Promise<void>(resolve => { entered = resolve })
  const delayed = new Promise<void>(resolve => { release = resolve })
  let count = 0
  f.ctx.mailer.send = async message => {
    await send(message)
    if (++count === 1) { entered(); await delayed; throw new Error('Old delivery failed') }
    return { status: 'accepted', providerId: 'fixture-delivery' }
  }
  const old = submitOidcContact(f.ctx, enrollment.token, contact, key)
  await waiting
  await submitOidcContact(f.ctx, enrollment.token, contact, key)
  release(); await old
  expect(await f.execute('SELECT delivery FROM oidc_enrollments').first('delivery')).toBe('accepted')
  expect(await f.execute('SELECT contact_version FROM oidc_enrollments').first('contact_version')).toBe(2)
  await expect(confirmOidcContact(f.ctx, enrollment.token, deliveredToken(0), contact.ip, key)).rejects.toMatchObject({ code: 'unauthenticated' })
  expect(await confirmOidcContact(f.ctx, enrollment.token, deliveredToken(1), contact.ip, key)).toHaveProperty('token')
})
it('does not attach a proven identity when another account claims its nominated email before confirmation', async () => {
  const enrollment = await start('microsoft')
  await submitOidcContact(f.ctx, enrollment.token, contact, key)
  await f.execute('INSERT INTO accounts(id,email,display_name,email_verified_at,created_at) VALUES(?,?,?,?,?)', 'racer', contact.email, 'Other Account', f.ctx.clock.now(), f.ctx.clock.now()).run()
  await expect(confirmOidcContact(f.ctx, enrollment.token, deliveredToken(), contact.ip, key)).rejects.toMatchObject({ code: 'unauthenticated' })
  expect(await f.execute('SELECT count(*) AS n FROM external_identities').first('n')).toBe(0)
  expect(await f.execute("SELECT display_name FROM accounts WHERE id='racer'").first('display_name')).toBe('Other Account')
})
it('enforces Microsoft GUID tenant shape in persisted enrollment evidence', async () => {
  const invalid = 'x'.repeat(36)
  await expect(f.execute(`INSERT INTO oidc_enrollments(id,token_digest,provider,connection_id,connection_version,client_id,issuer,subject,tenant_id,contact_proved,created_at,expires_at)
    VALUES('bad',?,'microsoft','microsoft',1,'fixture-client',?,'subject',?,0,?,?)`, 'a'.repeat(64), `https://login.microsoftonline.com/${invalid}/v2.0`, invalid, f.ctx.clock.now(), f.ctx.clock.now() + 900_000).run()).rejects.toThrow()
})
it('records failed delivery after persistence and still returns the generic acknowledgment', async () => {
  const enrollment = await start('microsoft')
  f.ctx.mailer.send = async () => { throw new Error('private provider failure') }
  expect(await submitOidcContact(f.ctx, enrollment.token, contact, key)).toBeNull()
  expect(await f.execute('SELECT delivery FROM oidc_enrollments').first('delivery')).toBe('failed')
  expect(await f.execute('SELECT contact_digest FROM oidc_enrollments').first('contact_digest')).toMatch(/^[a-f0-9]{64}$/)
})
it('rejects another enrollment browser, wrong/expired secrets and replays, with durable failure quotas', async () => {
  const enrollment = await start('microsoft')
  await submitOidcContact(f.ctx, enrollment.token, contact, key)
  const token = deliveredToken()
  await expect(confirmOidcContact(f.ctx, 'x'.repeat(43), token, contact.ip, key)).rejects.toMatchObject({ code: 'unauthenticated' })
  for (let n = 0; n < 5; n++) await expect(confirmOidcContact(f.ctx, enrollment.token, 'x'.repeat(43), contact.ip, key)).rejects.toMatchObject({ code: 'unauthenticated' })
  await expect(confirmOidcContact(f.ctx, enrollment.token, token, contact.ip, key)).rejects.toMatchObject({ code: 'rate_limited' })
  f.advance(900_000)
  await expect(confirmOidcContact(f.ctx, enrollment.token, token, contact.ip, key)).rejects.toMatchObject({ code: 'unauthenticated' })
})
it('commits one account and identity under competing confirmations', async () => {
  const enrollment = await start('microsoft')
  await submitOidcContact(f.ctx, enrollment.token, contact, key)
  const token = deliveredToken()
  const results = await Promise.allSettled([1, 2].map(() => confirmOidcContact(f.ctx, enrollment.token, token, contact.ip, key)))
  expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1)
  expect(await f.execute('SELECT count(*) AS n FROM accounts').first('n')).toBe(5)
  expect(await f.execute('SELECT count(*) AS n FROM external_identities').first('n')).toBe(1)
})
it('rolls back account, identity and consumption if audit fails', async () => {
  const enrollment = await start()
  f.ctx.ids.next = () => 'duplicate'
  await expect(submitOidcContact(f.ctx, enrollment.token, { ...contact, email: 'person@gmail.com' }, key)).rejects.toThrow()
  expect(await f.execute('SELECT count(*) AS n FROM accounts').first('n')).toBe(4)
  expect(await f.execute('SELECT count(*) AS n FROM external_identities').first('n')).toBe(0)
  expect(await getOidcEnrollment(f.ctx, enrollment.token)).toHaveProperty('csrfToken')
})
it('does not accept deserialized proof or continue after connection revocation', async () => {
  await expect(beginOidcEnrollment(f.ctx, JSON.parse(JSON.stringify(await proof())))).rejects.toMatchObject({ code: 'unauthenticated' })
  const enrollment = await start('microsoft')
  await submitOidcContact(f.ctx, enrollment.token, contact, key)
  await f.execute("UPDATE identity_connections SET enabled=0,version=2 WHERE id='microsoft'").run()
  await expect(confirmOidcContact(f.ctx, enrollment.token, deliveredToken(), contact.ip, key)).rejects.toMatchObject({ code: 'unauthenticated' })
})
