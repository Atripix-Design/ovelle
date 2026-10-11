import type { D1Database, ExportedHandler, Fetcher, R2Bucket, SendEmail } from '@cloudflare/workers-types'
import { sendDownloadEmail } from './download-email'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

interface Env {
  APP_ENV: string
  ASSETS: Fetcher
  DB: D1Database
  STORAGE: R2Bucket
  R2_ACCOUNT_ID: string
  R2_BUCKET_NAME: string
  R2_ACCESS_KEY_ID: string
  R2_SECRET_ACCESS_KEY: string
  EMAIL?: SendEmail
  DOWNLOAD_EMAIL_FROM?: string
  RELEASE_VERSION: string
}

const releasePath = /^\/downloads\/(Ovelle-[A-Za-z0-9._-]+\.(?:zip|exe))$/

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === '/api/download-email') return sendDownloadEmail(request, env)
    if (url.pathname === '/api/releases') {
      if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 })
      const version = env.RELEASE_VERSION || '0.1.0'
      const cdn = env.APP_ENV === 'production' ? 'cdn.ovelle.org' : 'cdn.dev.ovelle.org'
      const catalog = [
        { platform: 'macOS', title: 'Mac · Apple silicon', description: 'For Macs with an Apple silicon chip.', label: 'Download for Apple silicon', file: `Ovelle-${version}-mac-arm64.zip` },
        { platform: 'macOS', title: 'Mac · Intel', description: 'For Macs with an Intel processor.', label: 'Download for Intel', file: `Ovelle-${version}-mac-x64.zip` },
        { platform: 'Windows', title: 'Windows · x64', description: 'Install Ovelle on your Windows computer.', label: 'Download for Windows', file: `Ovelle-${version}-win-x64.exe` },
      ]
      const releases = await Promise.all(catalog.map(async release => {
        const object = await env.STORAGE.head(`releases/desktop/${release.file}`)
        return { ...release, available: !!object, href: `https://${cdn}/releases/desktop/${release.file}?v=${object?.etag || version}`, requirements: release.platform === 'macOS' ? 'ZIP archive · Preview build' : 'EXE installer · Preview build' }
      }))
      return Response.json({ releases }, { headers: { 'Cache-Control': 'no-store' } })
    }
    if (url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 })

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
      const object = await env.STORAGE.head(key)
      if (!object) return new Response('Not found', { status: 404 })

      const headers = new Headers()
      headers.set('content-type', match[1].endsWith('.zip') ? 'application/zip' : 'application/octet-stream')
      headers.set('content-disposition', `attachment; filename="${match[1]}"`)
      headers.set('content-length', String(object.size))
      if (request.method === 'HEAD') return new Response(null, { headers })

      if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
        const body = await env.STORAGE.get(key)
        if (!body) return new Response('Not found', { status: 404 })
        return new Response(body.body, { headers })
      }
      const client = new S3Client({
        region: 'auto',
        endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        forcePathStyle: true,
        credentials: {
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        },
      })
      const signedUrl = await getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }),
        { expiresIn: 300 },
      )
      return new Response(null, {
        status: 302,
        headers: { Location: signedUrl, 'Cache-Control': 'no-store' },
      })
    }

    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
