import { browserTransport } from './browser-transport'
import { inflateRawSync } from 'node:zlib'
import type { RequestContext } from '../../../src/cloudflare/stage0/contracts'
import { handleSamlRequest } from '../../../src/cloudflare/stage0/auth/saml/routes'
import { beginPrelogin } from '../../../src/cloudflare/stage0/auth/prelogin'
import { handleSessionRequest } from '../../../src/cloudflare/stage0/auth/routes'
import { encodedSaml, signedSamlResponse, persistent, publicKey, samlIssuer } from './saml-fixture'

interface FixtureEnv { DB: D1Database; ORIGIN: string; IDP: string; ATTACKER: string; CONTROL: string }
const key = new Uint8Array(32).fill(23)
let subject = 'stable-person-001'
let formPolicy = 'origin'
let client = 0
let lastForm: { relay: string; response: string } | undefined
const mail: { url: string }[] = []
const navigation: { modeBefore: string | null; mode: string | null; dest: string | null; site: string | null }[] = []
const html = (body: string, referrer = 'no-referrer') => new Response('<!doctype html><title>Isolated backend fixture</title>' + body,
  { headers: { 'Content-Type': 'text/html', 'Referrer-Policy': referrer, 'Cache-Control': 'no-store' } })
function form(origin: string) {
  if (!lastForm) return new Response(null, { status: 404 })
  return html(`<form method="POST" action="${origin}/api/v1/auth/saml/callback"><input type="hidden" name="RelayState" value="${lastForm.relay}"><input type="hidden" name="SAMLResponse" value="${lastForm.response}"><button id="submit">Submit fixture</button></form>`, formPolicy)
}

/** Test-only composition: no import from the public Worker, no live providers,
 * no persistent database and no credential bootstrap endpoint. */
export default { async fetch(request: Request, env: FixtureEnv): Promise<Response> {
  const url = new URL(request.url)
  if (url.pathname.startsWith('/__fixture/')) {
    if (request.headers.get('X-Fixture-Control') !== env.CONTROL) return new Response(null, { status: 403 })
    if (url.pathname === '/__fixture/subject' && request.method === 'POST') {
      const input = await request.json() as { subject: string; referrer?: string }
      subject = input.subject; formPolicy = input.referrer ?? 'origin'; client++
      return new Response(null, { status: 204 })
    }
    if (url.pathname === '/__fixture/mail') return Response.json(mail)
    if (url.pathname === '/__fixture/navigation') return Response.json(navigation)
    return new Response(null, { status: 404 })
  }
  const modeBefore = request.headers.get('Sec-Fetch-Mode')
  const transported = browserTransport(request, env.CONTROL)
  if (!transported) return new Response(null, { status: 403 })
  request = transported
  if (url.pathname === '/api/v1/auth/saml/callback') navigation.push({ modeBefore, mode: request.headers.get('Sec-Fetch-Mode'), dest: request.headers.get('Sec-Fetch-Dest'), site: request.headers.get('Sec-Fetch-Site') })
  const settings = { connectionId: 'saml-a', organizationId: 'org-a', connectionVersion: 1, issuer: samlIssuer,
    audience: 'https://ovelle.example.test/saml', nameIdFormat: persistent, signingKeys: [publicKey], entryPoint: env.IDP + '/sso' }
  if (url.origin === env.IDP && url.pathname === '/sso') {
    const xml = inflateRawSync(Buffer.from(url.searchParams.get('SAMLRequest') ?? '', 'base64')).toString()
    const requestId = /\bID="([^"]+)"/.exec(xml)?.[1]
    const relay = url.searchParams.get('RelayState') ?? ''
    if (!requestId || !/^[A-Za-z0-9_-]{43}$/.test(relay)) return new Response(null, { status: 400 })
    lastForm = { relay, response: encodedSaml(signedSamlResponse({ now: Date.now(), requestId, subject,
      callback: env.ORIGIN + '/api/v1/auth/saml/callback', audience: settings.audience,
      responseId: '_' + crypto.randomUUID(), assertionId: '_' + crypto.randomUUID() })) }
    return form(env.ORIGIN)
  }
  if ([env.IDP, env.ATTACKER].includes(url.origin) && url.pathname === '/replay') return form(env.ORIGIN)
  if (url.origin !== env.ORIGIN) return new Response(null, { status: 404 })
  if (['/', '/account', '/account/sign-in', '/account/enroll', '/account/verify-contact'].includes(url.pathname)) return html('')
  const ctx: RequestContext = { db: env.DB, config: { environment: 'development', origin: env.ORIGIN, rpId: 'dev.ovelle.org',
    emailFrom: 'fixture@example.test', enabled: false, passwordDecision: 'pending' }, clock: { now: Date.now }, ids: { next: () => crypto.randomUUID() },
    requestId: crypto.randomUUID(), mailer: { async send(message) { mail.push({ url: message.url }); return { status: 'accepted', providerId: 'fixture-only' } } } }
  if (url.pathname === '/api/v1/auth/prelogin') {
    const initial = await beginPrelogin(ctx, request, key)
    return Response.json({ csrfToken: initial.csrfToken }, { headers: { 'Set-Cookie': initial.cookie } })
  }
  // Independent sequential scenarios use distinct trusted TEST-NET clients;
  // application quotas are unchanged and remain covered by D1 route tests.
  if (url.pathname.startsWith('/api/v1/auth/saml/')) return handleSamlRequest(ctx, request, { budgetKey: key, trustedIp: `192.0.2.${client}`,
    turnstileSecret: 'fixture-only', getSettings: async () => settings,
    turnstileFetch: async () => Response.json({ success: true, hostname: 'dev.ovelle.org', action: 'saml_login', challenge_ts: new Date().toISOString() }) })
  return handleSessionRequest(ctx, request, 'browser')
} }
