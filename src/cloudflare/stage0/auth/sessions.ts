import type { Principal, RequestContext } from '../contracts'
import { auditStatement, guardedBatch, type SqlValue } from '../db'
import { Stage0Error } from '../errors'

type Transport = Principal['transport']
type Method = Principal['method']
export interface SessionRow {
  id: string; account_id: string; transport: Transport; method: Method; assurance: Principal['assurance'];
  account_security_version: number; external_identity_id: string | null; external_identity_version: number | null; connection_id: string | null; connection_version: number | null;
  created_at: number; authenticated_at: number; passkey_verified_at: number | null; expires_at: number
}
export interface IssuedSession { token: string; csrfToken: string | null; principal: Principal }
/** Only a verified server-side credential/protocol adapter may invoke the issuer.
 * This is not proof verification, and must never receive a deserialized request body.
 */
export interface VerifiedAuthentication { accountId: string; method: Method; externalIdentityId?: string }
const secretPattern = /^[A-Za-z0-9_-]{43}$/
function secret(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}
async function digest(value: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('')
}
export function principalFromRow(row: SessionRow): Principal {
  return { accountId: row.account_id, sessionId: row.id, transport: row.transport, method: row.method, assurance: row.assurance, connectionId: row.connection_id, connectionVersion: row.connection_version, authenticatedAt: row.authenticated_at, passkeyVerifiedAt: row.passkey_verified_at }
}
// Reused at every service boundary; never trust assurance/roles supplied in a principal object.
export function liveSessionCondition(principal: Principal, now: number): { sql: string; values: SqlValue[] } {
  return { sql: 'EXISTS(SELECT 1 FROM stage0_live_sessions WHERE id=? AND account_id=? AND transport=? AND expires_at>? AND created_at<=?)', values: [principal.sessionId, principal.accountId, principal.transport, now, now] }
}
export async function loadLiveSession(ctx: RequestContext, principal: Principal): Promise<SessionRow> {
  const row = await ctx.db.prepare('SELECT * FROM stage0_live_sessions WHERE id=? AND account_id=? AND transport=? AND expires_at>? AND created_at<=?')
    .bind(principal.sessionId, principal.accountId, principal.transport, ctx.clock.now(), ctx.clock.now()).first<SessionRow>()
  if (!row) throw new Stage0Error('unauthenticated')
  return row
}
export async function resolveSession(ctx: RequestContext, token: string, transport: Transport): Promise<Principal> {
  if (!secretPattern.test(token)) throw new Stage0Error('unauthenticated')
  const row = await ctx.db.prepare('SELECT * FROM stage0_live_sessions WHERE token_digest=? AND transport=? AND expires_at>? AND created_at<=?')
    .bind(await digest(token), transport, ctx.clock.now(), ctx.clock.now()).first<SessionRow>()
  if (!row) throw new Stage0Error('unauthenticated')
  return principalFromRow(row)
}
async function prepareIssuance(ctx: RequestContext, row: SessionRow) {
  const token = secret()
  const csrfToken = row.transport === 'browser' ? secret() : null
  const insert = ctx.db.prepare(`INSERT INTO sessions(id,account_id,token_digest,csrf_digest,transport,method,assurance,account_security_version,external_identity_id,external_identity_version,connection_id,connection_version,created_at,authenticated_at,passkey_verified_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(row.id, row.account_id, await digest(token), csrfToken ? await digest(csrfToken) : null, row.transport, row.method, row.assurance, row.account_security_version, row.external_identity_id, row.external_identity_version, row.connection_id, row.connection_version, row.created_at, row.authenticated_at, row.passkey_verified_at, row.expires_at)
  return { insert, issued: { token, csrfToken, principal: principalFromRow(row) } }
}
export async function issueSession(ctx: RequestContext, auth: VerifiedAuthentication, transport: Transport): Promise<IssuedSession> {
  if (!['password', 'passkey', 'oidc', 'saml'].includes(auth.method) || !['browser', 'desktop'].includes(transport)) throw new Stage0Error('invalid_input')
  const federated = auth.method === 'oidc' || auth.method === 'saml'
  if (federated !== Boolean(auth.externalIdentityId)) throw new Stage0Error('invalid_input')
  const account = await ctx.db.prepare('SELECT security_version,email_verified_at FROM accounts WHERE id=? AND disabled_at IS NULL').bind(auth.accountId).first<{ security_version: number; email_verified_at: number | null }>()
  if (!account) throw new Stage0Error('unauthenticated')
  if (auth.method === 'passkey' && account.email_verified_at === null) throw new Stage0Error('forbidden')
  const identity = federated ? await ctx.db.prepare(`SELECT i.connection_id,c.version,i.version AS identity_version FROM external_identities i JOIN identity_connections c ON c.id=i.connection_id WHERE i.id=? AND i.account_id=? AND i.disabled_at IS NULL AND c.enabled=1 AND c.protocol=? AND c.issuer=i.issuer`)
    .bind(auth.externalIdentityId!, auth.accountId, auth.method).first<{ connection_id: string; version: number; identity_version: number }>() : null
  if (federated && !identity) throw new Stage0Error('unauthenticated')
  const now = ctx.clock.now()
  const row: SessionRow = { id: ctx.ids.next(), account_id: auth.accountId, transport, method: auth.method,
    assurance: account.email_verified_at === null ? 'enrollment' : auth.method === 'passkey' ? 'passkey' : 'authenticated',
    account_security_version: account.security_version, external_identity_id: auth.externalIdentityId ?? null, external_identity_version: identity?.identity_version ?? null,
    connection_id: identity?.connection_id ?? null, connection_version: identity?.version ?? null,
    created_at: now, authenticated_at: now, passkey_verified_at: auth.method === 'passkey' ? now : null, expires_at: now + 43_200_000 }
  const prepared = await prepareIssuance(ctx, row)
  await guardedBatch(ctx, `EXISTS(SELECT 1 FROM accounts WHERE id=? AND disabled_at IS NULL AND security_version=? AND (email_verified_at IS NOT NULL OR ?='enrollment'))
    AND (? IS NULL OR EXISTS(SELECT 1 FROM external_identities i JOIN identity_connections c ON c.id=i.connection_id WHERE i.id=? AND i.account_id=? AND i.version=? AND i.disabled_at IS NULL AND c.id=? AND c.version=? AND c.enabled=1 AND c.protocol=? AND c.issuer=i.issuer))`,
  [row.account_id, row.account_security_version, row.assurance, row.external_identity_id, row.external_identity_id, row.account_id, row.external_identity_version, row.connection_id, row.connection_version, row.method],
  [prepared.insert, auditStatement(ctx, 'session.issue', row.id, prepared.issued.principal)])
  return prepared.issued
}
export async function rotateSession(ctx: RequestContext, principal: Principal): Promise<IssuedSession> {
  const existing = await loadLiveSession(ctx, principal)
  // Rotation is not reauthentication: retain the original auth time and absolute expiry.
  const row = { ...existing, id: ctx.ids.next(), created_at: ctx.clock.now() }
  const prepared = await prepareIssuance(ctx, row)
  const guard = liveSessionCondition(principal, ctx.clock.now())
  await guardedBatch(ctx, guard.sql, guard.values, [prepared.insert,
    ctx.db.prepare('UPDATE sessions SET revoked_at=? WHERE id=?').bind(ctx.clock.now(), existing.id),
    auditStatement(ctx, 'session.rotate', row.id, principal)])
  return prepared.issued
}
export async function revokeSession(ctx: RequestContext, principal: Principal, targetId: string): Promise<void> {
  await loadLiveSession(ctx, principal)
  const exists = await ctx.db.prepare('SELECT id FROM sessions WHERE id=? AND account_id=?').bind(targetId, principal.accountId).first()
  if (!exists) throw new Stage0Error('not_found')
  const guard = liveSessionCondition(principal, ctx.clock.now())
  await guardedBatch(ctx, guard.sql, guard.values, [ctx.db.prepare('UPDATE sessions SET revoked_at=coalesce(revoked_at,?) WHERE id=? AND account_id=?').bind(ctx.clock.now(), targetId, principal.accountId), auditStatement(ctx, 'session.revoke', targetId, principal)])
}
export async function revokeAllSessions(ctx: RequestContext, principal: Principal): Promise<void> {
  await loadLiveSession(ctx, principal)
  const guard = liveSessionCondition(principal, ctx.clock.now())
  await guardedBatch(ctx, guard.sql, guard.values, [
    ctx.db.prepare('UPDATE accounts SET security_version=security_version+1 WHERE id=?').bind(principal.accountId),
    ctx.db.prepare('UPDATE sessions SET revoked_at=coalesce(revoked_at,?) WHERE account_id=?').bind(ctx.clock.now(), principal.accountId),
    auditStatement(ctx, 'session.revoke_all', principal.accountId, principal),
  ])
}
export async function verifyCsrf(ctx: RequestContext, principal: Principal, csrfToken: string): Promise<boolean> {
  if (!secretPattern.test(csrfToken) || principal.transport !== 'browser') return false
  const guard = liveSessionCondition(principal, ctx.clock.now())
  return Boolean(await ctx.db.prepare(`SELECT 1 FROM sessions WHERE id=? AND csrf_digest=? AND (${guard.sql})`).bind(principal.sessionId, await digest(csrfToken), ...guard.values).first())
}
