/** Mutate only policy fields. Rebuilding a header record can fold independent
 * Set-Cookie headers, including the session and short-lived federation cookies.
 * Applying policy last prevents adapter extras from weakening private responses.
 */
export function applyPrivateResponseHeaders(headers: Headers, requestId: string): void {
  headers.set('Cache-Control', 'no-store')
  headers.set('Referrer-Policy', 'no-referrer')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('X-Request-ID', requestId)
  headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
}

export function authResponse(ctx: { requestId: string }, body: unknown, status = 200, extra: HeadersInit = {}): Response {
  const headers = new Headers(extra)
  applyPrivateResponseHeaders(headers, ctx.requestId)
  return status === 204 || status === 303 ? new Response(null, { status, headers }) : Response.json(body, { status, headers })
}
