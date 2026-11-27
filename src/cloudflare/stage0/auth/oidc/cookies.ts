import type { Stage0Config } from '../../config'
import { Stage0Error } from '../../errors'
import { secretPattern } from '../secrets'

const cookieName = (config: Stage0Config) => config.environment === 'local' ? 'ovelle_local_oidc' : '__Host-ovelle_oidc'
/** Lax is required only for the temporary top-level IdP callback. This cookie is
 * not an account session, and cannot authenticate any ordinary API request.
 */
export function oidcBindingCookie(config: Stage0Config, binding: string | null): string {
  if (binding !== null && !secretPattern.test(binding)) throw new Stage0Error('invalid_input')
  return `${cookieName(config)}=${binding ?? ''}; Path=/; HttpOnly;${config.environment === 'local' ? '' : ' Secure;'} SameSite=Lax; Max-Age=${binding === null ? 0 : 300}`
}
export function readOidcBindingCookie(config: Stage0Config, request: Request): string {
  const cookies = (request.headers.get('Cookie') ?? '').split(';').map(part => part.trim()).filter(part => part.startsWith(`${cookieName(config)}=`))
  if (cookies.length !== 1) throw new Stage0Error('unauthenticated')
  const value = cookies[0].slice(cookieName(config).length + 1)
  if (!secretPattern.test(value)) throw new Stage0Error('unauthenticated')
  return value
}
