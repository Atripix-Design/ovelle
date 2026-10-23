import { beforeEach, expect, it } from 'vitest'
import * as client from 'openid-client'
import { databaseFixture } from './database'
import { callback, oidcProviderFixture, settings } from './oidc-protocol-fixture'
import { handleOidcRequest, type OidcHttpDependencies } from '../../../src/cloudflare/stage0/auth/oidc/routes'
import { issueSession, resolveSession } from '../../../src/cloudflare/stage0/auth/sessions'
import { handleSessionRequest } from '../../../src/cloudflare/stage0/auth/routes'

let f: Awaited<ReturnType<typeof databaseFixture>>
let deps: OidcHttpDependencies
let provider: Awaited<ReturnType<typeof oidcProviderFixture>>
let authorization: URL
let calls: number
let jar: Map<string, string>
const origin = 'http://localhost:4173'
beforeEach(async () => {
  f = await databaseFixture(); jar = new Map(); calls = 0
  await f.execute("INSERT INTO identity_connections(id,protocol,provider,issuer,client_id,created_at) VALUES('google','oidc','google','https://accounts.google.com','fixture-client',1)").run()
  await f.execute("INSERT INTO external_identities(id,account_id,connection_id,issuer,subject,created_at) VALUES('existing','d','google','https://accounts.google.com','exact-subject',1)").run()
  provider = await oidcProviderFixture('google')
  deps = {
    budgetKey: new Uint8Array(32).fill(31), trustedIp: '127.0.0.1', turnstileSecret: 'fixture-secret',
    getSettings: async name => settings(name),
    turnstileFetch: async () => { calls++; return Response.json({ success: true, hostname: 'localhost', action: 'oidc_login', challenge_ts: new Date(f.ctx.clock.now()).toISOString() }) },
    providerFetch: async (url, options) => {
      if (url.includes('oauth2.googleapis.com/token')) {
        const form = new URLSearchParams(String(options.body))
        expect(await client.calculatePKCECodeChallenge(form.get('code_verifier')!)).toBe(authorization.searchParams.get('code_challenge'))
        form.set('code_verifier', 'v'.repeat(43))
        return provider.fetcher(url, { ...options, body: form })
      }
      return provider.fetcher(url, options)
    },
  }
})
function request(path: string, method = 'GET', body?: unknown, extra: Record<string, string> = {}) {
  return new Request(new URL(path, origin), { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }), headers: {
    Cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; '), ...(method === 'POST' ? { Origin: origin, 'Content-Type': 'application/json' } : {}), ...extra,
  } })
}
function remember(response: Response) {
  for (const line of response.headers.getSetCookie()) {
    const item = line.split(';')[0]; const separator = item.indexOf('=')
    if (line.includes('Max-Age=0')) jar.delete(item.slice(0, separator))
    else jar.set(item.slice(0, separator), item.slice(separator + 1))
  }
}
async function csrf() {
  const response = await handleOidcRequest(f.ctx, request('/api/v1/auth/prelogin'), deps)
  expect(response.status).toBe(200); remember(response)
  return (await response.json() as { csrfToken: string }).csrfToken
}
async function start() {
  const token = await csrf()
  const response = await handleOidcRequest(f.ctx, request('/api/v1/auth/oidc/google/start', 'POST', { turnstileToken: 'fixture-token' }, { 'X-CSRF-Token': token }), deps)
  expect(response.status).toBe(200); remember(response)
  authorization = new URL((await response.json() as { authorizationUrl: string }).authorizationUrl)
  provider.state.claims.nonce = authorization.searchParams.get('nonce')!
  const url = callback('google'); url.searchParams.set('state', authorization.searchParams.get('state')!)
  return url
}
it('completes a real signed fixture flow with cookie-only credentials and a fixed clean redirect', async () => {
  const url = await start()
  const response = await handleOidcRequest(f.ctx, request(url.href, 'GET', undefined, { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' }), deps)
  expect(response.status).toBe(303)
  expect(response.headers.get('Location')).toBe('/account')
  expect(await response.text()).toBe('')
  remember(response)
  expect(jar.has('ovelle_local_oidc')).toBe(false)
  expect(jar.has('ovelle_local_prelogin')).toBe(false)
  const token = jar.get('ovelle_local_session')!
  expect((await resolveSession(f.ctx, token, 'browser')).accountId).toBe('d')
  const me = await handleSessionRequest(f.ctx, request('/api/v1/me'), 'browser')
  expect(me.status).toBe(200)
  expect(await me.text()).not.toContain(token)
  expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
})
it('denies missing/cross-site CSRF, bearer mixing, wrong method, malformed or oversized JSON before external work', async () => {
  const token = await csrf()
  for (const changes of [{ Origin: 'null' }, { Origin: 'https://foreign.example' }, { 'X-CSRF-Token': '' }, { Authorization: 'Bearer fixture' }, { 'Sec-Fetch-Site': 'cross-site' }] as Record<string, string>[]) {
    expect((await handleOidcRequest(f.ctx, request('/api/v1/auth/oidc/google/start', 'POST', { turnstileToken: 'fixture-token' }, { 'X-CSRF-Token': token, ...changes }), deps)).status).toBe(403)
  }
  expect((await handleOidcRequest(f.ctx, request('/api/v1/auth/oidc/google/start'), deps)).status).toBe(405)
  for (const body of [null, [], { turnstileToken: 'x'.repeat(5000) }, { turnstileToken: 'fixture', returnTo: 'https://foreign.example' }]) {
    expect((await handleOidcRequest(f.ctx, request('/api/v1/auth/oidc/google/start', 'POST', body, { 'X-CSRF-Token': token }), deps)).status).toBe(400)
  }
  expect(calls).toBe(0)
})
it('consumes start limits before Turnstile and never calls the provider when challenge validation fails', async () => {
  const token = await csrf()
  let providerCalls = 0
  deps.turnstileFetch = async () => { calls++; return Response.json({ success: false }) }
  deps.providerFetch = async () => { providerCalls++; throw new Error('Must not fetch') }
  for (let n = 0; n < 5; n++) expect((await handleOidcRequest(f.ctx, request('/api/v1/auth/oidc/google/start', 'POST', { turnstileToken: `fixture-${n}` }, { 'X-CSRF-Token': token }), deps)).status).toBe(403)
  expect((await handleOidcRequest(f.ctx, request('/api/v1/auth/oidc/google/start', 'POST', { turnstileToken: 'sixth' }, { 'X-CSRF-Token': token }), deps)).status).toBe(429)
  expect(calls).toBe(5); expect(providerCalls).toBe(0)
})
it('routes new verified identities into enrollment and confirms an authoritative contact without leaking tokens', async () => {
  await f.execute("DELETE FROM external_identities WHERE id='existing'").run()
  const url = await start()
  const callbackResponse = await handleOidcRequest(f.ctx, request(url.href), deps)
  expect(callbackResponse.headers.get('Location')).toBe('/account/enroll'); remember(callbackResponse)
  expect(jar.has('ovelle_local_session')).toBe(false)
  const snapshot = await handleOidcRequest(f.ctx, request('/api/v1/auth/enrollment'), deps)
  const data = await snapshot.json() as { csrfToken: string; emailHint: string }
  expect(data.emailHint).toBe('person@gmail.com')
  const sent = await handleOidcRequest(f.ctx, request('/api/v1/auth/enrollment/contact', 'POST', { email: 'person@gmail.com', displayName: 'Person' }, { 'X-CSRF-Token': data.csrfToken }), deps)
  expect(sent.status).toBe(202); expect(await sent.json()).toEqual({ accepted: true }); remember(sent)
  expect(jar.has('ovelle_local_enrollment')).toBe(false)
  expect(jar.has('ovelle_local_session')).toBe(true)
})
it('GET never consumes an email challenge, and confirmation needs the initiating browser and CSRF', async () => {
  await f.execute("DELETE FROM external_identities WHERE id='existing'").run()
  const url = await start(); const response = await handleOidcRequest(f.ctx, request(url.href), deps); remember(response)
  const snapshot = await handleOidcRequest(f.ctx, request('/api/v1/auth/enrollment'), deps)
  const { csrfToken } = await snapshot.json() as { csrfToken: string }
  const contact = await handleOidcRequest(f.ctx, request('/api/v1/auth/enrollment/contact', 'POST', { email: 'new@example.test', displayName: 'Person' }, { 'X-CSRF-Token': csrfToken }), deps)
  expect(contact.status).toBe(202)
  const token = new URLSearchParams(new URL(f.ctx.sent[0].url).hash.slice(1)).get('token')!
  expect((await handleOidcRequest(f.ctx, request('/api/v1/auth/enrollment/confirm'), deps)).status).toBe(405)
  expect((await handleOidcRequest(f.ctx, request('/api/v1/auth/enrollment/confirm', 'POST', { token }), deps)).status).toBe(403)
  const confirmed = await handleOidcRequest(f.ctx, request('/api/v1/auth/enrollment/confirm', 'POST', { token }, { 'X-CSRF-Token': csrfToken }), deps)
  expect(confirmed.status).toBe(204); remember(confirmed)
  expect(jar.has('ovelle_local_session')).toBe(true)
  expect(await f.execute('SELECT count(*) AS n FROM accounts').first('n')).toBe(5)
})
it('does not expose provider errors or callback query parameters through redirect responses', async () => {
  const url = await start()
  provider.state.tokenError = true
  url.searchParams.set('returnTo', 'https://foreign.example')
  const response = await handleOidcRequest(f.ctx, request(url.href), deps)
  expect(response.status).toBe(303)
  expect(response.headers.get('Location')).toBe('/account/sign-in?result=failed')
  expect(JSON.stringify([...response.headers])).not.toMatch(/one-time-code|private upstream detail|foreign.example/)
  expect(await response.text()).toBe('')
})
it('links using account CSRF and recent admin proof, then preserves the existing session', async () => {
  await f.execute("DELETE FROM external_identities WHERE id='existing'").run()
  const a = await issueSession(f.ctx, { accountId: 'a', method: 'passkey' }, 'browser')
  jar.set('ovelle_local_session', a.token)
  deps.turnstileFetch = async () => Response.json({ success: true, hostname: 'localhost', action: 'oidc_link', challenge_ts: new Date(f.ctx.clock.now()).toISOString() })
  const response = await handleOidcRequest(f.ctx, request('/api/v1/auth/oidc/google/link', 'POST', { turnstileToken: 'fixture-token' }, { 'X-CSRF-Token': a.csrfToken! }), deps)
  expect(response.status).toBe(200); remember(response)
  authorization = new URL((await response.json() as { authorizationUrl: string }).authorizationUrl)
  provider.state.claims.nonce = authorization.searchParams.get('nonce')!
  provider.state.claims.auth_time = Math.floor(f.ctx.clock.now() / 1000)
  const url = callback('google'); url.searchParams.set('state', authorization.searchParams.get('state')!)
  // Strict account cookie is absent on the provider's cross-site redirect.
  jar.delete('ovelle_local_session')
  const linked = await handleOidcRequest(f.ctx, request(url.href), deps)
  expect(linked.headers.get('Location')).toBe('/account/security')
  expect(linked.headers.getSetCookie().some(cookie => cookie.startsWith('ovelle_local_session='))).toBe(false)
  expect((await resolveSession(f.ctx, a.token, 'browser')).accountId).toBe('a')
  expect(await f.execute('SELECT account_id FROM external_identities').first('account_id')).toBe('a')
})
it('attaches no-store, request ID, no-referrer and no CORS to successes and errors', async () => {
  for (const path of ['/api/v1/auth/prelogin', '/api/v1/auth/enrollment', '/api/v1/auth/unknown']) {
    const response = await handleOidcRequest(f.ctx, request(path), deps)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
    expect(response.headers.get('X-Request-ID')).toBe(f.ctx.requestId)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
  }
})
