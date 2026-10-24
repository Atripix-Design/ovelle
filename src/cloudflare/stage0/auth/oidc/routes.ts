import type { CustomFetch } from 'openid-client'
import type { RequestContext } from '../../contracts'
import { Stage0Error } from '../../errors'
import { authenticateRequest, browserSessionCookie } from '../http'
import { beginPrelogin, verifyPrelogin } from '../prelogin'
import { equalSecret, secretPattern } from '../secrets'
import type { IssuedSession } from '../sessions'
import { verifyTurnstile } from '../turnstile'
import { authResponse, boundedJsonBody, readFlowCookie, requireBrowserOrigin, strictFlowCookie } from '../web'
import { confirmOidcContact, enrollmentCsrf, getOidcEnrollment, submitOidcContact } from './enrollment'
import type { OidcProvider, OidcSettings } from './protocol'
import { completeOidcTransaction, oidcBindingCookie, readOidcBindingCookie, startOidcTransaction } from './transactions'

export interface OidcHttpDependencies {
  budgetKey: Uint8Array
  /** Canonical edge-owned address from the composition root; never read
   * X-Forwarded-For or accept a body/header-selected IP in this adapter. */
  trustedIp: string
  turnstileSecret: string
  /** Controlled server configuration lookup, with no caller-selected endpoints. */
  getSettings(provider: OidcProvider): Promise<OidcSettings>
  providerFetch?: CustomFetch
  turnstileFetch?: (url: string, init: RequestInit) => Promise<Response>
}
async function body(request: Request, fields: string[]): Promise<Record<string, unknown>> {
  const parsed = await boundedJsonBody(request, 4096)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).some(key => !fields.includes(key))) throw new Stage0Error('invalid_input')
  return parsed as Record<string, unknown>
}
async function enrollmentToken(ctx: RequestContext, request: Request, mutation: boolean): Promise<string> {
  requireBrowserOrigin(ctx, request, mutation)
  const token = readFlowCookie(ctx.config, request, 'enrollment')
  if (!secretPattern.test(token)) throw new Stage0Error('unauthenticated')
  if (mutation && !equalSecret(request.headers.get('X-CSRF-Token') ?? '', await enrollmentCsrf(token))) throw new Stage0Error('forbidden')
  return token
}
async function sessionHeaders(ctx: RequestContext, session: IssuedSession): Promise<Headers> {
  const headers = new Headers()
  headers.append('Set-Cookie', await browserSessionCookie(ctx, session))
  headers.append('Set-Cookie', strictFlowCookie(ctx.config, 'enrollment', '', 0))
  return headers
}

/** Internal browser adapter, intentionally disconnected from worker.ts. A
 * future composition root must satisfy rollout gates, supply trusted dependencies
 * and route these fixed paths. Provider/client secrets and sessions never enter
 * JSON, redirects, logs or renderer IPC. This adapter does not enable live auth.
 */
