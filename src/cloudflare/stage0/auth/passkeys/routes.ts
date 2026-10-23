import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server'
import type { RequestContext } from '../../contracts'
import { Stage0Error } from '../../errors'
import { authenticateRequest, browserSessionCookie } from '../http'
import { verifyPrelogin } from '../prelogin'
import { equalSecret, secretMac, secretPattern } from '../secrets'
import { verifyTurnstile } from '../turnstile'
import { authResponse, boundedJsonBody, readFlowCookie, requireBrowserOrigin, strictFlowCookie } from '../web'
import { beginPasskeyAuthentication, beginPasskeyRegistration, finishPasskeyAuthentication, finishPasskeyRegistration } from './service'

export interface PasskeyHttpDependencies {
  budgetKey: Uint8Array
  trustedIp: string
  turnstileSecret: string
  turnstileFetch?: (url: string, init: RequestInit) => Promise<Response>
}
const flowCsrf = (token: string) => secretMac(token, ['ovelle:passkey-flow-csrf:v1'])
async function body(request: Request, fields: string[], limit: number): Promise<Record<string, unknown>> {
  const parsed = await boundedJsonBody(request, limit)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).some(key => !fields.includes(key))) throw new Stage0Error('invalid_input')
  return parsed as Record<string, unknown>
}
/** Internal adapter only. Public Worker routing and provider/rollout gates remain
 * closed. Real browser transport owns credentials; renderer DTOs cannot select
 * trusted IP, transport, verifier policy or authentication provenance. */
export async function handlePasskeyRequest(ctx: RequestContext, request: Request, deps: PasskeyHttpDependencies): Promise<Response> {
  const url = new URL(request.url)
  const match = /^\/api\/v1\/auth\/passkeys\/(register|login|step-up)\/(start|finish)$/.exec(url.pathname)
  if (!match) return authResponse(ctx, { error: 'not_found' }, 404)
  if (request.method !== 'POST') return authResponse(ctx, { error: 'method_not_allowed' }, 405, { Allow: 'POST' })
  try {
    requireBrowserOrigin(ctx, request, true)
    const login = match[1] === 'login'
    const principal = login ? null : await authenticateRequest(ctx, request, 'browser')
    if (match[2] === 'start') {
      const parsed = await body(request, login ? ['turnstileToken'] : [], 4096)
      if (login) await verifyPrelogin(ctx, request, deps.budgetKey)
      if (login && (typeof parsed.turnstileToken !== 'string' || !parsed.turnstileToken || parsed.turnstileToken.length > 2048)) throw new Stage0Error('invalid_input')
      const started = match[1] === 'register' ? await beginPasskeyRegistration(ctx, principal!, deps.trustedIp, deps.budgetKey)
        : await beginPasskeyAuthentication(ctx, principal, deps.trustedIp, deps.budgetKey, login
          ? () => verifyTurnstile(ctx, deps.turnstileSecret, parsed.turnstileToken as string, deps.trustedIp, 'passkey_login', deps.turnstileFetch) : undefined)
      const headers = new Headers({ 'Set-Cookie': strictFlowCookie(ctx.config, 'passkey', started.flowToken, 300) })
      if (login) headers.append('Set-Cookie', strictFlowCookie(ctx.config, 'prelogin', '', 0))
      return authResponse(ctx, { options: started.options, ...(login ? { csrfToken: await flowCsrf(started.flowToken) } : {}) }, 200, headers)
    }
    const token = readFlowCookie(ctx.config, request, 'passkey')
    if (!secretPattern.test(token)) throw new Stage0Error('unauthenticated')
    if (login && !equalSecret(request.headers.get('X-CSRF-Token') ?? '', await flowCsrf(token))) throw new Stage0Error('forbidden')
    const parsed = await body(request, match[1] === 'register' ? ['response', 'name'] : ['response'], 65_536)
    if (!parsed.response || typeof parsed.response !== 'object' || Array.isArray(parsed.response)) throw new Stage0Error('invalid_input')
    const registered = match[1] === 'register' ? await finishPasskeyRegistration(ctx, principal!, token, parsed.response as RegistrationResponseJSON, parsed.name as string, deps.trustedIp, deps.budgetKey) : null
    const session = registered?.session ?? await finishPasskeyAuthentication(ctx, principal, token, parsed.response as AuthenticationResponseJSON, deps.trustedIp, deps.budgetKey)
    const headers = new Headers({ 'Set-Cookie': await browserSessionCookie(ctx, session) })
    headers.append('Set-Cookie', strictFlowCookie(ctx.config, 'passkey', '', 0))
    return authResponse(ctx, registered ? { passkey: registered.passkey } : null, registered ? 200 : 204, headers)
  } catch (error) {
    return error instanceof Stage0Error ? authResponse(ctx, { error: error.code }, error.status) : authResponse(ctx, { error: 'unavailable' }, 503)
  }
}
