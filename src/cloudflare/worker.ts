import type { D1Database, ExportedHandler, Fetcher, R2Bucket, R2ObjectBody } from '@cloudflare/workers-types'

interface Env {
  APP_ENV: string
  ASSETS: Fetcher
  DB: D1Database
  STORAGE: R2Bucket
}

const releasePath = /^\/downloads\/(Ovelle-[A-Za-z0-9._-]+\.(?:zip|exe))$/

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === '/health') {
      if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 })
      const result = await env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>()
      return Response.json({ application: 'ovelle', environment: env.APP_ENV, database: result?.ok === 1 })
    }

    if (url.pathname.startsWith('/downloads/')) {
      const match = releasePath.exec(url.pathname)
      if (!match) return new Response('Not found', { status: 404 })
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method not allowed', { status: 405 })
      }

      const key = `releases/desktop/${match[1]}`
      const object = request.method === 'HEAD' ? await env.STORAGE.head(key) : await env.STORAGE.get(key)
      if (!object) return new Response('Not found', { status: 404 })

      const headers = new Headers()
      headers.set('content-type', match[1].endsWith('.zip') ? 'application/zip' : 'application/octet-stream')
      headers.set('content-disposition', `attachment; filename="${match[1]}"`)
      headers.set('content-length', String(object.size))
      if (request.method === 'HEAD') return new Response(null, { headers })
      return new Response((object as R2ObjectBody).body, { headers })
    }

    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
