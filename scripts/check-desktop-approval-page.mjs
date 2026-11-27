import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { chromium } from 'playwright'

const bundle = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Approval from './apps/web/src/DesktopApprovalPage'; createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode,null,React.createElement(Approval)));`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, format: 'esm', platform: 'browser', jsx: 'automatic', loader: { '.css': 'empty' }, write: false })
const state = 's'.repeat(43), code = 'c'.repeat(43), csrf = 't'.repeat(43)
const browser = await chromium.launch({ headless: true })
try {
  const context = await browser.newContext({ serviceWorkers: 'block' })
  let signedIn = false, posts = 0
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url())
    if (url.hostname === '127.0.0.1' && url.pathname === '/ovelle-auth/callback') return route.fulfill({ status: 200, body: 'Connected fixture' })
    if (url.origin !== 'https://dev.ovelle.org') return route.abort()
    if (url.pathname === '/desktop/authorize') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><div id="root"></div><script type="module" src="/fixture.js"></script>' })
    if (url.pathname === '/fixture.js') return route.fulfill({ status: 200, contentType: 'text/javascript', body: bundle.outputFiles[0].text })
    if (url.pathname === '/api/v1/me') return route.fulfill(signedIn ? { status: 200, json: { account: { displayName: 'Owner', email: 'owner@example.test' }, csrfToken: csrf } } : { status: 401, json: { error: 'unauthenticated' } })
    if (url.pathname === '/api/v1/auth/desktop/approve') {
      posts++
      assert.equal(req.headers()['x-csrf-token'], csrf)
      assert.deepEqual(req.postDataJSON(), { requestId: 'request-1', state, confirmation: true })
      return route.fulfill({ status: 200, json: { callbackUrl: `http://127.0.0.1:12345/ovelle-auth/callback?code=${code}&state=${state}` } })
    }
    return route.abort()
  })
  const page = await context.newPage()
  await page.goto(`https://dev.ovelle.org/desktop/authorize#requestId=request-1&state=${state}`)
  await page.getByRole('button', { name: 'Check sign-in' }).waitFor()
  assert.equal(new URL(page.url()).hash, '')
  assert.equal(posts, 0)
  signedIn = true
  await page.getByRole('button', { name: 'Check sign-in' }).click()
  await page.getByText('owner@example.test').waitFor()
  assert.equal(posts, 0)
  await page.getByRole('button', { name: 'Approve device' }).click()
  await page.getByText('Connected fixture').waitFor()
  assert.equal(posts, 1)
  const cancelled = await context.newPage()
  await cancelled.goto(`https://dev.ovelle.org/desktop/authorize#requestId=request-1&state=${state}`)
  await cancelled.getByRole('button', { name: 'Cancel' }).click()
  await cancelled.getByText('Request cancelled.', { exact: false }).waitFor()
  assert.equal(posts, 1)
  const invalid = await context.newPage()
  await invalid.goto(`https://dev.ovelle.org/desktop/authorize#requestId=request-1&state=${state}&state=${state}`)
  await invalid.getByRole('alert').waitFor()
  assert.equal(new URL(invalid.url()).hash, '')
  assert.equal(await invalid.getByRole('button', { name: 'Approve device' }).count(), 0)
  console.log('Desktop approval page: sign-in check, explicit approval, cancel and malformed fragment passed with fixture HTTP.')
} finally { await browser.close() }
