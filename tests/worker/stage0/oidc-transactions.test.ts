import { beforeEach, expect, it } from 'vitest'
import * as client from 'openid-client'
import { databaseFixture } from './database'
import { callback, oidcProviderFixture, settings } from './oidc-protocol-fixture'
import { issueSession, resolveSession } from '../../../src/cloudflare/stage0/auth/sessions'
import { startOidcTransaction, completeOidcTransaction, oidcBindingCookie, readOidcBindingCookie } from '../../../src/cloudflare/stage0/auth/oidc/transactions'

let f: Awaited<ReturnType<typeof databaseFixture>>
const budgetKey = new Uint8Array(32).fill(17)
beforeEach(async () => {
  f = await databaseFixture()
  await f.execute("INSERT INTO identity_connections(id,protocol,provider,issuer,client_id,created_at) VALUES('google','oidc','google','https://accounts.google.com','fixture-client',1)").run()
  await f.execute("INSERT INTO external_identities(id,account_id,connection_id,issuer,subject,created_at) VALUES('existing','d','google','https://accounts.google.com','exact-subject',1)").run()
})
async function flow(purpose: 'login' | 'link' = 'login', principal?: Awaited<ReturnType<typeof issueSession>>['principal']) {
  const provider = await oidcProviderFixture('google')
  const started = await startOidcTransaction(f.ctx, settings('google'), { purpose, principal, ip: '127.0.0.1' }, budgetKey, provider.fetcher)
  const url = new URL(started.authorizationUrl)
  provider.state.claims.nonce = url.searchParams.get('nonce')!
  provider.state.claims.auth_time = Math.floor(f.ctx.clock.now() / 1000)
  const fetcher: typeof provider.fetcher = async (target, init) => {
    if (target.includes('oauth2.googleapis.com/token')) {
      const form = new URLSearchParams(String(init.body))
      if (await client.calculatePKCECodeChallenge(form.get('code_verifier')!) !== url.searchParams.get('code_challenge')) return Response.json({ error: 'invalid_grant' }, { status: 400 })
      // The fixture independently checked the actual derived verifier above;
      // translate only for its fixed baseline token-endpoint expectations.
      form.set('code_verifier', 'v'.repeat(43))
      return provider.fetcher(target, { ...init, body: form })
    }
    return provider.fetcher(target, init)
  }
  const resultUrl = callback('google')
  resultUrl.searchParams.set('state', url.searchParams.get('state')!)
  return { started, provider, fetcher, url: resultUrl }
}

it('binds a code flow to one browser and stores no raw state, nonce, verifier, binding or provider secret', async () => {
  const attempt = await flow()
  const rows = JSON.stringify((await f.execute('SELECT * FROM oidc_transactions').all()).results)
  for (const secret of [attempt.started.browserBinding, attempt.url.searchParams.get('state')!, new URL(attempt.started.authorizationUrl).searchParams.get('nonce')!, 'fixture-client-secret']) expect(rows).not.toContain(secret)
  const completed = await completeOidcTransaction(f.ctx, settings('google'), attempt.url, attempt.started.browserBinding, attempt.fetcher)
  expect(completed.kind).toBe('signed_in')
  if (completed.kind !== 'signed_in') throw new Error('Wrong outcome')
  expect((await resolveSession(f.ctx, completed.session.token, 'browser')).accountId).toBe('d')
  await expect(completeOidcTransaction(f.ctx, settings('google'), attempt.url, attempt.started.browserBinding, attempt.fetcher)).rejects.toMatchObject({ code: 'unauthenticated' })
})

it('rejects another browser, mixed provider, malformed or duplicate state without consuming the real flow', async () => {
  const a = await flow()
  await expect(completeOidcTransaction(f.ctx, settings('google'), a.url, 'x'.repeat(43), a.fetcher)).rejects.toMatchObject({ code: 'unauthenticated' })
  const duplicate = new URL(a.url)
  duplicate.searchParams.append('state', 'extra')
  await expect(completeOidcTransaction(f.ctx, settings('google'), duplicate, a.started.browserBinding, a.fetcher)).rejects.toMatchObject({ code: 'unauthenticated' })
  await expect(completeOidcTransaction(f.ctx, settings('microsoft'), a.url, a.started.browserBinding, a.fetcher)).rejects.toMatchObject({ code: 'unauthenticated' })
  expect((await completeOidcTransaction(f.ctx, settings('google'), a.url, a.started.browserBinding, a.fetcher)).kind).toBe('signed_in')
})

