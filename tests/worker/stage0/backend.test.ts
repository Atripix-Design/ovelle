import { beforeEach, expect, it } from 'vitest'
import * as client from 'openid-client'
import { databaseFixture } from './database'
import { oidcProviderFixture } from './oidc-protocol-fixture'
import { passkeyFixture } from './passkey-fixture'
import { createStage0Backend } from '../../../src/cloudflare/stage0/backend'
import { loadStage0Config } from '../../../src/cloudflare/stage0/config'
import { issueSession, resolveSession } from '../../../src/cloudflare/stage0/auth/sessions'
import { randomSecret } from '../../../src/cloudflare/stage0/auth/secrets'

let f: Awaited<ReturnType<typeof databaseFixture>>
const origin = 'https://dev.ovelle.org'
const ip = '192.0.2.19'
const encodedKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(29))).replaceAll('=', '')
const backendEnv = () => ({ APP_ENV: 'development', AUTH_ORIGIN: origin, AUTH_RP_ID: 'dev.ovelle.org', AUTH_EMAIL_FROM: 'accounts@auth.example.test',
  TURNSTILE_SITE_KEY: 'fixture-site', TURNSTILE_SECRET_KEY: 'fixture-secret', AUTH_ADMISSION_KEY: encodedKey,
  AUTH_GOOGLE_CONNECTION_ID: 'google', AUTH_GOOGLE_CONNECTION_VERSION: '1', AUTH_GOOGLE_CLIENT_ID: 'fixture-client', AUTH_GOOGLE_CLIENT_SECRET: 'fixture-client-secret' })
const email = { async send() { return { messageId: 'fixture-mail' } } }
beforeEach(async () => {
  f = await databaseFixture()
  f.ctx.config = loadStage0Config(backendEnv())
})
function backend() { return createStage0Backend(backendEnv(), { db: f.db, email, clock: f.ctx.clock, ids: f.ctx.ids }) }
const req = (path: string, method = 'GET', headers: Record<string, string> = {}, body?: unknown) => new Request(origin + path, {
  method, headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})
const browserPaths = [
  '/api/v1/auth/prelogin', '/api/v1/auth/enrollment', '/api/v1/auth/enrollment/contact', '/api/v1/auth/enrollment/confirm',
  '/api/v1/auth/oidc/google/start', '/api/v1/auth/oidc/google/link', '/api/v1/auth/oidc/google/recovery', '/api/v1/auth/oidc/google/callback',
  '/api/v1/auth/oidc/microsoft/start', '/api/v1/auth/oidc/microsoft/link', '/api/v1/auth/oidc/microsoft/recovery', '/api/v1/auth/oidc/microsoft/callback',
  '/api/v1/auth/saml/start', '/api/v1/auth/saml/link', '/api/v1/auth/saml/callback', '/api/v1/auth/saml/enrollment', '/api/v1/auth/saml/enrollment/contact', '/api/v1/auth/saml/enrollment/confirm',
  '/api/v1/auth/passkeys/register/start', '/api/v1/auth/passkeys/register/finish', '/api/v1/auth/passkeys/login/start', '/api/v1/auth/passkeys/login/finish',
  '/api/v1/auth/passkeys/step-up/start', '/api/v1/auth/passkeys/step-up/finish', '/api/v1/auth/recovery/codes', '/api/v1/auth/recovery/consume',
  '/api/v1/auth/desktop/approve', '/api/v1/auth/session/rotate',
]
const sharedPaths = [
  '/api/v1/me', '/api/v1/auth/logout', '/api/v1/auth/logout-all', '/api/v1/me/organizations', '/api/v1/organizations', '/api/v1/organizations/org-a',
  '/api/v1/organizations/org-a/programs', '/api/v1/organizations/org-a/programs/a1', '/api/v1/organizations/org-a/locations', '/api/v1/organizations/org-a/locations/ax',
  '/api/v1/organizations/org-a/policies', '/api/v1/organizations/org-a/audit', '/api/v1/organizations/org-a/invitations',
  '/api/v1/organizations/org-a/invitations/offer', '/api/v1/organizations/org-a/invitations/offer/resend', '/api/v1/organizations/org-a/invitations/offer/revoke',
  '/api/v1/invitations/preview', '/api/v1/invitations/accept', '/api/v1/organizations/org-a/memberships', '/api/v1/organizations/org-a/memberships/member',
  '/api/v1/organizations/org-a/memberships/member/grants', '/api/v1/organizations/org-a/memberships/member/revoke',
  '/api/v1/organizations/org-a/ownership-transfer', '/api/v1/organizations/org-a/ownership-transfer/offer',
  '/api/v1/organizations/org-a/ownership-transfer/offer/accept', '/api/v1/organizations/org-a/ownership-transfer/offer/revoke',
]

