import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server'
import type { D1PreparedStatement } from '@cloudflare/workers-types'
import type { Principal, RequestContext } from '../../contracts'
import { auditStatement, guardedBatch } from '../../db'
import { Stage0Error } from '../../errors'
import { consumePasskeyStartBudget, finishAuthAttempt, reserveAuthAttempt } from '../limits'
import { randomSecret, secretDigest, secretPattern } from '../secrets'
import { liveSessionCondition, loadLiveSession, prepareSessionIssuance, type SessionRow } from '../sessions'
import { recoveryEnrollmentGuard } from '../recovery'
import { authenticationOptions, decodeBytes, encodeBytes, registrationOptions, verifyAuthentication, verifyRegistration } from './protocol'

interface Challenge { id: string; challenge_digest: string; purpose: 'register' | 'login' | 'step_up'; account_id: string | null; session_id: string | null; initial: number; consumed_at: number; expires_at: number }
interface Credential { id: string; account_id: string; public_key: string; counter: number; device_type: 'singleDevice' | 'multiDevice'; backed_up: number; transports: string; name: string; version: number; user_handle: string; email: string; security_version: number }
const recent = (time: number | null, now: number) => time !== null && time <= now && time > now - 300_000
function registrationPolicy(row: SessionRow, count: number, now: number): boolean {
  return row.assurance !== 'enrollment' && count < 10 && (count === 0 ? recent(row.authenticated_at, now)
    : row.assurance === 'passkey' && Boolean(row.passkey_credential_id) && recent(row.passkey_verified_at, now))
}
function registrationGuard(row: SessionRow, initial: boolean, now: number) {
  const normal = {
    sql: `EXISTS(SELECT 1 FROM stage0_live_sessions s WHERE s.id=? AND s.account_id=? AND s.transport='browser' AND s.expires_at>? AND s.created_at<=? AND s.assurance!='enrollment'
      AND ((?=1 AND s.authenticated_at>? AND s.authenticated_at<=? AND NOT EXISTS(SELECT 1 FROM passkey_credentials WHERE account_id=s.account_id))
        OR (?=0 AND s.assurance='passkey' AND s.passkey_credential_id IS NOT NULL AND s.passkey_verified_at>? AND s.passkey_verified_at<=?)))
      AND (SELECT count(*) FROM passkey_credentials WHERE account_id=?)<10`,
    values: [row.id, row.account_id, now, now, initial ? 1 : 0, now - 300_000, now, initial ? 1 : 0, now - 300_000, now, row.account_id],
  }
  const recovery = recoveryEnrollmentGuard(row, now)
  return { sql: `((${normal.sql}) OR (${recovery.sql}))`, values: [...normal.values, ...recovery.values] }
}
async function newChallenge(ctx: RequestContext, purpose: Challenge['purpose'], row: SessionRow | null, initial: boolean, statements: D1PreparedStatement[] = []) {
  const token = randomSecret(); const challenge = randomSecret(); const now = ctx.clock.now()
  const writes = [
    ctx.db.prepare('DELETE FROM passkey_challenges WHERE id IN (SELECT id FROM passkey_challenges WHERE expires_at<=? LIMIT 100)').bind(now),
    ...statements,
    ctx.db.prepare('UPDATE passkey_challenges SET consumed_at=? WHERE session_id=? AND purpose=? AND consumed_at IS NULL').bind(now, row?.id ?? null, purpose),
    ctx.db.prepare('INSERT INTO passkey_challenges(id,token_digest,challenge_digest,purpose,account_id,session_id,initial,origin,rp_id,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .bind(ctx.ids.next(), await secretDigest(token), await secretDigest(challenge), purpose, row?.account_id ?? null, row?.id ?? null, initial ? 1 : 0, ctx.config.origin, ctx.config.rpId, now, now + 300_000),
  ]
  const guard = row ? purpose === 'register' ? registrationGuard(row, initial, now) : liveSessionCondition({ accountId: row.account_id, sessionId: row.id, transport: row.transport } as Principal, now) : { sql: '1', values: [] }
  await guardedBatch(ctx, guard.sql, guard.values, writes)
  return { flowToken: token, challenge }
}
async function claim(ctx: RequestContext, principal: Principal | null, token: string, purpose: Challenge['purpose']): Promise<Challenge> {
  if (!secretPattern.test(token) || (principal && principal.transport !== 'browser')) throw new Stage0Error('unauthenticated')
  const now = ctx.clock.now()
  const guard = principal ? liveSessionCondition(principal, now) : { sql: '1', values: [] }
  const row = await ctx.db.prepare(`UPDATE passkey_challenges SET consumed_at=? WHERE token_digest=? AND purpose=? AND account_id IS ? AND session_id IS ?
    AND consumed_at IS NULL AND created_at<=? AND expires_at>? AND origin=? AND rp_id=? AND (${guard.sql}) RETURNING *`)
    .bind(now, await secretDigest(token), purpose, principal?.accountId ?? null, principal?.sessionId ?? null, now, now, ctx.config.origin, ctx.config.rpId, ...guard.values).first<Challenge>()
  if (!row) throw new Stage0Error('unauthenticated')
  return row
}
const challengeGuard = (ctx: RequestContext, row: Challenge) => ({ sql: 'EXISTS(SELECT 1 FROM passkey_challenges WHERE id=? AND consumed_at=? AND expires_at>? AND origin=? AND rp_id=?)', values: [row.id, row.consumed_at, ctx.clock.now(), ctx.config.origin, ctx.config.rpId] })
async function account(ctx: RequestContext, accountId: string) {
  const result = await ctx.db.prepare('SELECT email,display_name,security_version FROM accounts WHERE id=? AND disabled_at IS NULL AND email_verified_at IS NOT NULL').bind(accountId).first<{ email: string; display_name: string; security_version: number }>()
  if (!result) throw new Stage0Error('forbidden')
  return result
}
function sessionRow(ctx: RequestContext, existing: SessionRow | null, accountId: string, securityVersion: number, credentialId: string): SessionRow {
  const now = ctx.clock.now()
  // Step-up changes assurance, not primary identity/provenance, auth time or
  // absolute expiry. Required-SAML policies still see the original connection.
  return { ...(existing ?? { account_id: accountId, transport: 'browser', method: 'passkey', account_security_version: securityVersion,
    external_identity_id: null, external_identity_version: null, connection_id: null, connection_version: null, authenticated_at: now, expires_at: now + 43_200_000 }),
    id: ctx.ids.next(), created_at: now, assurance: 'passkey', passkey_verified_at: now, passkey_credential_id: credentialId }
}

export async function beginPasskeyRegistration(ctx: RequestContext, principal: Principal, ip: string, budgetKey: Uint8Array) {
  if (principal.transport !== 'browser') throw new Stage0Error('forbidden')
  const row = await loadLiveSession(ctx, principal)
  const person = await account(ctx, row.account_id)
  const credentials = await ctx.db.prepare('SELECT id,transports FROM passkey_credentials WHERE account_id=?').bind(row.account_id).all<{ id: string; transports: string }>()
  const recovery = recoveryEnrollmentGuard(row, ctx.clock.now())
  const recovering = Boolean(await ctx.db.prepare(`SELECT 1 WHERE ${recovery.sql}`).bind(...recovery.values).first())
  if (!registrationPolicy(row, credentials.results.length, ctx.clock.now()) && !recovering) throw new Stage0Error('forbidden')
  await consumePasskeyStartBudget(ctx, ip, budgetKey)
  const started = await newChallenge(ctx, 'register', row, credentials.results.length === 0, [ctx.db.prepare('INSERT INTO passkey_users(account_id,user_handle) VALUES(?,?) ON CONFLICT(account_id) DO NOTHING').bind(row.account_id, randomSecret())])
  const handle = await ctx.db.prepare('SELECT user_handle FROM passkey_users WHERE account_id=?').bind(row.account_id).first<string>('user_handle')
  if (!handle) throw new Stage0Error('unauthenticated')
  return { flowToken: started.flowToken, options: await registrationOptions(ctx.config, { challenge: started.challenge, userHandle: handle, email: person.email, displayName: person.display_name,
    credentials: credentials.results.map(item => ({ id: item.id, transports: JSON.parse(item.transports) as string[] })) }) }
}
export async function finishPasskeyRegistration(ctx: RequestContext, principal: Principal, flowToken: string, response: RegistrationResponseJSON, name: string, ip: string, budgetKey: Uint8Array) {
  // eslint-disable-next-line no-control-regex
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80 || /[\u0000-\u001f\u007f]/.test(name)) throw new Stage0Error('invalid_input')
  const pending = await claim(ctx, principal, flowToken, 'register')
  const existing = await loadLiveSession(ctx, principal)
  const person = await account(ctx, existing.account_id)
  const lease = await reserveAuthAttempt(ctx, { email: person.email, ip }, budgetKey)
  let success = false
  try {
    const verified = await verifyRegistration(ctx.config, pending.challenge_digest, response)
    const credential = verified.credential
    const row = sessionRow(ctx, existing, existing.account_id, existing.account_security_version, credential.id)
    const recovering = existing.assurance === 'enrollment'
    if (recovering) {
      // The short enrollment deadline bounds replacement, while the resulting
      // session keeps the 12-hour absolute limit anchored to signed provider auth.
      // A second epoch change also invalidates any intervening old-key login.
      row.account_security_version++
      row.expires_at = existing.authenticated_at + 43_200_000
    }
    const prepared = await prepareSessionIssuance(ctx, row)
    const policy = registrationGuard(existing, pending.initial === 1, ctx.clock.now()); const challenge = challengeGuard(ctx, pending)
    await guardedBatch(ctx, `(${policy.sql}) AND (${challenge.sql}) AND NOT EXISTS(SELECT 1 FROM passkey_credentials WHERE id=?)`, [...policy.values, ...challenge.values, credential.id], [
      ...(recovering ? [
        ctx.db.prepare('UPDATE accounts SET security_version=security_version+1 WHERE id=?').bind(existing.account_id),
        ctx.db.prepare('UPDATE sessions SET revoked_at=coalesce(revoked_at,?) WHERE account_id=?').bind(ctx.clock.now(), existing.account_id),
        ctx.db.prepare('UPDATE passkey_credentials SET disabled_at=?,version=version+1 WHERE account_id=? AND disabled_at IS NULL').bind(ctx.clock.now(), existing.account_id),
        ctx.db.prepare('UPDATE recovery_enrollments SET completed_at=? WHERE session_id=?').bind(ctx.clock.now(), existing.id),
        auditStatement(ctx, 'recovery.complete', existing.account_id, principal),
      ] : []),
      ctx.db.prepare('INSERT INTO passkey_credentials(id,account_id,public_key,counter,device_type,backed_up,transports,name,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
        .bind(credential.id, existing.account_id, encodeBytes(credential.publicKey), credential.counter, verified.credentialDeviceType, verified.credentialBackedUp ? 1 : 0, JSON.stringify(credential.transports ?? []), name.trim(), ctx.clock.now()),
      prepared.insert,
      ctx.db.prepare('UPDATE sessions SET revoked_at=? WHERE id=?').bind(ctx.clock.now(), existing.id),
      auditStatement(ctx, 'passkey.register', credential.id, principal), auditStatement(ctx, 'session.rotate', row.id, principal),
    ])
    success = true
    return { passkey: { id: credential.id, name: name.trim() }, session: prepared.issued }
  } finally { await finishAuthAttempt(ctx, lease, success) }
}
/** Browser adapter must enforce origin/CSRF and supply the trusted admission
 * callback (Turnstile for login) and edge IP. No body may select those values. */
export async function beginPasskeyAuthentication(ctx: RequestContext, principal: Principal | null, ip: string, budgetKey: Uint8Array, admission?: () => Promise<void>) {
  const row = principal ? await loadLiveSession(ctx, principal) : null
  if (row && (row.transport !== 'browser' || row.assurance === 'enrollment')) throw new Stage0Error('forbidden')
  await consumePasskeyStartBudget(ctx, ip, budgetKey)
  if (admission) await admission()
  const started = await newChallenge(ctx, row ? 'step_up' : 'login', row, false)
  const credentials = row ? await ctx.db.prepare('SELECT id,transports FROM passkey_credentials WHERE account_id=? AND disabled_at IS NULL').bind(row.account_id).all<{ id: string; transports: string }>() : null
  return { flowToken: started.flowToken, options: await authenticationOptions(ctx.config, started.challenge, credentials?.results.map(item => ({ id: item.id, transports: JSON.parse(item.transports) as string[] }))) }
}
export async function finishPasskeyAuthentication(ctx: RequestContext, principal: Principal | null, flowToken: string, response: AuthenticationResponseJSON, ip: string, budgetKey: Uint8Array) {
  const pending = await claim(ctx, principal, flowToken, principal ? 'step_up' : 'login')
  const existing = principal ? await loadLiveSession(ctx, principal) : null
  const credential = typeof response?.id === 'string' && response.id.length <= 1364 ? await ctx.db.prepare(`SELECT p.*,u.user_handle,a.email,a.security_version FROM passkey_credentials p
    JOIN passkey_users u ON u.account_id=p.account_id JOIN accounts a ON a.id=p.account_id
    WHERE p.id=? AND p.disabled_at IS NULL AND a.disabled_at IS NULL AND a.email_verified_at IS NOT NULL`)
    .bind(response.id).first<Credential>() : null
  const lease = await reserveAuthAttempt(ctx, { email: credential?.email ?? 'passkey-unknown', ip }, budgetKey)
  let success = false
  try {
    if (!credential || (existing && (existing.account_id !== credential.account_id || existing.assurance === 'enrollment'))
      || (!existing && !response.response?.userHandle)) throw new Stage0Error('unauthenticated')
    const verified = await verifyAuthentication(ctx.config, pending.challenge_digest, { id: credential.id, publicKey: decodeBytes(credential.public_key, 4096), counter: credential.counter }, credential.user_handle, response)
    if (verified.credentialDeviceType !== credential.device_type) throw new Stage0Error('unauthenticated')
    const row = sessionRow(ctx, existing, credential.account_id, credential.security_version, credential.id)
    const prepared = await prepareSessionIssuance(ctx, row)
    const live = principal ? liveSessionCondition(principal, ctx.clock.now()) : { sql: '1', values: [] }
    const challenge = challengeGuard(ctx, pending)
    await guardedBatch(ctx, `(${live.sql}) AND (${challenge.sql}) AND EXISTS(SELECT 1 FROM passkey_credentials p JOIN accounts a ON a.id=p.account_id
      WHERE p.id=? AND p.account_id=? AND p.version=? AND p.counter=? AND p.disabled_at IS NULL AND a.disabled_at IS NULL AND a.email_verified_at IS NOT NULL AND a.security_version=?)`,
    [...live.values, ...challenge.values, credential.id, credential.account_id, credential.version, credential.counter, credential.security_version], [
      ctx.db.prepare('UPDATE passkey_credentials SET counter=?,backed_up=?,version=version+1 WHERE id=?').bind(verified.newCounter, verified.credentialBackedUp ? 1 : 0, credential.id), prepared.insert,
      ...(existing ? [ctx.db.prepare('UPDATE sessions SET revoked_at=? WHERE id=?').bind(ctx.clock.now(), existing.id)] : []),
      auditStatement(ctx, 'passkey.authenticate', credential.id, prepared.issued.principal), auditStatement(ctx, existing ? 'session.rotate' : 'session.issue', row.id, prepared.issued.principal),
    ])
    success = true
    return prepared.issued
  } finally { await finishAuthAttempt(ctx, lease, success) }
}
