import { Stage0Error } from '../errors'

export const secretPattern = /^[A-Za-z0-9_-]{43}$/
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
export const randomSecret = () => encode(crypto.getRandomValues(new Uint8Array(32)))
export async function secretDigest(value: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('')
}
/** Domain and context are fixed by server code, never arbitrary client SQL or
 * key selectors. These operations protect random secrets, not passwords.
 */
export async function secretMac(keyMaterial: Uint8Array | string, context: readonly unknown[]): Promise<string> {
  if (typeof keyMaterial === 'string' ? !secretPattern.test(keyMaterial) : !(keyMaterial instanceof Uint8Array) || keyMaterial.byteLength !== 32) throw new Stage0Error('configuration')
  const key = await crypto.subtle.importKey('raw', typeof keyMaterial === 'string' ? new TextEncoder().encode(keyMaterial) : keyMaterial, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return encode(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(JSON.stringify(context)))))
}
export function equalSecret(a: string, b: string): boolean {
  if (!secretPattern.test(a) || !secretPattern.test(b)) return false
  let difference = 0
  for (let index = 0; index < a.length; index++) difference |= a.charCodeAt(index) ^ b.charCodeAt(index)
  return difference === 0
}
