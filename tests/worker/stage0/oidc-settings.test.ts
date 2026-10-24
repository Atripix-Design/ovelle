import { beforeEach, expect, it } from 'vitest'
import * as client from 'openid-client'
import { databaseFixture } from './database'
import { oidcProviderFixture, microsoftIssuer } from './oidc-protocol-fixture'
import { createOidcSettingsResolver } from '../../../src/cloudflare/stage0/auth/oidc/settings'
import { handleOidcRequest } from '../../../src/cloudflare/stage0/auth/oidc/routes'
import { resolveSession } from '../../../src/cloudflare/stage0/auth/sessions'

let f: Awaited<ReturnType<typeof databaseFixture>>
const origin = 'http://localhost:4173'
const bindings = (provider: string): Record<string, unknown> => ({
  [`AUTH_${provider.toUpperCase()}_CONNECTION_ID`]: provider,
  [`AUTH_${provider.toUpperCase()}_CONNECTION_VERSION`]: '1',
  [`AUTH_${provider.toUpperCase()}_CLIENT_ID`]: 'fixture-client',
  [`AUTH_${provider.toUpperCase()}_CLIENT_SECRET`]: 'fixture-client-secret',
})
beforeEach(async () => {
  f = await databaseFixture()
  for (const provider of ['google', 'microsoft']) {
    await f.execute('INSERT INTO identity_connections(id,protocol,provider,issuer,client_id,created_at) VALUES(?,?,?,?,?,1)',
      provider, 'oidc', provider, provider === 'google' ? 'https://accounts.google.com' : 'https://login.microsoftonline.com/{tenantid}/v2.0', 'fixture-client').run()
    await f.execute('INSERT INTO external_identities(id,account_id,connection_id,issuer,subject,tenant_id,created_at) VALUES(?,?,?,?,?,?,1)',
      provider, 'd', provider, provider === 'google' ? 'https://accounts.google.com' : microsoftIssuer(), 'exact-subject', provider === 'google' ? null : '11111111-1111-4111-8111-111111111111').run()
  }
})

it('rejects an incomplete or malformed configured provider before accepting requests', () => {
  const complete = bindings('google')
  for (const key of Object.keys(complete)) {
    const partial = { ...complete }; delete partial[key]
    expect(() => createOidcSettingsResolver(f.db, partial)).toThrowError('configuration')
    for (const invalid of ['', ' ', null, 1, 'x\nsecret']) {
      expect(() => createOidcSettingsResolver(f.db, { ...complete, [key]: invalid })).toThrowError('configuration')
    }
  }
  for (const invalid of ['0', '-1', '01', '1.0', '1e0', '9007199254740992']) {
    expect(() => createOidcSettingsResolver(f.db, { ...complete, AUTH_GOOGLE_CONNECTION_VERSION: invalid })).toThrowError('configuration')
  }
  expect(() => createOidcSettingsResolver(f.db, { ...complete, AUTH_GOOGLE_CONNECTION_ID: 'a'.repeat(129) })).toThrowError('configuration')
  expect(() => createOidcSettingsResolver(f.db, { ...complete, AUTH_GOOGLE_CLIENT_ID: 'a'.repeat(1025) })).toThrowError('configuration')
  expect(() => createOidcSettingsResolver(f.db, { ...complete, AUTH_GOOGLE_CLIENT_SECRET: 'a'.repeat(4097) })).toThrowError('configuration')
})

it('does not infer unconfigured providers, connection IDs or credential aliases', async () => {
  const getSettings = createOidcSettingsResolver(f.db, { ...bindings('google'), AUTH_MICROSOFT_SECRET: 'unreviewed-alias' })
  for (const provider of ['microsoft', 'enterprise_saml', '__proto__', 'toString', 'GOOGLE', null]) {
    await expect(getSettings(provider as 'google')).rejects.toMatchObject({ code: 'configuration' })
  }
  await expect(createOidcSettingsResolver(f.db, {})('google')).rejects.toMatchObject({ code: 'configuration' })
})

it('rechecks enabled connection state and version instead of caching successful authority', async () => {
  const getSettings = createOidcSettingsResolver(f.db, bindings('google'))
  expect((await getSettings('google')).connectionVersion).toBe(1)
  await f.execute("UPDATE identity_connections SET enabled=0,version=2 WHERE id='google'").run()
  await expect(getSettings('google')).rejects.toMatchObject({ code: 'configuration' })
  await f.execute("UPDATE identity_connections SET enabled=1,version=3 WHERE id='google'").run()
  await expect(getSettings('google')).rejects.toMatchObject({ code: 'configuration' })
  const rotated = createOidcSettingsResolver(f.db, { ...bindings('google'), AUTH_GOOGLE_CONNECTION_VERSION: '3' })
  expect((await rotated('google')).connectionVersion).toBe(3)
})

it('rejects a foreign provider, changed client, missing row or issuer outside the pinned protocol', async () => {
  for (const values of [
    { AUTH_GOOGLE_CONNECTION_ID: 'microsoft' }, { AUTH_GOOGLE_CONNECTION_ID: 'missing' },
    { AUTH_GOOGLE_CLIENT_ID: 'foreign-client' }, { AUTH_GOOGLE_CONNECTION_VERSION: '2' },
  ]) await expect(createOidcSettingsResolver(f.db, { ...bindings('google'), ...values })('google')).rejects.toMatchObject({ code: 'configuration' })
  for (const [id, issuer] of [['google', 'https://accounts.google.com.evil.test'], ['microsoft', 'https://login.microsoftonline.com/common/v2.0']]) {
    await f.execute('UPDATE identity_connections SET issuer=?,version=2 WHERE id=?', issuer, id).run()
    await expect(createOidcSettingsResolver(f.db, { ...bindings(id), [`AUTH_${id.toUpperCase()}_CONNECTION_VERSION`]: '2' })(id as 'google')).rejects.toMatchObject({ code: 'configuration' })
  }
})

