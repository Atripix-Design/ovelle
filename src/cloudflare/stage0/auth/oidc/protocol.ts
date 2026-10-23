import * as client from 'openid-client'
import { decodeProtectedHeader } from 'jose'
import type { RequestContext } from '../../contracts'
import { Stage0Error } from '../../errors'

type Context = Pick<RequestContext, 'config' | 'clock'>
export type OidcProvider = 'google' | 'microsoft'
export interface OidcSettings {
  provider: OidcProvider
  connectionId: string
  connectionVersion: number
  clientId: string
  clientSecret: string
}
export interface OidcSecrets { state: string; nonce: string; verifier: string; createdAt: number; purpose: 'login' | 'link' }
const proofBrand: unique symbol = Symbol('verified OIDC identity')
export interface VerifiedOidcIdentity {
  readonly [proofBrand]: true
  readonly provider: OidcProvider
  readonly connectionId: string
  readonly connectionVersion: number
  readonly clientId: string
  readonly issuer: string
  readonly subject: string
  readonly tenantId: string | null
  readonly email: string | null
  readonly emailVerified: boolean
  readonly displayName: string | null
  readonly verifiedAt: number
  readonly purpose: OidcSecrets['purpose']
}
const proofs = new WeakSet<VerifiedOidcIdentity>()
const secretPattern = /^[A-Za-z0-9_-]{43}$/
const tenantPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const microsoftTemplate = 'https://login.microsoftonline.com/{tenantid}/v2.0'
const endpoints = {
  google: { issuer: 'https://accounts.google.com', authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth', token_endpoint: 'https://oauth2.googleapis.com/token', jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs' },
  microsoft: { issuer: microsoftTemplate, authorization_endpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', token_endpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token', jwks_uri: 'https://login.microsoftonline.com/common/discovery/v2.0/keys' },
} as const
const authority = { google: 'https://accounts.google.com', microsoft: 'https://login.microsoftonline.com/common/v2.0' } as const

function callbackUri(ctx: Context, provider: OidcProvider): string {
  return `${ctx.config.origin}/api/v1/auth/oidc/${provider}/callback`
}
function checkSettings(settings: OidcSettings): void {
  if (!Object.hasOwn(endpoints, settings.provider) || typeof settings.connectionId !== 'string' || settings.connectionId.length < 1 || settings.connectionId.length > 128 || !Number.isSafeInteger(settings.connectionVersion) || settings.connectionVersion < 1 || typeof settings.clientId !== 'string' || !settings.clientId.trim() || settings.clientId.length > 1024 || typeof settings.clientSecret !== 'string' || !settings.clientSecret.trim() || settings.clientSecret.length > 4096) throw new Stage0Error('configuration')
}
function checkSecrets(ctx: Context, secrets: OidcSecrets): void {
  const now = ctx.clock.now()
  if (![secrets.state, secrets.nonce, secrets.verifier].every(value => typeof value === 'string' && secretPattern.test(value)) || !['login', 'link'].includes(secrets.purpose) || !Number.isSafeInteger(secrets.createdAt) || secrets.createdAt > now || now >= secrets.createdAt + 300_000) throw new Stage0Error('unauthenticated')
}
export function newOidcSecrets(ctx: Context, purpose: OidcSecrets['purpose']): OidcSecrets {
  if (!['login', 'link'].includes(purpose)) throw new Stage0Error('invalid_input')
  return { state: client.randomState(), nonce: client.randomNonce(), verifier: client.randomPKCECodeVerifier(), createdAt: ctx.clock.now(), purpose }
}

async function boundedJson(response: Response): Promise<unknown> {
  if (!response.ok || !response.headers.get('content-type')?.toLowerCase().includes('application/json') || !response.body) throw new Stage0Error('configuration')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > 262_144) throw new Stage0Error('configuration')
      chunks.push(chunk.value)
    }
  } finally { await reader.cancel() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return JSON.parse(new TextDecoder().decode(bytes))
}

async function configuration(ctx: Context, settings: OidcSettings, fetcher: client.CustomFetch) {
  const pinned = endpoints[settings.provider]
  const discovery = `${authority[settings.provider]}/.well-known/openid-configuration`
  let jwks: Record<string, unknown>[] = []
  const restrictedFetch: client.CustomFetch = async (url, options) => {
    if (!([discovery, pinned.token_endpoint, pinned.jwks_uri] as readonly string[]).includes(url)) throw new Stage0Error('configuration')
    const result = await fetcher(url, { ...options, redirect: 'manual' })
    // Redirects are rejected without contacting their Location, even if a
    // reviewed provider's metadata or network boundary becomes compromised.
    const json = await boundedJson(result)
    if (url === pinned.jwks_uri && json && typeof json === 'object' && 'keys' in json && Array.isArray(json.keys)) jwks = json.keys
    return Response.json(json, { status: result.status })
  }
  const config = await client.discovery(new URL(authority[settings.provider]), settings.clientId,
    { id_token_signed_response_alg: 'RS256', [client.clockTolerance]: 0, [client.clockSkew]: Math.floor(ctx.clock.now() / 1000) - Math.floor(Date.now() / 1000) },
    client.ClientSecretPost(settings.clientSecret), { [client.customFetch]: restrictedFetch, execute: [client.enableNonRepudiationChecks], timeout: 10 })
  const metadata = config.serverMetadata()
  for (const [key, value] of Object.entries(pinned)) if (metadata[key] !== value) throw new Stage0Error('configuration')
  return { config, keys: () => jwks }
}
const network: client.CustomFetch = (url, options) => fetch(url, options as RequestInit)

