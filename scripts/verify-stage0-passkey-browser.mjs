import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { readD1Migrations } from '@cloudflare/vitest-plugin'
import { chromium } from 'playwright'

// Ephemeral localhost-only test harness, never a deployed application or a
// credential bypass in the public Worker. All outbound Worker requests are denied.
const bundle = await build({ entryPoints: ['tests/worker/stage0/passkey-browser-worker.ts'], bundle: true, format: 'esm', platform: 'browser', write: false })
const runtime = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-10-06', d1Databases: ['DB'], outboundService: () => new Response(null, { status: 503 }) }))
let server
let browser
try {
  const db = await runtime.getD1Database('DB')
  for (const migration of await readD1Migrations('./migrations')) await db.batch(migration.queries.map(query => db.prepare(query)))
  const now = Date.now()
  await db.prepare('INSERT INTO accounts(id,email,display_name,email_verified_at,created_at) VALUES(?,?,?,?,?)').bind('browser-person', 'browser@example.test', 'Browser Person', now, now).run()
  server = createServer(async (request, response) => {
    try {
      const chunks = []; let size = 0
      for await (const chunk of request) { size += chunk.length; if (size > 100_000) throw new Error('Fixture request too large'); chunks.push(chunk) }
      const result = await runtime.dispatchFetch('http://localhost:4173' + request.url, { method: request.method, headers: request.headers, ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) })
      response.statusCode = result.status
      for (const [name, value] of result.headers) if (name !== 'set-cookie') response.setHeader(name, value)
      if (result.headers.getSetCookie().length) response.setHeader('Set-Cookie', result.headers.getSetCookie())
      response.end(Buffer.from(await result.arrayBuffer()))
    } catch { response.statusCode = 500; response.end('Fixture failure') }
  })
  server.listen(4173, '127.0.0.1')
  await once(server, 'listening')
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } })
  await page.goto('http://localhost:4173')
  const result = await page.evaluate(async () => {
    const post = async (path, value, csrf) => {
      const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(value) })
      if (!response.ok) throw new Error('Browser ceremony failed: ' + path + ' HTTP ' + response.status)
      return response.status === 204 ? null : response.json()
    }
    const primary = await post('/__fixture/bootstrap', {}, '')
    const begin = await post('/api/v1/auth/passkeys/register/start', {}, primary.csrfToken)
    const created = await navigator.credentials.create({ publicKey: PublicKeyCredential.parseCreationOptionsFromJSON(begin.options) })
    const registered = await post('/api/v1/auth/passkeys/register/finish', { response: created.toJSON(), name: 'Browser passkey' }, primary.csrfToken)
    const firstMe = await (await fetch('/api/v1/me')).json()
    if (firstMe.session.assurance !== 'passkey') throw new Error('Registration did not grant UV assurance')
    const cookieHidden = document.cookie === ''
    await post('/api/v1/auth/logout', {}, firstMe.csrfToken)
    const signedOut = (await fetch('/api/v1/me')).status
    const prelogin = await (await fetch('/api/v1/auth/prelogin')).json()
    const start = await post('/api/v1/auth/passkeys/login/start', { turnstileToken: 'fixture-only' }, prelogin.csrfToken)
    const assertion = await navigator.credentials.get({ publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(start.options) })
    await post('/api/v1/auth/passkeys/login/finish', { response: assertion.toJSON() }, start.csrfToken)
    const lastMe = await (await fetch('/api/v1/me')).json()
    return { registration: Boolean(registered.passkey.id), initialAssurance: firstMe.session.assurance, signedOut, account: lastMe.account.id, method: lastMe.session.method, assurance: lastMe.session.assurance, cookieHidden }
  })
  assert.deepEqual(result, { registration: true, initialAssurance: 'passkey', signedOut: 401, account: 'browser-person', method: 'passkey', assurance: 'passkey', cookieHidden: true })
  const cookies = await context.cookies()
  assert.ok(cookies.some(cookie => cookie.name === 'ovelle_local_session' && cookie.httpOnly && cookie.sameSite === 'Strict'))
  assert.ok(!cookies.some(cookie => cookie.name === 'ovelle_local_passkey' || cookie.name === 'ovelle_local_prelogin'))
  assert.equal((await db.prepare('SELECT count(*) AS n FROM passkey_credentials').first()).n, 1)
  const sources = ['src/cloudflare/stage0/auth/passkeys/protocol.ts', 'src/cloudflare/stage0/auth/passkeys/service.ts', 'src/cloudflare/stage0/auth/passkeys/routes.ts', 'src/cloudflare/stage0/auth/sessions.ts', 'src/cloudflare/stage0/auth/web.ts', 'src/cloudflare/stage0/auth/limits.ts', 'src/cloudflare/stage0/auth/turnstile.ts', 'migrations/0008_passkeys.sql', 'package-lock.json', 'tests/worker/stage0/passkey-browser-worker.ts', 'scripts/verify-stage0-passkey-browser.mjs']
  const sourceHashes = Object.fromEntries(await Promise.all(sources.map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')])))
  console.log(JSON.stringify({ ranAt: new Date().toISOString(), scope: 'local Chromium + workerd + ephemeral D1', authenticator: 'CDP virtual CTAP2, resident key and UV', browser: browser.version(), ...result, productionProvider: false, physicalAuthenticator: false, recoveryVerified: false, sourceHashes }, null, 2))
} finally {
  if (browser) await browser.close()
  if (server?.listening) await new Promise(resolve => server.close(resolve))
  await runtime.dispose()
}
