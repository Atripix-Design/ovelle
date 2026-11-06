import type { D1PreparedStatement } from '@cloudflare/workers-types'
import type { RequestContext } from '../contracts'
import { Stage0Error } from '../errors'

import { deriveAuthBudgets } from './budgets'
import type { AuthBudget, AuthBudgetSelectors } from './budgets'

function cleanup(ctx: RequestContext, now: number): D1PreparedStatement[] {
  // Bounded request-path cleanup; callers can later schedule the same indexed
  // retention policy without making login latency depend on an unbounded sweep.
  return [
    ctx.db.prepare('DELETE FROM auth_attempts WHERE id IN (SELECT id FROM auth_attempts WHERE expires_at<=? LIMIT 100)').bind(now),
    ctx.db.prepare('DELETE FROM auth_limits WHERE id IN (SELECT id FROM auth_limits WHERE expires_at<=? LIMIT 100)').bind(now),
  ]
}

function consume(ctx: RequestContext, budget: AuthBudget, now: number): D1PreparedStatement {
  return ctx.db.prepare(`INSERT INTO auth_limits(id,kind,used,expires_at) VALUES(?,?,1,?)
    ON CONFLICT(id) DO UPDATE SET used=CASE WHEN auth_limits.expires_at<=? THEN 1 ELSE auth_limits.used+1 END,
    expires_at=CASE WHEN auth_limits.expires_at<=? THEN excluded.expires_at ELSE auth_limits.expires_at END`)
    .bind(budget.id, budget.kind, now + budget.lifetime, now, now)
}

async function batch(ctx: RequestContext, statements: D1PreparedStatement[]): Promise<void> {
  try { await ctx.db.batch(statements) } catch (error) {
    if (error instanceof Error && error.message.includes('auth_limit_exceeded')) throw new Stage0Error('rate_limited')
    throw error
  }
}

/** Internal only. The caller supplies the canonical trusted edge IP and a stable
 * environment-specific random 32-byte server key, never client-provided headers
 * or an unsalted hash. Reserve before verification, then settle in a finally
 * block. Pending/crashed attempts conservatively occupy their window's budget.
 */
export async function reserveAuthAttempt(ctx: RequestContext, input: AuthBudgetSelectors, keyMaterial: Uint8Array): Promise<string> {
  const [pair, ip] = await deriveAuthBudgets(input, keyMaterial, 'challenge')
  const now = ctx.clock.now()
  const leaseId = ctx.ids.next()
  await batch(ctx, [...cleanup(ctx, now), consume(ctx, pair, now), consume(ctx, ip, now),
    ctx.db.prepare(`INSERT INTO auth_attempts(id,pair_id,pair_expires_at,ip_id,ip_expires_at,expires_at)
      SELECT ?,a.id,a.expires_at,b.id,b.expires_at,max(a.expires_at,b.expires_at) FROM auth_limits a,auth_limits b WHERE a.id=? AND b.id=?`).bind(leaseId, pair.id, ip.id),
  ])
  return leaseId
}

/** Trusted verifier result only; the lease and success flag are never accepted
 * from HTTP. Removing the lease in the same batch makes refunds repeat-safe.
 * Window identity prevents a late completion from refunding a new counter.
 */
export async function finishAuthAttempt(ctx: RequestContext, leaseId: string, success: boolean): Promise<void> {
  const statements: D1PreparedStatement[] = []
  if (success) statements.push(ctx.db.prepare(`UPDATE auth_limits SET used=used-1 WHERE used>0 AND expires_at>?
    AND EXISTS(SELECT 1 FROM auth_attempts t WHERE t.id=? AND
      ((auth_limits.id=t.pair_id AND auth_limits.expires_at=t.pair_expires_at) OR (auth_limits.id=t.ip_id AND auth_limits.expires_at=t.ip_expires_at)))`).bind(ctx.clock.now(), leaseId))
  statements.push(ctx.db.prepare('DELETE FROM auth_attempts WHERE id=?').bind(leaseId))
  await batch(ctx, statements)
}

/** Shared across verification/reset/invitation sends. Count the reservation even
 * if delivery fails; provider retry and resend never create an unlimited budget.
 */
export async function consumeAuthEmailBudget(ctx: RequestContext, input: AuthBudgetSelectors, keyMaterial: Uint8Array): Promise<void> {
  const limits = await deriveAuthBudgets(input, keyMaterial, 'email')
  const now = ctx.clock.now()
  await batch(ctx, [...cleanup(ctx, now), ...limits.map(limit => consume(ctx, limit, now))])
}

/** Starts consume challenge capacity without a refundable verifier lease. */
async function consumeStart(ctx: RequestContext, selector: string, ip: string, keyMaterial: Uint8Array): Promise<void> {
  const limits = await deriveAuthBudgets({ email: selector, ip }, keyMaterial, 'challenge')
  const now = ctx.clock.now()
  await batch(ctx, [...cleanup(ctx, now), ...limits.map(limit => consume(ctx, limit, now))])
}

/** Provider starts have no email yet. Reserve five starts per provider/IP and
 * the shared thirty-per-IP challenge ceiling. No refund on successful login:
 * starting a flow already consumed database and provider work.
 */
export async function consumeOidcStartBudget(ctx: RequestContext, provider: 'google' | 'microsoft', ip: string, keyMaterial: Uint8Array): Promise<void> {
  if (provider !== 'google' && provider !== 'microsoft') throw new Stage0Error('invalid_input')
  await consumeStart(ctx, `oidc-start:${provider}`, ip, keyMaterial)
}

export async function consumePasskeyStartBudget(ctx: RequestContext, ip: string, keyMaterial: Uint8Array): Promise<void> {
  await consumeStart(ctx, 'passkey-start', ip, keyMaterial)
}

/** First-party native starts share the global per-IP challenge ceiling, with
 * five requests per IP/window for this purpose. A browser body cannot set IP. */
export async function consumeDesktopStartBudget(ctx: RequestContext, ip: string, keyMaterial: Uint8Array): Promise<void> {
  await consumeStart(ctx, 'desktop-request', ip, keyMaterial)
}

/** All enterprise SAML starts share one purpose/IP limit; rotating connection
 * selectors cannot multiply starts. The global IP challenge ceiling also applies. */
export async function consumeSamlStartBudget(ctx: RequestContext, ip: string, keyMaterial: Uint8Array): Promise<void> {
  await consumeStart(ctx, 'saml-start', ip, keyMaterial)
}
