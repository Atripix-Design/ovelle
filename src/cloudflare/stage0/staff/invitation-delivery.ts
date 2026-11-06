import type { RequestContext } from '../contracts'
import { secretDigest } from '../auth/secrets'

/** Send only after the invitation transaction commits. A late provider reply
 * must not overwrite a newer token's delivery or imply membership activation.
 * Unlike contact verification, invitations persist versioned delivery state.
 */
export async function deliverInvitation(ctx: RequestContext, id: string, issuedVersion: number, address: string, secret: string): Promise<void> {
  let status: 'accepted' | 'failed' = 'failed'
  try {
    const outcome = await ctx.mailer.send({
      to: address,
      kind: 'staff_invitation',
      url: `${ctx.config.origin}/account/staff-invitation#token=${secret}`,
    })
    status = outcome.status
  } catch { /* Provider detail never enters receipts, audit or API errors. */ }
  await ctx.db.prepare('UPDATE staff_invitations SET delivery=?,delivery_finished_at=? WHERE id=? AND delivery_version=? AND token_digest=? AND delivery=?')
    .bind(status, ctx.clock.now(), id, issuedVersion, await secretDigest(secret), 'pending').run()
}
