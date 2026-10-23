import { calculatePKCECodeChallenge } from 'openid-client'
import type { RequestContext } from '../../../src/cloudflare/stage0/contracts'
import { handleOidcRequest } from '../../../src/cloudflare/stage0/auth/oidc/routes'
import { handleSessionRequest } from '../../../src/cloudflare/stage0/auth/routes'
import { oidcProviderFixture, settings } from './oidc-protocol-fixture'
import { browserTransport } from './browser-transport'

interface Env { DB: D1Database; ORIGIN: string; CONTROL: string }
type Provider = 'google' | 'microsoft'
interface Grant { provider: Provider; nonce: string; challenge: string; subject: string; email: string; authTime: number }
const grants = new Map<string, Grant>(), returns = new Map<string, string>()
let selection = { provider: 'google' as Provider, subject: 'exact-subject', email: 'person@gmail.com', purpose: 'login', fail: false }
let client = 0, exchanges = 0, pkce = 0
const fixtures = new Map<Provider, Awaited<ReturnType<typeof oidcProviderFixture>>>()
const navigation: { mode: string | null; dest: string | null; site: string | null }[] = []
const mail: { url: string }[] = []
const key = new Uint8Array(32).fill(27)
const html = (body: string) => new Response('<!doctype html><title>Isolated backend fixture</title>' + body,
  { headers: { 'Content-Type': 'text/html', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' } })
const link = (href: string) => html(`<a id="submit" href="${href.replaceAll('&', '&amp;')}">Return fixture code</a>`)

/** Test composition only: public Worker imports neither this nor a bootstrap.
 * Browser authorization navigates over real TLS; only external provider fetch,
 * Turnstile and mail delivery are replaced. */
export default { async fetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  if (url.pathname.startsWith('/__fixture/')) {
    if (request.headers.get('X-Fixture-Control') !== env.CONTROL) return new Response(null, { status: 403 })
    if (url.pathname === '/__fixture/selection' && request.method === 'POST') {
      selection = { ...selection, ...await request.json() as Partial<typeof selection> }; client++
      return new Response(null, { status: 204 })
    }
    if (url.pathname === '/__fixture/mail') return Response.json(mail)
    if (url.pathname === '/__fixture/navigation') return Response.json(navigation)
    if (url.pathname === '/__fixture/stats') return Response.json({ exchanges, pkce })
    return new Response(null, { status: 404 })
  }
  const transported = browserTransport(request, env.CONTROL)
  if (!transported) return new Response(null, { status: 403 })
  request = transported
  if (/\/oidc\/(google|microsoft)\/callback$/.test(url.pathname)) navigation.push({ mode: request.headers.get('Sec-Fetch-Mode'), dest: request.headers.get('Sec-Fetch-Dest'), site: request.headers.get('Sec-Fetch-Site') })
  const provider: Provider | undefined = url.origin === 'https://accounts.google.com' ? 'google' : url.origin === 'https://login.microsoftonline.com' ? 'microsoft' : undefined
  if (provider) {
    if (url.pathname === '/replay') return returns.has(provider) ? link(returns.get(provider)!) : new Response(null, { status: 404 })
    if (!['/o/oauth2/v2/auth', '/common/oauth2/v2.0/authorize'].includes(url.pathname)
      || url.searchParams.get('client_id') !== 'fixture-client' || url.searchParams.get('response_type') !== 'code'
      || url.searchParams.get('code_challenge_method') !== 'S256'
      || url.searchParams.get('redirect_uri') !== `${env.ORIGIN}/api/v1/auth/oidc/${provider}/callback`) return new Response(null, { status: 400 })
    for (const name of ['state', 'nonce', 'code_challenge']) if (!/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get(name) ?? '')) return new Response(null, { status: 400 })
    const code = crypto.randomUUID()
    grants.set(code, { provider, nonce: url.searchParams.get('nonce')!, challenge: url.searchParams.get('code_challenge')!, subject: selection.subject, email: selection.email, authTime: Math.floor(Date.now() / 1000) })
    const callback = new URL(`${env.ORIGIN}/api/v1/auth/oidc/${provider}/callback`)
    callback.searchParams.set('state', url.searchParams.get('state')!); callback.searchParams.set('code', code)
    returns.set(provider, callback.href)
    return link(callback.href)
  }
  if (url.origin !== env.ORIGIN) return new Response(null, { status: 404 })
  if (['/', '/account', '/account/sign-in', '/account/enroll', '/account/security', '/account/verify-contact'].includes(url.pathname)) return html('')
  const ctx: RequestContext = { db: env.DB, config: { environment: 'development', origin: env.ORIGIN, rpId: 'dev.ovelle.org', emailFrom: 'fixture@example.test', enabled: false, passwordDecision: 'pending' },
    clock: { now: Date.now }, ids: { next: () => crypto.randomUUID() }, requestId: crypto.randomUUID(),
    mailer: { async send(message) { mail.push({ url: message.url }); return { status: 'accepted', providerId: 'fixture-only' } } } }
  if (url.pathname.startsWith('/api/v1/auth/oidc/') || ['/api/v1/auth/prelogin', '/api/v1/auth/enrollment', '/api/v1/auth/enrollment/contact', '/api/v1/auth/enrollment/confirm'].includes(url.pathname)) {
    return handleOidcRequest(ctx, request, { budgetKey: key, trustedIp: `192.0.2.${client}`, turnstileSecret: 'fixture-only', getSettings: async name => settings(name),
      turnstileFetch: async () => Response.json({ success: true, hostname: 'dev.ovelle.org', action: `oidc_${selection.purpose}`, challenge_ts: new Date().toISOString() }),
      providerFetch: async (target, init) => {
        const name = target.startsWith('https://login.microsoftonline.com/') ? 'microsoft' : 'google'
        let fixture = fixtures.get(name)
        if (!fixture) {
          fixture = await oidcProviderFixture(name, { origin: env.ORIGIN, now: Date.now, validateGrant: async form => {
            exchanges++
            const code = form.get('code') ?? '', grant = grants.get(code)
            if (!grant || grant.provider !== name || selection.fail || await calculatePKCECodeChallenge(form.get('code_verifier') ?? '') !== grant.challenge || grants.get(code) !== grant) return false
            grants.delete(code); pkce++
            fixture!.state.claims.auth_time = grant.authTime; fixture!.state.claims.nonce = grant.nonce; fixture!.state.claims.sub = grant.subject; fixture!.state.claims.email = grant.email
            return true
          } })
          fixtures.set(name, fixture)
        }
        return fixture.fetcher(target, init)
      },
    })
  }
  return handleSessionRequest(ctx, request, 'browser')
} }
