import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { chromium } from 'playwright'
const sources = { enroll: 'AccountEnrollmentPage', verify: 'AccountVerifyContactPage' }, bundles = {}
for (const [name, component] of Object.entries(sources)) {
  const result = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Page from './apps/web/src/${component}'; createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode,null,React.createElement(Page)));`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, format: 'esm', platform: 'browser', jsx: 'automatic', loader: { '.css': 'empty' }, write: false })
  bundles[name] = result.outputFiles[0].text
}
const browser = await chromium.launch({ headless: true }), csrf = 't'.repeat(43), token = 'v'.repeat(43)
try {
  const context = await browser.newContext({ serviceWorkers: 'block' })
  let contacts = 0, confirmations = 0
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin !== 'https://dev.ovelle.org') return route.abort()
    if (url.pathname === '/account/enroll' || url.pathname === '/account/verify-contact') return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><div id="root"></div><script type="module" src="/${url.pathname.endsWith('enroll') ? 'enroll' : 'verify'}.js"></script>` })
    if (url.pathname === '/enroll.js' || url.pathname === '/verify.js') return route.fulfill({ status: 200, contentType: 'text/javascript', body: bundles[url.pathname.slice(1, -3)] })
    if (url.pathname === '/api/v1/auth/enrollment') return route.fulfill({ status: 200, json: { csrfToken: csrf, emailHint: 'person@example.test', displayNameHint: 'Person' } })
    if (url.pathname === '/api/v1/auth/enrollment/contact') { contacts++; assert.equal(request.headers()['x-csrf-token'], csrf); assert.deepEqual(request.postDataJSON(), { displayName: 'Person', email: 'person@example.test' }); return route.fulfill({ status: 202, json: { accepted: true } }) }
    if (url.pathname === '/api/v1/auth/enrollment/confirm') { confirmations++; assert.equal(request.headers()['x-csrf-token'], csrf); assert.deepEqual(request.postDataJSON(), { token }); return route.fulfill({ status: 204 }) }
    if (url.pathname === '/api/v1/me') return route.fulfill({ status: 401, json: { error: 'unauthenticated' } })
    if (url.pathname === '/account') return route.fulfill({ status: 200, body: 'Account fixture' })
    return route.abort()
  })
  const enroll = await context.newPage(); await enroll.goto('https://dev.ovelle.org/account/enroll')
  await enroll.getByLabel('Contact email').waitFor(); assert.equal(contacts, 0)
  await enroll.getByRole('button', { name: 'Continue' }).click(); await enroll.getByRole('status').waitFor(); assert.equal(contacts, 1)
  const verify = await context.newPage(); await verify.goto(`https://dev.ovelle.org/account/verify-contact#token=${token}`)
  const button = verify.getByRole('button', { name: 'Confirm email' }); await button.waitFor(); await verify.waitForFunction(() => !document.querySelector('button').disabled)
  assert.equal(new URL(verify.url()).hash, ''); assert.equal(confirmations, 0)
  await button.click(); await verify.getByText('Account fixture').waitFor(); assert.equal(confirmations, 1)
  const invalid = await context.newPage(); await invalid.goto(`https://dev.ovelle.org/account/verify-contact#token=${token}&token=${token}`)
  await invalid.getByRole('alert').waitFor(); assert.equal(new URL(invalid.url()).hash, ''); assert.equal(confirmations, 1)
  console.log('Account enrollment pages: explicit contact and confirmation, CSRF and token fragment removal passed with fixture HTTP.')
} finally { await browser.close() }
