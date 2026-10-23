import { generateKeyPairSync } from 'node:crypto'
import { SignedXml } from 'xml-crypto'

// Ephemeral test-only signing material: no private key is committed or sent out.
const pair = generateKeyPairSync('rsa', { modulusLength: 2048 })
const privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
export const publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
export const samlIssuer = 'https://identity.example.test/saml'
export const persistent = 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent'
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;').replaceAll('>', '&gt;').replaceAll("'", '&apos;')
export interface SamlFixtureOptions {
  now: number; callback: string; requestId: string; audience: string
  responseId?: string; assertionId?: string; responseIssuer?: string; assertionIssuer?: string
  subject?: string; format?: string; destination?: string; recipient?: string; subjectRequestId?: string
  notBefore?: number; notOnOrAfter?: number; authnInstant?: number; issueInstant?: number
  assertionSigned?: boolean; responseSigned?: boolean; extraAssertion?: string; attributes?: string; beforeSign?: (xml: string) => string; signatureAlgorithm?: string
}
export function signedSamlResponse(input: SamlFixtureOptions): string {
  const time = (value: number) => new Date(value).toISOString()
  const issueInstant = time(input.issueInstant ?? input.now)
  let xml = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${escape(input.responseId ?? '_response-one')}" Version="2.0" IssueInstant="${issueInstant}" Destination="${escape(input.destination ?? input.callback)}" InResponseTo="${escape(input.requestId)}"><saml:Issuer>${escape(input.responseIssuer ?? samlIssuer)}</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status><saml:Assertion ID="${escape(input.assertionId ?? '_assertion-one')}" Version="2.0" IssueInstant="${issueInstant}"><saml:Issuer>${escape(input.assertionIssuer ?? samlIssuer)}</saml:Issuer><saml:Subject><saml:NameID Format="${escape(input.format ?? persistent)}">${escape(input.subject ?? 'stable-person-001')}</saml:NameID><saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData InResponseTo="${escape(input.subjectRequestId ?? input.requestId)}" Recipient="${escape(input.recipient ?? input.callback)}" NotOnOrAfter="${time(input.notOnOrAfter ?? input.now + 120_000)}"/></saml:SubjectConfirmation></saml:Subject><saml:Conditions NotBefore="${time(input.notBefore ?? input.now - 1000)}" NotOnOrAfter="${time(input.notOnOrAfter ?? input.now + 120_000)}"><saml:AudienceRestriction><saml:Audience>${escape(input.audience)}</saml:Audience></saml:AudienceRestriction></saml:Conditions><saml:AuthnStatement AuthnInstant="${time(input.authnInstant ?? input.now)}" SessionIndex="fixture-session"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement>${input.attributes ?? ''}</saml:Assertion>${input.extraAssertion ?? ''}</samlp:Response>`
  xml = input.beforeSign?.(xml) ?? xml
  for (const kind of ['Assertion', 'Response']) {
    if ((kind === 'Assertion' && input.assertionSigned === false) || (kind === 'Response' && input.responseSigned === false)) continue
    const signer = new SignedXml({ privateKey, publicCert: publicKey, signatureAlgorithm: input.signatureAlgorithm ?? 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256', canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#' })
    signer.addReference({ xpath: `//*[local-name()='${kind}']`, digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256', transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/2001/10/xml-exc-c14n#'] })
    signer.computeSignature(xml, { location: { reference: `//*[local-name()='${kind}']/*[local-name()='Issuer']`, action: 'after' } })
    xml = signer.getSignedXml()
  }
  return xml
}
export const encodedSaml = (xml: string) => btoa(String.fromCharCode(...new TextEncoder().encode(xml)))
