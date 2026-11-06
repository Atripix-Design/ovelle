import { exactObject } from '../../domain/input'
import { readSamlCallbackForm } from './form'
import { readUniqueCookie } from '../../http/cookies'
import type { RequestContext } from '../../contracts'
import { Stage0Error } from '../../errors'
import { authenticateRequest, browserSessionCookie } from '../http'
import { verifyPrelogin } from '../prelogin'
import { equalSecret, secretPattern } from '../secrets'
import { verifyTurnstile } from '../turnstile'
import { authResponse } from '../../http/response'
import { boundedJsonBody } from '../../http/body'
import { readFlowCookie, requireBrowserOrigin, strictFlowCookie } from '../web'
import { validateSamlConnection, type SamlConnectionSettings } from './authorization'
import { confirmSamlContact, getSamlEnrollment, samlEnrollmentCsrf, submitSamlContact } from './enrollment'
import { completeSamlTransaction, startSamlTransaction } from './transactions'

export interface SamlHttpDependencies {
  budgetKey: Uint8Array
  /** Supplied by trusted edge composition, never X-Forwarded-For or a body field. */
  trustedIp: string
  turnstileSecret: string
  /** Only registered server profiles; the selector cannot specify endpoints or keys. */
  getSettings(connectionId: string): Promise<SamlConnectionSettings>
  turnstileFetch?: (url: string, init: RequestInit) => Promise<Response>
}
const connectionPattern = /^[A-Za-z0-9_-]{1,128}$/
const name = (ctx: RequestContext) => ctx.config.environment === 'local' ? 'ovelle_local_saml' : '__Host-ovelle_saml'
function bindingCookie(ctx: RequestContext, value: string, seconds: number): string {
  // Only this independent short-lived binding crosses sites. Ordinary session,
  // pre-login and enrollment cookies retain their existing Strict policy.
  return `${name(ctx)}=${value}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${seconds}`
}
function readBinding(ctx: RequestContext, request: Request) {
  return selection(readUniqueCookie(request, name(ctx)))
}
function selection(value: string) {
  const parts = value.split('.')
  if (parts.length !== 2 || !connectionPattern.test(parts[0]) || !secretPattern.test(parts[1])) throw new Stage0Error('unauthenticated')
  return { connectionId: parts[0], browserBinding: parts[1] }
}
async function profile(deps: SamlHttpDependencies, connectionId: string) {
  const settings = validateSamlConnection(await deps.getSettings(connectionId))
  if (settings.connectionId !== connectionId) throw new Stage0Error('configuration')
  return settings
}

/** Internal composition only, disconnected from the public Worker. The selected
 * profile's entry-point origin must be the real browser form-post origin; other
 * origins and opaque/sandboxed forms need separately reviewed provider support.
 * Signed fixture integration does not establish browser/provider acceptance.
 */
