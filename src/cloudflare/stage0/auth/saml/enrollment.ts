import type { RequestContext } from '../../contracts'
import { auditStatement, guardedBatch } from '../../db'
import { Stage0Error } from '../../errors'
import { normalizedEmail, normalizedContactName, sendContactVerification } from '../contact'
import { consumeAuthEmailBudget, finishAuthAttempt, reserveAuthAttempt } from '../limits'
import { randomSecret, secretDigest, secretMac, secretPattern } from '../secrets'
import { prepareSessionIssuance, type IssuedSession, type SessionRow } from '../sessions'
import { samlSettingsDigest, validateSamlConnection, type SamlConnectionSettings } from './authorization'
interface Enrollment {
 id: string; organization_id: string; connection_id: string; connection_version: number; settings_digest: string;
 issuer: string; subject: string; name_id_format: string; authenticated_at: number; session_expires_at: number | null;
 created_at: number; expires_at: number; contact_email: string | null; contact_name: string | null; contact_digest: string | null;
 contact_expires_at: number | null; contact_version: number
}
const trusted = `e.consumed_at IS NULL AND e.created_at<=? AND e.expires_at>?
 AND EXISTS(SELECT 1 FROM identity_connections c WHERE c.id=e.connection_id AND c.organization_id=e.organization_id
 AND c.protocol='saml' AND c.provider='enterprise_saml' AND c.issuer=e.issuer AND c.version=e.connection_version AND c.enabled=1)`
async function load(ctx: RequestContext, input: SamlConnectionSettings, token: string): Promise<Enrollment> {
  if (!secretPattern.test(token)) throw new Stage0Error('unauthenticated')
  const settings = validateSamlConnection(input), digest = await samlSettingsDigest(ctx, settings), tokenDigest = await secretDigest(token), now = ctx.clock.now()
  const row = await ctx.db.prepare(`SELECT e.* FROM saml_enrollments e WHERE e.token_digest=? AND e.settings_digest=? AND e.connection_id=?
    AND e.connection_version=? AND e.organization_id=? AND e.issuer=? AND e.name_id_format=? AND (${trusted})`)
    .bind(tokenDigest, digest, settings.connectionId, settings.connectionVersion, settings.organizationId, settings.issuer, settings.nameIdFormat, now, now).first<Enrollment>()
  if (!row) throw new Stage0Error('unauthenticated')
  return row
}
export const samlEnrollmentCsrf = (token: string) => secretMac(token, ['ovelle:saml-enrollment-csrf:v1'])
export async function getSamlEnrollment(ctx: RequestContext, settings: SamlConnectionSettings, token: string) {
  await load(ctx, settings, token)
  return { csrfToken: await samlEnrollmentCsrf(token) }
}
/** A contact submission always requires independent verification. Existing emails
 * are suppressed generically, never converted into existing-account authority. */
