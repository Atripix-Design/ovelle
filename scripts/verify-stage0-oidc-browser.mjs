import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { build } from 'esbuild'
import { browserEngines, createBrowserHarness } from './stage0-browser-harness.mjs'

const signInBundle = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import SignIn from './apps/web/src/AccountSignInPage'; createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode,null,React.createElement(SignIn)));`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, format: 'esm', platform: 'browser', jsx: 'automatic', loader: { '.css': 'empty' }, write: false })
const enrollmentBundle = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Page from './apps/web/src/AccountEnrollmentPage'; createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode,null,React.createElement(Page)));`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, format: 'esm', platform: 'browser', jsx: 'automatic', loader: { '.css': 'empty' }, write: false })
const verifyBundle = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Page from './apps/web/src/AccountVerifyContactPage'; createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode,null,React.createElement(Page)));`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, format: 'esm', platform: 'browser', jsx: 'automatic', loader: { '.css': 'empty' }, write: false })
const requested = process.argv.slice(2)
assert.ok(requested.length <= 1 && (!requested.length || Object.hasOwn(browserEngines, requested[0])), 'Expected optional chromium, firefox or webkit')
async function runBrowser(engine) {
  const harness = await createBrowserHarness(engine, { worker: 'tests/worker/stage0/oidc-browser-worker.ts',
    providerOrigins: ['https://accounts.google.com', 'https://login.microsoftonline.com'], bindingCookie: '__Host-ovelle_oidc' })
  const { origin, db, browser, received, controlRequest, newContext } = harness
  const idp = provider => provider === 'google' ? 'https://accounts.google.com' : 'https://login.microsoftonline.com'
  const callbacks = () => received.filter(row => /\/oidc\/(google|microsoft)\/callback$/.test(row.path))
  try {
    const now = Date.now()
    await db.prepare("INSERT INTO accounts(id,email,display_name,email_verified_at,created_at) VALUES('d','fixture@example.test','Fixture',?,?)").bind(now, now).run()
    for (const provider of ['google', 'microsoft']) {
      const issuer = provider === 'google' ? 'https://accounts.google.com' : 'https://login.microsoftonline.com/{tenantid}/v2.0'
      const identityIssuer = provider === 'google' ? issuer : 'https://login.microsoftonline.com/11111111-1111-4111-8111-111111111111/v2.0'
      await db.prepare("INSERT INTO identity_connections(id,protocol,provider,issuer,client_id,created_at) VALUES(?,'oidc',?,?,'fixture-client',?)").bind(provider, provider, issuer, now).run()
      await db.prepare('INSERT INTO external_identities(id,account_id,connection_id,issuer,subject,tenant_id,created_at) VALUES(?,?,?,?,?,?,?)')
        .bind(provider, 'd', provider, identityIssuer, 'exact-subject', provider === 'microsoft' ? '11111111-1111-4111-8111-111111111111' : null, now).run()
    }
    const counts = async () => {
      const value = {}
      for (const table of ['accounts', 'external_identities', 'sessions', 'oidc_enrollments', 'audit_events']) value[table] = (await db.prepare('SELECT count(*) AS n FROM ' + table).first()).n
      value.consumed = (await db.prepare('SELECT count(*) AS n FROM oidc_transactions WHERE consumed_at IS NOT NULL').first()).n
      return value
    }
    const start = async (provider = 'google', input = {}, existing) => {
      const purpose = input.purpose ?? 'login'
      assert.equal((await controlRequest('selection', { provider, subject: 'exact-subject', email: 'person@gmail.com', purpose, fail: false, ...input })).status, 204)
      const context = existing ?? await newContext(), page = await context.newPage()
      page.setDefaultTimeout(10_000); await page.goto(origin)
      const authorizationUrl = await page.evaluate(async ({ provider, purpose }) => {
        const initial = await (await fetch(purpose === 'link' ? '/api/v1/me' : '/api/v1/auth/prelogin')).json()
        const response = await fetch(`/api/v1/auth/oidc/${provider}/${purpose === 'link' ? 'link' : 'start'}`, { method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': initial.csrfToken }, body: JSON.stringify({ turnstileToken: 'fixture-only' }) })
        if (!response.ok) throw Error('Start HTTP ' + response.status)
        return (await response.json()).authorizationUrl
      }, { provider, purpose })
      const cookie = (await context.cookies()).find(item => item.name === '__Host-ovelle_oidc')
      assert.ok(cookie?.httpOnly && cookie.secure && cookie.sameSite === 'Lax')
      await page.goto(authorizationUrl)
      return { context, page }
    }
    const submit = async (page, target) => {
      await page.click('#submit'); await page.waitForURL(/\/account/)
      assert.equal(page.url(), origin + target, JSON.stringify(callbacks()))
    }
    const me = page => page.evaluate(async () => ({ status: (await fetch('/api/v1/me')).status, cookie: document.cookie }))
    for (const provider of ['google', 'microsoft']) {
      const login = await start(provider)
      await submit(login.page, '/account')
      const callback = callbacks().at(-1)
      assert.deepEqual({ method: callback.method, origin: callback.origin, mode: callback.mode, dest: callback.dest, site: callback.site, binding: callback.binding, session: callback.session, status: callback.status },
        { method: 'GET', origin: undefined, mode: 'navigate', dest: 'document', site: 'cross-site', binding: true, session: false, status: 303 })
      assert.deepEqual(await me(login.page), { status: 200, cookie: '' })
      const cookies = await login.context.cookies()
      assert.ok(cookies.some(cookie => cookie.name === '__Host-ovelle_session' && cookie.secure && cookie.httpOnly && cookie.sameSite === 'Strict'))
      assert.ok(!cookies.some(cookie => cookie.name === '__Host-ovelle_oidc'))
      const beforeReplay = await counts()
      await login.page.goto(idp(provider) + '/replay'); await submit(login.page, '/account/sign-in?result=failed')
      assert.deepEqual(await counts(), beforeReplay)
      await login.context.close()
    }

    // Exercise the actual sign-in page against the OIDC service. Only the
    // external widget is simulated; the server still verifies its fixture token.
    assert.equal((await controlRequest('selection', { provider: 'google', subject: 'exact-subject', email: 'person@gmail.com', purpose: 'login', fail: false })).status, 204)
    const uiContext = await newContext()
    await uiContext.route('**/account/sign-in', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><div id="root"></div><script type="module" src="/fixture-signin.js"></script>' }))
    await uiContext.route('**/fixture-signin.js', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: signInBundle.outputFiles[0].text }))
    await uiContext.route('https://challenges.cloudflare.com/**', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: "window.turnstile={render:(el,opts)=>{window.fixtureVerify=opts.callback;return 'fixture'},remove:()=>{},reset:()=>{}}" }))
    const uiPage = await uiContext.newPage(); uiPage.setDefaultTimeout(10000)
    await uiPage.goto(origin + '/account/sign-in')
    await uiPage.waitForFunction(() => typeof window.fixtureVerify === 'function')
    await uiPage.evaluate(() => window.fixtureVerify('fixture-only'))
    await uiPage.getByRole('button', { name: 'Continue with Google' }).click()
    await submit(uiPage, '/account')
    assert.deepEqual(await me(uiPage), { status: 200, cookie: '' })
    await uiContext.close()

    const uiEnrollment = await start('google', { subject: 'ui-new-subject', email: 'ui-new@gmail.com' })
    await uiEnrollment.context.route('**/account/enroll', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><div id="root"></div><script type="module" src="/fixture-enroll.js"></script>' }))
    await uiEnrollment.context.route('**/fixture-enroll.js', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: enrollmentBundle.outputFiles[0].text }))
    await submit(uiEnrollment.page, '/account/enroll')
    await uiEnrollment.page.reload()
    await uiEnrollment.page.getByLabel('Name', { exact: true }).fill('UI New Volunteer')
    await uiEnrollment.page.getByLabel('Contact email').fill('ui-new@gmail.com')
    await uiEnrollment.page.getByRole('button', { name: 'Continue' }).click()
    await uiEnrollment.page.waitForURL(origin + '/account')
    assert.equal((await me(uiEnrollment.page)).status, 200)
    assert.ok(await db.prepare("SELECT id FROM accounts WHERE email='ui-new@gmail.com'").first())
    await uiEnrollment.context.close()

    const uiMailEnrollment = await start('microsoft', { subject: 'ui-mail-subject', email: 'ui-mail@example.test' })
    await uiMailEnrollment.context.route('**/account/enroll', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><div id="root"></div><script type="module" src="/fixture-enroll.js"></script>' }))
    await uiMailEnrollment.context.route('**/fixture-enroll.js', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: enrollmentBundle.outputFiles[0].text }))
    await uiMailEnrollment.context.route('**/account/verify-contact', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><div id="root"></div><script type="module" src="/fixture-verify.js"></script>' }))
    await uiMailEnrollment.context.route('**/fixture-verify.js', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: verifyBundle.outputFiles[0].text }))
    await submit(uiMailEnrollment.page, '/account/enroll'); await uiMailEnrollment.page.reload()
    await uiMailEnrollment.page.getByLabel('Name', { exact: true }).fill('UI Mail Volunteer')
    await uiMailEnrollment.page.getByLabel('Contact email').fill('ui-mail@example.test')
    await uiMailEnrollment.page.getByRole('button', { name: 'Continue' }).click()
    await uiMailEnrollment.page.getByRole('status').waitFor()
    assert.equal(await db.prepare("SELECT id FROM accounts WHERE email='ui-mail@example.test'").first(), null)
    const mailItems = await (await controlRequest('mail')).json(), verifyUrl = mailItems.at(-1)?.url
    assert.ok(verifyUrl)
    const verifyPage = await uiMailEnrollment.context.newPage(); await verifyPage.goto(verifyUrl)
    const confirm = verifyPage.getByRole('button', { name: 'Confirm email' }); await confirm.waitFor()
    assert.equal(new URL(verifyPage.url()).hash, '')
    assert.equal(await db.prepare("SELECT id FROM accounts WHERE email='ui-mail@example.test'").first(), null)
    await confirm.click(); await verifyPage.waitForURL(origin + '/account')
    assert.equal((await me(verifyPage)).status, 200)
    assert.ok(await db.prepare("SELECT id FROM accounts WHERE email='ui-mail@example.test'").first())
    await uiMailEnrollment.context.close()

    const owner = await start(), other = await newContext(), foreign = await other.newPage(), beforeForeign = await counts()
    await foreign.goto(idp('google') + '/replay'); await submit(foreign, '/account/sign-in?result=failed')
    assert.equal(callbacks().at(-1).binding, false); assert.deepEqual(await counts(), beforeForeign)
    await submit(owner.page, '/account')
    assert.equal((await counts()).sessions, beforeForeign.sessions + 1)
    await owner.context.close(); await other.close()

    const cors = await start(), beforeCors = await counts()
    await cors.page.evaluate(async () => { try { await fetch(document.querySelector('#submit').href, { credentials: 'include', redirect: 'manual' }) } catch { /* CORS denial is expected. */ } })
    const corsRequest = callbacks().at(-1)
    assert.equal(corsRequest.mode, 'cors'); assert.equal(corsRequest.dest, 'empty')
    assert.equal(corsRequest.origin, idp('google')); assert.equal(corsRequest.location, '/account/sign-in?result=failed')
    assert.deepEqual(await counts(), beforeCors); await cors.context.close()

    const wrongState = await start(), beforeState = await counts()
    await wrongState.page.evaluate(() => { const a = document.querySelector('#submit'); const url = new URL(a.href); url.searchParams.set('state', 'w'.repeat(43)); a.href = url.href })
    await submit(wrongState.page, '/account/sign-in?result=failed')
    assert.deepEqual(await counts(), beforeState); await wrongState.context.close()
    const failed = await start('google', { fail: true }), beforeFailure = await counts()
    await submit(failed.page, '/account/sign-in?result=failed')
    assert.deepEqual(await counts(), { ...beforeFailure, consumed: beforeFailure.consumed + 1 }); await failed.context.close()

    // Linking uses the recorded initiating session when Strict is absent from
    // the actual cross-site return; it must not mint a replacement session.
    const linking = await start(); await submit(linking.page, '/account')
    const session = (await linking.context.cookies()).find(cookie => cookie.name === '__Host-ovelle_session').value
    const beforeLink = await counts(), link = await start('microsoft', { subject: 'linked-extra', purpose: 'link' }, linking.context)
    await submit(link.page, '/account/security')
    assert.equal(callbacks().at(-1).session, false); assert.equal(callbacks().at(-1).binding, true)
    assert.equal((await counts()).sessions, beforeLink.sessions)
    assert.ok((await linking.context.cookies()).find(cookie => cookie.name === '__Host-ovelle_session').value === session)
    assert.equal((await db.prepare("SELECT account_id FROM external_identities WHERE subject='linked-extra'").first()).account_id, 'd')
    assert.deepEqual(await me(link.page), { status: 200, cookie: '' })
    const revoked = await start('microsoft', { subject: 'must-not-link', purpose: 'link' }, linking.context)
    await linking.page.goto(origin)
    assert.equal(await linking.page.evaluate(async () => { const { csrfToken } = await (await fetch('/api/v1/me')).json(); return (await fetch('/api/v1/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': csrfToken } })).status }), 204)
    const beforeRevoked = await counts(); await submit(revoked.page, '/account/sign-in?result=failed')
    assert.deepEqual(await counts(), beforeRevoked); assert.equal(callbacks().at(-1).binding, true)
    assert.equal(await db.prepare("SELECT id FROM external_identities WHERE subject='must-not-link'").first(), null)
    await linking.context.close()

    for (const provider of ['google', 'microsoft']) {
      const email = provider === 'google' ? 'new-google@gmail.com' : 'new-microsoft@example.test'
      const enrollment = await start(provider, { subject: 'new-' + provider, email }), before = await counts()
      await submit(enrollment.page, '/account/enroll')
      const pending = await counts()
      assert.equal(pending.accounts, before.accounts); assert.equal(pending.sessions, before.sessions)
      assert.equal(pending.oidc_enrollments, before.oidc_enrollments + 1)
      const mailBefore = (await (await controlRequest('mail')).json()).length
      const contact = await enrollment.page.evaluate(async email => {
        const { csrfToken } = await (await fetch('/api/v1/auth/enrollment')).json()
        const post = csrf => fetch('/api/v1/auth/enrollment/contact', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ email, displayName: 'Browser Fixture' }) })
        return { wrong: (await post('wrong')).status, status: (await post(csrfToken)).status, csrfToken }
      }, email)
      assert.equal(contact.wrong, 403); assert.equal(contact.status, 202)
      const mail = await (await controlRequest('mail')).json()
      if (provider === 'google') assert.equal(mail.length, mailBefore, 'Matching authoritative Google contact needs no mail')
      else {
        assert.equal((await counts()).accounts, pending.accounts)
        assert.ok(!(await enrollment.context.cookies()).some(cookie => cookie.name === '__Host-ovelle_session'))
        assert.equal(mail.length, mailBefore + 1)
        const url = new URL(mail.at(-1).url), token = new URLSearchParams(url.hash.slice(1)).get('token')
        assert.equal(url.search, ''); assert.match(token, /^[A-Za-z0-9_-]{43}$/)
        const confirm = page => page.evaluate(async ({ token, csrfToken }) => (await fetch('/api/v1/auth/enrollment/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify({ token }) })).status, { token, csrfToken: contact.csrfToken })
        const stranger = await newContext(), page = await stranger.newPage(); await page.goto(origin)
        assert.equal(await confirm(page), 401); assert.deepEqual(await counts(), pending); await stranger.close()
        await enrollment.page.goto(url.href)
        assert.equal(await confirm(enrollment.page), 204); assert.equal(await confirm(enrollment.page), 401)
        assert.ok(!harness.urlContains(token), 'Mail credential must stay out of HTTPS URLs')
      }
      assert.deepEqual(await me(enrollment.page), { status: 200, cookie: '' })
      const current = await enrollment.page.evaluate(async () => (await (await fetch('/api/v1/me')).json()).account)
      assert.equal(current.email, email)
      assert.equal((await counts()).accounts, pending.accounts + 1)
      assert.equal((await db.prepare('SELECT count(*) AS n FROM organization_memberships WHERE account_id=?').bind(current.id).first()).n, 0)
      assert.ok(!(await enrollment.context.cookies()).some(cookie => ['__Host-ovelle_oidc', '__Host-ovelle_enrollment'].includes(cookie.name)))
      await enrollment.context.close()
    }
    const navigation = await (await controlRequest('navigation')).json()
    assert.deepEqual(navigation, callbacks().map(({ mode, dest, site }) => ({ mode, dest, site })))
    assert.equal(harness.workerNetwork(), 0); assert.deepEqual(harness.denied, [])
    const external = await newContext(), page = await external.newPage(); await page.goto(origin)
    await page.evaluate(async () => { try { await fetch('https://outside.example.test/') } catch { /* fixture guard */ } })
    assert.deepEqual(harness.denied, ['https://outside.example.test']); await external.close()
    assert.deepEqual(harness.failures, [])
    const stats = await (await controlRequest('stats')).json(); assert.ok(stats.pkce > 0 && stats.exchanges > stats.pkce)
    const sources = ['apps/web/src/AccountSignInPage.tsx', 'apps/web/src/AccountEnrollmentPage.tsx', 'apps/web/src/AccountVerifyContactPage.tsx', 'scripts/verify-stage0-oidc-browser.mjs', 'scripts/stage0-browser-harness.mjs', 'scripts/stage0-browser-proxy.mjs', 'tests/worker/stage0/browser-transport.ts', 'tests/worker/stage0/oidc-browser-worker.ts', 'tests/worker/stage0/oidc-protocol-fixture.ts', 'src/cloudflare/stage0/auth/oidc/protocol.ts', 'src/cloudflare/stage0/auth/oidc/transactions.ts', 'src/cloudflare/stage0/auth/oidc/routes.ts', 'src/cloudflare/stage0/auth/oidc/enrollment.ts', 'src/cloudflare/stage0/auth/sessions.ts', 'src/cloudflare/stage0/auth/http.ts', 'package-lock.json']
    const sourceHashes = Object.fromEntries(await Promise.all(sources.map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')])))
    console.log('OIDC_BROWSER_VERIFIED ' + JSON.stringify({ engine, browser: browser.version(), scope: 'isolated loopback HTTPS + workerd + ephemeral D1', providers: ['google', 'microsoft'], observed: { method: callbacks()[0].method, mode: callbacks()[0].mode, dest: callbacks()[0].dest, site: callbacks()[0].site, binding: callbacks()[0].binding },
      linkingWithoutStrictCookie: true, authoritativeGoogleContact: true, separateMicrosoftContact: true, negativeControls: ['replay', 'foreign-browser', 'cors-fetch', 'wrong-state', 'provider-error', 'revoked-link-session', 'contact-csrf', 'foreign-mail', 'mail-reuse', 'external-network'], sourceHashes, realProvider: false, realMail: false, trustedPublicTls: false }))
  } finally { await harness.close() }
}
for (const engine of requested.length ? requested : Object.keys(browserEngines)) await runBrowser(engine)
if (!requested.length) console.log('OIDC_BROWSER_MATRIX_VERIFIED chromium firefox webkit')
