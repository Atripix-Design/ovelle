import type { Principal, RequestContext } from '../contracts'
import { auditStatement, guardedBatch } from '../db'
import { Stage0Error } from '../errors'
import { randomSecret, secretDigest, secretPattern } from './secrets'
import { liveSessionCondition, loadLiveSession, prepareSessionIssuance, type SessionRow } from './sessions'
import { consumeOidcIdentity, type VerifiedOidcIdentity } from './oidc/protocol'
import { finishAuthAttempt, reserveAuthAttempt } from './limits'

/** A recovery callback verifies a provider without giving an ordinary login.
 * Only an already linked immutable subject can produce this short-lived proof.
 * Provider/email contact enrollment and normal login cannot substitute for it. */
export async function beginProviderRecovery(ctx: RequestContext, input: VerifiedOidcIdentity) {
  const proof = consumeOidcIdentity(input), now = ctx.clock.now()
  if (proof.purpose !== 'recovery' || proof.verifiedAt > now || proof.verifiedAt <= now - 60_000
    || proof.authenticatedAt === null || proof.authenticatedAt > now || proof.authenticatedAt <= now - 300_000) throw new Stage0Error('unauthenticated')
  const identity = await ctx.db.prepare(`SELECT i.id,i.account_id,i.version,a.security_version FROM stage0_trusted_identities i
    JOIN accounts a ON a.id=i.account_id WHERE i.protocol='oidc' AND i.provider=? AND i.connection_id=? AND i.connection_version=?
    AND i.client_id=? AND i.issuer=? AND i.subject=? AND a.disabled_at IS NULL AND a.email_verified_at IS NOT NULL`)
    .bind(proof.provider, proof.connectionId, proof.connectionVersion, proof.clientId, proof.issuer, proof.subject)
    .first<{ id: string; account_id: string; version: number; security_version: number }>()
  if (!identity) throw new Stage0Error('unauthenticated')
  const row: SessionRow = { id: ctx.ids.next(), account_id: identity.account_id, transport: 'browser', method: 'oidc', assurance: 'enrollment',
    account_security_version: identity.security_version, external_identity_id: identity.id, external_identity_version: identity.version,
    connection_id: proof.connectionId, connection_version: proof.connectionVersion, created_at: now, authenticated_at: proof.authenticatedAt,
    passkey_verified_at: null, expires_at: proof.authenticatedAt + 300_000 }
  const prepared = await prepareSessionIssuance(ctx, row)
  await guardedBatch(ctx, `EXISTS(SELECT 1 FROM stage0_trusted_identities i JOIN accounts a ON a.id=i.account_id
    WHERE i.id=? AND i.account_id=? AND i.version=? AND i.connection_version=? AND i.protocol='oidc' AND i.client_id=?
    AND a.security_version=? AND a.disabled_at IS NULL AND a.email_verified_at IS NOT NULL)`,
  [identity.id, identity.account_id, identity.version, proof.connectionVersion, proof.clientId, identity.security_version], [
    prepared.insert,
    ctx.db.prepare('INSERT INTO recovery_provider_proofs(session_id,account_id,authenticated_at) VALUES(?,?,?)').bind(row.id, row.account_id, row.authenticated_at),
    auditStatement(ctx, 'session.issue', row.id, prepared.issued.principal),
  ])
  return prepared.issued
}

/** Both factors are required at the atomic write. Incrementing the account epoch
 * invalidates every browser/native session and approved desktop exchange, whose
 * existing service rechecks its exact live source session at consumption. */
export async function consumeRecoveryCode(ctx: RequestContext, principal: Principal, code: string, ip: string, budgetKey: Uint8Array) {
  const source = await loadLiveSession(ctx, principal)
  if (source.transport !== 'browser' || source.method !== 'oidc' || source.assurance !== 'enrollment'
    || !await ctx.db.prepare('SELECT 1 FROM recovery_provider_proofs WHERE session_id=? AND account_id=?').bind(source.id, source.account_id).first()) throw new Stage0Error('forbidden')
  const lease = await reserveAuthAttempt(ctx, { email: `recovery:${source.account_id}`, ip }, budgetKey)
  let success = false
  try {
    if (typeof code !== 'string' || !secretPattern.test(code)) throw new Stage0Error('unauthenticated')
    const digest = await secretDigest(JSON.stringify(['ovelle:recovery-code:v1', source.account_id, code]))
    if (!await ctx.db.prepare('SELECT 1 FROM recovery_codes WHERE account_id=? AND code_digest=?').bind(source.account_id, digest).first()) throw new Stage0Error('unauthenticated')
    const now = ctx.clock.now(), live = liveSessionCondition(principal, now)
    const row: SessionRow = { ...source, id: ctx.ids.next(), created_at: now, account_security_version: source.account_security_version + 1 }
    const prepared = await prepareSessionIssuance(ctx, row)
    await guardedBatch(ctx, `(${live.sql}) AND EXISTS(SELECT 1 FROM recovery_provider_proofs WHERE session_id=? AND account_id=?)
      AND EXISTS(SELECT 1 FROM recovery_codes WHERE account_id=? AND code_digest=?) AND ?<=? AND ?>?
      AND EXISTS(SELECT 1 FROM accounts WHERE id=? AND email_verified_at IS NOT NULL)`,
    [...live.values, source.id, source.account_id, source.account_id, digest, source.authenticated_at, now, source.authenticated_at, now - 300_000, source.account_id], [
      ctx.db.prepare('DELETE FROM recovery_codes WHERE account_id=? AND code_digest=?').bind(source.account_id, digest),
      ctx.db.prepare('UPDATE accounts SET security_version=security_version+1 WHERE id=?').bind(source.account_id),
      ctx.db.prepare('UPDATE sessions SET revoked_at=coalesce(revoked_at,?) WHERE account_id=?').bind(now, source.account_id),
      prepared.insert,
      ctx.db.prepare('INSERT INTO recovery_enrollments(session_id,account_id,created_at,expires_at) VALUES(?,?,?,?)').bind(row.id, row.account_id, now, row.expires_at),
      auditStatement(ctx, 'recovery.consume', source.account_id, principal),
    ])
    success = true
    return prepared.issued
  } finally { await finishAuthAttempt(ctx, lease, success) }
}

/** Recovery grants are bound to a single, unrotated enrollment session. This
 * predicate belongs in the registration transaction as well as preflight. */
export function recoveryEnrollmentGuard(row: SessionRow, now: number) {
  return { sql: `EXISTS(SELECT 1 FROM recovery_enrollments r JOIN stage0_live_sessions s ON s.id=r.session_id AND s.account_id=r.account_id
    WHERE r.session_id=? AND r.account_id=? AND r.completed_at IS NULL AND r.created_at<=? AND r.expires_at>?
    AND s.transport='browser' AND s.method='oidc' AND s.assurance='enrollment' AND s.created_at<=? AND s.expires_at>?)`,
  values: [row.id, row.account_id, now, now, now, now] }
}

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