export async function handleSamlRequest(ctx: RequestContext, request: Request, deps: SamlHttpDependencies): Promise<Response> {
  const url = new URL(request.url), match = /^\/api\/v1\/auth\/saml\/(start|link|callback)$/.exec(url.pathname)
  if (url.origin !== ctx.config.origin) return authResponse(ctx, { error: 'forbidden' }, 403)
  const enrollment = /^\/api\/v1\/auth\/saml\/enrollment(\/(contact|confirm))?$/.exec(url.pathname)
  if (!match && !enrollment) return authResponse(ctx, { error: 'not_found' }, 404)
  const expected = enrollment && !enrollment[1] ? 'GET' : 'POST'
  if (request.method !== expected) return authResponse(ctx, { error: 'method_not_allowed' }, 405, { Allow: expected })
  const callback = match?.[1] === 'callback'
  try {
    if (url.search || url.hash) throw new Stage0Error('invalid_input')
    if (enrollment) {
      requireBrowserOrigin(ctx, request, expected === 'POST')
      const pending = selection(readFlowCookie(ctx.config, request, 'saml_enrollment'))
      if (expected === 'POST' && !equalSecret(request.headers.get('X-CSRF-Token') ?? '', await samlEnrollmentCsrf(pending.browserBinding))) throw new Stage0Error('forbidden')
      const settings = await profile(deps, pending.connectionId)
      if (expected === 'GET') return authResponse(ctx, await getSamlEnrollment(ctx, settings, pending.browserBinding))
      const data = exactObject(await boundedJsonBody(request, 4096), enrollment[2] === 'contact' ? ['email', 'displayName'] : ['token'])
      if (enrollment[2] === 'contact') {
        if (typeof data.email !== 'string' || typeof data.displayName !== 'string') throw new Stage0Error('invalid_input')
        await submitSamlContact(ctx, settings, pending.browserBinding, { email: data.email, displayName: data.displayName, ip: deps.trustedIp }, deps.budgetKey)
        return authResponse(ctx, { accepted: true }, 202)
      }
      if (typeof data.token !== 'string') throw new Stage0Error('invalid_input')
      const session = await confirmSamlContact(ctx, settings, pending.browserBinding, data.token, deps.trustedIp, deps.budgetKey)
      const headers = new Headers({ 'Set-Cookie': await browserSessionCookie(ctx, session) })
      headers.append('Set-Cookie', strictFlowCookie(ctx.config, 'saml_enrollment', '', 0))
      return authResponse(ctx, null, 204, headers)
    }
    if (callback) {
      if (request.headers.has('Authorization') || (request.headers.has('Sec-Fetch-Mode') && request.headers.get('Sec-Fetch-Mode') !== 'navigate')
        || (request.headers.has('Sec-Fetch-Dest') && request.headers.get('Sec-Fetch-Dest') !== 'document')) throw new Stage0Error('forbidden')
      const binding = readBinding(ctx, request), settings = await profile(deps, binding.connectionId)
      if (request.headers.get('Origin') !== new URL(settings.entryPoint).origin) throw new Stage0Error('forbidden')
      const input = await readSamlCallbackForm(request)
      const result = await completeSamlTransaction(ctx, settings, { ...input, browserBinding: binding.browserBinding }, deps.trustedIp, deps.budgetKey)
      const headers = new Headers({ Location: result.kind === 'linked' ? '/account/security' : result.kind === 'enrollment' ? '/account/enroll' : '/account', 'Set-Cookie': bindingCookie(ctx, '', 0) })
      headers.append('Set-Cookie', strictFlowCookie(ctx.config, 'prelogin', '', 0))
      if (result.kind === 'enrollment') headers.append('Set-Cookie', strictFlowCookie(ctx.config, 'saml_enrollment', `${settings.connectionId}.${result.token}`, Math.max(0, Math.floor((result.expiresAt - ctx.clock.now()) / 1000))))
      if (result.kind === 'signed_in') {
        headers.append('Set-Cookie', await browserSessionCookie(ctx, result.session))
        headers.append('Set-Cookie', strictFlowCookie(ctx.config, 'enrollment', '', 0))
        headers.append('Set-Cookie', strictFlowCookie(ctx.config, 'saml_enrollment', '', 0))
      }
      return authResponse(ctx, null, 303, headers)
    }
    requireBrowserOrigin(ctx, request, true)
    const principal = match![1] === 'link' ? await authenticateRequest(ctx, request, 'browser') : undefined
    if (!principal) await verifyPrelogin(ctx, request, deps.budgetKey)
    const data = exactObject(await boundedJsonBody(request, 4096), ['connectionId', 'turnstileToken'])
    if (typeof data.connectionId !== 'string' || !connectionPattern.test(data.connectionId)
      || typeof data.turnstileToken !== 'string' || !data.turnstileToken || data.turnstileToken.length > 2048) throw new Stage0Error('invalid_input')
    const settings = await profile(deps, data.connectionId)
    const started = await startSamlTransaction(ctx, settings, { purpose: principal ? 'link' : 'login', principal, ip: deps.trustedIp }, deps.budgetKey,
      () => verifyTurnstile(ctx, deps.turnstileSecret, data.turnstileToken as string, deps.trustedIp, principal ? 'saml_link' : 'saml_login', deps.turnstileFetch))
    const headers = new Headers({ 'Set-Cookie': bindingCookie(ctx, `${settings.connectionId}.${started.browserBinding}`, 300) })
    headers.append('Set-Cookie', strictFlowCookie(ctx.config, 'prelogin', '', 0))
    return authResponse(ctx, { authorizationUrl: started.authorizationUrl }, 200, headers)
  } catch (error) {
    if (callback) return authResponse(ctx, null, 303, { Location: '/account/sign-in?result=failed', 'Set-Cookie': bindingCookie(ctx, '', 0) })
    return error instanceof Stage0Error ? authResponse(ctx, { error: error.code }, error.status) : authResponse(ctx, { error: 'unavailable' }, 503)
  }
}
