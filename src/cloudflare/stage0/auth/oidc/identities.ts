import type { Principal, RequestContext } from '../../contracts'
import { auditStatement, guardedBatch } from '../../db'
import { Stage0Error } from '../../errors'
import { liveSessionCondition, loadLiveSession, type VerifiedAuthentication } from '../sessions'
import { consumeOidcIdentity, type VerifiedOidcIdentity } from './protocol'

export interface IdentitySnapshot { id: string; provider: string; issuer: string; subject: string }
const recent = 300_000
// Owners and active admins must use a local passkey even when an upstream IdP
// claims MFA. Linking changes future ways into this existing Ovelle account.
const elevated = `EXISTS(SELECT 1 FROM organization_memberships m JOIN organizations o ON o.id=m.organization_id
  WHERE m.account_id=s.account_id AND m.state='active' AND (m.preset='admin' OR o.owner_account_id=s.account_id))`
const linkAssurance = `s.assurance!='enrollment' AND s.authenticated_at>? AND s.authenticated_at<=?
  AND (NOT (${elevated}) OR (s.assurance='passkey' AND s.passkey_verified_at>? AND s.passkey_verified_at<=?))`

function consume(ctx: RequestContext, proof: VerifiedOidcIdentity, purpose: 'login' | 'link') {
  const verified = consumeOidcIdentity(proof)
  const now = ctx.clock.now()
  if (verified.purpose !== purpose || verified.verifiedAt > now || now >= verified.verifiedAt + 60_000) throw new Stage0Error('unauthenticated')
  return verified
}
async function currentConnection(ctx: RequestContext, proof: VerifiedOidcIdentity): Promise<boolean> {
  return Boolean(await ctx.db.prepare(`SELECT 1 FROM identity_connections WHERE id=? AND provider=? AND protocol='oidc'
    AND client_id=? AND version=? AND enabled=1`).bind(proof.connectionId, proof.provider, proof.clientId, proof.connectionVersion).first())
}

export function oidcLinkGuard(principal: Principal, now: number) {
  const live = liveSessionCondition(principal, now)
  return { sql: `${live.sql} AND EXISTS(SELECT 1 FROM stage0_live_sessions s WHERE s.id=? AND (${linkAssurance}))`,
    values: [...live.values, principal.sessionId, now - recent, now, now - recent, now] }
}

export async function assertOidcLinkPrincipal(ctx: RequestContext, principal: Principal): Promise<void> {
  await loadLiveSession(ctx, principal)
  const guard = oidcLinkGuard(principal, ctx.clock.now())
  if (!await ctx.db.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first()) throw new Stage0Error('forbidden')
}

/** Resolve an already linked immutable issuer/subject pair. Email and provider
 * role claims never locate an account or create organization authority.
 */
export async function resolveOidcLogin(ctx: RequestContext, input: VerifiedOidcIdentity): Promise<VerifiedAuthentication> {
  const proof = consume(ctx, input, 'login')
  const row = await ctx.db.prepare(`SELECT i.id,i.account_id,i.version FROM stage0_trusted_identities i JOIN accounts a ON a.id=i.account_id
    WHERE i.connection_id=? AND i.provider=? AND i.protocol='oidc' AND i.client_id=? AND i.connection_version=?
      AND i.issuer=? AND i.subject=? AND a.disabled_at IS NULL`)
    .bind(proof.connectionId, proof.provider, proof.clientId, proof.connectionVersion, proof.issuer, proof.subject)
    .first<{ id: string; account_id: string; version: number }>()
  if (!row) throw new Stage0Error('unauthenticated')
  return { accountId: row.account_id, method: 'oidc', externalIdentityId: row.id, identityVersion: row.version, connectionVersion: proof.connectionVersion }
}

/** Called only after a server-owned link transaction verifies its initiating
 * session binding. Keep this repository internal; HTTP input is never proof.
 */
export async function linkOidcIdentity(ctx: RequestContext, principal: Principal, input: VerifiedOidcIdentity): Promise<IdentitySnapshot> {
  const proof = consume(ctx, input, 'link')
  await assertOidcLinkPrincipal(ctx, principal)
  const now = ctx.clock.now()
  const live = oidcLinkGuard(principal, now)
  if (!await currentConnection(ctx, proof)) throw new Stage0Error('forbidden')
  const existing = await ctx.db.prepare('SELECT id,account_id,disabled_at FROM external_identities WHERE connection_id=? AND issuer=? AND subject=?')
    .bind(proof.connectionId, proof.issuer, proof.subject).first<{ id: string; account_id: string; disabled_at: number | null }>()
  // Do not reassign foreign identities or revive disabled ones. Idempotent
  // repeat linking still requires fresh provider and existing-account proof.
  if (existing && (existing.account_id !== principal.accountId || existing.disabled_at !== null)) throw new Stage0Error('conflict')
  const id = existing?.id ?? ctx.ids.next()
  const condition = `${live.sql} AND EXISTS(SELECT 1 FROM identity_connections WHERE id=? AND provider=? AND protocol='oidc' AND client_id=? AND version=? AND enabled=1)`
  const values = [...live.values, proof.connectionId, proof.provider, proof.clientId, proof.connectionVersion]
  const statements = existing ? [ctx.db.prepare('SELECT 1 FROM stage0_trusted_identities WHERE id=? AND account_id=?').bind(id, principal.accountId)] : [
    ctx.db.prepare('INSERT INTO external_identities(id,account_id,connection_id,issuer,subject,tenant_id,created_at) VALUES(?,?,?,?,?,?,?)')
      .bind(id, principal.accountId, proof.connectionId, proof.issuer, proof.subject, proof.tenantId, now),
    auditStatement(ctx, 'identity.link', id, principal),
  ]
  // Existing identity state must be checked inside the same transaction too.
  const existingGuard = existing ? ' AND EXISTS(SELECT 1 FROM stage0_trusted_identities WHERE id=? AND account_id=?)' : ''
  try {
    await guardedBatch(ctx, condition + existingGuard, existing ? [...values, id, principal.accountId] : values, statements)
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed: external_identities.')) throw new Stage0Error('conflict')
    throw error
  }
  return { id, provider: proof.provider, issuer: proof.issuer, subject: proof.subject }
}
