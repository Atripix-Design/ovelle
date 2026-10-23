/** Isolated local browser fixture. Never imported by the application Worker. */
import type { D1Database } from '@cloudflare/workers-types'
import type { RequestContext } from '../../../src/cloudflare/stage0/contracts'
import { loadStage0Config } from '../../../src/cloudflare/stage0/config'
import { handlePasskeyRequest } from '../../../src/cloudflare/stage0/auth/passkeys/routes'
import { handleSessionRequest } from '../../../src/cloudflare/stage0/auth/routes'
import { beginPrelogin } from '../../../src/cloudflare/stage0/auth/prelogin'
import { browserSessionCookie } from '../../../src/cloudflare/stage0/auth/http'
import { issueSession } from '../../../src/cloudflare/stage0/auth/sessions'
import { authResponse } from '../../../src/cloudflare/stage0/auth/web'

const key = new Uint8Array(32).fill(13)
export default {
  async fetch(request: Request, env: { DB: D1Database }): Promise<Response> {
    const ctx: RequestContext = { db: env.DB, config: loadStage0Config({ APP_ENV: 'local', AUTH_ORIGIN: 'http://localhost:4173', AUTH_RP_ID: 'localhost', AUTH_LOCAL_FIXTURES: 'true' }),
      clock: { now: Date.now }, ids: { next: () => crypto.randomUUID() }, requestId: crypto.randomUUID(), mailer: { async send() { throw new Error('Mail prohibited in browser fixture') } } }
    const path = new URL(request.url).pathname
    if (path === '/') return new Response('<!doctype html><title>Ovelle passkey verification fixture</title>', { headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' } })
    // Synthetic primary authentication belongs only to this test fixture. The
    // browser must still complete the real WebAuthn and HTTP ceremony afterwards.
    if (path === '/__fixture/bootstrap' && request.method === 'POST' && request.headers.get('Origin') === ctx.config.origin) {
      const session = await issueSession(ctx, { accountId: 'browser-person', method: 'password' }, 'browser')
      return authResponse(ctx, { csrfToken: session.csrfToken }, 200, { 'Set-Cookie': await browserSessionCookie(ctx, session) })
    }
    if (path === '/api/v1/auth/prelogin' && request.method === 'GET') {
      const started = await beginPrelogin(ctx, request, key)
      return authResponse(ctx, { csrfToken: started.csrfToken }, 200, { 'Set-Cookie': started.cookie })
    }
    if (path.startsWith('/api/v1/auth/passkeys/')) return handlePasskeyRequest(ctx, request, { budgetKey: key, trustedIp: '127.0.0.1', turnstileSecret: 'fixture-only',
      turnstileFetch: async () => Response.json({ success: true, hostname: 'localhost', action: 'passkey_login', challenge_ts: new Date().toISOString() }) })
    return handleSessionRequest(ctx, request, 'browser')
  },
}
