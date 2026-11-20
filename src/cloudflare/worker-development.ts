import type { D1Database, ExportedHandler, SendEmail } from '@cloudflare/workers-types'
import publicWorker from './worker'
import { createStage0Backend } from './stage0/backend'

interface Env { APP_ENV: string; DB: D1Database; AUTH_EMAIL?: SendEmail; [key: string]: unknown }

/** This development-only surface intentionally excludes SAML, recovery,
 * invitations and unrelated administration until their rollout is reviewed. */
function workflowPath(path: string): boolean {
  if (['/api/v1/auth/prelogin', '/api/v1/auth/enrollment', '/api/v1/auth/enrollment/contact', '/api/v1/auth/enrollment/confirm', '/api/v1/me', '/api/v1/auth/logout', '/api/v1/auth/logout-all', '/api/v1/auth/desktop/requests', '/api/v1/auth/desktop/exchange', '/api/v1/auth/desktop/approve', '/api/v1/native/me', '/api/v1/native/auth/logout', '/api/v1/native/me/organizations', '/api/v1/native/organizations'].includes(path)) return true
  if (/^\/api\/v1\/auth\/oidc\/(google|microsoft)\/(start|callback)$/.test(path)) return true
  if (/^\/api\/v1\/auth\/passkeys\/(register|step-up)\/(start|finish)$/.test(path)) return true
  return /^\/api\/v1\/native\/organizations\/[^/]+\/(?:programs|locations|volunteers(?:\/search)?|volunteer-schedule|volunteer-readiness(?:\/(?:decision|evidence))?|volunteer-occurrences\/[^/]+(?:\/(?:roster|roles|publish|waitlist)|\/roles\/[^/]+\/criteria)?|volunteer-assignments(?:\/[^/]+\/(?:check-in|check-out|hours|cancel|presence|corrections))?|volunteer-hours(?:\/[^/]+\/(?:review|history|clarification))?|volunteer-waitlist\/[^/]+\/(?:offers|withdraw)|volunteer-offers\/[^/]+\/(?:confirm|withdraw)|volunteer-corrections(?:\/[^/]+\/resolve)?|volunteer-service-history)$/.test(path)
}
function unavailable(): Response {
  return Response.json({ error: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" } })
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (env.APP_ENV !== 'development' || url.origin !== 'https://dev.ovelle.org' || !workflowPath(url.pathname)) return publicWorker.fetch(request, env as never)
    // Cloudflare supplies CF-Connecting-IP for direct edge traffic. A Worker
    // subrequest can influence it, so reject the edge-added CF-Worker marker.
    const ip = request.headers.get('CF-Connecting-IP')
    if (!request.cf || request.headers.has('CF-Worker') || !ip || ip.length > 64 || !/^[a-f0-9:.]+$/i.test(ip)) return unavailable()
    if (!env.AUTH_EMAIL) return unavailable()
    try { return await createStage0Backend(env, { db: env.DB, email: env.AUTH_EMAIL }).fetch(request, ip) }
    catch { return unavailable() }
  },
} satisfies ExportedHandler<Env>
