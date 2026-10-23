import { beforeEach, expect, it } from 'vitest'
import { SAML, ValidateInResponseTo } from '@node-saml/node-saml'
import { loadStage0Config } from '../../../src/cloudflare/stage0/config'
import { verifySamlResponse, consumeSamlIdentity } from '../../../src/cloudflare/stage0/auth/saml/protocol'
import { signedSamlResponse, encodedSaml, publicKey, persistent, samlIssuer } from './saml-fixture'

const config = loadStage0Config({ APP_ENV: 'local', AUTH_ORIGIN: 'http://localhost:4173', AUTH_RP_ID: 'localhost', AUTH_LOCAL_FIXTURES: 'true' })
const settings = { connectionId: 'saml-connection', connectionVersion: 1, organizationId: 'org-a', issuer: samlIssuer, audience: 'https://ovelle.example.test/saml/metadata', signingKeys: [publicKey], nameIdFormat: persistent }
let now: number
const ctx = { config, clock: { now: () => now } }
const request = () => ({ requestId: '_request-one', createdAt: now - 1000 })
const fixture = (extra: Partial<Parameters<typeof signedSamlResponse>[0]> = {}) => signedSamlResponse({ now, callback: config.origin + '/api/v1/auth/saml/callback', requestId: request().requestId, audience: settings.audience, ...extra })
const verify = (extra: Partial<Parameters<typeof signedSamlResponse>[0]> = {}) => verifySamlResponse(ctx, settings, request(), encodedSaml(fixture(extra)))
beforeEach(() => { now = Date.now() })
it('runs the maintained verifier on a genuinely signed response/assertion in workerd', async () => {
  const saml = new SAML({ issuer: settings.audience, callbackUrl: config.origin + '/api/v1/auth/saml/callback', idpCert: publicKey, validateInResponseTo: ValidateInResponseTo.always, wantAssertionsSigned: true, wantAuthnResponseSigned: true,
    cacheProvider: { saveAsync: async () => null, getAsync: async id => id === '_request-one' ? new Date(now - 1000).toISOString() : null, removeAsync: async () => null } })
  const result = await saml.validatePostResponseAsync({ SAMLResponse: encodedSaml(fixture()) })
  expect(result.profile?.nameID).toBe('stable-person-001')
  expect(result.profile?.issuer).toBe(samlIssuer)
})
it('returns closed branded identity evidence without XML, roles, attributes or a session', async () => {
  const evidence = await verify({ attributes: '<saml:AttributeStatement><saml:Attribute Name="role"><saml:AttributeValue>owner</saml:AttributeValue></saml:Attribute></saml:AttributeStatement>' })
  expect(evidence.verifiedAt).toBeGreaterThanOrEqual(now)
  expect({ ...evidence, verifiedAt: now }).toEqual({ connectionId: 'saml-connection', connectionVersion: 1, organizationId: 'org-a', issuer: samlIssuer, subject: 'stable-person-001', nameIdFormat: persistent, requestId: '_request-one', responseId: '_response-one', assertionId: '_assertion-one', authenticatedAt: now, expiresAt: now + 120_000, sessionExpiresAt: null, verifiedAt: now })
  expect(consumeSamlIdentity(evidence)).toBe(evidence)
  expect(() => consumeSamlIdentity(evidence)).toThrow()
  expect(() => consumeSamlIdentity({ ...evidence })).toThrow()
  expect(() => consumeSamlIdentity(JSON.parse(JSON.stringify(evidence)))).toThrow()
  expect(Object.isFrozen(evidence)).toBe(true)
})
it.each(['responseIssuer', 'assertionIssuer', 'destination', 'recipient', 'subjectRequestId', 'audience'] as const)('rejects signed wrong %s instead of trusting the signature alone', async field => {
  await expect(verify({ [field]: 'https://foreign.example.test/value' })).rejects.toMatchObject({ code: 'unauthenticated' })
})
it.each([{ assertionSigned: false }, { responseSigned: false }, { responseSigned: false, assertionSigned: false }])('requires signed response and assertion: %j', async extra => {
  await expect(verify(extra)).rejects.toMatchObject({ code: 'unauthenticated' })
})
it('rejects tampering and signatures outside the reviewed trust set', async () => {
  await expect(verifySamlResponse(ctx, settings, request(), encodedSaml(fixture().replace('stable-person-001', 'attacker')))).rejects.toMatchObject({ code: 'unauthenticated' })
  const other = await import('node:crypto').then(crypto => crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }))
  await expect(verifySamlResponse(ctx, { ...settings, signingKeys: [other.publicKey.export({ type: 'spki', format: 'pem' }).toString()] }, request(), encodedSaml(fixture()))).rejects.toMatchObject({ code: 'unauthenticated' })
})
it.each(['expired', 'future', 'old-issue', 'future-authn'] as const)('rejects signed %s evidence with exclusive expiry', async kind => {
  const extra = kind === 'expired' ? { notOnOrAfter: now } : kind === 'future' ? { notBefore: now + 1 } : kind === 'old-issue' ? { issueInstant: now - 300_001 } : { authnInstant: now + 1 }
  await expect(verify(extra)).rejects.toMatchObject({ code: 'unauthenticated' })
})
it('rejects missing or stale request state and does not accept unsolicited assertions', async () => {
  for (const state of [{ requestId: '_wrong-request', createdAt: now }, { requestId: '', createdAt: now }, { requestId: '_request-one', createdAt: now - 300_000 }, { requestId: '_request-one', createdAt: now + 1 }]) {
    await expect(verifySamlResponse(ctx, settings, state, encodedSaml(fixture()))).rejects.toMatchObject({ code: 'unauthenticated' })
  }
})
it('rejects DTD/entities, malformed XML, multiple roots and bounded-input overflow', async () => {
  for (const xml of ['<!DOCTYPE x [<!ENTITY injected SYSTEM "file:///fixture">]>' + fixture(), fixture() + '<extra/>', '<broken>', 'x'.repeat(70_000)]) {
    await expect(verifySamlResponse(ctx, settings, request(), encodedSaml(xml))).rejects.toMatchObject({ code: 'unauthenticated' })
  }
  for (const encoded of ['not base64!', '', encodedSaml(fixture()) + 'x']) await expect(verifySamlResponse(ctx, settings, request(), encoded)).rejects.toMatchObject({ code: 'unauthenticated' })
})
it('enforces configured stable-name format and a nonempty exact subject', async () => {
  await expect(verify({ format: 'urn:oasis:names:tc:SAML:2.0:nameid-format:transient' })).rejects.toMatchObject({ code: 'unauthenticated' })
  await expect(verify({ subject: '' })).rejects.toMatchObject({ code: 'unauthenticated' })
  const exact = await verify({ subject: '  exact-stable-subject  ' })
  expect(exact.subject).toBe('  exact-stable-subject  ')
})
it('fails configuration closed before invoking untrusted metadata/network options', async () => {
  for (const value of [{ ...settings, signingKeys: [] }, { ...settings, connectionVersion: 0 }, { ...settings, organizationId: '' }, { ...settings, audience: '' }]) await expect(verifySamlResponse(ctx, value, request(), encodedSaml(fixture()))).rejects.toMatchObject({ code: 'configuration' })
})
it('does not return evidence that expires while asynchronous verification is running', async () => {
  let reads = 0
  const advancing = { ...ctx, clock: { now: () => ++reads === 1 ? now : now + 120_000 } }
  await expect(verifySamlResponse(advancing, settings, request(), encodedSaml(fixture()))).rejects.toMatchObject({ code: 'unauthenticated' })
})
it('keeps reviewed connection and request binding immutable across asynchronous verification', async () => {
  const mutableSettings = { ...settings, signingKeys: [...settings.signingKeys] }
  const pending = request()
  const promise = verifySamlResponse(ctx, mutableSettings, pending, encodedSaml(fixture()))
  mutableSettings.connectionId = 'foreign-connection'; mutableSettings.organizationId = 'org-b'; mutableSettings.connectionVersion = 99
  pending.requestId = '_foreign-request'
  const evidence = await promise
  expect(evidence).toMatchObject({ connectionId: 'saml-connection', organizationId: 'org-a', connectionVersion: 1, requestId: '_request-one' })
})
it.each(['root-namespace', 'assertion-namespace', 'duplicate-id', 'nested-assertion', 'depth', 'cdata', 'comment'] as const)('rejects independently signed structural ambiguity: %s', async kind => {
  const beforeSign = (xml: string) => {
    if (kind === 'root-namespace') return xml.replace('xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"', 'xmlns:samlp="urn:foreign:protocol"')
    if (kind === 'assertion-namespace') return xml.replace('xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"', 'xmlns:saml="urn:foreign:assertion"')
    if (kind === 'duplicate-id') return xml.replace('<saml:Subject>', '<saml:Subject ID="_assertion-one">')
    if (kind === 'nested-assertion') return xml.replace('<saml:Subject>', '<saml:Subject><saml:Assertion ID="_nested"/>')
    if (kind === 'depth') return xml.replace('</saml:Assertion>', '<nested>'.repeat(35) + 'value' + '</nested>'.repeat(35) + '</saml:Assertion>')
    if (kind === 'cdata') return xml.replace('stable-person-001', '<![CDATA[stable-person-001]]>')
    return xml.replace('stable-person-001', 'stable-<!-- comment -->person-001')
  }
  await expect(verify({ beforeSign })).rejects.toMatchObject({ code: 'unauthenticated' })
})
it('rejects SHA-1 even with a valid trusted signature and never fetches a Reference URI', async () => {
  await expect(verify({ signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1' })).rejects.toMatchObject({ code: 'unauthenticated' })
  const external = fixture().replace('URI="#_assertion-one"', 'URI="https://unreviewed.example.test/key"')
  await expect(verifySamlResponse(ctx, settings, request(), encodedSaml(external))).rejects.toMatchObject({ code: 'unauthenticated' })
})
it('accepts explicitly reviewed key rotation without widening the provider trust set', async () => {
  const other = await import('node:crypto').then(crypto => crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }))
  const rotated = { ...settings, signingKeys: [other.publicKey.export({ type: 'spki', format: 'pem' }).toString(), publicKey] }
  expect((await verifySamlResponse(ctx, rotated, request(), encodedSaml(fixture()))).subject).toBe('stable-person-001')
})
it('keeps stable subjects within the existing identity schema without truncation', async () => {
  await expect(verify({ subject: 'x'.repeat(513) })).rejects.toMatchObject({ code: 'unauthenticated' })
  expect((await verify({ subject: 'x'.repeat(512) })).subject).toHaveLength(512)
})
it.each([
  '<saml:Condition xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:custom="urn:custom" xsi:type="custom:DevicePolicy"/>',
  '<saml:OneTimeUse/>',
  '<saml:ProxyRestriction Count="0"/>',
  '<custom:DevicePolicy xmlns:custom="urn:custom"/>',
])('rejects signed unsupported condition semantics: %s', async condition => {
  await expect(verify({ beforeSign: xml => xml.replace('</saml:Conditions>', condition + '</saml:Conditions>') })).rejects.toMatchObject({ code: 'unauthenticated' })
})
it('rejects extension attributes on supported conditions instead of ignoring restrictions', async () => {
  for (const target of ['<saml:Conditions ', '<saml:AudienceRestriction>']) {
    const beforeSign = (xml: string) => xml.replace(target, target.replace(/>$/, ' ') + 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:custom="urn:custom" xsi:type="custom:DevicePolicy"' + (target.endsWith('>') ? '>' : ' '))
    await expect(verify({ beforeSign })).rejects.toMatchObject({ code: 'unauthenticated' })
  }
})
it.each(['past', 'boundary', 'malformed'] as const)('rejects signed %s IdP session deadlines', async kind => {
  const deadline = kind === 'malformed' ? 'invalid' : new Date(now - (kind === 'past' ? 60_000 : 0)).toISOString()
  await expect(verify({ beforeSign: xml => xml.replace('<saml:AuthnStatement ', `<saml:AuthnStatement SessionNotOnOrAfter="${deadline}" `) })).rejects.toMatchObject({ code: 'unauthenticated' })
})
it.each([30_000, 7_200_000])('preserves the signed session ceiling independently of assertion validity: %i', async offset => {
  const deadline = now + offset
  const evidence = await verify({ beforeSign: xml => xml.replace('<saml:AuthnStatement ', `<saml:AuthnStatement SessionNotOnOrAfter="${new Date(deadline).toISOString()}" `) })
  expect(evidence).toMatchObject({ sessionExpiresAt: deadline, expiresAt: Math.min(now + 120_000, deadline) })
})
it('rejects the IdP session deadline if it passes during asynchronous verification', async () => {
  let reads = 0
  const advancing = { ...ctx, clock: { now: () => ++reads === 1 ? now : now + 30_000 } }
  const xml = fixture({ beforeSign: xml => xml.replace('<saml:AuthnStatement ', `<saml:AuthnStatement SessionNotOnOrAfter="${new Date(now + 30_000).toISOString()}" `) })
  await expect(verifySamlResponse(advancing, settings, request(), encodedSaml(xml))).rejects.toMatchObject({ code: 'unauthenticated' })
})
it('does not let a shorter IdP session deadline hide an overlong assertion window', async () => {
  await expect(verify({ notOnOrAfter: now + 600_000, beforeSign: xml => xml.replace('<saml:AuthnStatement ', `<saml:AuthnStatement SessionNotOnOrAfter="${new Date(now + 30_000).toISOString()}" `) })).rejects.toMatchObject({ code: 'unauthenticated' })
})
