import { Stage0Error } from '../errors'

/** Keyed counter identities and window policy, independent of persistence.
 * Selectors include opaque flow purposes as well as email addresses. Their
 * normalization is not mailbox validation. Keep the versioned HMAC input stable
 * across deployments so existing counters cannot be bypassed by a refactor.
 */
export interface AuthBudgetSelectors { email: string; ip: string }
type Kind = 'challenge_pair' | 'challenge_ip' | 'email_address' | 'email_ip'
export interface AuthBudget { id: string; kind: Kind; lifetime: number }

export async function deriveAuthBudgets(input: AuthBudgetSelectors, keyMaterial: Uint8Array, purpose: 'challenge' | 'email'): Promise<AuthBudget[]> {
  if (!(keyMaterial instanceof Uint8Array) || keyMaterial.byteLength !== 32) throw new Stage0Error('configuration')
  if (typeof input.email !== 'string' || typeof input.ip !== 'string') throw new Stage0Error('invalid_input')
  const address = input.email.trim().toLowerCase()
  const ip = input.ip.toLowerCase()
  // Control characters are rejected deliberately in caller-supplied identifiers.
  // eslint-disable-next-line no-control-regex
  if (!address || address.length > 254 || /[\u0000-\u001f\u007f]/.test(address) || ip.length > 64 || !/^[a-f0-9:.]+$/.test(ip)) throw new Stage0Error('invalid_input')
  const key = await crypto.subtle.importKey('raw', keyMaterial, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const digest = async (kind: Kind, selectors: string[]): Promise<AuthBudget> => {
    const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(JSON.stringify(['ovelle:auth-budget:v1', kind, ...selectors]))))
    return { id: Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join(''), kind, lifetime: purpose === 'email' ? 3_600_000 : 900_000 }
  }
  return purpose === 'email' ? Promise.all([digest('email_address', [address]), digest('email_ip', [ip])])
    : Promise.all([digest('challenge_pair', [address, ip]), digest('challenge_ip', [ip])])
}
