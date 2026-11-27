import assert from 'node:assert/strict'
import { createServer } from 'node:https'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { readD1Migrations } from '@cloudflare/vitest-plugin'
import { chromium, firefox, webkit } from 'playwright'
import { createFixtureProxy } from './stage0-browser-proxy.mjs'

export const browserEngines = { chromium, firefox, webkit }

// Shared test transport only. TLS observes actual browser metadata before Node
// fetch overwrites it; application handlers receive exactly those observations.
export async function createBrowserHarness(engine, { worker, providerOrigins, bindingCookie }) {
  assert.ok(Object.hasOwn(browserEngines, engine))
  const dir = await mkdtemp(join(tmpdir(), 'ovelle-auth-browser-'))
  let runtime, server, browser, proxy
  let workerNetwork = 0
  const received = [], denied = [], failures = [], urls = []
  const close = async () => {
    try {
      const cleanup = await Promise.allSettled([
        browser?.close(), proxy?.close(), runtime?.dispose(),
        server?.listening ? new Promise((resolve, reject) => {
          server.closeAllConnections(); server.close(error => error ? reject(error) : resolve())
        }) : undefined,
      ])
      assert.deepEqual(cleanup.filter(result => result.status === 'rejected'), [], 'Browser fixture cleanup failed')
    } finally { await rm(dir, { recursive: true, force: true }) }
  }
  try {
    const hosts = ['dev.ovelle.org', 'attacker.example.test', ...(providerOrigins?.map(value => new URL(value).hostname) ?? ['identity.example.test'])]
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=isolated-fixture.test',
      '-addext', 'subjectAltName=' + hosts.map(host => 'DNS:' + host).join(','),
      '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')], { stdio: 'ignore' })
    server = createServer({ key: await readFile(join(dir, 'key.pem')), cert: await readFile(join(dir, 'cert.pem')) }, async (request, response) => {
      try {
        const requestOrigin = 'https://' + request.headers.host
        assert.ok(origins.includes(requestOrigin), 'Unexpected fixture host')
        const chunks = []; let size = 0
        for await (const chunk of request) { size += chunk.length; assert.ok(size <= 270_000); chunks.push(chunk) }
        const cookie = request.headers.cookie ?? ''
        const observed = { path: new URL(request.url, requestOrigin).pathname, method: request.method, origin: request.headers.origin,
          mode: request.headers['sec-fetch-mode'], dest: request.headers['sec-fetch-dest'], site: request.headers['sec-fetch-site'],
          binding: cookie.includes(bindingCookie + '='), session: cookie.includes('__Host-ovelle_session=') }
        urls.push(request.url)
        const headers = { ...request.headers, 'X-Fixture-Transport': control, 'X-Fixture-Observed': JSON.stringify(Object.fromEntries(
          ['Sec-Fetch-Mode', 'Sec-Fetch-Dest', 'Sec-Fetch-Site'].map(name => [name, request.headers[name.toLowerCase()] ?? null]))) }
        const result = await runtime.dispatchFetch(requestOrigin + request.url, { method: request.method, headers,
          redirect: 'manual', ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) })
        received.push({ ...observed, status: result.status, location: result.headers.get('Location') })
        response.statusCode = result.status
        for (const [name, value] of result.headers) if (name !== 'set-cookie') response.setHeader(name, value)
        if (result.headers.getSetCookie().length) response.setHeader('Set-Cookie', result.headers.getSetCookie())
        response.end(Buffer.from(await result.arrayBuffer()))
      } catch (error) { failures.push(error.message); response.statusCode = 500; response.end('Fixture transport failed') }
    })
    server.listen(0, '127.0.0.1'); await once(server, 'listening')
    const port = server.address().port
    const origin = `https://dev.ovelle.org:${port}`, idp = `https://identity.example.test:${port}`, attacker = `https://attacker.example.test:${port}`
    const origins = [origin, attacker, ...(providerOrigins ?? [idp])], control = randomBytes(32).toString('hex')
    const bundle = await build({ entryPoints: [worker], bundle: true, format: 'esm', platform: 'node', write: false,
      banner: { js: "import {createRequire} from 'node:module'; const require=createRequire('/script-0.mjs');" } })
    runtime = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-10-06',
      compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], bindings: { ORIGIN: origin, IDP: idp, ATTACKER: attacker, CONTROL: control },
      outboundService: () => { workerNetwork++; return new Response(null, { status: 503 }) } }))
    const db = await runtime.getD1Database('DB')
    for (const migration of await readD1Migrations('./migrations')) await db.batch(migration.queries.map(query => db.prepare(query)))
    proxy = await createFixtureProxy({ port, authorities: origins.map(value => {
      const url = new URL(value); return url.hostname + ':' + (url.port || '443')
    }) })
    browser = await browserEngines[engine].launch({ headless: true, proxy: { server: proxy.url } })
    return { origin, idp, attacker, db, browser, received, denied, failures, close,
      urlContains: value => urls.some(url => url.includes(value)),
      workerNetwork: () => workerNetwork,
      controlRequest: (path, data) => runtime.dispatchFetch(origin + '/__fixture/' + path, { method: data ? 'POST' : 'GET',
        headers: { 'X-Fixture-Control': control, 'Content-Type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}) }),
      async newContext() {
        const context = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: 'block' })
        await context.route('**/*', route => {
          if (origins.includes(new URL(route.request().url()).origin)) return route.continue()
          denied.push(new URL(route.request().url()).origin); return route.abort()
        })
        return context
      },
    }
  } catch (error) { await close(); throw error }
}
