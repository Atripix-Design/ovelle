import type { Stage0Config } from '../config'
import type { RequestContext } from '../contracts'
import { Stage0Error } from '../errors'

export function requireBrowserOrigin(ctx: RequestContext, request: Request, mutation: boolean): void {
  const origin = request.headers.get('Origin')
  if (new URL(request.url).origin !== ctx.config.origin || request.headers.has('Authorization') || request.headers.get('Sec-Fetch-Site') === 'cross-site'
    || (mutation ? origin !== ctx.config.origin : origin !== null && origin !== ctx.config.origin)) throw new Stage0Error('forbidden')
}
export function cookieName(config: Stage0Config, purpose: 'prelogin' | 'enrollment' | 'passkey'): string {
  return config.environment === 'local' ? `ovelle_local_${purpose}` : `__Host-ovelle_${purpose}`
}
export function strictFlowCookie(config: Stage0Config, purpose: 'prelogin' | 'enrollment' | 'passkey', value: string, seconds: number): string {
  return `${cookieName(config, purpose)}=${value}; Path=/; HttpOnly;${config.environment === 'local' ? '' : ' Secure;'} SameSite=Strict; Max-Age=${Math.max(0, seconds)}`
}
export function readFlowCookie(config: Stage0Config, request: Request, purpose: 'prelogin' | 'enrollment' | 'passkey'): string {
  const name = cookieName(config, purpose)
  const values = (request.headers.get('Cookie') ?? '').split(';').flatMap(part => {
    const index = part.indexOf('=')
    return index >= 0 && part.slice(0, index).trim() === name ? [part.slice(index + 1).trim()] : []
  })
  if (values.length !== 1) throw new Stage0Error('unauthenticated')
  return values[0]
}
export async function boundedJsonBody(source: { body: ReadableStream<Uint8Array> | null; headers: Headers }, limit: number): Promise<unknown> {
  if (source.headers.get('Content-Type')?.toLowerCase().split(';')[0].trim() !== 'application/json' || !source.body) throw new Stage0Error('invalid_input')
  const reader = source.body.getReader()
  let size = 0
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > limit) throw new Stage0Error('invalid_input')
      chunks.push(next.value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)) }
    catch { throw new Stage0Error('invalid_input') }
  } finally { await reader.cancel() }
}
export function authResponse(ctx: RequestContext, body: unknown, status = 200, extra: HeadersInit = {}): Response {
  const headers = new Headers(extra)
  headers.set('Cache-Control', 'no-store')
  headers.set('Referrer-Policy', 'no-referrer')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('X-Request-ID', ctx.requestId)
  headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
  return status === 204 || status === 303 ? new Response(null, { status, headers }) : Response.json(body, { status, headers })
}
