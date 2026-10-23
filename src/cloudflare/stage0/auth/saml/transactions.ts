import type { Principal, RequestContext } from '../../contracts'
import { auditStatement, guardedBatch, type SqlValue } from '../../db'
import { Stage0Error } from '../../errors'
import { object } from '../../http-input'
import { assertIdentityLinkPrincipal, identityLinkGuard } from '../linking'
import { consumeSamlStartBudget, reserveAuthAttempt, finishAuthAttempt } from '../limits'
import { randomSecret, secretDigest, secretPattern } from '../secrets'
import { loadLiveSession, prepareSessionIssuance, principalFromRow, type IssuedSession, type SessionRow } from '../sessions'
import { createSamlAuthorization, samlSettingsDigest, validateSamlConnection, type SamlConnectionSettings } from './authorization'
import { consumeSamlIdentity, verifySamlResponse, type VerifiedSamlIdentity } from './protocol'

interface Start { purpose: 'login' | 'link'; principal?: Principal; ip: string }
export interface SamlCallback { relayState: string; browserBinding: string; response: string }
interface Transaction { request_id: string; purpose: Start['purpose']; account_id: string | null; session_id: string | null; created_at: number; expires_at: number }
interface Identity { id: string; account_id: string; version: number; security_version: number; email_verified_at: number | null }
type Completion = { kind: 'signed_in'; session: IssuedSession; expiresAt: number } | { kind: 'linked'; identity: { id: string; provider: 'enterprise_saml'; issuer: string; subject: string } }
const connectionSql = `EXISTS(SELECT 1 FROM identity_connections WHERE id=? AND organization_id=? AND protocol='saml' AND provider='enterprise_saml' AND issuer=? AND version=? AND enabled=1)`
const connectionValues = (s: SamlConnectionSettings): SqlValue[] => [s.connectionId, s.organizationId, s.issuer, s.connectionVersion]
function freshProof(proof: VerifiedSamlIdentity, now: number): void {
  if (proof.verifiedAt > now || now >= proof.verifiedAt + 60_000 || now >= proof.expiresAt) throw new Stage0Error('unauthenticated')
}
/** Internal only: a future HTTP adapter must admit starts using exact Origin,
 * pre-login CSRF/Turnstile or authenticated CSRF, and a trusted edge IP. */