export async function handleOidcRequest(ctx: RequestContext, request: Request, deps: OidcHttpDependencies): Promise<Response> {
  const url = new URL(request.url)
  if (url.origin !== ctx.config.origin) return authResponse(ctx, { error: 'forbidden' }, 403)
  const match = /^\/api\/v1\/auth\/oidc\/(google|microsoft)\/(start|link|recovery|callback)$/.exec(url.pathname)
  const callback = match?.[2] === 'callback'
  const expected = match ? callback ? 'GET' : 'POST' : ['/api/v1/auth/prelogin', '/api/v1/auth/enrollment'].includes(url.pathname) ? 'GET'
    : ['/api/v1/auth/enrollment/contact', '/api/v1/auth/enrollment/confirm'].includes(url.pathname) ? 'POST' : null
  if (!expected) return authResponse(ctx, { error: 'not_found' }, 404)
  if (request.method !== expected) return authResponse(ctx, { error: 'method_not_allowed' }, 405, { Allow: expected })
  try {
    if (url.pathname === '/api/v1/auth/prelogin') {
      const initial = await beginPrelogin(ctx, request, deps.budgetKey)
      return authResponse(ctx, { csrfToken: initial.csrfToken }, 200, { 'Set-Cookie': initial.cookie })
    }
    if (match) {
      const provider = match[1] as OidcProvider
      if (callback) {
        if (request.url.length > 8192 || request.headers.has('Authorization') || (request.headers.has('Origin') && request.headers.get('Origin') !== ctx.config.origin)
          || (request.headers.has('Sec-Fetch-Mode') && request.headers.get('Sec-Fetch-Mode') !== 'navigate')
          || (request.headers.has('Sec-Fetch-Dest') && request.headers.get('Sec-Fetch-Dest') !== 'document')) throw new Stage0Error('forbidden')
        const settings = await deps.getSettings(provider)
        if (settings.provider !== provider) throw new Stage0Error('configuration')
        const result = await completeOidcTransaction(ctx, settings, url, readOidcBindingCookie(ctx.config, request), deps.providerFetch)
        const headers = result.kind === 'signed_in' || result.kind === 'recovery' ? await sessionHeaders(ctx, result.session) : new Headers()
        headers.append('Set-Cookie', oidcBindingCookie(ctx.config, null))
        headers.append('Set-Cookie', strictFlowCookie(ctx.config, 'prelogin', '', 0))
        if (result.kind === 'enrollment') headers.append('Set-Cookie', strictFlowCookie(ctx.config, 'enrollment', result.token, 900))
        headers.set('Location', result.kind === 'recovery' ? '/account/recover' : result.kind === 'signed_in' ? '/account' : result.kind === 'linked' ? '/account/security' : '/account/enroll')
        return authResponse(ctx, null, 303, headers)
      }
      requireBrowserOrigin(ctx, request, true)
      const principal = match[2] === 'link' ? await authenticateRequest(ctx, request, 'browser') : undefined
      if (!principal) await verifyPrelogin(ctx, request, deps.budgetKey)
      const parsed = await body(request, ['turnstileToken'])
      if (typeof parsed.turnstileToken !== 'string' || !parsed.turnstileToken || parsed.turnstileToken.length > 2048) throw new Stage0Error('invalid_input')
      const settings = await deps.getSettings(provider)
      if (settings.provider !== provider) throw new Stage0Error('configuration')
      const started = await startOidcTransaction(ctx, settings, { purpose: principal ? 'link' : match[2] === 'recovery' ? 'recovery' : 'login', principal, ip: deps.trustedIp }, deps.budgetKey, deps.providerFetch,
        () => verifyTurnstile(ctx, deps.turnstileSecret, parsed.turnstileToken as string, deps.trustedIp, principal ? 'oidc_link' : match[2] === 'recovery' ? 'oidc_recovery' : 'oidc_login', deps.turnstileFetch))
      const headers = new Headers({ 'Set-Cookie': oidcBindingCookie(ctx.config, started.browserBinding) })
      headers.append('Set-Cookie', strictFlowCookie(ctx.config, 'prelogin', '', 0))
      return authResponse(ctx, { authorizationUrl: started.authorizationUrl }, 200, headers)
    }
    const token = await enrollmentToken(ctx, request, expected === 'POST')
    if (url.pathname === '/api/v1/auth/enrollment') return authResponse(ctx, await getOidcEnrollment(ctx, token))
    if (url.pathname === '/api/v1/auth/enrollment/contact') {
      const parsed = await body(request, ['email', 'displayName'])
      if (typeof parsed.email !== 'string' || typeof parsed.displayName !== 'string') throw new Stage0Error('invalid_input')
      const session = await submitOidcContact(ctx, token, { email: parsed.email, displayName: parsed.displayName, ip: deps.trustedIp }, deps.budgetKey)
      return authResponse(ctx, { accepted: true }, 202, session ? await sessionHeaders(ctx, session) : {})
    }
    const parsed = await body(request, ['token'])
    if (typeof parsed.token !== 'string') throw new Stage0Error('invalid_input')
    const session = await confirmOidcContact(ctx, token, parsed.token, deps.trustedIp, deps.budgetKey)
    return authResponse(ctx, null, 204, await sessionHeaders(ctx, session))
  } catch (error) {
    if (callback) {
      const headers = new Headers({ Location: '/account/sign-in?result=failed' })
      headers.append('Set-Cookie', oidcBindingCookie(ctx.config, null))
      return authResponse(ctx, null, 303, headers)
    }
    return error instanceof Stage0Error ? authResponse(ctx, { error: error.code }, error.status) : authResponse(ctx, { error: 'unavailable' }, 503)
  }
}
