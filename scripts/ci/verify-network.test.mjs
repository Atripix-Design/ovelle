import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { verifyRemote } from './verify-network.mjs'

async function fixture(handler, run) {
  const server = createServer(handler)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try { await run(`http://127.0.0.1:${server.address().port}`) }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
}

test('retries a truncated download body and validates the complete replacement', async () => {
  let requests = 0
  await fixture((request, response) => {
    requests++
    response.writeHead(200, { 'content-length': '2' })
    response.flushHeaders()
    if (requests === 1) { response.write('P'); setTimeout(() => response.destroy(), 5) }
    else response.end('PK')
  }, async url => {
    const value = await verifyRemote('package sample', async signal => {
      const response = await fetch(url, { signal })
      const bytes = Buffer.from(await response.arrayBuffer())
      assert.equal(bytes.toString('ascii'), 'PK')
      return bytes.length
    }, { delay: async () => {} })
    assert.equal(value, 2)
    assert.equal(requests, 2)
  })
})

test('bounds a stalled response and stops after the configured number of attempts', async () => {
  let requests = 0
  await fixture(() => { requests++ }, async url => {
    await assert.rejects(verifyRemote('stalled sample', signal => fetch(url, { signal }), { timeoutMs: 100, attempts: 2, delay: async () => {} }), /stalled sample: network verification failed after 2 attempts/)
    assert.equal(requests, 2)
  })
})

test('does not retry validation failures or hide a permanently wrong package', async () => {
  let requests = 0
  await fixture((request, response) => { requests++; response.end('XX') }, async url => {
    await assert.rejects(verifyRemote('package sample', async signal => {
      const response = await fetch(url, { signal })
      if (await response.text() !== 'PK') throw new Error('Invalid package signature')
    }, { delay: async () => {} }), /Invalid package signature/)
    assert.equal(requests, 1)
  })
})

test('does not print signed URLs or raw transport errors when retries are exhausted', async () => {
  let attempts = 0
  const privateDetail = 'https://example.test/?X-Amz-Signature=private-fixture'
  await assert.rejects(verifyRemote('signed package sample', async () => {
    attempts++
    throw new TypeError(privateDetail, { cause: Object.assign(new Error(privateDetail), { code: 'ECONNRESET' }) })
  }, { delay: async () => {} }), error => {
    assert.equal(attempts, 3)
    assert.match(error.message, /signed package sample: network verification failed after 3 attempts/)
    assert.equal(error.cause, undefined)
    assert.ok(!error.stack.includes('private-fixture'))
    return true
  })
})