it('claims a callback once before exchange, including concurrent callbacks and failed verification', async () => {
  const a = await flow()
  const results = await Promise.allSettled([1, 2].map(() => completeOidcTransaction(f.ctx, settings('google'), a.url, a.started.browserBinding, a.fetcher)))
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  const failed = await flow()
  failed.provider.state.badSignature = true
  await expect(completeOidcTransaction(f.ctx, settings('google'), failed.url, failed.started.browserBinding, failed.fetcher)).rejects.toMatchObject({ code: 'unauthenticated' })
  failed.provider.state.badSignature = false
  await expect(completeOidcTransaction(f.ctx, settings('google'), failed.url, failed.started.browserBinding, failed.fetcher)).rejects.toMatchObject({ code: 'unauthenticated' })
})

it('expires at five minutes and rejects a changed connection configuration', async () => {
  const a = await flow()
  f.advance(300_000)
  await expect(completeOidcTransaction(f.ctx, settings('google'), a.url, a.started.browserBinding, a.fetcher)).rejects.toMatchObject({ code: 'unauthenticated' })
  const b = await flow()
  await f.execute("UPDATE identity_connections SET version=2,client_id='other-client' WHERE id='google'").run()
  await expect(completeOidcTransaction(f.ctx, settings('google'), b.url, b.started.browserBinding, b.fetcher)).rejects.toMatchObject({ code: 'unauthenticated' })
})

it('binds linking to the initiating session and account rather than whichever cookie returns', async () => {
  const a = await issueSession(f.ctx, { accountId: 'a', method: 'passkey' }, 'browser')
  await f.execute("DELETE FROM external_identities WHERE id='existing'").run()
  const link = await flow('link', a.principal)
  const completed = await completeOidcTransaction(f.ctx, settings('google'), link.url, link.started.browserBinding, link.fetcher)
  expect(completed.kind).toBe('linked')
  expect(await f.execute('SELECT account_id FROM external_identities').first('account_id')).toBe('a')
  expect(await f.execute('SELECT count(*) AS n FROM sessions').first('n')).toBe(1)
  const revoked = await flow('link', a.principal)
  await f.execute('UPDATE sessions SET revoked_at=? WHERE id=?', f.ctx.clock.now(), a.principal.sessionId).run()
  await expect(completeOidcTransaction(f.ctx, settings('google'), revoked.url, revoked.started.browserBinding, revoked.fetcher)).rejects.toMatchObject({ code: 'unauthenticated' })
})

it('rejects weak administrator proof before starting and limits provider starts durably', async () => {
  const weak = await issueSession(f.ctx, { accountId: 'a', method: 'password' }, 'browser')
  await expect(flow('link', weak.principal)).rejects.toMatchObject({ code: 'forbidden' })
  for (let n = 0; n < 5; n++) await flow()
  await expect(flow()).rejects.toMatchObject({ code: 'rate_limited' })
  expect(await f.execute('SELECT count(*) AS n FROM oidc_transactions').first('n')).toBe(5)
})

it('uses a separate host-only Lax HttpOnly callback binding cookie and rejects duplicates', async () => {
  const a = await flow()
  const hosted = { ...f.ctx.config, environment: 'development' as const, origin: 'https://dev.ovelle.org', rpId: 'dev.ovelle.org' }
  expect(oidcBindingCookie(hosted, a.started.browserBinding)).toBe(`__Host-ovelle_oidc=${a.started.browserBinding}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300`)
  expect(oidcBindingCookie(hosted, null)).toContain('Max-Age=0')
  const cookie = `ovelle_local_oidc=${a.started.browserBinding}`
  expect(readOidcBindingCookie(f.ctx.config, new Request(a.url, { headers: { Cookie: cookie } }))).toBe(a.started.browserBinding)
  expect(() => readOidcBindingCookie(f.ctx.config, new Request(a.url, { headers: { Cookie: `${cookie}; ${cookie}` } }))).toThrow()
  expect(() => readOidcBindingCookie(f.ctx.config, new Request(a.url))).toThrow()
})
