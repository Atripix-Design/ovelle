import type { RequestContext } from '../contracts'
import { Stage0Error } from '../errors'
import { authenticateRequest, browserSessionCookie } from './http'
import { consumeRecoveryCode, getRecoveryCodeStatus, rotateRecoveryCodes } from './recovery'
import { authResponse, boundedJsonBody, requireBrowserOrigin } from './web'

/** Internal browser adapter. Explicit POST confirmation prevents accidental
 * rotation; existing cookie/CSRF checks own identity and assurance server-side.
 * No public Worker routing or recovery consumption is enabled here. */
export async function handleRecoveryCodeRequest(ctx: RequestContext, request: Request): Promise<Response> {
  const url = new URL(request.url)
  if (url.pathname !== '/api/v1/auth/recovery/codes') return authResponse(ctx, { error: 'not_found' }, 404)
  if (!['GET', 'POST'].includes(request.method)) return authResponse(ctx, { error: 'method_not_allowed' }, 405, { Allow: 'GET, POST' })
  try {
    requireBrowserOrigin(ctx, request, request.method === 'POST')
    const principal = await authenticateRequest(ctx, request, 'browser')
    if (url.search) throw new Stage0Error('invalid_input')
    if (request.method === 'GET') return authResponse(ctx, await getRecoveryCodeStatus(ctx, principal))
    const body = await boundedJsonBody(request, 4096)
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['expectedVersion', 'confirmation'].includes(key))) throw new Stage0Error('invalid_input')
    const input = body as Record<string, unknown>
    if (input.confirmation !== true || typeof input.expectedVersion !== 'number') throw new Stage0Error('invalid_input')
    return authResponse(ctx, await rotateRecoveryCodes(ctx, principal, input.expectedVersion))
  } catch (error) {
    return error instanceof Stage0Error ? authResponse(ctx, { error: error.code }, error.status) : authResponse(ctx, { error: 'unavailable' }, 503)
  }
}

/** Internal replacement authorization only. Proof comes from the dedicated OIDC
 * recovery callback; body/account selectors and ordinary login cannot supply it. */
export async function handleRecoveryRequest(ctx: RequestContext, request: Request, deps: { trustedIp: string; budgetKey: Uint8Array }): Promise<Response> {
  const url = new URL(request.url)
  if (url.pathname !== '/api/v1/auth/recovery/consume') return authResponse(ctx, { error: 'not_found' }, 404)
  if (request.method !== 'POST') return authResponse(ctx, { error: 'method_not_allowed' }, 405, { Allow: 'POST' })
  try {
    requireBrowserOrigin(ctx, request, true)
    const principal = await authenticateRequest(ctx, request, 'browser')
    if (url.search) throw new Stage0Error('invalid_input')
    const parsed = await boundedJsonBody(request, 4096)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).some(key => !['code', 'confirmation'].includes(key))) throw new Stage0Error('invalid_input')
    const body = parsed as Record<string, unknown>
    if (body.confirmation !== true || typeof body.code !== 'string' || body.code.length > 128) throw new Stage0Error('invalid_input')
    const session = await consumeRecoveryCode(ctx, principal, body.code, deps.trustedIp, deps.budgetKey)
    return authResponse(ctx, null, 204, { 'Set-Cookie': await browserSessionCookie(ctx, session) })
  } catch (error) {
    return error instanceof Stage0Error ? authResponse(ctx, { error: error.code }, error.status) : authResponse(ctx, { error: 'unavailable' }, 503)
  }
}
