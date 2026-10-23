import type { Principal, RequestContext } from '../contracts'
import { auditStatement, guardedBatch } from '../db'
import { Stage0Error } from '../errors'
import { randomSecret, secretDigest } from './secrets'
import { liveSessionCondition, loadLiveSession } from './sessions'

export interface RecoveryCodeStatus { version: number; remaining: number; rotatedAt: number | null }

/** Account-owned metadata only. No plaintext, digest or authentication capability
 * is returned, and the final SELECT rechecks the live session after preflight. */
export async function getRecoveryCodeStatus(ctx: RequestContext, principal: Principal): Promise<RecoveryCodeStatus> {
  const session = await loadLiveSession(ctx, principal)
  if (session.assurance === 'enrollment') throw new Stage0Error('forbidden')
  const live = liveSessionCondition(principal, ctx.clock.now())
  const row = await ctx.db.prepare(`SELECT coalesce(r.version,0) AS version,r.rotated_at AS rotatedAt,
    (SELECT count(*) FROM recovery_codes c WHERE c.account_id=a.id) AS remaining
    FROM accounts a LEFT JOIN recovery_code_sets r ON r.account_id=a.id
    WHERE a.id=? AND (${live.sql}) AND a.email_verified_at IS NOT NULL`)
    .bind(principal.accountId, ...live.values).first<RecoveryCodeStatus>()
  if (!row) throw new Stage0Error('unauthenticated')
  return row
}

/** Explicit issuance/rotation, never a login/reset operation. A lost response
 * cannot be replayed to reveal codes: read metadata and deliberately rotate again.
 * Version checks admit only one racing caller for the same expected generation. */
export async function rotateRecoveryCodes(ctx: RequestContext, principal: Principal, expectedVersion: number): Promise<{ version: number; codes: string[] }> {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || expectedVersion >= Number.MAX_SAFE_INTEGER) throw new Stage0Error('invalid_input')
  const session = await loadLiveSession(ctx, principal)
  const before = ctx.clock.now()
  if (session.assurance !== 'passkey' || !session.passkey_credential_id || session.passkey_verified_at === null
    || session.passkey_verified_at > before || session.passkey_verified_at <= before - 300_000) throw new Stage0Error('forbidden')
  const codes = Array.from({ length: 8 }, () => randomSecret())
  const digests = await Promise.all(codes.map(code => secretDigest(JSON.stringify(['ovelle:recovery-code:v1', session.account_id, code]))))
  const now = ctx.clock.now()
  // The database-owned passkey binding/provenance and recency must remain valid
  // at the write, including provider/key revocation while hashing the new set.
  await guardedBatch(ctx, `EXISTS(SELECT 1 FROM stage0_live_sessions s WHERE s.id=? AND s.account_id=? AND s.transport=?
      AND s.expires_at>? AND s.created_at<=? AND s.assurance='passkey' AND s.passkey_credential_id IS NOT NULL
      AND s.passkey_verified_at>? AND s.passkey_verified_at<=?)
    AND coalesce((SELECT version FROM recovery_code_sets WHERE account_id=?),0)=?`,
  [principal.sessionId, principal.accountId, principal.transport, now, now, now - 300_000, now, principal.accountId, expectedVersion], [
    ctx.db.prepare('DELETE FROM recovery_codes WHERE account_id=?').bind(session.account_id),
    ctx.db.prepare(`INSERT INTO recovery_code_sets(account_id,version,rotated_at) VALUES(?,?,?)
      ON CONFLICT(account_id) DO UPDATE SET version=excluded.version,rotated_at=excluded.rotated_at`).bind(session.account_id, expectedVersion + 1, now),
    ...digests.map((digest, index) => ctx.db.prepare('INSERT INTO recovery_codes(account_id,position,code_digest) VALUES(?,?,?)').bind(session.account_id, index + 1, digest)),
    auditStatement(ctx, 'recovery.rotate', session.account_id, principal),
  ])
  return { version: expectedVersion + 1, codes }
}
