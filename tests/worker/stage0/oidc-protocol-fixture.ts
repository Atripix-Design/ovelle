import * as client from 'openid-client'
import { exportJWK, generateKeyPair, importJWK, SignJWT, type JWTPayload } from 'jose'
import { loadStage0Config } from '../../../src/cloudflare/stage0/config'

export const oidcContext = {
  config: loadStage0Config({ APP_ENV: 'local', AUTH_ORIGIN: 'http://localhost:4173', AUTH_RP_ID: 'localhost', AUTH_LOCAL_FIXTURES: 'true' }),
  clock: { now: () => 1_792_627_200_000 },
}
export const tenant = '11111111-1111-4111-8111-111111111111'
export const consumerTenant = '9188040d-6c67-4c5b-b112-36a304b66dad'
export const secrets = { state: 's'.repeat(43), nonce: 'n'.repeat(43), verifier: 'v'.repeat(43), createdAt: oidcContext.clock.now(), purpose: 'login' as 'login' | 'link' }
export const settings = (provider: 'google' | 'microsoft') => ({ provider, connectionId: provider, connectionVersion: 1, clientId: 'fixture-client', clientSecret: 'fixture-client-secret' })
export const callback = (provider: string) => new URL(`http://localhost:4173/api/v1/auth/oidc/${provider}/callback?state=${secrets.state}&code=one-time-code`)
export const microsoftIssuer = (tid = tenant) => `https://login.microsoftonline.com/${tid}/v2.0`

/** Only the provider network is replaced. Actual OIDC processing, JWT signatures,
 * claims, PKCE parameters and key selection run in Workers with real Web Crypto.
 */
export async function oidcProviderFixture(provider: 'google' | 'microsoft') {
  const keys = await generateKeyPair('RS256', { extractable: true })
  const other = await generateKeyPair('RS256', { extractable: true })
  const pssPrivate = await importJWK(await exportJWK(keys.privateKey), 'PS256')
  const jwk = { ...await exportJWK(keys.publicKey), kid: 'fixture-key', use: 'sig', alg: 'RS256', ...(provider === 'microsoft' ? { issuer: 'https://login.microsoftonline.com/{tenantid}/v2.0' } : {}) }
  const now = Math.floor(oidcContext.clock.now() / 1000)
  const endpoints = provider === 'google' ? {
    issuer: 'https://accounts.google.com', authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    token_endpoint: 'https://oauth2.googleapis.com/token', jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
  } : {
    issuer: 'https://login.microsoftonline.com/{tenantid}/v2.0', authorization_endpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    token_endpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token', jwks_uri: 'https://login.microsoftonline.com/common/discovery/v2.0/keys',
  }
  const metadata: Record<string, unknown> = { ...endpoints, response_types_supported: ['code'], subject_types_supported: ['public'], id_token_signing_alg_values_supported: ['RS256'], code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['client_secret_post'] }
  const claims: JWTPayload = { iss: provider === 'google' ? endpoints.issuer : microsoftIssuer(), sub: 'exact-subject', aud: 'fixture-client', iat: now, exp: now + 600, nonce: secrets.nonce, email: 'person@gmail.com', email_verified: true, name: 'Example Person', ...(provider === 'microsoft' ? { tid: tenant } : {}) }
  const state = { metadata, claims, keyIssuer: jwk.issuer as string | undefined, badSignature: false, badAlgorithm: false, tokenError: false, tokenOmitted: false, oversized: false, redirect: false, fetchedKeys: 0 }
  const fetcher: client.CustomFetch = async (url, init) => {
    if (url.endsWith('/.well-known/openid-configuration')) return state.redirect
      ? new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/private' } })
      : state.oversized ? new Response('x'.repeat(300_000), { headers: { 'content-type': 'application/json' } }) : Response.json(state.metadata)
    if (url === endpoints.token_endpoint) {
      const form = new URLSearchParams(String(init.body))
      if (state.tokenError || init.method !== 'POST' || form.get('code') !== 'one-time-code' || form.get('code_verifier') !== secrets.verifier || form.get('client_id') !== 'fixture-client' || form.get('client_secret') !== 'fixture-client-secret' || form.get('redirect_uri') !== callback(provider).origin + callback(provider).pathname) return Response.json({ error: 'invalid_grant', error_description: 'private upstream detail' }, { status: 400 })
      const id_token = await new SignJWT(state.claims).setProtectedHeader({ alg: state.badAlgorithm ? 'PS256' : 'RS256', kid: 'fixture-key' }).sign(state.badAlgorithm ? pssPrivate : state.badSignature ? other.privateKey : keys.privateKey)
      return Response.json({ access_token: 'provider-access-secret', token_type: 'Bearer', expires_in: 3600, ...(state.tokenOmitted ? {} : { id_token }), refresh_token: 'provider-refresh-secret' })
    }
    if (url === endpoints.jwks_uri) {
      state.fetchedKeys++
      return Response.json({ keys: [{ ...jwk, ...(provider === 'microsoft' ? { issuer: state.keyIssuer } : {}) }] })
    }
    throw new Error('Unexpected provider endpoint')
  }
  return { state, fetcher }
}
