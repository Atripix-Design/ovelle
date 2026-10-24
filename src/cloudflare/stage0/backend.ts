import type { D1Database, SendEmail } from '@cloudflare/workers-types'
import type { CustomFetch } from 'openid-client'
import { loadStage0Config } from './config'
import type { Clock, Ids, Principal, RequestContext } from './contracts'
import { Stage0Error } from './errors'
import { handleOrganizationRequest } from './access/routes'
import { handleStaffAccessRequest } from './staff/access-routes'
import { handleStaffInvitationRequest } from './staff/routes'
import { createAuthMailer } from './auth/mail'
import { createOidcSettingsResolver } from './auth/oidc/settings'
import { handleOidcRequest } from './auth/oidc/routes'
import { handleSamlRequest, type SamlHttpDependencies } from './auth/saml/routes'
import { handlePasskeyRequest } from './auth/passkeys/routes'
import { handleRecoveryCodeRequest, handleRecoveryRequest } from './auth/recovery-routes'
import { handleDesktopAuthRequest } from './auth/desktop-routes'
import { handleSessionRequest } from './auth/routes'
import { authResponse } from './auth/web'

export interface Stage0BackendResources {
  db: D1Database
  email: Pick<SendEmail, 'send'>
  clock?: Clock
  ids?: Ids
  /** Trusted server profile registry only; this does not implement its lifecycle. */
  getSamlSettings?: SamlHttpDependencies['getSettings']
  /** Network seams are server-owned, never selected by HTTP fields or env flags. */
  providerFetch?: CustomFetch
  turnstileFetch?: SamlHttpDependencies['turnstileFetch']
}
export interface Stage0Backend {
  fetch(request: Request, trustedIp: string): Promise<Response>
  browser(request: Request, trustedIp: string): Promise<Response>
  desktop(request: Request, trustedIp: string): Promise<Response>
}
type Kind = 'oidc' | 'saml' | 'passkey' | 'recovery_codes' | 'recovery' | 'handoff' | 'session' | 'organization' | 'invitation' | 'staff'

function route(path: string, transport: Principal['transport']): Kind | null {
  if (transport === 'browser') {
    if (/^\/api\/v1\/auth\/oidc\/(google|microsoft)\/(start|link|recovery|callback)$/.test(path)
      || /^\/api\/v1\/auth\/(prelogin|enrollment(?:\/(contact|confirm))?)$/.test(path)) return 'oidc'
    if (/^\/api\/v1\/auth\/saml\/(start|link|callback|enrollment(?:\/(contact|confirm))?)$/.test(path)) return 'saml'
    if (/^\/api\/v1\/auth\/passkeys\/(register|login|step-up)\/(start|finish)$/.test(path)) return 'passkey'
    if (path === '/api/v1/auth/recovery/codes') return 'recovery_codes'
    if (path === '/api/v1/auth/recovery/consume') return 'recovery'
    if (path === '/api/v1/auth/desktop/approve') return 'handoff'
    if (path === '/api/v1/auth/session/rotate') return 'session'
  } else if (/^\/api\/v1\/auth\/desktop\/(requests|exchange)$/.test(path)) return 'handoff'
  if (path === '/api/v1/me' || /^\/api\/v1\/auth\/(logout|logout-all)$/.test(path)) return 'session'
  if (/^\/api\/v1\/invitations\/(preview|accept)$/.test(path)
    || /^\/api\/v1\/organizations\/[^/]+\/invitations(?:\/[^/]+(?:\/(resend|revoke))?)?$/.test(path)) return 'invitation'
  if (/^\/api\/v1\/organizations\/[^/]+\/(memberships(?:\/[^/]+(?:\/(grants|revoke))?)?|ownership-transfer(?:\/[^/]+(?:\/(accept|revoke))?)?)$/.test(path)) return 'staff'
  if (path === '/api/v1/organizations' || path === '/api/v1/me/organizations'
    || /^\/api\/v1\/organizations\/[^/]+(?:\/(programs|locations)(?:\/[^/]+)?|\/(policies|audit))?$/.test(path)) return 'organization'
  return null
}

function admissionKey(input: unknown): Uint8Array {
  try {
    if (typeof input !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(input)) throw new Error()
    const bytes = Uint8Array.from(atob(input.replaceAll('-', '+').replaceAll('_', '/')+'='), value => value.charCodeAt(0))
    const canonical = btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
    if (bytes.length !== 32 || canonical !== input) throw new Error()
    return bytes
  } catch { throw new Stage0Error('configuration') }
}

/** Internal hosted composition only. Importing or constructing this object does
 * not register a public route. The future Worker must choose a fixed entry point
 * and supply its edge-owned IP. Never choose transport from headers, JSON, query
 * parameters or the presence/absence of credentials. Public rollout stays gated.
 */
