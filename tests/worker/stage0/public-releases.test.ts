import { afterEach, expect, it, vi } from 'vitest'
import worker from '../../../src/cloudflare/worker'
import { downloadRelease, releaseCatalog, type ReleaseEnv } from '../../../src/cloudflare/releases'

function fixture() {
  const head = vi.fn(async () => ({ size: 7, etag: 'stored-etag' }))
  const get = vi.fn(async () => ({ body: new Blob(['archive']).stream() }))
  const env = {
    APP_ENV: 'development', STORAGE: { head, get },
    R2_ACCOUNT_ID: 'fixture-account', R2_BUCKET_NAME: 'fixture-bucket',
    R2_ACCESS_KEY_ID: '', R2_SECRET_ACCESS_KEY: '',
  } as unknown as ReleaseEnv
  return { env, head, get }
}
// These routes do not read edge cf metadata; model an incoming Worker request.
const request = (path: string, method = 'GET') => new Request(`https://dev.ovelle.org${path}`, { method }) as Parameters<typeof worker.fetch>[0]

const sha = 'a'.repeat(40)
const devTag = `desktop-dev-${sha}`
const stableTag = 'v2.3.4'
const asset = (tag: string, name: string) => ({
  name, state: 'uploaded', size: 100, browser_download_url: `https://github.com/Atripix-Design/ovelle/releases/download/${tag}/${name}`,
})
afterEach(() => vi.unstubAllGlobals())

it('selects a published development prerelease and uses only its actual executable links', async () => {
  const { env, head } = fixture()
  const mac = asset(devTag, 'Ovelle-2.3.4-mac-arm64.zip')
  const win = asset(devTag, 'Ovelle-2.3.4-win-x64.exe')
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json([
      { tag_name: stableTag, draft: false, prerelease: false },
      { tag_name: `desktop-dev-${'b'.repeat(40)}`, draft: true, prerelease: true },
      { tag_name: 'another-preview', draft: false, prerelease: true },
    ], { headers: { link: '<https://api.github.com>; rel="next"' } }))
    .mockResolvedValueOnce(Response.json([
      { tag_name: devTag, draft: false, prerelease: true, assets: [
        mac, win, { ...asset(devTag, 'Ovelle-2.3.4-mac-x64.zip'), browser_download_url: 'https://example.com/wrong.zip' },
        { ...asset(devTag, 'Ovelle-2.3.4-mac-x64.zip'), state: 'starter' },
        asset(devTag, 'Source-code.zip'),
      ] },
    ]))
  vi.stubGlobal('fetch', fetch)
  const response = await releaseCatalog(request('/api/releases'), env)
  const catalog = await response.json<{ tag: string, releases: Array<Record<string, unknown>> }>()
  expect(catalog.tag).toBe(devTag)
  expect(catalog.releases.map(r => [r.file, r.available, r.href])).toEqual([
    [mac.name, true, mac.browser_download_url], [undefined, false, ''], [win.name, true, win.browser_download_url],
  ])
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    'https://api.github.com/repos/Atripix-Design/ovelle/releases?per_page=30&page=1',
    'https://api.github.com/repos/Atripix-Design/ovelle/releases?per_page=30&page=2',
  ])
  expect(head).not.toHaveBeenCalled()
})

it('tracks GitHub Latest for production without a configured package version', async () => {
  const { env } = fixture()
  env.APP_ENV = 'production'
  const fetch = vi.fn()
  for (const tag of [stableTag, 'v2.4.0']) {
    fetch.mockResolvedValueOnce(Response.json({
      tag_name: tag, draft: false, prerelease: false, assets: [asset(tag, 'Ovelle-7.8.9-win-x64.exe')],
    }))
  }
  vi.stubGlobal('fetch', fetch)
  for (const tag of [stableTag, 'v2.4.0']) {
    const result = await (await releaseCatalog(request('/api/releases'), env)).json<{ tag: string, releases: Array<{ href: string }> }>()
    expect(result.tag).toBe(tag)
    expect(result.releases[2].href).toBe(asset(tag, 'Ovelle-7.8.9-win-x64.exe').browser_download_url)
  }
  expect(fetch).toHaveBeenCalledWith('https://api.github.com/repos/Atripix-Design/ovelle/releases/latest', expect.anything())
})

it('shows no links when there is no stable release and does not convert a GitHub failure into availability', async () => {
  const { env } = fixture()
  env.APP_ENV = 'production'
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 })).mockResolvedValueOnce(new Response(null, { status: 429 })))
  const absent = await releaseCatalog(request('/api/releases'), env)
  expect(await absent.json()).toMatchObject({ tag: null, releases: Array.from({ length: 3 }, () => ({ available: false, href: '' })) })
  const unavailable = await releaseCatalog(request('/api/releases'), env)
  expect(unavailable.status).toBe(503)
  expect(unavailable.headers.get('Cache-Control')).toBe('no-store')
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
  await expect(downloadRelease(request('/downloads/Ovelle-a.zip'), env)).rejects.toThrow('storage unavailable')
})