/** Internal protocol adapter only. Secrets must come from a server-owned,
 * single-use transaction; discovery URLs and callbacks are never browser input.
 */
export async function createOidcAuthorization(ctx: Context, settings: OidcSettings, secrets: OidcSecrets, fetcher: client.CustomFetch = network): Promise<URL> {
  checkSettings(settings)
  checkSecrets(ctx, secrets)
  try {
    const { config } = await configuration(ctx, settings, fetcher)
    return client.buildAuthorizationUrl(config, {
      response_type: 'code', redirect_uri: callbackUri(ctx, settings.provider), scope: 'openid profile email',
      state: secrets.state, nonce: secrets.nonce, code_challenge: await client.calculatePKCECodeChallenge(secrets.verifier), code_challenge_method: 'S256',
      ...(secrets.purpose === 'link' ? settings.provider === 'google'
        ? { prompt: 'select_account consent', claims: JSON.stringify({ id_token: { auth_time: { essential: true } } }) }
        : { prompt: 'login', max_age: '0' } : { prompt: 'select_account' }),
    })
  } catch { throw new Stage0Error('configuration') }
}

/** Maintained OIDC/JOSE code validates signatures, issuer, audience, time, nonce,
 * state and code exchange. Each call owns a fresh Configuration/JWKS capture so
 * concurrent Microsoft tenants cannot share mutable verification evidence.
 */
export async function verifyOidcCode(ctx: Context, settings: OidcSettings, secrets: OidcSecrets, callback: URL, fetcher: client.CustomFetch = network): Promise<VerifiedOidcIdentity> {
  checkSettings(settings)
  checkSecrets(ctx, secrets)
  if (callback.origin + callback.pathname !== callbackUri(ctx, settings.provider) || callback.hash || callback.username || callback.password) throw new Stage0Error('unauthenticated')
  try {
    const { config, keys } = await configuration(ctx, settings, fetcher)
    const tokens = await client.authorizationCodeGrant(config, callback, { pkceCodeVerifier: secrets.verifier, expectedNonce: secrets.nonce, expectedState: secrets.state, idTokenExpected: true, ...(secrets.purpose === 'link' ? { maxAge: 300 } : {}) })
    checkSecrets(ctx, secrets)
    const claims = tokens.claims()!
    const nowSeconds = Math.floor(ctx.clock.now() / 1000)
    // The maintained verifier checks JWT validity and max-age. Ovelle also
    // rejects future authentication evidence and uses an exclusive five-minute
    // step-up boundary, consistently with its local account-link policy.
    if (!Number.isSafeInteger(claims.iat) || claims.iat > nowSeconds || (secrets.purpose === 'link' &&
      (typeof claims.auth_time !== 'number' || !Number.isSafeInteger(claims.auth_time) || claims.auth_time > nowSeconds || claims.auth_time <= nowSeconds - 300))) throw new Stage0Error('unauthenticated')
    if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 512) throw new Stage0Error('unauthenticated')
    let tenantId: string | null = null
    if (settings.provider === 'microsoft') {
      if (typeof claims.tid !== 'string' || !tenantPattern.test(claims.tid) || claims.iss !== microsoftTemplate.replace('{tenantid}', claims.tid)) throw new Stage0Error('unauthenticated')
      tenantId = claims.tid
      // The library has already validated the token signature. Microsoft also
      // scopes each public key by issuer; do not accept a consumer-only key for
      // a work tenant (or vice versa) merely because the cryptographic key fits.
      const header = decodeProtectedHeader(tokens.id_token!)
      const candidates = keys().filter(key => key.kid === header.kid && key.kty === 'RSA' && (key.use === undefined || key.use === 'sig') && (key.alg === undefined || key.alg === 'RS256') && (key.key_ops === undefined || (Array.isArray(key.key_ops) && key.key_ops.includes('verify'))))
      if (candidates.length !== 1 || (candidates[0].issuer !== claims.iss && candidates[0].issuer !== microsoftTemplate)) throw new Stage0Error('unauthenticated')
    }
    const email = typeof claims.email === 'string' && claims.email.length <= 254 ? claims.email : null
    // Google is authoritative for Gmail and verified Workspace addresses. Other
    // email hints and Microsoft's mutable email/UPN still need contact proof.
    const emailVerified = settings.provider === 'google' && claims.email_verified === true && email !== null && (email.toLowerCase().endsWith('@gmail.com') || (typeof claims.hd === 'string' && claims.hd.length > 0))
    const proof: VerifiedOidcIdentity = Object.freeze({ [proofBrand]: true as const, provider: settings.provider, connectionId: settings.connectionId, connectionVersion: settings.connectionVersion, clientId: settings.clientId, issuer: claims.iss, subject: claims.sub, tenantId, email, emailVerified, displayName: typeof claims.name === 'string' && claims.name.length <= 120 ? claims.name : null, verifiedAt: ctx.clock.now(), purpose: secrets.purpose })
    proofs.add(proof)
    return proof
  } catch { throw new Stage0Error('unauthenticated') }
}

/** Account repositories accept only an in-memory result of this verifier, once.
 * Serialized JSON cannot masquerade as proof, even with a TypeScript assertion.
 */
export function consumeOidcIdentity(proof: VerifiedOidcIdentity): VerifiedOidcIdentity {
  if (!proofs.delete(proof)) throw new Stage0Error('unauthenticated')
  return proof
}
