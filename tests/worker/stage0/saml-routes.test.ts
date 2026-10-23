import { beforeEach, expect, it } from 'vitest'
import { inflateRawSync } from 'node:zlib'
import { databaseFixture } from './database'
import { encodedSaml, signedSamlResponse, persistent, publicKey, samlIssuer } from './saml-fixture'
import { handleSamlRequest, type SamlHttpDependencies } from '../../../src/cloudflare/stage0/auth/saml/routes'
import { beginPrelogin } from '../../../src/cloudflare/stage0/auth/prelogin'
import { issueSession, resolveSession, sessionCsrfSecret } from '../../../src/cloudflare/stage0/auth/sessions'
let f: Awaited<ReturnType<typeof databaseFixture>>, deps: SamlHttpDependencies, now: number, calls: number
let jar: Map<string, string>
const origin = 'http://localhost:4173', idp = 'https://identity.example.test'
const settings = { connectionId: 'saml-a', organizationId: 'org-a', connectionVersion: 1, issuer: samlIssuer, audience: 'https://ovelle.example.test/saml', nameIdFormat: persistent, signingKeys: [publicKey], entryPoint: idp + '/sso' }
beforeEach(async () => {
  f = await databaseFixture(); now = Date.now(); f.ctx.clock.now = () => now; calls = 0; jar = new Map()
  await f.execute("INSERT INTO identity_connections(id,organization_id,protocol,provider,issuer,created_at) VALUES('saml-a','org-a','saml','enterprise_saml',?,?)", samlIssuer, now).run()
  await f.execute("INSERT INTO external_identities(id,account_id,connection_id,issuer,subject,saml_name_id_format,created_at) VALUES('linked','d','saml-a',?,'stable-person-001',?,?)", samlIssuer, persistent, now).run()
  deps = { budgetKey: new Uint8Array(32).fill(23), trustedIp: '127.0.0.1', turnstileSecret: 'fixture-secret',
    getSettings: async connection => { if (connection !== 'saml-a') throw new Error('private-profile-details'); return settings },
    turnstileFetch: async (_url, init) => {
      calls++
      const values = new URLSearchParams(String(init.body))
      expect(values.get('remoteip')).toBe('127.0.0.1')
      expect(values.get('response')).toBe('fixture-token')
      return Response.json({ success: true, hostname: 'localhost', action: jar.has('ovelle_local_session') ? 'saml_link' : 'saml_login', challenge_ts: new Date(now).toISOString() })
    },
  }
})
function cookie() { return [...jar].map(([k, v]) => `${k}=${v}`).join('; ') }
function remember(response: Response) {
  for (const line of response.headers.getSetCookie()) {
    const [name, value] = line.split(';')[0].split('=')
    if (line.includes('Max-Age=0')) jar.delete(name); else jar.set(name, value)
  }
}
function req(path = '/callback', body?: string, extra: Record<string, string> = {}, method = 'POST') {
  return new Request(origin + '/api/v1/auth/saml' + path, { method, headers: { Cookie: cookie(), Origin: path.startsWith('/callback') ? idp : origin,
    'Content-Type': path.startsWith('/callback') ? 'application/x-www-form-urlencoded' : 'application/json', ...extra }, ...(body === undefined ? {} : { body }) })
}
async function start(link = false) {
  let csrf: string
  if (link) {
    const session = await issueSession(f.ctx, { accountId: 'a', method: 'passkey' }, 'browser')
    jar.set('ovelle_local_session', session.token); csrf = await sessionCsrfSecret(session.token)
  } else {
    const initial = await beginPrelogin(f.ctx, new Request(origin + '/api/v1/auth/prelogin'), deps.budgetKey)
    jar.set('ovelle_local_prelogin', initial.cookie.split(';')[0].split('=')[1]); csrf = initial.csrfToken
  }
  const response = await handleSamlRequest(f.ctx, req(link ? '/link' : '/start', JSON.stringify({ connectionId: 'saml-a', turnstileToken: 'fixture-token' }), { 'X-CSRF-Token': csrf }), deps)
  expect(response.status).toBe(200); remember(response)
  const data = await response.json() as { authorizationUrl: string }
  expect(Object.keys(data)).toEqual(['authorizationUrl'])
  const url = new URL(data.authorizationUrl)
  const xml = inflateRawSync(Buffer.from(url.searchParams.get('SAMLRequest')!, 'base64')).toString()
  const requestId = /\bID="([^"]+)"/.exec(xml)![1]
  const form = (extra: Partial<Parameters<typeof signedSamlResponse>[0]> = {}) => new URLSearchParams({ RelayState: url.searchParams.get('RelayState')!, SAMLResponse: encodedSaml(signedSamlResponse({ now, requestId, responseId: '_response-' + requestId, assertionId: '_assertion-' + requestId, callback: origin + '/api/v1/auth/saml/callback', audience: settings.audience, ...extra })) }).toString()
  return { response, form, url }
}
it('completes a real signed cross-site POST with a separate secure binding and cookie-only Strict session', async () => {
  const flow = await start()
  const binding = flow.response.headers.getSetCookie().find(x => x.startsWith('ovelle_local_saml='))!
  expect(binding).toContain('HttpOnly; Secure; SameSite=None; Max-Age=300')
  expect(binding).toContain('Path=/'); expect(binding).not.toContain('Domain=')
  const response = await handleSamlRequest(f.ctx, req('/callback', flow.form(), { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' }), deps)
  expect(response.status).toBe(303); expect(response.headers.get('Location')).toBe('/account'); expect(await response.text()).toBe('')
  remember(response)
  expect(jar.has('ovelle_local_saml')).toBe(false)
  expect(jar.has('ovelle_local_prelogin')).toBe(false)
  const token = jar.get('ovelle_local_session')!
  expect((await resolveSession(f.ctx, token, 'browser')).accountId).toBe('d')
  expect(response.headers.getSetCookie().find(x => x.startsWith('ovelle_local_session='))).toContain('SameSite=Strict')
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
})
it('links only the durable initiating account without requiring its Strict session on the cross-site POST', async () => {
  const flow = await start(true); jar.delete('ovelle_local_session')
  const response = await handleSamlRequest(f.ctx, req('/callback', flow.form({ subject: 'new-linked-person' })), deps)
  expect(response.headers.get('Location')).toBe('/account/security')
  expect(await f.execute("SELECT account_id FROM external_identities WHERE subject='new-linked-person'").first('account_id')).toBe('a')
  expect(response.headers.getSetCookie().some(x => x.startsWith('ovelle_local_session='))).toBe(false)
})
it.each(['missing-origin', 'foreign-origin', 'null-origin', 'bearer', 'iframe', 'fetch', 'query', 'duplicate-field', 'unknown-field', 'invalid-escape', 'oversized', 'wrong-content', 'missing-binding', 'duplicate-binding', 'swapped-selector'] as const)('rejects callback %s without session, consumption or leaked details', async change => {
  const flow = await start(); let body = flow.form(); const extra: Record<string, string> = {}; let path = '/callback'
  if (change === 'missing-origin') extra.Origin = ''
  if (change === 'foreign-origin') extra.Origin = 'https://foreign.example'
  if (change === 'null-origin') extra.Origin = 'null'
  if (change === 'bearer') extra.Authorization = 'Bearer private-token'
  if (change === 'iframe') extra['Sec-Fetch-Dest'] = 'iframe'
  if (change === 'fetch') extra['Sec-Fetch-Mode'] = 'cors'
  if (change === 'query') path += '?connectionId=saml-a'
  if (change === 'duplicate-field') body += '&RelayState=other'
  if (change === 'unknown-field') body += '&returnTo=https://foreign.example'
  if (change === 'invalid-escape') body += '%xx'
  if (change === 'oversized') body = 'SAMLResponse=' + 'x'.repeat(270_001)
  if (change === 'wrong-content') extra['Content-Type'] = 'text/plain'
  if (change === 'missing-binding') jar.delete('ovelle_local_saml')
  if (change === 'duplicate-binding') extra.Cookie = cookie() + '; ovelle_local_saml=other'
  if (change === 'swapped-selector') jar.set('ovelle_local_saml', jar.get('ovelle_local_saml')!.replace('saml-a.', 'saml-b.'))
  const response = await handleSamlRequest(f.ctx, req(path, body, extra), deps)
  expect(response.status).toBe(303); expect(response.headers.get('Location')).toBe('/account/sign-in?result=failed')
  expect(await response.text()).toBe(''); expect(response.headers.getSetCookie().some(x => x.startsWith('ovelle_local_saml=;'))).toBe(true)
  expect(await f.execute('SELECT count(*) AS n FROM sessions').first('n')).toBe(0)
  expect(await f.execute('SELECT consumed_at FROM saml_transactions').first('consumed_at')).toBeNull()
})
it('consumes quota before failed Turnstile and never persists a request on failed admission', async () => {
  const initial = await beginPrelogin(f.ctx, new Request(origin + '/api/v1/auth/prelogin'), deps.budgetKey)
  jar.set('ovelle_local_prelogin', initial.cookie.split(';')[0].split('=')[1])
  deps.turnstileFetch = async () => { calls++; return Response.json({ success: false }) }
  const send = () => handleSamlRequest(f.ctx, req('/start', JSON.stringify({ connectionId: 'saml-a', turnstileToken: 'fixture-token' }), { 'X-CSRF-Token': initial.csrfToken }), deps)
  for (let i = 0; i < 5; i++) expect((await send()).status).toBe(403)
  expect((await send()).status).toBe(429); expect(calls).toBe(5)
  expect(await f.execute('SELECT count(*) AS n FROM saml_transactions').first('n')).toBe(0)
})
it('denies CSRF, foreign Origin, bearer mixing and client-selected dependencies before Turnstile', async () => {
  const initial = await beginPrelogin(f.ctx, new Request(origin + '/api/v1/auth/prelogin'), deps.budgetKey)
  jar.set('ovelle_local_prelogin', initial.cookie.split(';')[0].split('=')[1])
  for (const extra of [{ 'X-CSRF-Token': '' }, { Origin: 'null' }, { Origin: 'https://foreign.example' }, { Authorization: 'Bearer private-token' }] as Record<string, string>[]) {
    expect((await handleSamlRequest(f.ctx, req('/start', JSON.stringify({ connectionId: 'saml-a', turnstileToken: 'fixture-token' }), { 'X-CSRF-Token': initial.csrfToken, ...extra }), deps)).status).toBe(403)
  }
  expect((await handleSamlRequest(f.ctx, req('/start', JSON.stringify({ connectionId: 'saml-a', turnstileToken: 'fixture-token', ip: '8.8.8.8' }), { 'X-CSRF-Token': initial.csrfToken }), deps)).status).toBe(400)
  expect(calls).toBe(0)
})
it('GET callbacks and starts never create or consume transactions', async () => {
  for (const path of ['/start', '/link', '/callback']) {
    const response = await handleSamlRequest(f.ctx, req(path, undefined, {}, 'GET'), deps)
    expect(response.status).toBe(405); expect(response.headers.get('Allow')).toBe('POST')
  }
  expect(await f.execute('SELECT count(*) AS n FROM saml_transactions').first('n')).toBe(0)
})
it('denies a missing Origin header, foreign application host and an unknown route', async () => {
  const flow = await start(), missing = req('/callback', flow.form()); missing.headers.delete('Origin')
  expect((await handleSamlRequest(f.ctx, missing, deps)).headers.get('Location')).toBe('/account/sign-in?result=failed')
  const foreign = new Request('https://foreign.example/api/v1/auth/saml/callback', { method: 'POST', body: flow.form() })
  expect((await handleSamlRequest(f.ctx, foreign, deps)).status).toBe(403)
  expect((await handleSamlRequest(f.ctx, req('/anything'), deps)).status).toBe(404)
  expect(await f.execute('SELECT count(*) AS n FROM sessions').first('n')).toBe(0)
})
it('rejects profile-selector substitution even when the lookup returns a different valid server profile', async () => {
  const flow = await start()
  deps.getSettings = async () => ({ ...settings, connectionId: 'other-connection' })
  const result = await handleSamlRequest(f.ctx, req('/callback', flow.form()), deps)
  expect(result.headers.get('Location')).toBe('/account/sign-in?result=failed')
  expect(await f.execute('SELECT consumed_at FROM saml_transactions').first('consumed_at')).toBeNull()
})
it('admits one concurrent signed POST only and never places credentials in body or redirect', async () => {
  const flow = await start()
  const results = await Promise.all([handleSamlRequest(f.ctx, req('/callback', flow.form()), deps), handleSamlRequest(f.ctx, req('/callback', flow.form()), deps)])
  expect(results.filter(response => response.headers.get('Location') === '/account')).toHaveLength(1)
  expect(await f.execute('SELECT count(*) AS n FROM sessions').first('n')).toBe(1)
  expect(await f.execute('SELECT count(*) AS n FROM saml_replays').first('n')).toBe(2)
  for (const response of results) {
    expect(await response.text()).toBe('')
    expect(response.headers.get('Location')).not.toContain('token=')
  }
})
it('rejects a swapped browser secret while preserving the legitimate pending request', async () => {
  const flow = await start(), binding = jar.get('ovelle_local_saml')!
  jar.set('ovelle_local_saml', 'saml-a.' + 'x'.repeat(43))
  expect((await handleSamlRequest(f.ctx, req('/callback', flow.form()), deps)).headers.get('Location')).toBe('/account/sign-in?result=failed')
  jar.set('ovelle_local_saml', binding)
  expect((await handleSamlRequest(f.ctx, req('/callback', flow.form()), deps)).headers.get('Location')).toBe('/account')
})
it('rechecks initiating-session revocation and denies weak administrator linking', async () => {
  const flow = await start(true)
  await f.execute("UPDATE sessions SET revoked_at=? WHERE account_id='a'", now).run()
  expect((await handleSamlRequest(f.ctx, req('/callback', flow.form({ subject: 'must-not-link' })), deps)).headers.get('Location')).toBe('/account/sign-in?result=failed')
  expect(await f.execute("SELECT count(*) AS n FROM external_identities WHERE subject='must-not-link'").first('n')).toBe(0)
  const session = await issueSession(f.ctx, { accountId: 'a', method: 'password' }, 'browser')
  jar.set('ovelle_local_session', session.token)
  const response = await handleSamlRequest(f.ctx, req('/link', JSON.stringify({ connectionId: 'saml-a', turnstileToken: 'fixture-token' }), { 'X-CSRF-Token': await sessionCsrfSecret(session.token) }), deps)
  expect(response.status).toBe(403)
  expect(calls).toBe(1)
})
it('uses hosted __Host secure flow and Strict session cookies with fixed HTTPS callback', async () => {
  const hosted = 'https://dev.ovelle.org'
  f.ctx.config = { ...f.ctx.config, environment: 'development', origin: hosted, rpId: 'dev.ovelle.org' }
  deps.turnstileFetch = async () => Response.json({ success: true, hostname: 'dev.ovelle.org', action: 'saml_login', challenge_ts: new Date(now).toISOString() })
  const initial = await beginPrelogin(f.ctx, new Request(hosted + '/api/v1/auth/prelogin'), deps.budgetKey)
  const response = await handleSamlRequest(f.ctx, new Request(hosted + '/api/v1/auth/saml/start', { method: 'POST', body: JSON.stringify({ connectionId: 'saml-a', turnstileToken: 'fixture-token' }), headers: { Origin: hosted, Cookie: initial.cookie.split(';')[0], 'X-CSRF-Token': initial.csrfToken, 'Content-Type': 'application/json' } }), deps)
  expect(response.status).toBe(200)
  const binding = response.headers.getSetCookie().find(x => x.startsWith('__Host-ovelle_saml='))!
  expect(binding).toContain('; Secure; SameSite=None; Max-Age=300'); expect(binding).not.toContain('Domain=')
  const url = new URL((await response.json() as { authorizationUrl: string }).authorizationUrl)
  const xml = inflateRawSync(Buffer.from(url.searchParams.get('SAMLRequest')!, 'base64')).toString(), requestId = /\bID="([^"]+)"/.exec(xml)![1]
  const body = new URLSearchParams({ RelayState: url.searchParams.get('RelayState')!, SAMLResponse: encodedSaml(signedSamlResponse({ now, requestId, callback: hosted + '/api/v1/auth/saml/callback', audience: settings.audience })) })
  const result = await handleSamlRequest(f.ctx, new Request(hosted + '/api/v1/auth/saml/callback', { method: 'POST', body, headers: { Origin: idp, Cookie: binding.split(';')[0] } }), deps)
  expect(result.headers.get('Location')).toBe('/account')
  const session = result.headers.getSetCookie().find(x => x.startsWith('__Host-ovelle_session='))!
  expect(session).toContain('; Secure; SameSite=Strict'); expect(session).not.toContain('Domain=')
})
it.each(['encoded-duplicate', 'invalid-utf8', 'missing-field', 'empty-response', 'xml-garbage', 'expired', 'unsupported-charset'] as const)('fails closed on %s without partial effects', async change => {
  const flow = await start(); let body = flow.form(); const extra: Record<string, string> = {}
  if (change === 'encoded-duplicate') body += '&%52elayState=another'
  if (change === 'invalid-utf8') body += '%FF'
  if (change === 'missing-field') body = 'RelayState=x'
  if (change === 'empty-response') body = new URLSearchParams({ RelayState: flow.url.searchParams.get('RelayState')!, SAMLResponse: '' }).toString()
  if (change === 'xml-garbage') body = new URLSearchParams({ RelayState: flow.url.searchParams.get('RelayState')!, SAMLResponse: btoa('<bad/>') }).toString()
  if (change === 'expired') now += 300_000
  if (change === 'unsupported-charset') extra['Content-Type'] = 'application/x-www-form-urlencoded; charset=iso-8859-1'
  expect((await handleSamlRequest(f.ctx, req('/callback', body, extra), deps)).headers.get('Location')).toBe('/account/sign-in?result=failed')
  expect(await f.execute('SELECT count(*) AS n FROM sessions').first('n')).toBe(0)
  expect(await f.execute('SELECT count(*) AS n FROM saml_replays').first('n')).toBe(0)
})
