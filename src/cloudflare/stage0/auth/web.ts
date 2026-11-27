import { readUniqueCookie } from '../http/cookies'
import type { Stage0Config } from '../config'
import type { RequestContext } from '../contracts'
import { Stage0Error } from '../errors'

export function requireBrowserOrigin(ctx: RequestContext, request: Request, mutation: boolean): void {
  const origin = request.headers.get('Origin')
  if (new URL(request.url).origin !== ctx.config.origin || request.headers.has('Authorization') || request.headers.get('Sec-Fetch-Site') === 'cross-site'
    || (mutation ? origin !== ctx.config.origin : origin !== null && origin !== ctx.config.origin)) throw new Stage0Error('forbidden')
}
export function cookieName(config: Stage0Config, purpose: 'prelogin' | 'enrollment' | 'passkey' | 'saml_enrollment'): string {
  return config.environment === 'local' ? `ovelle_local_${purpose}` : `__Host-ovelle_${purpose}`
}
export function strictFlowCookie(config: Stage0Config, purpose: 'prelogin' | 'enrollment' | 'passkey' | 'saml_enrollment', value: string, seconds: number): string {
  return `${cookieName(config, purpose)}=${value}; Path=/; HttpOnly;${config.environment === 'local' ? '' : ' Secure;'} SameSite=Strict; Max-Age=${Math.max(0, seconds)}`
}
export function readFlowCookie(config: Stage0Config, request: Request, purpose: 'prelogin' | 'enrollment' | 'passkey' | 'saml_enrollment'): string {
  return readUniqueCookie(request, cookieName(config, purpose))
}
