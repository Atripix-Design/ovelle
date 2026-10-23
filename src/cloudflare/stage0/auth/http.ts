import type { Stage0Config } from '../config'
import type { Principal, RequestContext } from '../contracts'
import { Stage0Error } from '../errors'
import { loadLiveSession, resolveSession, verifyCsrf, sessionCsrfSecret, type IssuedSession } from './sessions'

const cookieName = (config: Stage0Config): string => config.environment === 'local' ? 'ovelle_local_session' : '__Host-ovelle_session'
const cookieAttributes = (config: Stage0Config): string => `Path=/; HttpOnly;${config.environment === 'local' ? '' : ' Secure;'} SameSite=Strict`

/** Serialize only a current browser credential, using its database-owned expiry.
 * Rotation must never restart the absolute lifetime in the browser's cookie jar.
 */
export async function browserSessionCookie(ctx: RequestContext, issued: IssuedSession): Promise<string> {
  if (issued.principal.transport !== 'browser') throw new Stage0Error('invalid_input')
  const principal = await resolveSession(ctx, issued.token, 'browser')
  if (principal.sessionId !== issued.principal.sessionId) throw new Stage0Error('invalid_input')
  const row = await loadLiveSession(ctx, principal)
  const remainingSeconds = Math.max(0, Math.floor((row.expires_at - ctx.clock.now()) / 1000))
  return `${cookieName(ctx.config)}=${issued.token}; ${cookieAttributes(ctx.config)}; Max-Age=${remainingSeconds}`
}

export function clearBrowserSessionCookie(config: Stage0Config): string {
  return `${cookieName(config)}=; ${cookieAttributes(config)}; Max-Age=0`
}

/** Return only through a same-origin, no-store response without CORS headers.
 * Recovering this value is a read; it never extends a session or changes a token.
 */
export async function browserCsrfToken(ctx: RequestContext, request: Request): Promise<string> {
  const principal = await authenticateRequest(ctx, request, 'browser')
  const csrfToken = await sessionCsrfSecret(readCookie(request, cookieName(ctx.config)))
  if (!await verifyCsrf(ctx, principal, csrfToken)) throw new Stage0Error('unauthenticated')
  return csrfToken
}

function readCookie(request: Request, name: string): string {
  const values = (request.headers.get('Cookie') ?? '').split(';').flatMap(part => {
    const separator = part.indexOf('=')
    return separator !== -1 && part.slice(0, separator).trim() === name ? [part.slice(separator + 1).trim()] : []
  })
  // Cookie ordering is not authority. Fail closed if a proxy or cookie shadowing
  // makes the selected session ambiguous; do not URL-decode or unquote secrets.
  if (values.length !== 1) throw new Stage0Error('unauthenticated')
  return values[0]
}

/** Call only from a fixed route with a server-selected transport. An absent
 * Origin never turns a cookie into native authentication. This module does not
 * enable any live route or accept a client-provided principal/assurance object.
 */
export async function authenticateRequest(ctx: RequestContext, request: Request, transport: Principal['transport']): Promise<Principal> {
  if (new URL(request.url).origin !== ctx.config.origin) throw new Stage0Error('forbidden')
  if (transport === 'desktop') {
    // Native calls originate in Electron main, not a renderer fetch. No CORS
    // response or preflight path may make this bearer boundary browser-callable.
    if (request.headers.has('Cookie') || request.headers.has('Origin') || request.headers.has('Sec-Fetch-Site')) throw new Stage0Error('unauthenticated')
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(request.headers.get('Authorization') ?? '')
    if (!match) throw new Stage0Error('unauthenticated')
    return resolveSession(ctx, match[1], 'desktop')
  }
  if (transport !== 'browser' || request.headers.has('Authorization')) throw new Stage0Error('unauthenticated')
  const origin = request.headers.get('Origin')
  if ((origin !== null && origin !== ctx.config.origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') throw new Stage0Error('forbidden')
  const principal = await resolveSession(ctx, readCookie(request, cookieName(ctx.config)), 'browser')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    if (origin !== ctx.config.origin || !await verifyCsrf(ctx, principal, request.headers.get('X-CSRF-Token') ?? '')) throw new Stage0Error('forbidden')
  }
  return principal
}
