import { expect, it, vi } from 'vitest'
import worker from '../../../src/cloudflare/worker'
import { downloadRelease, releaseCatalog, type ReleaseEnv } from '../../../src/cloudflare/releases'

function fixture() {
  const head = vi.fn(async () => ({ size: 7, etag: 'stored-etag' }))
  const get = vi.fn(async () => ({ body: new Blob(['archive']).stream() }))
  const env = {
    APP_ENV: 'development', RELEASE_VERSION: '1.2.3', STORAGE: { head, get },
    R2_ACCOUNT_ID: 'fixture-account', R2_BUCKET_NAME: 'fixture-bucket',
    R2_ACCESS_KEY_ID: '', R2_SECRET_ACCESS_KEY: '',
  } as unknown as ReleaseEnv
  return { env, head, get }
}
const request = (path: string, method = 'GET') => new Request(`https://dev.ovelle.org${path}`, { method })

it('derives the three catalog entries from metadata and preserves cache/version URLs', async () => {
  const { env, head, get } = fixture()
  head.mockResolvedValueOnce(null as never)
  const response = await releaseCatalog(request('/api/releases'), env)
  const { releases } = await response.json() as { releases: Array<Record<string, unknown>> }
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  expect(releases.map(r => [r.file, r.available, r.href])).toEqual([
    ['Ovelle-1.2.3-mac-arm64.zip', false, 'https://cdn.dev.ovelle.org/releases/desktop/Ovelle-1.2.3-mac-arm64.zip?v=1.2.3'],
    ['Ovelle-1.2.3-mac-x64.zip', true, 'https://cdn.dev.ovelle.org/releases/desktop/Ovelle-1.2.3-mac-x64.zip?v=stored-etag'],
    ['Ovelle-1.2.3-win-x64.exe', true, 'https://cdn.dev.ovelle.org/releases/desktop/Ovelle-1.2.3-win-x64.exe?v=stored-etag'],
  ])
  expect(head).toHaveBeenCalledTimes(3)
  expect(get).not.toHaveBeenCalled()
  env.APP_ENV = 'production'
  env.RELEASE_VERSION = ''
  const production = await (await releaseCatalog(request('/api/releases'), env)).json() as { releases: Array<{ href: string }> }
  expect(production.releases[0].href).toBe('https://cdn.ovelle.org/releases/desktop/Ovelle-0.1.0-mac-arm64.zip?v=stored-etag')
})

it('rejects malformed paths and methods before accessing storage', async () => {
  const { env, head } = fixture()
  expect((await releaseCatalog(request('/api/releases', 'POST'), env)).status).toBe(405)
  for (const path of ['/downloads/other.zip', '/downloads/Ovelle-a.txt', '/downloads/Ovelle-%22.zip', '/downloads/Ovelle-a.zip/extra']) {
    expect((await downloadRelease(request(path), env)).status).toBe(404)
  }
  expect((await downloadRelease(request('/downloads/Ovelle-a.zip', 'POST'), env)).status).toBe(405)
  expect(head).not.toHaveBeenCalled()
})

it('serves HEAD metadata without body access and streams GET without signing credentials', async () => {
  const { env, head, get } = fixture()
  const response = await downloadRelease(request('/downloads/Ovelle-a.zip', 'HEAD'), env)
  expect(response.status).toBe(200)
  expect(response.headers.get('content-length')).toBe('7')
  expect(response.headers.get('content-type')).toBe('application/zip')
  expect(response.headers.get('content-disposition')).toBe('attachment; filename="Ovelle-a.zip"')
  expect(await response.text()).toBe('')
  expect(get).not.toHaveBeenCalled()
  const body = await downloadRelease(request('/downloads/Ovelle-a.exe'), env)
  expect(new TextDecoder().decode(await body.arrayBuffer())).toBe('archive')
  expect(body.headers.get('content-type')).toBe('application/octet-stream')
  expect(head).toHaveBeenLastCalledWith('releases/desktop/Ovelle-a.exe')
  expect(get).toHaveBeenCalledWith('releases/desktop/Ovelle-a.exe')
})

it('returns not found for absent metadata or a body removed after HEAD', async () => {
  const { env, head, get } = fixture()
  head.mockResolvedValueOnce(null as never)
  expect((await downloadRelease(request('/downloads/Ovelle-a.zip'), env)).status).toBe(404)
  expect(get).not.toHaveBeenCalled()
  get.mockResolvedValueOnce(null as never)
  expect((await downloadRelease(request('/downloads/Ovelle-a.zip'), env)).status).toBe(404)
})

it('signs a five-minute no-store redirect without reading R2 bodies', async () => {
  const { env, get } = fixture()
  env.R2_ACCESS_KEY_ID = 'fixture-key'
  env.R2_SECRET_ACCESS_KEY = 'fixture-secret'
  const response = await downloadRelease(request('/downloads/Ovelle-a.zip'), env)
  expect(response.status).toBe(302)
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  const signed = new URL(response.headers.get('Location')!)
  expect(signed.origin).toBe('https://fixture-account.r2.cloudflarestorage.com')
  expect(signed.pathname).toBe('/fixture-bucket/releases/desktop/Ovelle-a.zip')
  expect(signed.searchParams.get('X-Amz-Expires')).toBe('300')
  expect(signed.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/)
  expect(get).not.toHaveBeenCalled()
})

it('keeps public routing, health and assets separate and leaves Stage 0 disabled', async () => {
  const { env } = fixture()
  const assets = vi.fn(async () => new Response('asset'))
  const first = vi.fn(async () => ({ ok: 1 }))
  const composed = { ...env, ASSETS: { fetch: assets }, DB: { prepare: () => ({ first }) } } as unknown as Parameters<typeof worker.fetch>[1]
  expect((await worker.fetch(request('/api/v1/auth/prelogin'), composed)).status).toBe(404)
  expect((await worker.fetch(request('/api/releases', 'POST'), composed)).status).toBe(405)
  expect((await worker.fetch(request('/api/download-email'), composed)).status).toBe(405)
  expect(await (await worker.fetch(request('/health'), composed)).json()).toEqual({ application: 'ovelle', environment: 'development', database: true })
  expect(first).toHaveBeenCalledTimes(1)
  expect((await worker.fetch(request('/downloads/invalid'), composed)).status).toBe(404)
  expect(assets).not.toHaveBeenCalled()
  expect(await (await worker.fetch(request('/'), composed)).text()).toBe('asset')
  expect(assets).toHaveBeenCalledTimes(1)
})

it('propagates storage failures instead of reporting a missing or available release', async () => {
  const { env, head } = fixture()
  head.mockRejectedValue(new Error('storage unavailable'))
  await expect(releaseCatalog(request('/api/releases'), env)).rejects.toThrow('storage unavailable')
  await expect(downloadRelease(request('/downloads/Ovelle-a.zip'), env)).rejects.toThrow('storage unavailable')
})
