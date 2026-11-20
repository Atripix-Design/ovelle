import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { chromium } from 'playwright'
const bundle = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import SignIn from './apps/web/src/AccountSignInPage'; createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode,null,React.createElement(SignIn)));`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, format: 'esm', platform: 'browser', jsx: 'automatic', loader: { '.css': 'empty' }, write: false })
const browser = await chromium.launch({ headless: true }), csrf = 't'.repeat(43)
try {
  const context = await browser.newContext({ serviceWorkers: 'block' })
  let invalid = true, posts = 0, prelogins = 0
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin === 'https://challenges.cloudflare.com') return route.fulfill({ status: 200, contentType: 'text/javascript', body: `window.turnstile={render:(element,options)=>{window.finishVerification=options.callback;return 'widget'},remove:()=>{},reset:()=>{}}` })
    if (url.origin === 'https://login.microsoftonline.com') return route.fulfill({ status: 200, body: 'Provider fixture' })
    if (url.origin !== 'https://dev.ovelle.org') return route.abort()
    if (url.pathname === '/account/sign-in') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><div id="root"></div><script type="module" src="/fixture.js"></script>' })
    if (url.pathname === '/fixture.js') return route.fulfill({ status: 200, contentType: 'text/javascript', body: bundle.outputFiles[0].text })
    if (url.pathname === '/api/v1/auth/prelogin') { prelogins++; return route.fulfill({ status: 200, json: { csrfToken: csrf, siteKey: 'public-test-key' } }) }
    if (url.pathname === '/api/v1/auth/oidc/microsoft/start') {
      posts++; assert.equal(request.headers()['x-csrf-token'], csrf); assert.deepEqual(request.postDataJSON(), { turnstileToken: 'fixture-token' })
      return route.fulfill({ status: 200, json: { authorizationUrl: invalid ? 'https://evil.example/steal' : 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?state=fixture' } })
    }
    return route.abort()
  })
  const page = await context.newPage()
  await page.goto('https://dev.ovelle.org/account/sign-in')
  const microsoft = page.getByRole('button', { name: 'Continue with Microsoft' })
  await page.waitForFunction(() => typeof window.finishVerification === 'function')
  assert.equal(await microsoft.isDisabled(), true)
  assert.equal(prelogins, 1, 'Strict Mode must not create racing prelogin cookies')
  await page.evaluate(() => window.finishVerification('fixture-token'))
  await microsoft.click()
  await page.getByRole('alert').waitFor()
  assert.equal(new URL(page.url()).origin, 'https://dev.ovelle.org')
  assert.equal(posts, 1)
  invalid = false
  await page.waitForFunction(() => typeof window.finishVerification === 'function')
  await page.evaluate(() => window.finishVerification('fixture-token'))
  await microsoft.click()
  await page.getByText('Provider fixture').waitFor()
  assert.equal(posts, 2)
  console.log('Account sign-in page: single prelogin, verification gate, CSRF and fixed provider redirects passed with simulated widget and HTTP.')
} finally { await browser.close() }
