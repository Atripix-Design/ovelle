import type { RequestContext } from '../contracts'
import { Stage0Error } from '../errors'
import { authenticateRequest } from './http'
import { getRecoveryCodeStatus, rotateRecoveryCodes } from './recovery'
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
