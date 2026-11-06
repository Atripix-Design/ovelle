import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright'

const require = createRequire(import.meta.url)
const application = await _electron.launch({
  executablePath: require('electron'),
  args: ['--disable-gpu', fileURLToPath(new URL('../apps/desktop/out/main/index.js', import.meta.url))],
})
try {
  const page = await application.firstWindow()
  await page.waitForFunction(() => Boolean(window.ovelleDownloads))
  await application.evaluate(() => {
    globalThis.ipcRequests = []
    globalThis.ipcReply = { status: 200, body: { releases: [{ id: 'fixture' }] } }
    globalThis.fetch = async (url, init) => {
      globalThis.ipcRequests.push({ url, ...init })
      const { body, status } = globalThis.ipcReply
      return Response.json(body, { status })
    }
  })
  assert.deepEqual(await page.evaluate(() => window.ovelleDownloads.loadReleases()), [{ id: 'fixture' }])
  await application.evaluate(() => {
    globalThis.ipcRequests = []
    globalThis.ipcReply = { status: 200, body: { sent: true } }
  })
  await page.evaluate(() => window.ovelleDownloads.emailLink('reader@example.com'))
  const requests = await application.evaluate(() => globalThis.ipcRequests)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, 'https://dev.ovelle.org/api/download-email')
  assert.equal(requests[0].method, 'POST')
  assert.deepEqual(JSON.parse(requests[0].body), { email: 'reader@example.com' })

  for (const email of [null, 7, {}, 'a'.repeat(255)]) {
    await assert.rejects(page.evaluate(email => window.ovelleDownloads.emailLink(email), email), /Invalid email/)
  }
  assert.equal((await application.evaluate(() => globalThis.ipcRequests)).length, 1)

  await application.evaluate(() => { globalThis.ipcReply = { status: 503, body: {} } })
  await assert.rejects(page.evaluate(() => window.ovelleDownloads.loadReleases()), /Download catalog unavailable/)
  await assert.rejects(page.evaluate(() => window.ovelleDownloads.emailLink('reader@example.com')), /Email delivery unavailable/)
  await application.evaluate(() => { globalThis.ipcReply = { status: 200, body: { sent: false } } })
  await assert.rejects(page.evaluate(() => window.ovelleDownloads.emailLink('reader@example.com')), /Email delivery unavailable/)

  // Navigation must invalidate authority even though the same native window and
  // preload bridge survive. Rejection must precede any outbound request.
  await page.goto('about:blank')
  await page.waitForFunction(() => Boolean(window.ovelleDownloads))
  await application.evaluate(() => { globalThis.ipcRequests = [] })
  await assert.rejects(page.evaluate(() => window.ovelleDownloads.loadReleases()), /Untrusted download request/)
  await assert.rejects(page.evaluate(() => window.ovelleDownloads.emailLink('reader@example.com')), /Untrusted download request/)
  assert.deepEqual(await application.evaluate(() => globalThis.ipcRequests), [])
  const isolation = await application.evaluate(({ BrowserWindow }) => {
    const preferences = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences()
    return { sandbox: preferences.sandbox, contextIsolation: preferences.contextIsolation, nodeIntegration: preferences.nodeIntegration }
  })
  assert.deepEqual(isolation, { sandbox: true, contextIsolation: true, nodeIntegration: false })
  console.log('Real Electron preload/main IPC: requests, validation, failure propagation, navigation revocation and isolation passed (fixture HTTP responses).')
} finally {
  await application.close()
}
