import { SAML, ValidateInResponseTo } from '@node-saml/node-saml'
import { DOMParser, type Node, type Element } from '@xmldom/xmldom'
import { createPublicKey } from 'node:crypto'
import type { RequestContext } from '../../contracts'
import { Stage0Error } from '../../errors'

type Context = Pick<RequestContext, 'config' | 'clock'>
export interface SamlSettings {
  connectionId: string; connectionVersion: number; organizationId: string
  issuer: string; audience: string; signingKeys: readonly string[]; nameIdFormat: string
}
export interface SamlRequestEvidence { requestId: string; createdAt: number }
declare const proofBrand: unique symbol
export interface VerifiedSamlIdentity {
  readonly [proofBrand]: true
  readonly connectionId: string; readonly connectionVersion: number; readonly organizationId: string
  readonly issuer: string; readonly subject: string; readonly nameIdFormat: string; readonly requestId: string
  readonly responseId: string; readonly assertionId: string; readonly authenticatedAt: number
  readonly expiresAt: number; readonly sessionExpiresAt: number | null; readonly verifiedAt: number
}
const proofs = new WeakSet<VerifiedSamlIdentity>()
const assertionNs = 'urn:oasis:names:tc:SAML:2.0:assertion'
const protocolNs = 'urn:oasis:names:tc:SAML:2.0:protocol'
const signatureNs = 'http://www.w3.org/2000/09/xmldsig#'
const c14n = 'http://www.w3.org/2001/10/xml-exc-c14n#'
const rsa256 = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256'
const sha256 = 'http://www.w3.org/2001/04/xmlenc#sha256'
const formats = ['urn:oasis:names:tc:SAML:2.0:nameid-format:persistent', 'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified']
const fail = (): never => { throw new Stage0Error('unauthenticated') }
const validText = (value: unknown, max = 1024): value is string => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\p{Cc}]/u.test(value)
const idPattern = /^[A-Za-z_][A-Za-z0-9_.-]{0,255}$/
function settingsGuard(settings: SamlSettings): Readonly<SamlSettings> {
  try {
    if (![settings.connectionId, settings.organizationId].every(value => validText(value, 256)) || !validText(settings.issuer) || !validText(settings.audience)
      || !Number.isSafeInteger(settings.connectionVersion) || settings.connectionVersion < 1 || !formats.includes(settings.nameIdFormat)
      || !Array.isArray(settings.signingKeys) || settings.signingKeys.length < 1 || settings.signingKeys.length > 3) throw new Error()
    for (const pem of settings.signingKeys) {
      if (typeof pem !== 'string' || pem.length > 16_384) throw new Error()
      const key = createPublicKey(pem)
      if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw new Error()
    }
    return Object.freeze({ ...settings, signingKeys: Object.freeze([...settings.signingKeys]) })
  } catch { throw new Stage0Error('configuration') }
}
function children(node: Element): Element[] { return Array.from(node.childNodes).filter((item): item is Element => item.nodeType === 1) }
function attributes(node: Element, allowed: readonly string[]): void {
  for (const attribute of Array.from(node.attributes)) {
    if (attribute.namespaceURI === 'http://www.w3.org/2000/xmlns/') continue
    if (attribute.namespaceURI || !allowed.includes(attribute.name)) fail()
  }
}
function one(node: Element, namespace: string, name: string): Element {
  const matches = children(node).filter(item => item.namespaceURI === namespace && item.localName === name)
  return matches.length === 1 ? matches[0] : fail()
}
function text(node: Element): string {
  if (children(node).length || !validText(node.textContent)) return fail()
  return node.textContent
}
function timestamp(value: string | null): number {
  if (!value || value.length > 40 || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value)) return fail()
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : fail()
}
function signaturePolicy(node: Element): void {
  const signature = one(node, signatureNs, 'Signature'), info = one(signature, signatureNs, 'SignedInfo')
  if (one(info, signatureNs, 'SignatureMethod').getAttribute('Algorithm') !== rsa256 || one(info, signatureNs, 'CanonicalizationMethod').getAttribute('Algorithm') !== c14n) fail()
  const reference = one(info, signatureNs, 'Reference')
  if (reference.getAttribute('URI') !== '#' + node.getAttribute('ID') || one(reference, signatureNs, 'DigestMethod').getAttribute('Algorithm') !== sha256) fail()
  const transforms = children(one(reference, signatureNs, 'Transforms'))
  if (transforms.length !== 2 || transforms[0].namespaceURI !== signatureNs || transforms[1].namespaceURI !== signatureNs
    || transforms[0].localName !== 'Transform' || transforms[1].localName !== 'Transform'
    || transforms[0].getAttribute('Algorithm') !== signatureNs + 'enveloped-signature' || transforms[1].getAttribute('Algorithm') !== c14n) fail()
}
function parse(encoded: string): { xml: string; root: Element } {
  if (typeof encoded !== 'string' || encoded.length > 87_384 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) fail()
  const raw = atob(encoded)
  if (btoa(raw) !== encoded || raw.length > 65_536) fail()
  const xml = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(Uint8Array.from(raw, char => char.charCodeAt(0)))
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) fail()
  const doc = new DOMParser({ onError: fail }).parseFromString(xml, 'application/xml')
  const root = doc.documentElement
  if (!root) return fail()
  if (root.namespaceURI !== protocolNs || root.localName !== 'Response') fail()
  const ids = new Set<string>(), queue: [Node, number][] = [[doc, 0]]
  let count = 0, assertions = 0, signatures = 0
  // Bound traversal without recursive calls. Reject ambiguous DOM constructs
  // before the maintained signature verifier sees them; no custom crypto here.
  while (queue.length) {
    const [node, depth] = queue.pop()!
    if (++count > 1024 || depth > 32) fail()
    if ([4, 5, 6, 8, 10].includes(node.nodeType) || (node.nodeType === 7 && (node.parentNode !== doc || node.nodeName !== 'xml'))) fail()
    if (node.nodeType === 1) {
      const element = node as Element
      if (element !== root && element.parentNode === doc) fail()
      if (element.localName === 'Assertion') { if (element.namespaceURI !== assertionNs || element.parentNode !== root) fail(); assertions++ }
      if (element.localName === 'Signature') { if (element.namespaceURI !== signatureNs) fail(); signatures++ }
      for (const attribute of Array.from(element.attributes)) if (['ID', 'Id', 'id'].includes(attribute.localName ?? attribute.name)) {
        if (!idPattern.test(attribute.value) || ids.has(attribute.value)) fail()
        ids.add(attribute.value)
      }
    }
    for (const child of Array.from(node.childNodes ?? [])) queue.push([child, depth + 1])
  }
  if (assertions !== 1 || signatures !== 2) fail()
  return { xml, root }
}

