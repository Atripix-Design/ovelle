import type { D1PreparedStatement } from '@cloudflare/workers-types'
import type { CommandContext } from './contracts'
import { guardedBatch } from './db'
import { Stage0Error } from './errors'
import { loadLiveSession } from './auth/sessions'
import { secretDigest } from './auth/secrets'
import { Bindings } from './access/policy'

type Command = 'organization.create' | 'organization.update' | 'program.save' | 'location.save'
  | 'invitation.create' | 'invitation.resend' | 'invitation.revoke' | 'invitation.accept'
type Policy = (b: Bindings, organizationId: string) => string

/** A receipt is a past result, not a capability. Each replay rechecks live SQL
 * authority, including grants and federation, before disclosing the result.
 */
export async function withReceipt<T>(ctx: CommandContext, command: Command, scopeKey: string, body: unknown, replayPolicy: Policy, apply: (digest: string) => Promise<T>): Promise<T> {
  if (typeof ctx.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(ctx.idempotencyKey)) throw new Stage0Error('invalid_input')
  await loadLiveSession(ctx, ctx.principal)
  const digest = await secretDigest(JSON.stringify(['stage0-command-v1', command, scopeKey, body]))
  const replay = async (): Promise<{ result: T } | null> => {
    const row = await ctx.db.prepare('SELECT id,organization_id FROM command_receipts WHERE actor_account_id=? AND scope_key=? AND command=? AND idempotency_key=?')
      .bind(ctx.principal.accountId, scopeKey, command, ctx.idempotencyKey).first<{ id: string; organization_id: string }>()
    if (!row) return null
    const b = new Bindings()
    const allowed = replayPolicy(b, row.organization_id)
    const receipt = await ctx.db.prepare(`SELECT request_digest,result FROM command_receipts WHERE id=${b.add(row.id)} AND (${allowed})`).bind(...b.values).first<{ request_digest: string; result: string }>()
    if (!receipt) throw new Stage0Error('not_found')
    if (receipt.request_digest !== digest) throw new Stage0Error('conflict')
    return { result: JSON.parse(receipt.result) as T }
  }
  const existing = await replay()
  if (existing) return existing.result
  try { return await apply(digest) } catch (error) {
    // Two concurrent same-key requests may both miss the first SELECT. Only one
    // batch commits; the other may return that receipt after fresh authorization.
    if (error instanceof Stage0Error && error.code === 'conflict') {
      const committed = await replay()
      if (committed) return committed.result
    }
    throw error
  }
}
export async function commit<T>(ctx: CommandContext, command: Command, organizationId: string, scopeKey: string, digest: string, b: Bindings, condition: string, statements: D1PreparedStatement[], result: T): Promise<T> {
  const absent = `NOT EXISTS(SELECT 1 FROM command_receipts WHERE actor_account_id=${b.add(ctx.principal.accountId)} AND scope_key=${b.add(scopeKey)} AND command=${b.add(command)} AND idempotency_key=${b.add(ctx.idempotencyKey)})`
  await guardedBatch(ctx, `(${condition}) AND ${absent}`, b.values, [
    ...statements,
    ctx.db.prepare('INSERT INTO command_receipts(id,actor_account_id,organization_id,scope_key,command,idempotency_key,request_digest,result,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .bind(ctx.ids.next(), ctx.principal.accountId, organizationId, scopeKey, command, ctx.idempotencyKey, digest, JSON.stringify(result), ctx.clock.now()),
  ])
  return result
}
