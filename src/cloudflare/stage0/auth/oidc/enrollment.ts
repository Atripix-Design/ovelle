import type { RequestContext } from '../../contracts'
import { guardedBatch } from '../../db'
import { Stage0Error } from '../../errors'
import { normalizedEmail, normalizedContactName, sendContactVerification } from '../contact'
import { consumeAuthEmailBudget, finishAuthAttempt, reserveAuthAttempt } from '../limits'
import { randomSecret, secretDigest, secretMac, secretPattern } from '../secrets'
import { issueSession, type IssuedSession } from '../sessions'
import { consumeOidcIdentity, type VerifiedOidcIdentity } from './protocol'

interface EnrollmentRow {
  id: string; provider: 'google' | 'microsoft'; connection_id: string; connection_version: number; client_id: string;
  issuer: string; subject: string; tenant_id: string | null; email_hint: string | null; contact_proved: number;
  display_name_hint: string | null; contact_email: string | null; contact_name: string | null; contact_digest: string | null;
  contact_expires_at: number | null; contact_version: number; expires_at: number
}
const trusted = `e.consumed_at IS NULL AND e.created_at<=? AND e.expires_at>?
 AND EXISTS(SELECT 1 FROM identity_connections c WHERE c.id=e.connection_id AND c.provider=e.provider AND c.protocol='oidc'
   AND c.enabled=1 AND c.version=e.connection_version AND c.client_id=e.client_id AND (
    (e.provider='google' AND e.tenant_id IS NULL AND c.issuer=e.issuer)
    OR (e.provider='microsoft' AND e.tenant_id IS NOT NULL AND e.issuer='https://login.microsoftonline.com/'||e.tenant_id||'/v2.0'
      AND (c.issuer=e.issuer OR c.issuer='https://login.microsoftonline.com/{tenantid}/v2.0'))))`
async function load(ctx: RequestContext, token: string): Promise<EnrollmentRow> {
  if (!secretPattern.test(token)) throw new Stage0Error('unauthenticated')
  const now = ctx.clock.now()
  const row = await ctx.db.prepare(`SELECT e.* FROM oidc_enrollments e WHERE e.token_digest=? AND (${trusted})`)
    .bind(await secretDigest(token), now, now).first<EnrollmentRow>()
  if (!row) throw new Stage0Error('unauthenticated')
  return row
}
export const enrollmentCsrf = (token: string) => secretMac(token, ['ovelle:enrollment-csrf:v1'])

/** Only newly verified, unlinked identities can begin enrollment. A matching
 * account email is never login/link authority, including verified Google email.
 */