it('supports an explicitly reviewed Microsoft tenant issuer as well as common', async () => {
  await f.execute("UPDATE identity_connections SET issuer=?,version=2 WHERE id='microsoft'", microsoftIssuer()).run()
  const getSettings = createOidcSettingsResolver(f.db, { ...bindings('microsoft'), AUTH_MICROSOFT_CONNECTION_VERSION: '2' })
  expect((await getSettings('microsoft')).provider).toBe('microsoft')
})

// Removing a binding snapshot, mixing providers, or returning settings without a
// live DB match breaks these real signed HTTP flows, not a mock-handler assertion.
it.each(['google', 'microsoft'] as const)('uses captured %s credentials for signed browser login without leaking them', async providerName => {
  const env = { ...bindings('google'), ...bindings('microsoft') }
  const getSettings = createOidcSettingsResolver(f.db, env)
  env[`AUTH_${providerName.toUpperCase()}_CLIENT_SECRET`] = 'mutated-secret'
  env[`AUTH_${providerName.toUpperCase()}_CLIENT_ID`] = 'mutated-client'
  const exposed = await getSettings(providerName)
  try { exposed.clientSecret = 'mutated-return-value' } catch { /* Frozen settings may throw in strict mode. */ }
  let authorization: URL
  const provider = await oidcProviderFixture(providerName, { validateGrant: async form => form.get('code') === 'one-time-code'
    && await client.calculatePKCECodeChallenge(form.get('code_verifier')!) === authorization.searchParams.get('code_challenge') })
  const deps = { getSettings, budgetKey: new Uint8Array(32).fill(47), trustedIp: '127.0.0.1', turnstileSecret: 'fixture-secret', providerFetch: provider.fetcher,
    turnstileFetch: async () => Response.json({ success: true, hostname: 'localhost', action: 'oidc_login', challenge_ts: new Date(f.ctx.clock.now()).toISOString() }) }
  const prelogin = await handleOidcRequest(f.ctx, new Request(origin + '/api/v1/auth/prelogin'), deps)
  const csrf = (await prelogin.json() as { csrfToken: string }).csrfToken
  const started = await handleOidcRequest(f.ctx, new Request(`${origin}/api/v1/auth/oidc/${providerName}/start`, { method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: prelogin.headers.getSetCookie()[0].split(';')[0], 'X-CSRF-Token': csrf },
    body: JSON.stringify({ turnstileToken: 'fixture-token' }) }), deps)
  expect(started.status).toBe(200)
  const dto = await started.json() as { authorizationUrl: string }
  authorization = new URL(dto.authorizationUrl)
  provider.state.claims.nonce = authorization.searchParams.get('nonce')!
  const returned = new URL(`${origin}/api/v1/auth/oidc/${providerName}/callback?code=one-time-code`)
  returned.searchParams.set('state', authorization.searchParams.get('state')!)
  const completed = await handleOidcRequest(f.ctx, new Request(returned, { headers: { Cookie: started.headers.getSetCookie()[0].split(';')[0], 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Site': 'cross-site' } }), deps)
  expect(completed.status).toBe(303)
  expect(completed.headers.get('Location')).toBe('/account')
  const cookie = completed.headers.getSetCookie().find(value => value.startsWith('ovelle_local_session='))!
  const token = cookie.split(';')[0].slice('ovelle_local_session='.length)
  expect((await resolveSession(f.ctx, token, 'browser')).accountId).toBe('d')
  const stored = JSON.stringify((await f.execute('SELECT * FROM oidc_transactions').all()).results)
  for (const text of [JSON.stringify(dto), completed.headers.get('Location')!, stored]) {
    expect(text).not.toContain('fixture-client-secret')
    expect(text).not.toContain('mutated-secret')
  }
})

it('returns only a generic HTTP error when the configured connection has been disabled', async () => {
  const getSettings = createOidcSettingsResolver(f.db, bindings('google'))
  await f.execute("UPDATE identity_connections SET enabled=0,version=2 WHERE id='google'").run()
  const deps = { getSettings, budgetKey: new Uint8Array(32).fill(47), trustedIp: '127.0.0.1', turnstileSecret: 'fixture-secret' }
  const prelogin = await handleOidcRequest(f.ctx, new Request(origin + '/api/v1/auth/prelogin'), deps)
  const csrf = (await prelogin.json() as { csrfToken: string }).csrfToken
  const response = await handleOidcRequest(f.ctx, new Request(origin + '/api/v1/auth/oidc/google/start', { method: 'POST', headers: {
    Origin: origin, 'Content-Type': 'application/json', Cookie: prelogin.headers.getSetCookie()[0].split(';')[0], 'X-CSRF-Token': csrf,
  }, body: JSON.stringify({ turnstileToken: 'fixture-token' }) }), deps)
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({ error: 'configuration' })
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  expect(await f.execute('SELECT count(*) AS n FROM oidc_transactions').first('n')).toBe(0)
})
