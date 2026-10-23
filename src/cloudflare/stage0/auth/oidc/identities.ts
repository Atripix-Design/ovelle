import type { Principal, RequestContext } from '../../contracts'
import { auditStatement, guardedBatch } from '../../db'
import { Stage0Error } from '../../errors'
import type { VerifiedAuthentication } from '../sessions'
import { assertIdentityLinkPrincipal as assertOidcLinkPrincipal, identityLinkGuard as oidcLinkGuard } from '../linking'
export { assertIdentityLinkPrincipal as assertOidcLinkPrincipal, identityLinkGuard as oidcLinkGuard } from '../linking'
import { consumeOidcIdentity, type VerifiedOidcIdentity } from './protocol'

export interface IdentitySnapshot { id: string; provider: string; issuer: string; subject: string }

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