export async function startSamlTransaction(ctx: RequestContext, inputSettings: SamlConnectionSettings, input: Start, budgetKey: Uint8Array): Promise<{ authorizationUrl: string; browserBinding: string }> {
  const settings = validateSamlConnection(inputSettings), purpose = input.purpose, ip = input.ip
  const principal = input.principal ? Object.freeze({ ...input.principal }) : undefined
  if (!['login', 'link'].includes(purpose) || (purpose === 'link') !== Boolean(principal) || (principal && principal.transport !== 'browser')) throw new Stage0Error('invalid_input')
  if (principal) await assertIdentityLinkPrincipal(ctx, principal)
  await consumeSamlStartBudget(ctx, ip, budgetKey)
  const now = ctx.clock.now(), requestId = '_' + randomSecret(), relayState = randomSecret(), browserBinding = randomSecret()
  const settingsDigest = await samlSettingsDigest(ctx, settings)
  const relayDigest = await secretDigest(relayState), bindingDigest = await secretDigest(browserBinding)
  const authorizationUrl = await createSamlAuthorization(ctx, settings, requestId, relayState, purpose)
  const current = ctx.clock.now()
  if (current < now || current >= now + 300_000) throw new Stage0Error('unauthenticated')
  const link = principal ? identityLinkGuard(principal, current) : { sql: '1', values: [] }
  await guardedBatch(ctx, `${connectionSql} AND (${link.sql})`, [...connectionValues(settings), ...link.values], [
    ctx.db.prepare('DELETE FROM saml_transactions WHERE request_id IN (SELECT request_id FROM saml_transactions WHERE expires_at<=? LIMIT 100)').bind(current),
    ctx.db.prepare('DELETE FROM saml_replays WHERE digest IN (SELECT digest FROM saml_replays WHERE expires_at<=? LIMIT 100)').bind(current),
    ctx.db.prepare(`INSERT INTO saml_transactions(request_id,relay_digest,binding_digest,settings_digest,organization_id,connection_id,connection_version,purpose,account_id,session_id,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(requestId, relayDigest, bindingDigest, settingsDigest, settings.organizationId, settings.connectionId, settings.connectionVersion, purpose, principal?.accountId ?? null, principal?.sessionId ?? null, now, now + 300_000),
  ])
  return { authorizationUrl, browserBinding }
}
/** Verify only a selected browser-bound request, then atomically consume it and
 * both issuer/message IDs with current identity/session effects and audit. No
 * email matching, account creation, membership provisioning or public routing. */
export async function completeSamlTransaction(ctx: RequestContext, inputSettings: SamlConnectionSettings, input: SamlCallback, ip: string, budgetKey: Uint8Array): Promise<Completion> {
  object(input, ['relayState', 'browserBinding', 'response'], true)
  const { relayState, browserBinding, response } = input
  if (typeof relayState !== 'string' || !secretPattern.test(relayState) || typeof browserBinding !== 'string' || !secretPattern.test(browserBinding)
    || typeof response !== 'string' || !response || response.length > 87_384) throw new Stage0Error('unauthenticated')
  const lease = await reserveAuthAttempt(ctx, { email: 'saml-callback', ip }, budgetKey)
  let success = false
  try {
    const settings = validateSamlConnection(inputSettings), selectedAt = ctx.clock.now()
    const relayDigest = await secretDigest(relayState), bindingDigest = await secretDigest(browserBinding), settingsDigest = await samlSettingsDigest(ctx, settings)
    const selection = `relay_digest=? AND binding_digest=? AND settings_digest=? AND organization_id=? AND connection_id=? AND connection_version=?
      AND consumed_at IS NULL AND created_at<=? AND expires_at>?`
    const selectors: SqlValue[] = [relayDigest, bindingDigest, settingsDigest, settings.organizationId, settings.connectionId, settings.connectionVersion]
    const transaction = await ctx.db.prepare(`SELECT request_id,purpose,account_id,session_id,created_at,expires_at FROM saml_transactions WHERE ${selection} AND ${connectionSql}`)
      .bind(...selectors, selectedAt, selectedAt, ...connectionValues(settings)).first<Transaction>()
    if (!transaction) throw new Stage0Error('unauthenticated')
    const proof = consumeSamlIdentity(await verifySamlResponse(ctx, settings, { requestId: transaction.request_id, createdAt: transaction.created_at }, response))
    // Stable issuer/message identity survives reviewed key or connection rotation.
    const replayDigests = await Promise.all([['response', proof.responseId], ['assertion', proof.assertionId]].map(([kind, id]) => secretDigest(JSON.stringify(['ovelle:saml-replay:v1', proof.issuer, kind, id]))))
    const effects: Parameters<typeof guardedBatch>[3] = []
    let authority: { sql: string; values: SqlValue[] }, result: Completion
    let linkPrincipal: Principal | undefined
    const preparedAt = ctx.clock.now()
    freshProof(proof, preparedAt)
    if (transaction.purpose === 'login') {
      const identity = await ctx.db.prepare(`SELECT i.id,i.account_id,i.version,a.security_version,a.email_verified_at FROM stage0_trusted_identities i JOIN accounts a ON a.id=i.account_id
        WHERE i.connection_id=? AND i.connection_version=? AND i.protocol='saml' AND i.provider='enterprise_saml' AND i.issuer=? AND i.subject=? AND i.saml_name_id_format=? AND a.disabled_at IS NULL`)
        .bind(settings.connectionId, settings.connectionVersion, proof.issuer, proof.subject, proof.nameIdFormat).first<Identity>()
      if (!identity) throw new Stage0Error('unauthenticated')
      const row: SessionRow = { id: ctx.ids.next(), account_id: identity.account_id, transport: 'browser', method: 'saml',
        assurance: identity.email_verified_at === null ? 'enrollment' : 'authenticated', account_security_version: identity.security_version,
        external_identity_id: identity.id, external_identity_version: identity.version, connection_id: settings.connectionId, connection_version: settings.connectionVersion,
        created_at: preparedAt, authenticated_at: proof.authenticatedAt, passkey_verified_at: null,
        expires_at: Math.min(preparedAt + 43_200_000, proof.authenticatedAt + 43_200_000, proof.sessionExpiresAt ?? Infinity) }
      if (row.expires_at <= preparedAt) throw new Stage0Error('unauthenticated')
      const prepared = await prepareSessionIssuance(ctx, row)
      authority = { sql: `EXISTS(SELECT 1 FROM stage0_trusted_identities i JOIN accounts a ON a.id=i.account_id
        WHERE i.id=? AND i.account_id=? AND i.version=? AND i.connection_id=? AND i.connection_version=? AND i.protocol='saml'
          AND i.issuer=? AND i.subject=? AND i.saml_name_id_format=? AND a.disabled_at IS NULL AND a.security_version=? AND (a.email_verified_at IS NOT NULL OR ?='enrollment'))`,
      values: [identity.id, identity.account_id, identity.version, settings.connectionId, settings.connectionVersion, proof.issuer, proof.subject, proof.nameIdFormat, identity.security_version, row.assurance] }
      effects.push(prepared.insert, auditStatement(ctx, 'session.issue', row.id, prepared.issued.principal, settings.organizationId))
      result = { kind: 'signed_in', session: prepared.issued, expiresAt: row.expires_at }
    } else {
      if (proof.authenticatedAt <= preparedAt - 300_000 || proof.authenticatedAt < transaction.created_at - 60_000) throw new Stage0Error('unauthenticated')
      const source = await loadLiveSession(ctx, { accountId: transaction.account_id!, sessionId: transaction.session_id!, transport: 'browser' } as Principal)
      const principal = principalFromRow(source)
      await assertIdentityLinkPrincipal(ctx, principal)
      const existing = await ctx.db.prepare('SELECT id,account_id,version,disabled_at,saml_name_id_format FROM external_identities WHERE connection_id=? AND issuer=? AND subject=?')
        .bind(settings.connectionId, proof.issuer, proof.subject).first<{ id: string; account_id: string; version: number; disabled_at: number | null; saml_name_id_format: string | null }>()
      if (existing && (existing.account_id !== source.account_id || existing.disabled_at !== null || existing.saml_name_id_format !== proof.nameIdFormat)) throw new Stage0Error('conflict')
      const id = existing?.id ?? ctx.ids.next()
      linkPrincipal = principal
      const unchanged = existing ? `EXISTS(SELECT 1 FROM stage0_trusted_identities WHERE id=? AND account_id=? AND version=? AND connection_version=?)`
        : 'NOT EXISTS(SELECT 1 FROM external_identities WHERE connection_id=? AND issuer=? AND subject=?)'
      authority = { sql: unchanged, values: existing ? [id, source.account_id, existing.version, settings.connectionVersion] : [settings.connectionId, proof.issuer, proof.subject] }
      if (!existing) effects.push(ctx.db.prepare('INSERT INTO external_identities(id,account_id,connection_id,issuer,subject,saml_name_id_format,created_at) VALUES(?,?,?,?,?,?,?)')
        .bind(id, source.account_id, settings.connectionId, proof.issuer, proof.subject, proof.nameIdFormat, preparedAt), auditStatement(ctx, 'identity.link', id, principal, settings.organizationId))
      result = { kind: 'linked', identity: { id, provider: 'enterprise_saml', issuer: proof.issuer, subject: proof.subject } }
    }
    const now = ctx.clock.now()
    freshProof(proof, now)
    if (linkPrincipal && proof.authenticatedAt <= now - 300_000) throw new Stage0Error('unauthenticated')
    const link = linkPrincipal ? identityLinkGuard(linkPrincipal, now) : { sql: '1', values: [] }
    if (result.kind === 'signed_in' && now >= result.expiresAt) throw new Stage0Error('unauthenticated')
    await guardedBatch(ctx, `EXISTS(SELECT 1 FROM saml_transactions WHERE request_id=? AND ${selection}) AND ${connectionSql}
      AND NOT EXISTS(SELECT 1 FROM saml_replays WHERE digest IN (?,?)) AND (${authority.sql}) AND (${link.sql})`,
    [transaction.request_id, ...selectors, now, now, ...connectionValues(settings), ...replayDigests, ...authority.values, ...link.values], [
      ctx.db.prepare('UPDATE saml_transactions SET consumed_at=? WHERE request_id=?').bind(now, transaction.request_id),
      ...replayDigests.map(digest => ctx.db.prepare('INSERT INTO saml_replays(digest,created_at,expires_at) VALUES(?,?,?)').bind(digest, now, now + 300_000)),
      ...effects,
    ])
    success = true
    return result
  } finally { await finishAuthAttempt(ctx, lease, success) }
}