export async function submitSamlContact(ctx: RequestContext, settings: SamlConnectionSettings, token: string, input: { email: string; displayName: string; ip: string }, budgetKey: Uint8Array): Promise<void> {
  const row = await load(ctx, settings, token), email = normalizedEmail(input.email), name = normalizedContactName(input.displayName)
  await consumeAuthEmailBudget(ctx, { email, ip: input.ip }, budgetKey)
  const exists = await ctx.db.prepare('SELECT 1 FROM accounts WHERE email=?').bind(email).first()
  const secret = randomSecret(), digest = exists ? null : await secretDigest(secret), version = row.contact_version + 1, now = ctx.clock.now()
  await guardedBatch(ctx, `EXISTS(SELECT 1 FROM saml_enrollments e WHERE e.id=? AND e.contact_version=? AND e.settings_digest=? AND (${trusted}))`, [row.id, row.contact_version, row.settings_digest, now, now], [
    ctx.db.prepare('UPDATE saml_enrollments SET contact_email=?,contact_name=?,contact_digest=?,contact_expires_at=?,contact_version=?,delivery=? WHERE id=?')
      .bind(email, name, digest, Math.min(now + 900_000, row.expires_at), version, exists ? 'suppressed' : 'pending', row.id),
  ])
  if (exists) return
  const delivery = await sendContactVerification(ctx, email, secret, 'saml')
  await ctx.db.prepare('UPDATE saml_enrollments SET delivery=? WHERE id=? AND contact_version=? AND consumed_at IS NULL').bind(delivery, row.id, version).run()
}
export async function confirmSamlContact(ctx: RequestContext, settings: SamlConnectionSettings, token: string, contactToken: string, ip: string, budgetKey: Uint8Array): Promise<IssuedSession> {
  const row = await load(ctx, settings, token)
  if (!row.contact_email || !row.contact_name || !row.contact_digest || row.contact_expires_at === null || !secretPattern.test(contactToken)) throw new Stage0Error('unauthenticated')
  const lease = await reserveAuthAttempt(ctx, { email: row.contact_email, ip }, budgetKey)
  let success = false
  try {
    const digest = await secretDigest(contactToken)
    if (digest !== row.contact_digest || row.contact_expires_at <= ctx.clock.now()) throw new Stage0Error('unauthenticated')
    const preparedAt = ctx.clock.now(), accountId = ctx.ids.next(), identityId = ctx.ids.next()
    // Contact verification must never restart the IdP's original SSO lifetime.
    const session: SessionRow = { id: ctx.ids.next(), account_id: accountId, transport: 'browser', method: 'saml', assurance: 'authenticated',
      account_security_version: 1, external_identity_id: identityId, external_identity_version: 1, connection_id: row.connection_id,
      connection_version: row.connection_version, created_at: preparedAt, authenticated_at: row.authenticated_at, passkey_verified_at: null,
      expires_at: Math.min(preparedAt + 43_200_000, row.authenticated_at + 43_200_000, row.session_expires_at ?? Infinity) }
    const prepared = await prepareSessionIssuance(ctx, session), now = ctx.clock.now()
    if (now >= session.expires_at) throw new Stage0Error('unauthenticated')
    try {
      await guardedBatch(ctx, `EXISTS(SELECT 1 FROM saml_enrollments e WHERE e.id=? AND e.contact_version=? AND e.settings_digest=? AND e.contact_digest=? AND e.contact_expires_at>? AND (${trusted}))
        AND NOT EXISTS(SELECT 1 FROM accounts WHERE email=?) AND NOT EXISTS(SELECT 1 FROM external_identities WHERE connection_id=? AND issuer=? AND subject=?)`,
      [row.id, row.contact_version, row.settings_digest, digest, now, now, now, row.contact_email, row.connection_id, row.issuer, row.subject], [
        ctx.db.prepare('INSERT INTO accounts(id,email,display_name,email_verified_at,created_at) VALUES(?,?,?,?,?)').bind(accountId, row.contact_email, row.contact_name, now, now),
        ctx.db.prepare('INSERT INTO external_identities(id,account_id,connection_id,issuer,subject,saml_name_id_format,created_at) VALUES(?,?,?,?,?,?,?)')
          .bind(identityId, accountId, row.connection_id, row.issuer, row.subject, row.name_id_format, now),
        prepared.insert,
        ctx.db.prepare('UPDATE saml_enrollments SET consumed_at=? WHERE id=?').bind(now, row.id),
        ...(['account.create', 'identity.link', 'session.issue'] as const).map((action, i) => auditStatement(ctx, action, [accountId, identityId, session.id][i], prepared.issued.principal, row.organization_id)),
      ])
    } catch (error) { if (error instanceof Stage0Error && error.code === 'conflict') throw new Stage0Error('unauthenticated'); throw error }
    success = true
    return prepared.issued
  } finally { await finishAuthAttempt(ctx, lease, success) }
}