it('validates hosted configuration, mail binding and canonical stable admission key before serving', () => {
  for (const invalid of ['', 'a'.repeat(43), 'x'.repeat(44), ' '+encodedKey, 1, undefined]) {
    expect(() => createStage0Backend({ ...backendEnv(), AUTH_ADMISSION_KEY: invalid }, { db: f.db, email })).toThrowError('configuration')
  }
  expect(() => createStage0Backend({ ...backendEnv(), STAGE0_AUTH_ENABLED: 'true' }, { db: f.db, email })).toThrowError('configuration')
  expect(() => createStage0Backend({ ...backendEnv(), AUTH_ORIGIN: 'https://ovelle.org' }, { db: f.db, email })).toThrowError('configuration')
  expect(() => createStage0Backend(backendEnv(), { db: f.db, email: {} as typeof email })).toThrowError('configuration')
})

it('routes every existing adapter family without exposing browser-only ceremonies to the native surface', async () => {
  const app = backend()
  for (const path of [...browserPaths, ...sharedPaths]) expect((await app.browser(req(path, 'OPTIONS'), ip)).status, path).toBe(405)
  for (const path of [...sharedPaths, '/api/v1/auth/desktop/requests', '/api/v1/auth/desktop/exchange']) expect((await app.desktop(req(path, 'OPTIONS'), ip)).status, path).toBe(405)
  for (const path of browserPaths) expect((await app.desktop(req(path), ip)).status, path).toBe(404)
  for (const path of ['/api/v1/auth/desktop/requests', '/api/v1/auth/desktop/exchange']) expect((await app.browser(req(path), ip)).status).toBe(404)
  for (const path of ['/api/v1/auth/password/login', '/api/v1/auth/oidc/other/start', '/api/v1/organizations/org-a/documents', '/api/v1/me/unknown', '/api/v1/auth/prelogin/']) {
    expect((await app.browser(req(path), ip)).status).toBe(404)
    expect((await app.desktop(req(path), ip)).status).toBe(404)
  }
})

it('never infers transport from credentials, absent Origin, or caller-selected transport fields', async () => {
  const app = backend()
  // These are trusted fixture sessions, not evidence of password authentication.
  const browser = await issueSession(f.ctx, { accountId: 'a', method: 'password' }, 'browser')
  const native = await issueSession(f.ctx, { accountId: 'a', method: 'password' }, 'desktop')
  const cookie = { Cookie: `__Host-ovelle_session=${browser.token}` }
  const bearer = { Authorization: `Bearer ${native.token}` }
  expect((await app.browser(req('/api/v1/me', 'GET', cookie), ip)).status).toBe(200)
  expect((await app.desktop(req('/api/v1/me', 'GET', bearer), ip)).status).toBe(200)
  expect((await app.browser(req('/api/v1/me', 'GET', bearer), ip)).status).toBe(401)
  expect((await app.desktop(req('/api/v1/me', 'GET', cookie), ip)).status).toBe(401)
  expect((await app.browser(req('/api/v1/me?transport=desktop', 'GET', bearer), ip)).status).toBe(400)
  expect((await app.desktop(req('/api/v1/me', 'GET', { ...bearer, Origin: origin }), ip)).status).toBe(401)
  const denied = await app.browser(req('/api/v1/auth/logout', 'POST', { ...cookie, 'X-Transport': 'desktop' }, { transport: 'desktop' }), ip)
  expect(denied.status).toBe(403)
  expect((await resolveSession(f.ctx, browser.token, 'browser')).accountId).toBe('a')
})

