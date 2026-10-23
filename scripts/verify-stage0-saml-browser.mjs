import assert from 'node:assert/strict'
import { createServer } from 'node:https'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { randomBytes, createHash } from 'node:crypto'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { readD1Migrations } from '@cloudflare/vitest-plugin'
import { chromium, firefox, webkit } from 'playwright'
import { createFixtureProxy } from './stage0-browser-proxy.mjs'

const engines = { chromium, firefox, webkit }
const requested = process.argv.slice(2)
assert.ok(requested.length <= 1 && (!requested.length || Object.hasOwn(engines, requested[0])), 'Expected optional chromium, firefox or webkit')

async function runBrowser(engine) {
  // Actual loopback TLS receives browser headers before the Node/Miniflare
  // transport. CONNECT routing is browser-local; no hosts/trust-store changes.
  const dir = await mkdtemp(join(tmpdir(), 'ovelle-saml-browser-'))
  let runtime, server, browser, proxy
  let workerNetwork = 0
  const received = [], denied = [], failures = []
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=isolated-fixture.test',
      '-addext', 'subjectAltName=DNS:dev.ovelle.org,DNS:identity.example.test,DNS:attacker.example.test',
      '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')], { stdio: 'ignore' })
    server = createServer({ key: await readFile(join(dir, 'key.pem')), cert: await readFile(join(dir, 'cert.pem')) }, async (request, response) => {
      try {
        const origin = 'https://' + request.headers.host
        assert.ok(origins.includes(origin), 'Unexpected fixture host')
        const chunks = []; let size = 0
        for await (const chunk of request) { size += chunk.length; assert.ok(size <= 270_000); chunks.push(chunk) }
        const observed = { path: request.url, method: request.method, origin: request.headers.origin,
          mode: request.headers['sec-fetch-mode'], dest: request.headers['sec-fetch-dest'], site: request.headers['sec-fetch-site'],
          binding: (request.headers.cookie ?? '').includes('__Host-ovelle_saml=') }
        const headers = { ...request.headers, 'X-Fixture-Transport': control, 'X-Fixture-Observed': JSON.stringify(Object.fromEntries(
          ['Sec-Fetch-Mode', 'Sec-Fetch-Dest', 'Sec-Fetch-Site'].map(name => [name, request.headers[name.toLowerCase()] ?? null]))) }
        const result = await runtime.dispatchFetch(origin + request.url, { method: request.method, headers,
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
    const origins = [origin, idp, attacker], control = randomBytes(32).toString('hex')
    const bundle = await build({ entryPoints: ['tests/worker/stage0/saml-browser-worker.ts'], bundle: true, format: 'esm', platform: 'node', write: false,
      banner: { js: "import {createRequire} from 'node:module'; const require=createRequire('/script-0.mjs');" } })
    runtime = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-10-06',
      compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], bindings: { ORIGIN: origin, IDP: idp, ATTACKER: attacker, CONTROL: control },
      outboundService: () => { workerNetwork++; return new Response(null, { status: 503 }) } }))
    const db = await runtime.getD1Database('DB')
    for (const migration of await readD1Migrations('./migrations')) await db.batch(migration.queries.map(query => db.prepare(query)))
    const now = Date.now()
    await db.prepare("INSERT INTO accounts(id,email,display_name,email_verified_at,created_at) VALUES('d','fixture@example.test','Fixture',?,?)").bind(now, now).run()
    await db.prepare("INSERT INTO organizations(id,name,owner_account_id,created_by_account_id,created_at) VALUES('org-a','Fixture','d','d',?)").bind(now).run()
    await db.prepare("INSERT INTO identity_connections(id,organization_id,protocol,provider,issuer,created_at) VALUES('saml-a','org-a','saml','enterprise_saml','https://identity.example.test/saml',?)").bind(now).run()
    await db.prepare("INSERT INTO external_identities(id,account_id,connection_id,issuer,subject,saml_name_id_format,created_at) VALUES('linked','d','saml-a','https://identity.example.test/saml','stable-person-001','urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',?)").bind(now).run()
    proxy = await createFixtureProxy({ port, hosts: origins.map(value => new URL(value).hostname) })
    browser = await engines[engine].launch({ headless: true, proxy: { server: proxy.url } })
    const controlRequest = (path, data) => runtime.dispatchFetch(origin + '/__fixture/' + path, { method: data ? 'POST' : 'GET',
      headers: { 'X-Fixture-Control': control, 'Content-Type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}) })
    const newContext = async () => {
      const context = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: 'block' })
      await context.route('**/*', route => {
        if (origins.includes(new URL(route.request().url()).origin)) return route.continue()
        denied.push(new URL(route.request().url()).origin); return route.abort()
      })
      return context
    }
    const start = async (subject = 'stable-person-001', referrer = 'origin') => {
      assert.equal((await controlRequest('subject', { subject, referrer })).status, 204)
      const context = await newContext(), page = await context.newPage()
      page.setDefaultTimeout(10_000)
      await page.goto(origin)
      const authorizationUrl = await page.evaluate(async () => {
        const initial = await (await fetch('/api/v1/auth/prelogin')).json()
        const response = await fetch('/api/v1/auth/saml/start', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': initial.csrfToken }, body: JSON.stringify({ connectionId: 'saml-a', turnstileToken: 'fixture-only' }) })
        if (!response.ok) throw Error('Start HTTP ' + response.status)
        return (await response.json()).authorizationUrl
      })
      await page.goto(authorizationUrl)
      return { context, page }
    }
    const submit = async (page, target) => {
      await page.click('#submit'); await page.waitForURL(/\/account/)
      assert.equal(page.url(), origin + target, JSON.stringify(received.filter(request => request.path === '/api/v1/auth/saml/callback')))
    }
    const counts = async () => {
      const result = {}
      for (const table of ['accounts', 'external_identities', 'sessions', 'saml_enrollments', 'audit_events']) result[table] = (await db.prepare('SELECT count(*) AS n FROM ' + table).first()).n
      result.consumed = (await db.prepare('SELECT count(*) AS n FROM saml_transactions WHERE consumed_at IS NOT NULL').first()).n
      return result
    }
    const { context, page } = await start()
    const flow = (await context.cookies()).find(cookie => cookie.name === '__Host-ovelle_saml')
    assert.ok(flow?.httpOnly && flow.secure && flow.sameSite === 'None')
    await submit(page, '/account')
    const callback = received.find(request => request.path === '/api/v1/auth/saml/callback')
    assert.deepEqual({ method: callback.method, origin: callback.origin, mode: callback.mode, dest: callback.dest, site: callback.site, binding: callback.binding, status: callback.status },
      { method: 'POST', origin: idp, mode: 'navigate', dest: 'document', site: 'cross-site', binding: true, status: 303 })
    assert.equal(await page.evaluate(async () => (await fetch('/api/v1/me')).status), 200)
    assert.equal(await page.evaluate(() => document.cookie), '')
    const sessionCookies = await context.cookies()
    assert.ok(sessionCookies.some(cookie => cookie.name === '__Host-ovelle_session' && cookie.httpOnly && cookie.secure && cookie.sameSite === 'Strict'))
    assert.ok(!sessionCookies.some(cookie => cookie.name === '__Host-ovelle_saml'))
    const afterLogin = await counts()
    await page.goto(idp + '/replay'); await submit(page, '/account/sign-in?result=failed')
    assert.deepEqual(await counts(), afterLogin, 'A callback replay cannot issue another session')
    await context.close()

    // Wrong browser: the exact signed response remains usable by its initiator.
    const owner = await start(), other = await newContext(), foreign = await other.newPage()
    const beforeForeign = await counts()
    await foreign.goto(idp + '/replay'); await submit(foreign, '/account/sign-in?result=failed')
    assert.deepEqual(await counts(), beforeForeign)
    assert.equal(received.filter(request => request.path === '/api/v1/auth/saml/callback').at(-1).binding, false)
    await submit(owner.page, '/account')
    assert.equal((await counts()).sessions, beforeForeign.sessions + 1)
    await owner.context.close(); await other.close()

    // Valid browser binding and signed form, but a different actual form origin.
    const wrongOrigin = await start(), beforeOrigin = await counts()
    await wrongOrigin.page.goto(attacker + '/replay'); await submit(wrongOrigin.page, '/account/sign-in?result=failed')
    assert.deepEqual(await counts(), beforeOrigin)
    const wrongOriginRequest = received.filter(request => request.path === '/api/v1/auth/saml/callback').at(-1)
    assert.equal(wrongOriginRequest.origin, attacker); assert.equal(wrongOriginRequest.binding, true)
    await wrongOrigin.context.close()

    // A no-referrer IdP form really emits Origin:null; this supported-profile
    // contract intentionally rejects it without relaxing the admission policy.
    const opaque = await start('stable-person-001', 'no-referrer'), beforeOpaque = await counts()
    await submit(opaque.page, '/account/sign-in?result=failed')
    assert.deepEqual(await counts(), beforeOpaque)
    const opaqueRequest = received.filter(request => request.path === '/api/v1/auth/saml/callback').at(-1)
    assert.equal(opaqueRequest.origin, 'null'); assert.equal(opaqueRequest.binding, true)
    await opaque.context.close()

    // Actual credentialed CORS fetch, rather than navigation. No forged Sec-*
    // headers: the browser supplies cors/empty and the same legitimate Origin.
    const wrongMode = await start(), beforeMode = await counts(), callbacksBefore = received.filter(request => request.path === '/api/v1/auth/saml/callback').length
    await wrongMode.page.evaluate(async () => {
      const form = document.querySelector('form')
      try { await fetch(form.action, { method: 'POST', credentials: 'include', redirect: 'manual', body: new URLSearchParams(new FormData(form)) }) } catch { /* Expected CORS-denied response. */ }
    })
    const modeRequests = received.filter(request => request.path === '/api/v1/auth/saml/callback')
    assert.equal(modeRequests.length, callbacksBefore + 1)
    assert.equal(modeRequests.at(-1).mode, 'cors'); assert.equal(modeRequests.at(-1).dest, 'empty')
    assert.equal(modeRequests.at(-1).origin, idp); assert.equal(modeRequests.at(-1).binding, true)
    assert.equal(modeRequests.at(-1).location, '/account/sign-in?result=failed'); assert.deepEqual(await counts(), beforeMode)
    await wrongMode.context.close()

    const enrollment = await start('new-browser-person'), beforeEnrollment = await counts()
    await submit(enrollment.page, '/account/enroll')
    const pending = await counts()
    assert.equal(pending.accounts, beforeEnrollment.accounts); assert.equal(pending.sessions, beforeEnrollment.sessions)
    assert.equal(pending.saml_enrollments, beforeEnrollment.saml_enrollments + 1)
    const pendingCookies = await enrollment.context.cookies()
    assert.ok(pendingCookies.some(cookie => cookie.name === '__Host-ovelle_saml_enrollment' && cookie.httpOnly && cookie.secure && cookie.sameSite === 'Strict'))
    assert.ok(!pendingCookies.some(cookie => cookie.name === '__Host-ovelle_session' || cookie.name === '__Host-ovelle_saml'))
    const contact = await enrollment.page.evaluate(async () => {
      const initial = await (await fetch('/api/v1/auth/saml/enrollment')).json()
      const post = async csrf => fetch('/api/v1/auth/saml/enrollment/contact', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ email: 'new-browser@example.test', displayName: 'New Browser' }) })
      const wrong = await post('wrong')
      const valid = await post(initial.csrfToken)
      return { wrong: wrong.status, status: valid.status, body: await valid.json(), csrf: initial.csrfToken }
    })
    assert.equal(contact.wrong, 403); assert.equal(contact.status, 202); assert.deepEqual(contact.body, { accepted: true })
    const mail = await (await controlRequest('mail')).json()
    assert.equal(mail.length, 1)
    const link = new URL(mail[0].url), fragment = new URLSearchParams(link.hash.slice(1)), token = fragment.get('token')
    assert.equal(link.search, ''); assert.equal(fragment.get('flow'), 'saml'); assert.match(token, /^[A-Za-z0-9_-]{43}$/)
    const stranger = await newContext(), strangerPage = await stranger.newPage()
    await strangerPage.goto(origin)
    const confirm = (page, csrf) => page.evaluate(async ({ token, csrf }) => (await fetch('/api/v1/auth/saml/enrollment/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ token }) })).status, { token, csrf })
    assert.equal(await confirm(strangerPage, contact.csrf), 401, 'Mail secret alone grants no browser capability')
    assert.deepEqual(await counts(), pending)
    await stranger.close()
    await enrollment.page.goto(link.href)
    assert.equal(await confirm(enrollment.page, contact.csrf), 204)
    assert.equal(await confirm(enrollment.page, contact.csrf), 401, 'Verification is one-use')
    const me = await enrollment.page.evaluate(async () => ({ me: await (await fetch('/api/v1/me')).json(), cookie: document.cookie }))
    assert.equal(me.me.account.email, 'new-browser@example.test'); assert.equal(me.me.session.method, 'saml'); assert.equal(me.cookie, '')
    assert.equal((await db.prepare('SELECT count(*) AS n FROM organization_memberships WHERE account_id=?').bind(me.me.account.id).first()).n, 0)
    const finalCookies = await enrollment.context.cookies()
    assert.ok(finalCookies.some(cookie => cookie.name === '__Host-ovelle_session' && cookie.httpOnly && cookie.secure && cookie.sameSite === 'Strict'))
    assert.ok(!finalCookies.some(cookie => cookie.name === '__Host-ovelle_saml_enrollment'))
    assert.ok(received.every(request => !request.path.includes(token)), 'Mail credential is never sent in a URL')
    const navigation = await (await controlRequest('navigation')).json()
    const callbacks = received.filter(request => request.path === '/api/v1/auth/saml/callback')
    assert.deepEqual(navigation.map(({ mode, dest, site }) => ({ mode, dest, site })), callbacks.map(({ mode, dest, site }) => ({ mode, dest, site })), 'Transport must preserve every actual browser metadata value')
    assert.equal(workerNetwork, 0)
    // Prove the browser's outbound guard actually blocks, with a negative control.
    assert.deepEqual(denied, [])
    await enrollment.page.evaluate(async () => { try { await fetch('https://outside.example.test/') } catch { /* blocked by the fixture */ } })
    assert.deepEqual(denied, ['https://outside.example.test'])
    assert.equal(failures.length, 0, failures.join('; '))
    const sources = ['scripts/verify-stage0-saml-browser.mjs', 'scripts/stage0-browser-proxy.mjs', 'tests/worker/stage0/saml-browser-worker.ts', 'tests/worker/stage0/saml-fixture.ts', 'src/cloudflare/stage0/auth/saml/protocol.ts', 'src/cloudflare/stage0/auth/saml/authorization.ts', 'src/cloudflare/stage0/auth/saml/transactions.ts', 'src/cloudflare/stage0/auth/saml/routes.ts', 'src/cloudflare/stage0/auth/saml/enrollment.ts', 'src/cloudflare/stage0/auth/contact.ts', 'src/cloudflare/stage0/auth/web.ts', 'src/cloudflare/stage0/auth/http.ts', 'src/cloudflare/stage0/auth/sessions.ts', 'src/cloudflare/stage0/auth/limits.ts', 'src/cloudflare/stage0/db.ts', 'package-lock.json']
    const sourceHashes = Object.fromEntries(await Promise.all(sources.map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')])))
    console.log('SAML_BROWSER_VERIFIED ' + JSON.stringify({ engine, browser: browser.version(), scope: 'isolated loopback HTTPS + workerd + ephemeral D1',
      observed: { method: callback.method, mode: callback.mode, dest: callback.dest, site: callback.site, binding: callback.binding }, negativeControls: ['replay', 'foreign-browser', 'wrong-origin', 'null-origin', 'cors-fetch', 'contact-csrf', 'foreign-mail', 'mail-reuse', 'external-network'], enrollment: true, sourceHashes, realProvider: false, realMail: false, trustedPublicTls: false }))
  } finally {
    // Every resource gets a cleanup attempt even when another disposer rejects.
    try {
      const cleanup = await Promise.allSettled([
        browser?.close(), proxy?.close(), runtime?.dispose(),
        server?.listening ? new Promise((resolve, reject) => {
          server.closeAllConnections(); server.close(error => error ? reject(error) : resolve())
        }) : undefined,
      ])
      const errors = cleanup.filter(result => result.status === 'rejected').map(result => result.reason)
      assert.deepEqual(errors, [], 'Browser fixture cleanup failed')
    } finally { await rm(dir, { recursive: true, force: true }) }
  }
}

for (const engine of requested.length ? requested : Object.keys(engines)) await runBrowser(engine)
if (!requested.length) console.log('SAML_BROWSER_MATRIX_VERIFIED chromium firefox webkit')