export function createStage0Backend(bindings: Record<string, unknown>, resources: Stage0BackendResources): Readonly<Stage0Backend> {
  const config = Object.freeze(loadStage0Config(bindings))
  const budgetKey = admissionKey(bindings.AUTH_ADMISSION_KEY)
  const db = resources.db
  if (typeof db?.prepare !== 'function' || typeof db?.batch !== 'function') throw new Stage0Error('configuration')
  const mailer = createAuthMailer(config, resources.email)
  const getSettings = createOidcSettingsResolver(db, bindings)
  const clock = Object.freeze({ now: resources.clock ? resources.clock.now.bind(resources.clock) : () => Date.now() })
  const ids = Object.freeze({ next: resources.ids ? resources.ids.next.bind(resources.ids) : () => crypto.randomUUID() })
  const { providerFetch, turnstileFetch } = resources
  const getSamlSettings = resources.getSamlSettings ?? (async () => { throw new Stage0Error('configuration') })
  const turnstileSecret = bindings.TURNSTILE_SECRET_KEY as string

  async function serve(transport: Principal['transport'], request: Request, trustedIp: string): Promise<Response> {
    const ctx: RequestContext = { db, config, clock, ids, mailer, requestId: crypto.randomUUID() }
    let response: Response
    try {
      // A server input is required even for reads: do not silently collapse a
      // missing edge address into one shared quota or trust forwarded headers.
      if (typeof trustedIp !== 'string' || !trustedIp || trustedIp.length > 64 || !/^[a-fA-F0-9:.]+$/.test(trustedIp)) throw new Stage0Error('configuration')
      const url = new URL(request.url)
      if (url.origin !== config.origin) throw new Stage0Error('forbidden')
      const kind = route(url.pathname, transport)
      if (!kind) throw new Stage0Error('not_found')
      const callbackQuery = kind === 'oidc' && url.pathname.endsWith('/callback') && request.method === 'GET'
      if (url.hash || (url.search && !callbackQuery && !(kind === 'organization' && request.method === 'GET'))) throw new Stage0Error('invalid_input')
      const admission = { budgetKey, trustedIp }
      switch (kind) {
        case 'oidc': response = await handleOidcRequest(ctx, request, { ...admission, turnstileSecret, getSettings, providerFetch, turnstileFetch }); break
        case 'saml': response = await handleSamlRequest(ctx, request, { ...admission, turnstileSecret, getSettings: getSamlSettings, turnstileFetch }); break
        case 'passkey': response = await handlePasskeyRequest(ctx, request, { ...admission, turnstileSecret, turnstileFetch }); break
        case 'recovery_codes': response = await handleRecoveryCodeRequest(ctx, request); break
        case 'recovery': response = await handleRecoveryRequest(ctx, request, admission); break
        case 'handoff': response = await handleDesktopAuthRequest(ctx, request, trustedIp, budgetKey); break
        case 'session': response = await handleSessionRequest(ctx, request, transport); break
        case 'organization': response = await handleOrganizationRequest(ctx, request, transport); break
        case 'invitation': response = await handleStaffInvitationRequest(ctx, request, transport, admission); break
        case 'staff': response = await handleStaffAccessRequest(ctx, request, transport); break
      }
    } catch (error) {
      const safe = error instanceof Stage0Error ? error : new Stage0Error('configuration')
      response = authResponse(ctx, { error: safe.code }, safe.status)
    }
    // Preserve every Set-Cookie from the responsible adapter. Standardize policy
    // in place; rebuilding a header record can fold independent flow cookies.
    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('Referrer-Policy', 'no-referrer')
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
    response.headers.set('X-Request-ID', ctx.requestId)
    return response
  }
  const backend: Stage0Backend = {
    browser: (request, trustedIp) => serve('browser', request, trustedIp),
    desktop: (request, trustedIp) => serve('desktop', request, trustedIp),
    fetch(request, trustedIp) {
      const url = new URL(request.url)
      // The shared adapters retain their canonical internal paths. Only this
      // fixed native namespace maps them to bearer transport at the server edge.
      if (url.pathname.startsWith('/api/v1/native/')) {
        const canonical = '/api/v1/'+url.pathname.slice('/api/v1/native/'.length)
        const kind = route(canonical, 'desktop')
        if (kind && kind !== 'handoff') {
          url.pathname = canonical
          return serve('desktop', new Request(url, request), trustedIp)
        }
        return serve('desktop', request, trustedIp)
      }
      // Creation/exchange have always used these distinct native-only paths;
      // approval remains an ordinary browser cookie + CSRF operation.
      const native = /^\/api\/v1\/auth\/desktop\/(requests|exchange)$/.test(url.pathname)
      return serve(native ? 'desktop' : 'browser', request, trustedIp)
    },
  }
  return Object.freeze(backend)
}