it('selects native transport only at fixed native URLs in the combined server entry point', async () => {
  const app = backend()
  const browser = await issueSession(f.ctx, { accountId: 'a', method: 'password' }, 'browser')
  const native = await issueSession(f.ctx, { accountId: 'a', method: 'password' }, 'desktop')
  const cookie = { Cookie: `__Host-ovelle_session=${browser.token}` }
  const bearer = { Authorization: `Bearer ${native.token}` }
  expect((await app.fetch(req('/api/v1/me', 'GET', cookie), ip)).status).toBe(200)
  expect((await app.fetch(req('/api/v1/native/me', 'GET', bearer), ip)).status).toBe(200)
  expect((await app.fetch(req('/api/v1/me', 'GET', bearer), ip)).status).toBe(401)
  expect((await app.fetch(req('/api/v1/native/me', 'GET', cookie), ip)).status).toBe(401)
  expect((await app.fetch(req('/api/v1/native/auth/prelogin'), ip)).status).toBe(404)
  expect((await app.fetch(req('/api/v1/native/auth/desktop/approve'), ip)).status).toBe(404)
  expect((await app.fetch(req('/api/v1/native/me?transport=browser', 'GET', bearer), ip)).status).toBe(400)
  for (const path of ['/api/v1/native', '/api/v1/native//me', '/api/v1/native/%6de', '/api/v1/native/auth/desktop/requests', '/api/v1/native/auth/desktop/exchange']) expect((await app.fetch(req(path, 'GET', bearer), ip)).status).toBe(404)
  const pending = await app.fetch(req('/api/v1/auth/desktop/requests', 'POST', {}, { state: randomSecret(), challenge: await client.calculatePKCECodeChallenge(randomSecret()), callbackUri: 'http://127.0.0.1:52143/ovelle-auth/callback' }), ip)
  expect(pending.status).toBe(201)
  const browserAttempt = await app.fetch(req('/api/v1/auth/desktop/requests', 'POST', { ...cookie, Origin: origin }, {}), ip)
  expect(browserAttempt.status).toBe(403)
})

it('keeps origin, no-CORS, no-store and server-generated request IDs consistent even on errors', async () => {
  const app = backend()
  const first = await app.browser(req('/api/v1/auth/prelogin', 'GET', { 'X-Request-ID': 'caller-secret' }), ip)
  const second = await app.browser(req('/api/v1/unknown'), ip)
  expect(first.status).toBe(200); expect(second.status).toBe(404)
  expect(first.headers.get('X-Request-ID')).not.toBe('caller-secret')
  expect(first.headers.get('X-Request-ID')).not.toBe(second.headers.get('X-Request-ID'))
  for (const response of [first, second, await app.browser(new Request('https://ovelle.org/api/v1/auth/prelogin'), ip), await app.desktop(req('/api/v1/me'), '')]) {
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
    expect(response.headers.get('Content-Security-Policy')).toBe("default-src 'none'; frame-ancestors 'none'")
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
  }
  expect((await app.browser(new Request('https://ovelle.org/api/v1/auth/prelogin'), ip)).status).toBe(403)
  expect((await app.desktop(req('/api/v1/me'), '')).status).toBe(503)
})

it('captures the stable admission key and uses only the server-supplied IP for durable native start limits', async () => {
  const env = backendEnv()
  const app = createStage0Backend(env, { db: f.db, email, clock: f.ctx.clock, ids: f.ctx.ids })
  for (let index = 0; index < 6; index++) {
    env.AUTH_ADMISSION_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(index))).replaceAll('=', '')
    const response = await app.desktop(req('/api/v1/auth/desktop/requests', 'POST', { 'X-Forwarded-For': `192.0.2.${index}`, 'CF-Connecting-IP': `192.0.2.${index}` },
      { state: randomSecret(), challenge: await client.calculatePKCECodeChallenge(randomSecret()), callbackUri: 'http://127.0.0.1:52143/ovelle-auth/callback' }), ip)
    expect(response.status).toBe(index < 5 ? 201 : 429)
  }
  expect(await f.execute('SELECT count(*) AS n FROM desktop_auth_requests').first('n')).toBe(5)
})

