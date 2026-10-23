import type { D1PreparedStatement } from '@cloudflare/workers-types'
import type { Principal, RequestContext } from './contracts'
import { Stage0Error } from './errors'

export type SqlValue = string | number | null
export type AuditAction = 'account.create' | 'session.issue' | 'session.rotate' | 'session.revoke' | 'session.revoke_all' | 'program.update' | 'identity.link' | 'passkey.register' | 'passkey.authenticate'
  | 'organization.create' | 'organization.update' | 'program.create' | 'program.archive' | 'location.create' | 'location.update' | 'location.archive'
  | 'invitation.create' | 'invitation.resend' | 'invitation.revoke' | 'invitation.accept' | 'invitation.expire'
export function auditStatement(ctx: RequestContext, action: AuditAction, resourceId: string, actor: Pick<Principal, 'accountId' | 'sessionId'>, organizationId: string | null = null): D1PreparedStatement {
  return ctx.db.prepare(`INSERT INTO audit_events(id,organization_id,actor_account_id,session_id,action,resource_id,request_id,created_at) VALUES(?,?,?,?,?,?,?,?)`)
    .bind(ctx.ids.next(), organizationId, actor.accountId, actor.sessionId, action, resourceId, ctx.requestId, ctx.clock.now())
}

/** Internal SQL boundary. Never accept SQL fragments or bindings from an HTTP client.
 * Guard failure is a constraint violation: all writes and audit in the batch roll back.
 */
export async function guardedBatch(ctx: RequestContext, condition: string, values: SqlValue[], statements: D1PreparedStatement[]): Promise<void> {
  const guardId = ctx.ids.next()
  try {
    await ctx.db.batch([
      ctx.db.prepare(`INSERT INTO stage0_guards(allowed,id) VALUES(CASE WHEN (${condition}) THEN 1 ELSE 0 END,?${values.length + 1})`).bind(...values, guardId),
      ...statements,
      ctx.db.prepare('DELETE FROM stage0_guards WHERE id=?').bind(guardId),
    ])
  } catch (error) {
    if (error instanceof Error && error.message.includes('stage0_guard_denied')) throw new Stage0Error('conflict')
    throw error
  }
}
