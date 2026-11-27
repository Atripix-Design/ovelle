import { expect, it } from 'vitest'
import { inflateRawSync } from 'node:zlib'
import { createVerify } from 'node:crypto'
import { stringify } from 'node:querystring'
import { loadStage0Config } from '../../../src/cloudflare/stage0/config'
import { createSamlAuthorization } from '../../../src/cloudflare/stage0/auth/saml/authorization'
import { persistent, publicKey, samlIssuer, testSigningKey } from './saml-fixture'
const ctx = { config: loadStage0Config({ APP_ENV: 'local', AUTH_ORIGIN: 'http://localhost:4173', AUTH_RP_ID: 'localhost', AUTH_LOCAL_FIXTURES: 'true' }) }
const settings = { connectionId: 'saml-a', connectionVersion: 1, organizationId: 'org-a', issuer: samlIssuer, audience: 'https://ovelle.example.test/saml', signingKeys: [publicKey], nameIdFormat: persistent, entryPoint: 'https://identity.example.test/sso' }
it('generates the actual maintained Redirect request with exact server selectors and fresh linking intent', async () => {
  const url = new URL(await createSamlAuthorization(ctx, settings, '_selected-request', 'r'.repeat(43), 'link'))
  expect(url.origin + url.pathname).toBe('https://identity.example.test/sso')
  expect(url.searchParams.get('RelayState')).toBe('r'.repeat(43))
  const xml = inflateRawSync(Buffer.from(url.searchParams.get('SAMLRequest')!, 'base64')).toString()
  expect(xml).toContain('ID="_selected-request"'); expect(xml).toContain('ForceAuthn="true"')
  expect(xml).toContain('AssertionConsumerServiceURL="http://localhost:4173/api/v1/auth/saml/callback"')
  expect(xml).toContain('ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"')
  expect(xml).toContain('https://ovelle.example.test/saml'); expect(xml).toContain(persistent)
  expect(xml).not.toContain('RequestedAuthnContext')
})
it('signs Redirect parameters with reviewed SP key and RSA-SHA256 without exposing private material', async () => {
  const url = new URL(await createSamlAuthorization(ctx, { ...settings, spSigningKey: testSigningKey }, '_selected-request', 'r'.repeat(43), 'login'))
  expect(url.searchParams.get('SigAlg')).toBe('http://www.w3.org/2001/04/xmldsig-more#rsa-sha256')
  const signed = stringify(Object.fromEntries(['SAMLRequest', 'RelayState', 'SigAlg'].map(key => [key, url.searchParams.get(key)!])))
  expect(createVerify('RSA-SHA256').update(signed).verify(publicKey, url.searchParams.get('Signature')!, 'base64')).toBe(true)
  expect(url.href).not.toContain('PRIVATE'); expect(url.href).not.toContain(testSigningKey)
})
it('rejects unsafe destinations, endpoint query overrides and malformed signing configuration', async () => {
  for (const entryPoint of ['http://identity.example.test/sso', 'https://user@identity.example.test/sso', 'https://identity.example.test/sso#fragment', 'https://identity.example.test/sso?RelayState=replace']) {
    await expect(createSamlAuthorization(ctx, { ...settings, entryPoint }, '_request', 'r'.repeat(43), 'login')).rejects.toMatchObject({ code: 'configuration' })
  }
  await expect(createSamlAuthorization(ctx, { ...settings, spSigningKey: 'invalid' }, '_request', 'r'.repeat(43), 'login')).rejects.toMatchObject({ code: 'configuration' })
})
