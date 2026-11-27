import type { Principal, RequestContext } from '../contracts'
import { Stage0Error } from '../errors'
import { liveSessionCondition, loadLiveSession } from './sessions'

const recent = 300_000
// Owners and active admins must use a local passkey even when an upstream IdP
// claims MFA. Linking changes future ways into this existing Ovelle account.
const elevated = `EXISTS(SELECT 1 FROM organization_memberships m JOIN organizations o ON o.id=m.organization_id
  WHERE m.account_id=s.account_id AND m.state='active' AND (m.preset='admin' OR o.owner_account_id=s.account_id))`
const linkAssurance = `s.assurance!='enrollment' AND s.authenticated_at>? AND s.authenticated_at<=?
  AND (NOT (${elevated}) OR (s.assurance='passkey' AND s.passkey_verified_at>? AND s.passkey_verified_at<=?))`

export function identityLinkGuard(principal: Principal, now: number) {
  const live = liveSessionCondition(principal, now)
  return { sql: `${live.sql} AND EXISTS(SELECT 1 FROM stage0_live_sessions s WHERE s.id=? AND (${linkAssurance}))`,
    values: [...live.values, principal.sessionId, now - recent, now, now - recent, now] }
}

export async function assertIdentityLinkPrincipal(ctx: RequestContext, principal: Principal): Promise<void> {
  await loadLiveSession(ctx, principal)
  const guard = identityLinkGuard(principal, ctx.clock.now())
  if (!await ctx.db.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first()) throw new Stage0Error('forbidden')
}