/** Verifies protocol evidence only. The caller must atomically consume durable
 * browser/request/assertion state with current connection/account checks before
 * issuing a session. This function performs no network access or D1 writes. */
export async function verifySamlResponse(ctx: Context, inputSettings: SamlSettings, inputRequest: SamlRequestEvidence, encoded: string): Promise<VerifiedSamlIdentity> {
  const settings = settingsGuard(inputSettings)
  const request = Object.freeze({ ...inputRequest })
  const now = ctx.clock.now()
  if (!idPattern.test(request.requestId) || !Number.isSafeInteger(request.createdAt) || request.createdAt > now || request.createdAt <= now - 300_000) fail()
  try {
    const callback = ctx.config.origin + '/api/v1/auth/saml/callback'
    const { root } = parse(encoded)
    const assertion = one(root, assertionNs, 'Assertion')
    if (root.getAttribute('Version') !== '2.0' || assertion.getAttribute('Version') !== '2.0'
      || !idPattern.test(root.getAttribute('ID') ?? '') || !idPattern.test(assertion.getAttribute('ID') ?? '')
      || root.getAttribute('Destination') !== callback || root.getAttribute('InResponseTo') !== request.requestId
      || text(one(root, assertionNs, 'Issuer')) !== settings.issuer || text(one(assertion, assertionNs, 'Issuer')) !== settings.issuer) fail()
    const status = one(one(root, protocolNs, 'Status'), protocolNs, 'StatusCode')
    if (status.getAttribute('Value') !== 'urn:oasis:names:tc:SAML:2.0:status:Success') fail()
    signaturePolicy(root); signaturePolicy(assertion)
    const subject = one(assertion, assertionNs, 'Subject'), name = one(subject, assertionNs, 'NameID')
    if (name.getAttribute('Format') !== settings.nameIdFormat || (name.hasAttribute('NameQualifier') && name.getAttribute('NameQualifier') !== settings.issuer)
      || (name.hasAttribute('SPNameQualifier') && name.getAttribute('SPNameQualifier') !== settings.audience)) fail()
    const subjectId = text(name)
    if (subjectId.length > 512) fail()
    const confirmation = one(subject, assertionNs, 'SubjectConfirmation'), data = one(confirmation, assertionNs, 'SubjectConfirmationData')
    if (confirmation.getAttribute('Method') !== 'urn:oasis:names:tc:SAML:2.0:cm:bearer' || data.getAttribute('Recipient') !== callback || data.getAttribute('InResponseTo') !== request.requestId) fail()
    const conditions = one(assertion, assertionNs, 'Conditions')
    // Unknown signed conditions are indeterminate, never permission to proceed.
    attributes(conditions, ['NotBefore', 'NotOnOrAfter'])
    if (children(conditions).some(item => item.namespaceURI !== assertionNs || item.localName !== 'AudienceRestriction')) fail()
    const restriction = one(conditions, assertionNs, 'AudienceRestriction'), audience = one(restriction, assertionNs, 'Audience')
    attributes(restriction, []); attributes(audience, [])
    if (children(restriction).length !== 1 || text(audience) !== settings.audience) fail()
    const issueTimes = [timestamp(root.getAttribute('IssueInstant')), timestamp(assertion.getAttribute('IssueInstant'))]
    const statement = one(assertion, assertionNs, 'AuthnStatement')
    const sessionExpiresAt = statement.hasAttribute('SessionNotOnOrAfter') ? timestamp(statement.getAttribute('SessionNotOnOrAfter')) : null
    // Preserve the independent IdP session ceiling for the future issuer, and
    // never return protocol evidence after that session has already ended.
    const assertionExpiresAt = Math.min(timestamp(conditions.getAttribute('NotOnOrAfter')), timestamp(data.getAttribute('NotOnOrAfter')))
    const expiresAt = Math.min(assertionExpiresAt, sessionExpiresAt ?? Infinity)
    const authenticatedAt = timestamp(statement.getAttribute('AuthnInstant'))
    if (issueTimes.some(time => time > now || time < now - 300_000) || timestamp(conditions.getAttribute('NotBefore')) > now
      || (data.hasAttribute('NotBefore') && timestamp(data.getAttribute('NotBefore')) > now)
      || expiresAt <= now || assertionExpiresAt > Math.min(...issueTimes) + 300_000 || authenticatedAt > now || authenticatedAt < now - 43_200_000) fail()
    const saml = new SAML({ issuer: settings.audience, audience: settings.audience, callbackUrl: callback, idpCert: [...settings.signingKeys],
      wantAssertionsSigned: true, wantAuthnResponseSigned: true, acceptedClockSkewMs: 0, maxAssertionAgeMs: 300_000,
      validateInResponseTo: ValidateInResponseTo.always, requestIdExpirationPeriodMs: 300_000,
      // This is a read-only view of already selected request evidence, not a
      // replay cache. Persistent one-use consumption belongs in the D1 command.
      cacheProvider: { saveAsync: async () => null, getAsync: async id => id === request.requestId ? new Date(request.createdAt).toISOString() : null, removeAsync: async () => null } })
    const result = await saml.validatePostResponseAsync({ SAMLResponse: encoded })
    if (result.loggedOut || !result.profile || result.profile.issuer !== settings.issuer || result.profile.nameID !== subjectId || result.profile.nameIDFormat !== settings.nameIdFormat || result.profile.inResponseTo !== request.requestId) fail()
    const verifiedAt = ctx.clock.now()
    if (verifiedAt < now || verifiedAt >= expiresAt || verifiedAt >= request.createdAt + 300_000) fail()
    const proof = Object.freeze({ connectionId: settings.connectionId, connectionVersion: settings.connectionVersion, organizationId: settings.organizationId,
      issuer: settings.issuer, subject: subjectId, nameIdFormat: settings.nameIdFormat, requestId: request.requestId, responseId: root.getAttribute('ID')!, assertionId: assertion.getAttribute('ID')!, authenticatedAt, expiresAt, sessionExpiresAt, verifiedAt }) as VerifiedSamlIdentity
    proofs.add(proof)
    return proof
  } catch { return fail() }
}
/** Repositories must reject deserialized/copied/reused protocol results. This
 * in-process brand is additional to, and cannot replace, durable D1 replay guards. */
export function consumeSamlIdentity(proof: VerifiedSamlIdentity): VerifiedSamlIdentity {
  if (!proofs.delete(proof)) fail()
  return proof
}
