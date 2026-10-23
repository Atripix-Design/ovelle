import type { Principal, RequestContext } from '../contracts'
import { Stage0Error } from '../errors'
import { getOwnAccount } from './accounts'
import { authenticateRequest, browserCsrfToken, browserSessionCookie, clearBrowserSessionCookie } from './http'
import { revokeAllSessions, revokeSession, rotateSession } from './sessions'

function response(ctx: RequestContext, body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  const headers = {
    'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff', 'X-Request-ID': ctx.requestId, ...extra,
  }
  return status === 204 ? new Response(null, { status, headers }) : Response.json(body, { status, headers })
}

/** Internal session HTTP adapter. Deliberately not imported by the public Worker:
 * protocol verification, abuse controls and rollout prerequisites must be ready
 * before a composition root can enable it. Transport comes from a fixed server
 * route, never from a header, body or query parameter supplied by the client.
 */
export async function handleSessionRequest(ctx: RequestContext, request: Request, transport: Principal['transport']): Promise<Response> {
  const path = new URL(request.url).pathname
  const expectedMethod = path === '/api/v1/me' ? 'GET'
    : ['/api/v1/auth/logout', '/api/v1/auth/logout-all'].includes(path) || (transport === 'browser' && path === '/api/v1/auth/session/rotate') ? 'POST' : null
  if (!expectedMethod) return response(ctx, { error: 'not_found' }, 404)
  if (request.method !== expectedMethod) return response(ctx, { error: 'method_not_allowed' }, 405, { Allow: expectedMethod })
  try {
    const principal = await authenticateRequest(ctx, request, transport)
    if (path === '/api/v1/me') {
      const account = await getOwnAccount(ctx, principal)
      const csrfToken = transport === 'browser' ? await browserCsrfToken(ctx, request) : null
      const { assurance, method, authenticatedAt, passkeyVerifiedAt } = principal
      return response(ctx, { account, session: { assurance, method, authenticatedAt, passkeyVerifiedAt }, csrfToken })
    }
    if (path === '/api/v1/auth/session/rotate') {
      const next = await rotateSession(ctx, principal)
      const cookie = await browserSessionCookie(ctx, next)
      return response(ctx, { csrfToken: next.csrfToken }, 200, { 'Set-Cookie': cookie })
    }
    if (path === '/api/v1/auth/logout-all') await revokeAllSessions(ctx, principal)
    else await revokeSession(ctx, principal, principal.sessionId)
    return response(ctx, null, 204, transport === 'browser' ? { 'Set-Cookie': clearBrowserSessionCookie(ctx.config) } : {})
  } catch (error) {
    // SQL/provider/runtime messages may contain private details. They are never
    // reflected to clients; operational logging must use redacted event fields.
    return error instanceof Stage0Error ? response(ctx, { error: error.code }, error.status) : response(ctx, { error: 'unavailable' }, 503)
  }
}