it('composes signed provider login, passkey enrollment and recovery-code issuance with cookie-only credentials', async () => {
  await f.execute("INSERT INTO identity_connections(id,protocol,provider,issuer,client_id,created_at) VALUES('google','oidc','google','https://accounts.google.com','fixture-client',1)").run()
  await f.execute("INSERT INTO external_identities(id,account_id,connection_id,issuer,subject,created_at) VALUES('google-d','d','google','https://accounts.google.com','exact-subject',1)").run()
  let authorization: URL
  const provider = await oidcProviderFixture('google', { origin, now: f.ctx.clock.now, validateGrant: async form =>
    form.get('code') === 'one-time-code' && await client.calculatePKCECodeChallenge(form.get('code_verifier')!) === authorization.searchParams.get('code_challenge') })
  const app = createStage0Backend(backendEnv(), { db: f.db, email, clock: f.ctx.clock, ids: f.ctx.ids, providerFetch: provider.fetcher,
    turnstileFetch: async () => Response.json({ success: true, hostname: 'dev.ovelle.org', action: 'oidc_login', challenge_ts: new Date(f.ctx.clock.now()).toISOString() }) })
  const jar = new Map<string, string>()
  function remember(response: Response) {
    for (const value of response.headers.getSetCookie()) {
      const [name, token] = value.split(';')[0].split('=')
      if (value.includes('Max-Age=0')) jar.delete(name); else jar.set(name, token)
    }
  }
  async function call(path: string, method = 'GET', body?: unknown, csrf?: string) {
    const response = await app.fetch(req(path, method, { Cookie: [...jar].map(([name, token]) => `${name}=${token}`).join('; '), ...(method === 'POST' ? { Origin: origin } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}) }, body), ip)
    remember(response); return response
  }
  const prelogin = await call('/api/v1/auth/prelogin')
  const csrf = (await prelogin.json() as { csrfToken: string }).csrfToken
  const start = await call('/api/v1/auth/oidc/google/start', 'POST', { turnstileToken: 'fixture-token' }, csrf)
  expect(start.status).toBe(200)
  authorization = new URL((await start.json() as { authorizationUrl: string }).authorizationUrl)
  provider.state.claims.nonce = authorization.searchParams.get('nonce')!
  const callback = await call('/api/v1/auth/oidc/google/callback?code=one-time-code&state='+authorization.searchParams.get('state'))
  expect(callback.status).toBe(303); expect(callback.headers.get('Location')).toBe('/account')
  expect(jar.has('__Host-ovelle_oidc')).toBe(false)
  expect(jar.has('__Host-ovelle_prelogin')).toBe(false)
  expect(jar.has('__Host-ovelle_session')).toBe(true)
  const me = await call('/api/v1/me')
  const account = await me.json() as { account: { id: string }; csrfToken: string }
  expect(account.account.id).toBe('d')
  const register = await call('/api/v1/auth/passkeys/register/start', 'POST', {}, account.csrfToken)
  expect(register.status).toBe(200)
  const challenge = (await register.json() as { options: { challenge: string } }).options.challenge
  const authenticator = await passkeyFixture(); authenticator.state.origin = origin; authenticator.state.rp = 'dev.ovelle.org'
  const finish = await call('/api/v1/auth/passkeys/register/finish', 'POST', { response: await authenticator.registration(challenge), name: 'Composed passkey' }, account.csrfToken)
  expect(finish.status).toBe(200)
  expect(jar.has('__Host-ovelle_passkey')).toBe(false)
  const strong = await call('/api/v1/me')
  const strongAccount = await strong.json() as { csrfToken: string; session: { assurance: string } }
  expect(strongAccount.session.assurance).toBe('passkey')
  const codes = await call('/api/v1/auth/recovery/codes', 'POST', { expectedVersion: 0, confirmation: true }, strongAccount.csrfToken)
  expect(codes.status).toBe(200)
  expect((await codes.json() as { codes: string[] }).codes).toHaveLength(8)
  expect(codes.headers.getSetCookie()).toHaveLength(0)
})
