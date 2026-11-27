import type { D1Database, ExportedHandler, Fetcher, SendEmail } from '@cloudflare/workers-types'
import { sendDownloadEmail } from './download-email'
import { downloadRelease, releaseCatalog, type ReleaseEnv } from './releases'

interface Env extends ReleaseEnv {
  ASSETS: Fetcher
  DB: D1Database
  EMAIL?: SendEmail
  DOWNLOAD_EMAIL_FROM?: string
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === '/api/download-email') return sendDownloadEmail(request, env)
    if (url.pathname === '/api/releases') return releaseCatalog(request, env)
    if (url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 })

    if (url.pathname === '/health') {
      if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 })
      const result = await env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>()
      return Response.json({ application: 'ovelle', environment: env.APP_ENV, database: result?.ok === 1 })
    }

    if (url.pathname.startsWith('/downloads/')) {
      return downloadRelease(request, env)
    }

    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
