import { beforeAll, expect, it } from 'vitest'
import { createOidcAuthorization, verifyOidcCode, newOidcSecrets, consumeOidcIdentity } from '../../../src/cloudflare/stage0/auth/oidc/protocol'
import { callback, consumerTenant, microsoftIssuer, oidcContext as ctx, oidcProviderFixture, secrets, settings, tenant } from './oidc-protocol-fixture'

let google: Awaited<ReturnType<typeof oidcProviderFixture>>
beforeAll(async () => { google = await oidcProviderFixture('google') })

it('generates independent high-entropy transaction secrets and only minimal S256 code-flow scopes', async () => {
  const a = newOidcSecrets(ctx, 'login')
  const b = newOidcSecrets(ctx, 'link')
  for (const value of [a.state, a.nonce, a.verifier, b.state, b.nonce, b.verifier]) expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(new Set([a.state, a.nonce, a.verifier, b.state, b.nonce, b.verifier]).size).toBe(6)
  const url = await createOidcAuthorization(ctx, settings('google'), secrets, google.fetcher)
  expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
  expect(url.searchParams.get('response_type')).toBe('code')
  expect(url.searchParams.get('scope')).toBe('openid profile email')
  expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(url.searchParams.get('nonce')).toBe(secrets.nonce)
  expect(url.searchParams.get('state')).toBe(secrets.state)
  expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:4173/api/v1/auth/oidc/google/callback')
  expect(url.href).not.toContain(secrets.verifier)
  expect(url.href).not.toContain('fixture-client-secret')
})

it('verifies a Google signature and returns a frozen exact identity without provider tokens or roles', async () => {
  const proof = await verifyOidcCode(ctx, settings('google'), secrets, callback('google'), google.fetcher)
  expect(proof).toMatchObject({ provider: 'google', connectionId: 'google', connectionVersion: 1, clientId: 'fixture-client', issuer: 'https://accounts.google.com', subject: 'exact-subject', tenantId: null, email: 'person@gmail.com', emailVerified: true, displayName: 'Example Person', verifiedAt: ctx.clock.now() })
  expect(google.state.fetchedKeys).toBeGreaterThan(0)
  expect(Object.isFrozen(proof)).toBe(true)
  expect(JSON.stringify(proof)).not.toMatch(/provider-access-secret|provider-refresh-secret|id_token|owner|passkey/)
  expect(consumeOidcIdentity(proof)).toBe(proof)
  expect(() => consumeOidcIdentity(proof)).toThrow()
  expect(() => consumeOidcIdentity(JSON.parse(JSON.stringify(proof)))).toThrow()
})

it.each([tenant, consumerTenant])('supports Microsoft business and consumer tenant %s with verified key issuer scope', async tid => {
  const ms = await oidcProviderFixture('microsoft')
  ms.state.claims.tid = tid
  ms.state.claims.iss = microsoftIssuer(tid)
  const proof = await verifyOidcCode(ctx, settings('microsoft'), secrets, callback('microsoft'), ms.fetcher)
  expect(proof).toMatchObject({ issuer: microsoftIssuer(tid), tenantId: tid, subject: 'exact-subject', emailVerified: false })
  expect(ms.state.fetchedKeys).toBe(1)
  const url = await createOidcAuthorization(ctx, settings('microsoft'), secrets, ms.fetcher)
  expect(url.pathname).toBe('/common/oauth2/v2.0/authorize')
})

it.each(['signature', 'audience', 'issuer', 'nonce', 'expiry', 'algorithm', 'missing_token'])('denies Google tokens with wrong %s', async failure => {
  const fixture = await oidcProviderFixture('google')
  if (failure === 'signature') fixture.state.badSignature = true
  if (failure === 'algorithm') fixture.state.badAlgorithm = true
  if (failure === 'audience') fixture.state.claims.aud = 'foreign-client'
  if (failure === 'issuer') fixture.state.claims.iss = 'https://evil.example'
  if (failure === 'nonce') fixture.state.claims.nonce = 'another-nonce'
  if (failure === 'expiry') fixture.state.claims.exp = Math.floor(ctx.clock.now() / 1000)
  if (failure === 'missing_token') fixture.state.tokenOmitted = true
  await expect(verifyOidcCode(ctx, settings('google'), secrets, callback('google'), fixture.fetcher)).rejects.toMatchObject({ code: 'unauthenticated' })
})

