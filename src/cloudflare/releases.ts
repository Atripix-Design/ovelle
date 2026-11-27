import type { R2Bucket } from '@cloudflare/workers-types'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { githubReleaseCatalog } from './github-releases'

export interface ReleaseEnv {
  APP_ENV: string
  STORAGE: R2Bucket
  R2_ACCOUNT_ID: string
  R2_BUCKET_NAME: string
  R2_ACCESS_KEY_ID: string
  R2_SECRET_ACCESS_KEY: string
}

const releasePath = /^\/downloads\/(Ovelle-[A-Za-z0-9._-]+\.(?:dmg|zip|exe))$/

export async function releaseCatalog(request: Request, env: ReleaseEnv): Promise<Response> {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 })
  try {
    return Response.json(await githubReleaseCatalog(env.APP_ENV), { headers: { 'Cache-Control': 'public, max-age=60' } })
  } catch {
    return Response.json({ error: 'Download catalog unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}

/** HEAD never reads the body or signs. GET streams through the binding when
 * signing credentials are absent; otherwise it returns a five-minute URL.
 * No client, metadata or signed URL is cached across requests.
 */
export async function downloadRelease(request: Request, env: ReleaseEnv): Promise<Response> {
  const url = new URL(request.url)
  const match = releasePath.exec(url.pathname)
  if (!match) return new Response('Not found', { status: 404 })
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 })
  }

  const key = `releases/desktop/${match[1]}`
  const object = await env.STORAGE.head(key)
  if (!object) return new Response('Not found', { status: 404 })

  const headers = new Headers()
  headers.set('content-type', match[1].endsWith('.dmg') ? 'application/x-apple-diskimage' : match[1].endsWith('.zip') ? 'application/zip' : 'application/octet-stream')
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
