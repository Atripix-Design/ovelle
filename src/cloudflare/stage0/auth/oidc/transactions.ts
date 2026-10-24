import type { CustomFetch } from 'openid-client'
import type { Stage0Config } from '../../config'
import type { Principal, RequestContext } from '../../contracts'
import { guardedBatch } from '../../db'
import { Stage0Error } from '../../errors'
import { consumeOidcStartBudget } from '../limits'
import { issueSession, principalFromRow, type IssuedSession, type SessionRow } from '../sessions'
import { assertOidcLinkPrincipal, linkOidcIdentity, oidcLinkGuard, resolveOidcLogin, type IdentitySnapshot } from './identities'
import { createOidcAuthorization, newOidcSecrets, verifyOidcCode, type OidcSecrets, type OidcSettings } from './protocol'
import { beginProviderRecovery } from '../recovery'
import { beginOidcEnrollment } from './enrollment'

interface Start { purpose: OidcSecrets['purpose']; principal?: Principal; ip: string }
interface Transaction { purpose: OidcSecrets['purpose']; created_at: number; account_id: string | null; session_id: string | null }
type Completion = { kind: 'recovery'; session: IssuedSession } | { kind: 'signed_in'; session: IssuedSession } | { kind: 'linked'; identity: IdentitySnapshot } | { kind: 'enrollment'; token: string }
const secretPattern = /^[A-Za-z0-9_-]{43}$/
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
async function digest(value: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('')
}
async function transactionSecrets(ctx: RequestContext, settings: OidcSettings, state: string, binding: string, purpose: OidcSecrets['purpose'], createdAt: number): Promise<OidcSecrets> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(binding), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const derive = async (kind: string) => encode(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(JSON.stringify([
    'ovelle:oidc-transaction:v1', kind, ctx.config.origin, settings.provider, settings.connectionId, settings.connectionVersion, purpose, state,
  ])))))
  return { state, nonce: await derive('nonce'), verifier: await derive('pkce'), purpose, createdAt }
}
const connectionCondition = `EXISTS(SELECT 1 FROM identity_connections WHERE id=? AND provider=? AND protocol='oidc' AND client_id=? AND version=? AND enabled=1)`
const connectionValues = (settings: OidcSettings) => [settings.connectionId, settings.provider, settings.clientId, settings.connectionVersion]

/** Internal composition only. Future HTTP starts must first verify exact Origin,
 * pre-login CSRF/Turnstile and an edge-owned IP; caller input is not authorization.
 * A fresh binding replaces the previous browser flow when its cookie is set.
 */
export async function startOidcTransaction(ctx: RequestContext, settings: OidcSettings, start: Start, budgetKey: Uint8Array, fetcher?: CustomFetch, admission?: () => Promise<void>): Promise<{ authorizationUrl: string; browserBinding: string }> {
  if (!['login', 'link', 'recovery'].includes(start.purpose) || (start.purpose === 'link') !== Boolean(start.principal) || (start.principal && start.principal.transport !== 'browser')) throw new Stage0Error('invalid_input')
  if (start.principal) await assertOidcLinkPrincipal(ctx, start.principal)
  await consumeOidcStartBudget(ctx, settings.provider, start.ip, budgetKey)
  // The HTTP adapter supplies Turnstile here, after durable admission and before
  // any external challenge/provider request. No second quota charge is needed.
  if (admission) await admission()
  const now = ctx.clock.now()
  const state = newOidcSecrets(ctx, start.purpose).state
  const browserBinding = encode(crypto.getRandomValues(new Uint8Array(32)))
  const secrets = await transactionSecrets(ctx, settings, state, browserBinding, start.purpose, now)
  const authorizationUrl = (await createOidcAuthorization(ctx, settings, secrets, fetcher)).href
  const guard = start.principal ? oidcLinkGuard(start.principal, ctx.clock.now()) : { sql: '1', values: [] }
  // Discovery can take time: never save a transaction that already expired.
  if (ctx.clock.now() >= now + 300_000) throw new Stage0Error('unauthenticated')
  await guardedBatch(ctx, `(${guard.sql}) AND ${connectionCondition}`, [...guard.values, ...connectionValues(settings)], [
    ctx.db.prepare('DELETE FROM oidc_transactions WHERE state_digest IN (SELECT state_digest FROM oidc_transactions WHERE expires_at<=? LIMIT 100)').bind(ctx.clock.now()),
    ctx.db.prepare(`INSERT INTO oidc_transactions(state_digest,binding_digest,provider,connection_id,connection_version,purpose,account_id,session_id,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)`)
      .bind(await digest(state), await digest(browserBinding), settings.provider, settings.connectionId, settings.connectionVersion, start.purpose, start.principal?.accountId ?? null, start.principal?.sessionId ?? null, now, now + 300_000),
  ])
  return { authorizationUrl, browserBinding }
}

