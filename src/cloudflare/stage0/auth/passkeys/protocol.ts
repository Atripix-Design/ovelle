import {
  generateRegistrationOptions, generateAuthenticationOptions, verifyRegistrationResponse, verifyAuthenticationResponse,
  type RegistrationResponseJSON, type AuthenticationResponseJSON, type WebAuthnCredential,
} from '@simplewebauthn/server'
import { decodeAttestationObject } from '@simplewebauthn/server/helpers'
import type { Stage0Config } from '../../config'
import { Stage0Error } from '../../errors'
import { secretDigest, secretPattern } from '../secrets'

const algorithms = [-7, -257] // ES256 and RS256; no runtime-dependent algorithm negotiation.
export const encodeBytes = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
export function decodeBytes(value: string, max: number): Uint8Array<ArrayBuffer> {
  if (typeof value !== 'string' || !value || value.length > max * 4 / 3 + 4 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Stage0Error('unauthenticated')
  const bytes = Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0))
  if (bytes.length > max || encodeBytes(bytes) !== value) throw new Stage0Error('unauthenticated')
  return bytes
}
function envelope(value: unknown): void {
  if (!value || typeof value !== 'object' || JSON.stringify(value).length > 65_536) throw new Stage0Error('unauthenticated')
  const response = value as RegistrationResponseJSON | AuthenticationResponseJSON
  decodeBytes(response.id, 1023)
  if (response.id !== response.rawId || response.type !== 'public-key') throw new Stage0Error('unauthenticated')
  // The maintained verifier intentionally supports some cross-origin contexts.
  // Ovelle supports only its own top-level origin, including browsers that omit
  // topOrigin. Inspect this extra policy without replacing protocol verification.
  const client = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(decodeBytes(response.response.clientDataJSON, 4096)))
  if (!client || typeof client !== 'object' || (client.crossOrigin !== undefined && client.crossOrigin !== false) || client.topOrigin !== undefined) throw new Stage0Error('unauthenticated')
}
export async function registrationOptions(config: Stage0Config, input: { challenge: string; userHandle: string; email: string; displayName: string; credentials: { id: string; transports?: string[] }[] }) {
  return generateRegistrationOptions({ rpName: 'Ovelle', rpID: config.rpId, userName: input.email, userDisplayName: input.displayName,
    userID: decodeBytes(input.userHandle, 32), challenge: decodeBytes(input.challenge, 32), timeout: 300_000, attestationType: 'none',
    supportedAlgorithmIDs: algorithms, authenticatorSelection: { residentKey: 'required', userVerification: 'required' }, excludeCredentials: input.credentials })
}
export async function authenticationOptions(config: Stage0Config, challenge: string, credentials?: { id: string; transports?: string[] }[]) {
  return generateAuthenticationOptions({ rpID: config.rpId, challenge: decodeBytes(challenge, 32), timeout: 300_000, userVerification: 'required', allowCredentials: credentials ?? [] })
}
export async function verifyRegistration(config: Stage0Config, challengeDigest: string, response: RegistrationResponseJSON) {
  try {
    envelope(response)
    const attestation = decodeAttestationObject(decodeBytes(response.response.attestationObject, 32_768))
    // Request no device attestation. Accept none or a self-attested packed key;
    // certificate/metadata formats are outside this policy and cannot trigger
    // certificate/revocation network work from untrusted authenticator material.
    const statement = attestation.get('attStmt')
    if (attestation.get('fmt') !== 'none' && !(attestation.get('fmt') === 'packed' && statement.size === 2 && !statement.get('x5c'))) throw new Stage0Error('unauthenticated')
    const verified = await verifyRegistrationResponse({ response, expectedChallenge: async challenge => secretPattern.test(challenge) && await secretDigest(challenge) === challengeDigest,
      expectedOrigin: config.origin, expectedRPID: config.rpId, requireUserPresence: true, requireUserVerification: true, supportedAlgorithmIDs: algorithms })
    if (!verified.verified || !verified.registrationInfo.userVerified) throw new Stage0Error('unauthenticated')
    const result = verified.registrationInfo
    if (result.credential.id !== response.id || result.credential.publicKey.length > 4096) throw new Stage0Error('unauthenticated')
    // Transport hints are untrusted UX hints, never authentication authority.
    result.credential.transports = [...new Set((response.response.transports ?? []).filter(value => ['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb'].includes(value)))].slice(0, 7)
    return result
  } catch { throw new Stage0Error('unauthenticated') }
}
export async function verifyAuthentication(config: Stage0Config, challengeDigest: string, credential: WebAuthnCredential, userHandle: string, response: AuthenticationResponseJSON) {
  try {
    envelope(response)
    if (response.id !== credential.id || (response.response.userHandle !== undefined && response.response.userHandle !== userHandle)) throw new Stage0Error('unauthenticated')
    const verified = await verifyAuthenticationResponse({ response, expectedChallenge: async challenge => secretPattern.test(challenge) && await secretDigest(challenge) === challengeDigest,
      expectedOrigin: config.origin, expectedRPID: config.rpId, credential, requireUserVerification: true })
    if (!verified.verified || !verified.authenticationInfo.userVerified) throw new Stage0Error('unauthenticated')
    return verified.authenticationInfo
  } catch { throw new Stage0Error('unauthenticated') }
}