it('binds callback origin, exact path, state, PKCE verifier and transaction expiry', async () => {
  for (const url of [new URL(callback('google').href.replace('localhost:4173', 'evil.example')), callback('microsoft'), new URL(callback('google').href.replace(`state=${secrets.state}`, 'state=wrong')), new URL(`${callback('google')}&state=duplicate`)]) {
    await expect(verifyOidcCode(ctx, settings('google'), secrets, url, google.fetcher)).rejects.toMatchObject({ code: 'unauthenticated' })
  }
  await expect(verifyOidcCode(ctx, settings('google'), { ...secrets, verifier: 'w'.repeat(43) }, callback('google'), google.fetcher)).rejects.toMatchObject({ code: 'unauthenticated' })
  for (const createdAt of [ctx.clock.now() - 300_000, ctx.clock.now() + 1]) await expect(verifyOidcCode(ctx, settings('google'), { ...secrets, createdAt }, callback('google'), google.fetcher)).rejects.toMatchObject({ code: 'unauthenticated' })
})

it.each(['http://127.0.0.1/private', 'https://evil.example/token', 'https://oauth2.googleapis.com/token?leak=1'])('rejects discovered token endpoints outside the exact allowlist: %s', async endpoint => {
  const fixture = await oidcProviderFixture('google')
  fixture.state.metadata.token_endpoint = endpoint
  await expect(createOidcAuthorization(ctx, settings('google'), secrets, fixture.fetcher)).rejects.toMatchObject({ code: 'configuration' })
})

it('rejects metadata redirects and oversized discovery documents', async () => {
  for (const flag of ['redirect', 'oversized'] as const) {
    const fixture = await oidcProviderFixture('google')
    fixture.state[flag] = true
    await expect(createOidcAuthorization(ctx, settings('google'), secrets, fixture.fetcher)).rejects.toMatchObject({ code: 'configuration' })
  }
})

it.each(['foreign', 'missing', 'invalid_tenant', 'tenant_issuer_mismatch'])('rejects Microsoft tenant/key issuer failure: %s', async failure => {
  const ms = await oidcProviderFixture('microsoft')
  if (failure === 'foreign') ms.state.keyIssuer = microsoftIssuer(consumerTenant)
  if (failure === 'missing') ms.state.keyIssuer = undefined
  if (failure === 'invalid_tenant') { ms.state.claims.tid = '../other'; ms.state.claims.iss = 'https://login.microsoftonline.com/../other/v2.0' }
  if (failure === 'tenant_issuer_mismatch') ms.state.claims.iss = microsoftIssuer(consumerTenant)
  await expect(verifyOidcCode(ctx, settings('microsoft'), secrets, callback('microsoft'), ms.fetcher)).rejects.toMatchObject({ code: 'unauthenticated' })
})

it('does not treat external Google email or Microsoft preferred username as verified account contact', async () => {
  const g = await oidcProviderFixture('google')
  g.state.claims.email = 'person@external.example'
  expect((await verifyOidcCode(ctx, settings('google'), secrets, callback('google'), g.fetcher)).emailVerified).toBe(false)
  g.state.claims.hd = 'external.example'
  expect((await verifyOidcCode(ctx, settings('google'), secrets, callback('google'), g.fetcher)).emailVerified).toBe(true)
  const ms = await oidcProviderFixture('microsoft')
  delete ms.state.claims.email
  ms.state.claims.preferred_username = 'user@business.example'
  expect((await verifyOidcCode(ctx, settings('microsoft'), secrets, callback('microsoft'), ms.fetcher)).email).toBeNull()
})