export async function beginOidcEnrollment(ctx: RequestContext, input: VerifiedOidcIdentity): Promise<{ token: string }> {
  const proof = consumeOidcIdentity(input)
  const now = ctx.clock.now()
  if (proof.purpose !== 'login' || proof.verifiedAt > now || now >= proof.verifiedAt + 60_000) throw new Stage0Error('unauthenticated')
  const token = randomSecret()
  let email: string | null = null
  try { email = normalizedEmail(proof.email) } catch { /* Optional provider hints need not be usable contacts. */ }
  await guardedBatch(ctx, 'NOT EXISTS(SELECT 1 FROM external_identities WHERE connection_id=? AND issuer=? AND subject=?)', [proof.connectionId, proof.issuer, proof.subject], [
    ctx.db.prepare('DELETE FROM oidc_enrollments WHERE id IN (SELECT id FROM oidc_enrollments WHERE expires_at<=? LIMIT 100)').bind(now),
    ctx.db.prepare(`INSERT INTO oidc_enrollments(id,token_digest,provider,connection_id,connection_version,client_id,issuer,subject,tenant_id,email_hint,contact_proved,display_name_hint,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(ctx.ids.next(), await secretDigest(token), proof.provider, proof.connectionId, proof.connectionVersion, proof.clientId, proof.issuer, proof.subject, proof.tenantId, email, proof.emailVerified && email !== null ? 1 : 0, proof.displayName, now, now + 900_000),
  ])
  return { token }
}
export async function getOidcEnrollment(ctx: RequestContext, token: string) {
  const row = await load(ctx, token)
  return { emailHint: row.email_hint, displayNameHint: row.display_name_hint, csrfToken: await enrollmentCsrf(token) }
}

async function create(ctx: RequestContext, row: EnrollmentRow, email: string, name: string, digest: string | null): Promise<IssuedSession> {
  const now = ctx.clock.now()
  const accountId = ctx.ids.next()
  const identityId = ctx.ids.next()
  const condition = `EXISTS(SELECT 1 FROM oidc_enrollments e WHERE e.id=? AND e.contact_version=? AND (${trusted})
    AND (? IS NULL OR (e.contact_digest=? AND e.contact_expires_at>?)))
    AND NOT EXISTS(SELECT 1 FROM accounts WHERE email=?)
    AND NOT EXISTS(SELECT 1 FROM external_identities WHERE connection_id=? AND issuer=? AND subject=?)`
  await guardedBatch(ctx, condition, [row.id, row.contact_version, now, now, digest, digest, now, email, row.connection_id, row.issuer, row.subject], [
    ctx.db.prepare('INSERT INTO accounts(id,email,display_name,email_verified_at,created_at) VALUES(?,?,?,?,?)').bind(accountId, email, name, now, now),
    ctx.db.prepare('INSERT INTO external_identities(id,account_id,connection_id,issuer,subject,tenant_id,created_at) VALUES(?,?,?,?,?,?,?)').bind(identityId, accountId, row.connection_id, row.issuer, row.subject, row.tenant_id, now),
    ctx.db.prepare('UPDATE oidc_enrollments SET consumed_at=? WHERE id=?').bind(now, row.id),
    ...['account.create', 'identity.link'].map(action => ctx.db.prepare('INSERT INTO audit_events(id,actor_account_id,action,resource_id,request_id,created_at) VALUES(?,?,?,?,?,?)')
      .bind(ctx.ids.next(), accountId, action, action === 'account.create' ? accountId : identityId, ctx.requestId, now)),
  ])
  // If issuance loses a later revocation race, the verified account remains;
  // the person can authenticate again. Do not undo committed audit/account data.
  return issueSession(ctx, { accountId, method: 'oidc', externalIdentityId: identityId, identityVersion: 1, connectionVersion: row.connection_version }, 'browser')
}

/** Return a generic 202 acknowledgment at the HTTP boundary whether delivery
 * succeeds, fails, is suppressed for an existing email, or is unnecessary for
 * the nominated authoritative Google contact. Only transport sees a session.
 */
export async function submitOidcContact(ctx: RequestContext, token: string, input: { email: string; displayName: string; ip: string }, budgetKey: Uint8Array): Promise<IssuedSession | null> {
  const row = await load(ctx, token)
  const email = normalizedEmail(input.email)
  const name = normalizedContactName(input.displayName)
  await consumeAuthEmailBudget(ctx, { email, ip: input.ip }, budgetKey)
  const exists = await ctx.db.prepare('SELECT 1 FROM accounts WHERE email=?').bind(email).first()
  if (!exists && row.contact_proved === 1 && email === row.email_hint) {
    try { return await create(ctx, row, email, name, null) }
    catch (error) { if (error instanceof Stage0Error && error.code === 'conflict') return null; throw error }
  }
  const secret = randomSecret()
  const version = row.contact_version + 1
  const now = ctx.clock.now()
  await guardedBatch(ctx, `EXISTS(SELECT 1 FROM oidc_enrollments e WHERE e.id=? AND e.contact_version=? AND (${trusted}))`, [row.id, row.contact_version, now, now], [
    ctx.db.prepare('UPDATE oidc_enrollments SET contact_email=?,contact_name=?,contact_digest=?,contact_expires_at=?,contact_version=?,delivery=? WHERE id=?')
      .bind(email, name, exists ? null : await secretDigest(secret), Math.min(now + 900_000, row.expires_at), version, exists ? 'suppressed' : 'pending', row.id),
  ])
  if (exists) return null
  const delivery = await sendContactVerification(ctx, email, secret)
  await ctx.db.prepare('UPDATE oidc_enrollments SET delivery=? WHERE id=? AND contact_version=? AND consumed_at IS NULL').bind(delivery, row.id, version).run()
  return null
}
export async function confirmOidcContact(ctx: RequestContext, token: string, contactToken: string, ip: string, budgetKey: Uint8Array): Promise<IssuedSession> {
  const row = await load(ctx, token)
  if (!row.contact_email || !row.contact_name || !row.contact_digest || row.contact_expires_at === null || !secretPattern.test(contactToken)) throw new Stage0Error('unauthenticated')
  const lease = await reserveAuthAttempt(ctx, { email: row.contact_email, ip }, budgetKey)
  let success = false
  try {
    const digest = await secretDigest(contactToken)
    if (digest !== row.contact_digest || row.contact_expires_at <= ctx.clock.now()) throw new Stage0Error('unauthenticated')
    let session: IssuedSession
    try { session = await create(ctx, row, row.contact_email, row.contact_name, digest) }
    catch (error) { if (error instanceof Stage0Error && error.code === 'conflict') throw new Stage0Error('unauthenticated'); throw error }
    success = true
    return session
  } finally { await finishAuthAttempt(ctx, lease, success) }
}
