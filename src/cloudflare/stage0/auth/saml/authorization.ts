import { SAML, ValidateInResponseTo } from '@node-saml/node-saml'
import { createPrivateKey, createPublicKey } from 'node:crypto'
import type { RequestContext } from '../../contracts'
import { Stage0Error } from '../../errors'
import { secretDigest, secretPattern } from '../secrets'
import { validateSamlSettings, type SamlSettings } from './protocol'
export interface SamlConnectionSettings extends SamlSettings { entryPoint: string; spSigningKey?: string }
export function validateSamlConnection(input: SamlConnectionSettings): Readonly<SamlConnectionSettings> {
  const settings = validateSamlSettings(input)
  try {
    if (typeof input.entryPoint !== 'string' || input.entryPoint.length > 2048) throw new Error()
    const url = new URL(input.entryPoint)
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.href !== input.entryPoint
      || ['SAMLRequest', 'SAMLResponse', 'RelayState', 'SigAlg', 'Signature'].some(name => url.searchParams.has(name))) throw new Error()
    if (input.spSigningKey !== undefined) {
      if (typeof input.spSigningKey !== 'string' || input.spSigningKey.length > 16_384) throw new Error()
      const key = createPrivateKey(input.spSigningKey)
      if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw new Error()
    }
    return Object.freeze({ ...settings, entryPoint: input.entryPoint, spSigningKey: input.spSigningKey })
  } catch { throw new Stage0Error('configuration') }
}
/** Bind reviewed profile settings to the pending request without storing secrets.
 * Changes require a new start even if an operator neglected a version bump. */
export async function samlSettingsDigest(ctx: Pick<RequestContext, 'config'>, settings: Readonly<SamlConnectionSettings>): Promise<string> {
  const spPublicKey = settings.spSigningKey ? createPublicKey(settings.spSigningKey).export({ type: 'spki', format: 'pem' }).toString() : null
  return secretDigest(JSON.stringify(['ovelle:saml-settings:v1', ctx.config.origin, settings.organizationId, settings.connectionId, settings.connectionVersion,
    settings.issuer, settings.audience, settings.nameIdFormat, settings.signingKeys, settings.entryPoint, spPublicKey]))
}
/** Maintained Redirect encoding/signing only; the transaction service owns
 * durable request/binding state. No metadata fetch or caller override options. */
export async function createSamlAuthorization(ctx: Pick<RequestContext, 'config'>, input: SamlConnectionSettings, requestId: string, relayState: string, purpose: 'login' | 'link'): Promise<string> {
  const settings = validateSamlConnection(input)
  if (!/^[A-Za-z_][A-Za-z0-9_.-]{0,255}$/.test(requestId) || !secretPattern.test(relayState) || !['login', 'link'].includes(purpose)) throw new Stage0Error('invalid_input')
  const saml = new SAML({ issuer: settings.audience, callbackUrl: ctx.config.origin + '/api/v1/auth/saml/callback', entryPoint: settings.entryPoint,
    idpCert: [...settings.signingKeys], identifierFormat: settings.nameIdFormat, disableRequestedAuthnContext: true, forceAuthn: purpose === 'link',
    privateKey: settings.spSigningKey, signatureAlgorithm: 'sha256', digestAlgorithm: 'sha256', generateUniqueId: () => requestId,
    validateInResponseTo: ValidateInResponseTo.always,
    // Creation is not durable until the caller commits its own D1 transaction.
    cacheProvider: { saveAsync: async () => null, getAsync: async () => null, removeAsync: async () => null } })
  return saml.getAuthorizeUrlAsync(relayState, undefined, {})
}