it('requires recent upstream authentication for linking and closes upstream error details', async () => {
  const g = await oidcProviderFixture('google')
  const link = { ...secrets, purpose: 'link' as const }
  const url = await createOidcAuthorization(ctx, settings('google'), link, g.fetcher)
  expect(url.searchParams.get('prompt')).toBe('select_account consent')
  expect(JSON.parse(url.searchParams.get('claims')!)).toEqual({ id_token: { auth_time: { essential: true } } })
  expect(url.searchParams.has('max_age')).toBe(false)
  await expect(verifyOidcCode(ctx, settings('google'), link, callback('google'), g.fetcher)).rejects.toMatchObject({ code: 'unauthenticated' })
  g.state.claims.auth_time = Math.floor(ctx.clock.now() / 1000)
  expect((await verifyOidcCode(ctx, settings('google'), link, callback('google'), g.fetcher)).subject).toBe('exact-subject')
  g.state.tokenError = true
  await expect(verifyOidcCode(ctx, settings('google'), secrets, callback('google'), g.fetcher)).rejects.toMatchObject({ message: 'unauthenticated' })
})


it('does not mint a proof if the transaction expires during the provider exchange', async () => {
  const g = await oidcProviderFixture('google')
  let now = ctx.clock.now()
  const advancing = { ...ctx, clock: { now: () => now } }
  const fetcher: typeof g.fetcher = async (url, options) => {
    const response = await g.fetcher(url, options)
    if (url.includes('oauth2.googleapis.com/token')) now += 300_000
    return response
  }
  await expect(verifyOidcCode(advancing, settings('google'), secrets, callback('google'), fetcher)).rejects.toMatchObject({ code: 'unauthenticated' })
})

it.each(['future_authentication', 'stale_authentication', 'future_issue'])('denies signed but unusable freshness evidence: %s', async failure => {
  const g = await oidcProviderFixture('google')
  const now = Math.floor(ctx.clock.now() / 1000)
  g.state.claims.auth_time = failure === 'future_authentication' ? now + 60 : failure === 'stale_authentication' ? now - 300 : now
  if (failure === 'future_issue') g.state.claims.iat = now + 60
  await expect(verifyOidcCode(ctx, settings('google'), { ...secrets, purpose: 'link' }, callback('google'), g.fetcher)).rejects.toMatchObject({ code: 'unauthenticated' })
})


it('supports a hosted fixture callback and validates the actual dynamic grant before signing', async () => {
  const hosted = { ...ctx, config: { ...ctx.config, environment: 'development' as const, origin: 'https://dev.ovelle.org:45123', rpId: 'dev.ovelle.org' } }
  const dynamic = newOidcSecrets(hosted, 'login')
  let used = false
  const fixture = await oidcProviderFixture('google', { origin: hosted.config.origin, validateGrant: async form => {
    if (used || form.get('code') !== 'dynamic-code' || form.get('code_verifier') !== dynamic.verifier) return false
    used = true; return true
  } })
  fixture.state.claims.nonce = dynamic.nonce
  const url = new URL(hosted.config.origin + '/api/v1/auth/oidc/google/callback')
  url.searchParams.set('state', dynamic.state); url.searchParams.set('code', 'dynamic-code')
  await expect(verifyOidcCode(hosted, settings('google'), { ...dynamic, verifier: 'w'.repeat(43) }, url, fixture.fetcher)).rejects.toMatchObject({ code: 'unauthenticated' })
  expect(used).toBe(false)
  expect((await verifyOidcCode(hosted, settings('google'), dynamic, url, fixture.fetcher)).subject).toBe('exact-subject')
  await expect(verifyOidcCode(hosted, settings('google'), dynamic, url, fixture.fetcher)).rejects.toMatchObject({ code: 'unauthenticated' })
})
