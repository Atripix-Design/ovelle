import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server'
import { isoCBOR } from '@simplewebauthn/server/helpers'

export const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
export const decode = (text: string) => Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0))
const utf8 = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
const join = (...parts: Uint8Array[]) => { const result = new Uint8Array(parts.reduce((n, part) => n + part.length, 0)); let i = 0; for (const part of parts) { result.set(part, i); i += part.length } return result }
const hash = async (data: Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-256', data))
function der(raw: Uint8Array): Uint8Array {
  const integer = (part: Uint8Array) => { let i = 0; while (part[i] === 0 && i < part.length - 1) i++; const trimmed = part.slice(i); const data = trimmed[0] & 128 ? join(new Uint8Array([0]), trimmed) : trimmed; return join(new Uint8Array([2, data.length]), data) }
  const body = join(integer(raw.slice(0, 32)), integer(raw.slice(32)))
  return join(new Uint8Array([48, body.length]), body)
}
/** Software authenticator used only by tests. The production verifier and Web
 * Crypto run unchanged; signatures are actual P-256 signatures over WebAuthn data. */
export async function passkeyFixture(algorithm: 'ES256' | 'RS256' = 'ES256') {
  const keys = await crypto.subtle.generateKey(algorithm === 'ES256' ? { name: 'ECDSA', namedCurve: 'P-256' } : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, ['sign', 'verify']) as CryptoKeyPair
  const jwk = await crypto.subtle.exportKey('jwk', keys.publicKey) as JsonWebKey
  const id = crypto.getRandomValues(new Uint8Array(32))
  const cose = isoCBOR.encode(new Map<number, number | Uint8Array>(algorithm === 'ES256' ? [[1, 2], [3, -7], [-1, 1], [-2, decode(jwk.x!)], [-3, decode(jwk.y!)]] : [[1, 3], [3, -257], [-1, decode(jwk.n!)], [-2, decode(jwk.e!)]]))
  const sign = async (authData: Uint8Array, client: Uint8Array) => {
    const signed = new Uint8Array(await crypto.subtle.sign(algorithm === 'ES256' ? { name: 'ECDSA', hash: 'SHA-256' } : { name: 'RSASSA-PKCS1-v1_5' }, keys.privateKey, join(authData, await hash(client))))
    return algorithm === 'ES256' ? der(signed) : signed
  }
  const data = async (rp: string, flags: number, counter: number) => { const count = new Uint8Array(4); new DataView(count.buffer).setUint32(0, counter); return join(await hash(new TextEncoder().encode(rp)), new Uint8Array([flags]), count) }
  const state = { origin: 'http://localhost:4173', rp: 'localhost', uv: true, up: true, crossOrigin: false, counter: 0, backedUp: false, badSignature: false }
  const client = (challenge: string, type: string) => utf8({ type, challenge, origin: state.origin, crossOrigin: state.crossOrigin })
  return {
    state, id: encode(id), publicKey: cose,
    async registration(challenge: string): Promise<RegistrationResponseJSON> {
      const cd = client(challenge, 'webauthn.create')
      const flags = 64 | (state.uv ? 4 : 0) | (state.up ? 1 : 0) | (state.backedUp ? 24 : 0)
      const authData = join(await data(state.rp, flags, state.counter), new Uint8Array(16), new Uint8Array([0, id.length]), id, cose)
      const attestation = isoCBOR.encode(new Map<string, unknown>([['fmt', 'packed'], ['authData', authData], ['attStmt', new Map<string, number | Uint8Array>([['alg', algorithm === 'ES256' ? -7 : -257], ['sig', await sign(authData, cd)]])]]) as never)
      return { id: encode(id), rawId: encode(id), type: 'public-key', clientExtensionResults: {}, response: { clientDataJSON: encode(cd), attestationObject: encode(attestation), transports: ['internal'] } }
    },
    async authentication(challenge: string, userHandle: string): Promise<AuthenticationResponseJSON> {
      const cd = client(challenge, 'webauthn.get')
      const authData = await data(state.rp, (state.uv ? 4 : 0) | (state.up ? 1 : 0) | (state.backedUp ? 24 : 0), state.counter)
      const signature = await sign(authData, cd)
      if (state.badSignature) signature[signature.length - 1] ^= 1
      return { id: encode(id), rawId: encode(id), type: 'public-key', clientExtensionResults: {}, response: { clientDataJSON: encode(cd), authenticatorData: encode(authData), signature: encode(signature), userHandle } }
    },
  }
}