/** Claim before the code exchange, even on upstream error. Replays and competing
 * callbacks cannot verify twice. Link callbacks use the recorded initiating
 * session; the normal Strict session cookie is absent on a cross-site redirect.
 */
export async function completeOidcTransaction(ctx: RequestContext, settings: OidcSettings, callback: URL, browserBinding: string, fetcher?: CustomFetch): Promise<Completion> {
  const states = callback.searchParams.getAll('state')
  if (callback.origin !== ctx.config.origin || callback.pathname !== `/api/v1/auth/oidc/${settings.provider}/callback` || callback.hash || callback.username || callback.password || states.length !== 1 || !secretPattern.test(states[0]) || !secretPattern.test(browserBinding)) throw new Stage0Error('unauthenticated')
  const now = ctx.clock.now()
  const row = await ctx.db.prepare(`UPDATE oidc_transactions SET consumed_at=?
    WHERE state_digest=? AND binding_digest=? AND provider=? AND connection_id=? AND connection_version=?
      AND consumed_at IS NULL AND created_at<=? AND expires_at>? AND ${connectionCondition}
      AND (purpose IN ('login','recovery') OR EXISTS(SELECT 1 FROM stage0_live_sessions s WHERE s.id=oidc_transactions.session_id AND s.account_id=oidc_transactions.account_id AND s.transport='browser' AND s.expires_at>? AND s.created_at<=?))
    RETURNING purpose,created_at,account_id,session_id`)
    .bind(now, await digest(states[0]), await digest(browserBinding), settings.provider, settings.connectionId, settings.connectionVersion, now, now, ...connectionValues(settings), now, now).first<Transaction>()
  if (!row) throw new Stage0Error('unauthenticated')
  const secrets = await transactionSecrets(ctx, settings, states[0], browserBinding, row.purpose, row.created_at)
  const verified = await verifyOidcCode(ctx, settings, secrets, callback, fetcher)
  if (row.purpose === 'recovery') return { kind: 'recovery', session: await beginProviderRecovery(ctx, verified) }
  if (row.purpose === 'login') {
    const linked = await ctx.db.prepare('SELECT 1 FROM external_identities WHERE connection_id=? AND issuer=? AND subject=?')
      .bind(verified.connectionId, verified.issuer, verified.subject).first()
    if (!linked) return { kind: 'enrollment', ...await beginOidcEnrollment(ctx, verified) }
    return { kind: 'signed_in', session: await issueSession(ctx, await resolveOidcLogin(ctx, verified), 'browser') }
  }
  const session = await ctx.db.prepare("SELECT * FROM stage0_live_sessions WHERE id=? AND account_id=? AND transport='browser' AND expires_at>? AND created_at<=?")
    .bind(row.session_id, row.account_id, ctx.clock.now(), ctx.clock.now()).first<SessionRow>()
  if (!session) throw new Stage0Error('unauthenticated')
  return { kind: 'linked', identity: await linkOidcIdentity(ctx, principalFromRow(session), verified) }
}

const cookieName = (config: Stage0Config) => config.environment === 'local' ? 'ovelle_local_oidc' : '__Host-ovelle_oidc'
/** Lax is required only for the temporary top-level IdP callback. This cookie is
 * not an account session, and cannot authenticate any ordinary API request.
 */
export function oidcBindingCookie(config: Stage0Config, binding: string | null): string {
  if (binding !== null && !secretPattern.test(binding)) throw new Stage0Error('invalid_input')
  return `${cookieName(config)}=${binding ?? ''}; Path=/; HttpOnly;${config.environment === 'local' ? '' : ' Secure;'} SameSite=Lax; Max-Age=${binding === null ? 0 : 300}`
}
export function readOidcBindingCookie(config: Stage0Config, request: Request): string {
  const cookies = (request.headers.get('Cookie') ?? '').split(';').map(part => part.trim()).filter(part => part.startsWith(`${cookieName(config)}=`))
  if (cookies.length !== 1) throw new Stage0Error('unauthenticated')
  const value = cookies[0].slice(cookieName(config).length + 1)
  if (!secretPattern.test(value)) throw new Stage0Error('unauthenticated')
  return value
}
