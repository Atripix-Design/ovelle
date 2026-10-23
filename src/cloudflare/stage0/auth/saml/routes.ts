import type { RequestContext } from '../../contracts'
import { Stage0Error } from '../../errors'
import { authenticateRequest, browserSessionCookie } from '../http'
import { verifyPrelogin } from '../prelogin'
import { secretPattern } from '../secrets'
import { verifyTurnstile } from '../turnstile'
import { authResponse, boundedJsonBody, requireBrowserOrigin, strictFlowCookie } from '../web'
import { validateSamlConnection, type SamlConnectionSettings } from './authorization'
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
  const values = (request.headers.get('Cookie') ?? '').split(';').flatMap(part => {
    const i = part.indexOf('=')
    return i >= 0 && part.slice(0, i).trim() === name(ctx) ? [part.slice(i + 1).trim()] : []
  })
  const parts = values.length === 1 ? values[0].split('.') : []
  if (parts.length !== 2 || !connectionPattern.test(parts[0]) || !secretPattern.test(parts[1])) throw new Stage0Error('unauthenticated')
  return { connectionId: parts[0], browserBinding: parts[1] }
}
async function profile(deps: SamlHttpDependencies, connectionId: string) {
  const settings = validateSamlConnection(await deps.getSettings(connectionId))
  if (settings.connectionId !== connectionId) throw new Stage0Error('configuration')
  return settings
}
async function form(request: Request): Promise<{ relayState: string; response: string }> {
  // Bound bytes before decoding: the maximal base64 XML may be percent-escaped.
  // URLSearchParams alone tolerates broken escapes and duplicate field names.
  const content = request.headers.get('Content-Type')?.toLowerCase()
  if (!content || !/^application\/x-www-form-urlencoded(?:\s*;\s*charset=utf-8)?\s*$/.test(content) || !request.body) throw new Stage0Error('invalid_input')
  const reader = request.body.getReader(), chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > 270_000) throw new Stage0Error('invalid_input')
      chunks.push(next.value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)
    const fields = new Map<string, string>()
    for (const pair of text.split('&')) {
      const i = pair.indexOf('=')
      if (i < 1) throw new Stage0Error('invalid_input')
      const key = decodeURIComponent(pair.slice(0, i).replaceAll('+', ' ')), value = decodeURIComponent(pair.slice(i + 1).replaceAll('+', ' '))
      if (!['SAMLResponse', 'RelayState'].includes(key) || fields.has(key)) throw new Stage0Error('invalid_input')
      fields.set(key, value)
    }
    if (fields.size !== 2) throw new Stage0Error('invalid_input')
    return { relayState: fields.get('RelayState')!, response: fields.get('SAMLResponse')! }
  } finally { await reader.cancel() }
}

/** Internal composition only, disconnected from the public Worker. The selected
 * profile's entry-point origin must be the real browser form-post origin; other
 * origins and opaque/sandboxed forms need separately reviewed provider support.
 * Signed fixture integration does not establish browser/provider acceptance.
 */
export async function handleSamlRequest(ctx: RequestContext, request: Request, deps: SamlHttpDependencies): Promise<Response> {
  const url = new URL(request.url), match = /^\/api\/v1\/auth\/saml\/(start|link|callback)$/.exec(url.pathname)
  if (url.origin !== ctx.config.origin) return authResponse(ctx, { error: 'forbidden' }, 403)
  if (!match) return authResponse(ctx, { error: 'not_found' }, 404)
  if (request.method !== 'POST') return authResponse(ctx, { error: 'method_not_allowed' }, 405, { Allow: 'POST' })
  const callback = match[1] === 'callback'
  try {
    if (url.search || url.hash) throw new Stage0Error('invalid_input')
    if (callback) {
      if (request.headers.has('Authorization') || (request.headers.has('Sec-Fetch-Mode') && request.headers.get('Sec-Fetch-Mode') !== 'navigate')
        || (request.headers.has('Sec-Fetch-Dest') && request.headers.get('Sec-Fetch-Dest') !== 'document')) throw new Stage0Error('forbidden')
      const binding = readBinding(ctx, request), settings = await profile(deps, binding.connectionId)
      if (request.headers.get('Origin') !== new URL(settings.entryPoint).origin) throw new Stage0Error('forbidden')
      const input = await form(request)
      const result = await completeSamlTransaction(ctx, settings, { ...input, browserBinding: binding.browserBinding }, deps.trustedIp, deps.budgetKey)
      const headers = new Headers({ Location: result.kind === 'linked' ? '/account/security' : '/account', 'Set-Cookie': bindingCookie(ctx, '', 0) })
      headers.append('Set-Cookie', strictFlowCookie(ctx.config, 'prelogin', '', 0))
      if (result.kind === 'signed_in') {
        headers.append('Set-Cookie', await browserSessionCookie(ctx, result.session))
        headers.append('Set-Cookie', strictFlowCookie(ctx.config, 'enrollment', '', 0))
      }
      return authResponse(ctx, null, 303, headers)
    }
    requireBrowserOrigin(ctx, request, true)
    const principal = match[1] === 'link' ? await authenticateRequest(ctx, request, 'browser') : undefined
    if (!principal) await verifyPrelogin(ctx, request, deps.budgetKey)
    const parsed = await boundedJsonBody(request, 4096)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Stage0Error('invalid_input')
    const data = parsed as Record<string, unknown>
    if (Object.keys(data).some(key => !['connectionId', 'turnstileToken'].includes(key)) || typeof data.connectionId !== 'string' || !connectionPattern.test(data.connectionId)
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
