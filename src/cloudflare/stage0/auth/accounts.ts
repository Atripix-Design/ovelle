import type { AccountSnapshot, Principal, RequestContext } from '../contracts'
import { Stage0Error } from '../errors'
import { normalizedEmail, normalizedContactName } from './contact'
import { loadLiveSession, liveSessionCondition } from './sessions'

type AccountRow = { id: string; email: string; display_name: string; email_verified_at: number | null }
const snapshot = (row: AccountRow): AccountSnapshot => ({ id: row.id, email: row.email, displayName: row.display_name, verifiedAt: row.email_verified_at })
/** Internal account creation only. HTTP registration will need enumeration-safe
 * acknowledgments, durable abuse limits and delivery; creation grants no access.
 */
export async function createAccount(ctx: RequestContext, input: { email: string; displayName: string }): Promise<AccountSnapshot> {
  const email = normalizedEmail(input.email)
  const displayName = normalizedContactName(input.displayName)
  const id = ctx.ids.next()
  try {
    await ctx.db.batch([
      ctx.db.prepare('INSERT INTO accounts(id,email,display_name,created_at) VALUES(?,?,?,?)').bind(id, email, displayName, ctx.clock.now()),
      ctx.db.prepare("INSERT INTO audit_events(id,actor_account_id,action,resource_id,request_id,created_at) VALUES(?,?,'account.create',?,?,?)").bind(ctx.ids.next(), id, id, ctx.requestId, ctx.clock.now()),
    ])
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint')) throw new Stage0Error('conflict')
    throw error
  }
  return { id, email, displayName, verifiedAt: null }
}
export async function getOwnAccount(ctx: RequestContext, principal: Principal): Promise<AccountSnapshot> {
  await loadLiveSession(ctx, principal)
  const guard = liveSessionCondition(principal, ctx.clock.now())
  const row = await ctx.db.prepare(`SELECT id,email,display_name,email_verified_at FROM accounts WHERE id=? AND (${guard.sql})`).bind(principal.accountId, ...guard.values).first<AccountRow>()
  if (!row) throw new Stage0Error('unauthenticated')
  return snapshot(row)
}
