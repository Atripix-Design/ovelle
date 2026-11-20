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
const uiBundle = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Account from './apps/web/src/AccountLanding'; createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode,null,React.createElement(Account)));`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, format: 'esm', platform: 'browser', jsx: 'automatic', loader: { '.css': 'empty' }, write: false })
const bundle = await build({ entryPoints: ['tests/worker/stage0/passkey-browser-worker.ts'], bundle: true, format: 'esm', platform: 'browser', write: false })
let externalWorkerRequests = 0
const runtime = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-10-06', d1Databases: ['DB'], outboundService: () => { externalWorkerRequests++; return new Response(null, { status: 503 }) } }))
let server
let browser
try {
  const db = await runtime.getD1Database('DB')
  for (const migration of await readD1Migrations('./migrations')) await db.batch(migration.queries.map(query => db.prepare(query)))
  const now = Date.now()
  await db.prepare('INSERT INTO accounts(id,email,display_name,email_verified_at,created_at) VALUES(?,?,?,?,?)').bind('browser-person', 'browser@example.test', 'Browser Person', now, now).run()
  await db.prepare('INSERT INTO accounts(id,email,display_name,email_verified_at,created_at) VALUES(?,?,?,?,?)').bind('browser-ui-person', 'ui@example.test', 'UI Person', now, now).run()
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
  const context = await browser.newContext({ serviceWorkers: 'block' })
  // A hosted browser must stay inside this isolated fixture, just like workerd.
  let blockedBrowserRequests = 0
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === 'http://localhost:4173') return route.continue()
    blockedBrowserRequests++
    return route.abort('blockedbyclient')
  })
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
  // Run the rendered account page with the same virtual authenticator, first
  // registering a new account's key, then stepping up a fresh primary session.
  await page.evaluate(async () => { const response = await fetch('/__fixture/bootstrap-ui', { method: 'POST' }); if (!response.ok) throw Error('bootstrap failed') })
  await context.route('**/account', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><div id="root"></div><script type="module" src="/fixture-account.js"></script>' }))
  await context.route('**/fixture-account.js', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: uiBundle.outputFiles[0].text }))
  await page.goto('http://localhost:4173/account')
  await page.getByRole('button', { name: 'Set up first passkey' }).click()
  await page.getByText('Passkey verified.', { exact: false }).waitFor()
  assert.equal((await page.evaluate(async () => (await (await fetch('/api/v1/me')).json()).session.assurance)), 'passkey')
  assert.equal((await db.prepare("SELECT count(*) AS n FROM passkey_credentials WHERE account_id='browser-ui-person'").first()).n, 1)
  await page.evaluate(async () => { const response = await fetch('/__fixture/bootstrap-ui', { method: 'POST' }); if (!response.ok) throw Error('bootstrap failed') })
  await page.reload(); await page.getByRole('button', { name: 'Use existing passkey' }).click()
  await page.getByText('Passkey verified.', { exact: false }).waitFor()
  assert.equal((await page.evaluate(async () => (await (await fetch('/api/v1/me')).json()).session.assurance)), 'passkey')
  await page.getByRole('button', { name: 'Sign out of browser' }).click()
  await page.waitForURL('http://localhost:4173/account/sign-in')
  await page.goto('http://localhost:4173/')
  assert.equal(await page.evaluate(async () => (await fetch('/api/v1/me')).status), 401)
  assert.equal(externalWorkerRequests, 0, 'Ceremony attempted external Worker traffic')
  assert.equal(blockedBrowserRequests, 0, 'Ceremony attempted external browser traffic')
  // Prove the absence check has an active browser boundary; do not contact it.
  await page.evaluate(() => fetch('https://outside.example.test/fixture-network-control').catch(() => null))
  assert.equal(blockedBrowserRequests, 1)
  const sources = ['apps/web/src/AccountLanding.tsx', 'src/cloudflare/stage0/auth/passkeys/protocol.ts', 'src/cloudflare/stage0/auth/passkeys/service.ts', 'src/cloudflare/stage0/auth/passkeys/routes.ts', 'src/cloudflare/stage0/auth/sessions.ts', 'src/cloudflare/stage0/auth/web.ts', 'src/cloudflare/stage0/auth/limits.ts', 'src/cloudflare/stage0/auth/turnstile.ts', 'migrations/0008_passkeys.sql', 'package-lock.json', 'tests/worker/stage0/passkey-browser-worker.ts', 'scripts/verify-stage0-passkey-browser.mjs']
  const sourceHashes = Object.fromEntries(await Promise.all(sources.map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')])))
  console.log('PASSKEY_BROWSER_VERIFIED ' + JSON.stringify({ ranAt: new Date().toISOString(), scope: 'local Chromium + workerd + ephemeral D1', authenticator: 'CDP virtual CTAP2, resident key and UV', browser: browser.version(), result, externalWorkerRequests, browserNetworkGuard: true, productionProvider: false, physicalAuthenticator: false, recoveryVerified: false, sourceHashes }))
} finally {
  if (browser) await browser.close()
  if (server?.listening) await new Promise(resolve => server.close(resolve))
  await runtime.dispose()
}
