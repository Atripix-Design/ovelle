import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertPresignedDownload, assertReleaseSample } from './desktop-release-validation.mjs'

const options = { accountId: 'fixture-account', environment: 'development', filename: 'Ovelle-0.1.0-mac-arm64.zip' }
const valid = () => new URL('https://fixture-account.r2.cloudflarestorage.com/ovelle-storage-development/releases/desktop/Ovelle-0.1.0-mac-arm64.zip?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=300')

const sampleOptions = { filename: 'Ovelle-0.1.0-mac-arm64.zip', size: 2_000_000 }
function sample(body = 'PK', headers = {}, status = 206) {
  return new Response(body, { status, headers: {
    'content-range': 'bytes 0-1/2000000', 'content-length': '2',
    'content-disposition': 'attachment; filename="Ovelle-0.1.0-mac-arm64.zip"', ...headers,
  } })
}

test('validates ZIP and executable samples including split stream chunks', async () => {
  await assertReleaseSample(sample(), sampleOptions)
  const filename = 'Ovelle-0.1.0-win-x64.exe'
  await assertReleaseSample(sample('MZ', { 'content-disposition': `attachment; filename="${filename}"` }), { ...sampleOptions, filename })
  const split = new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array([0x50])); controller.enqueue(new Uint8Array([0x4b])); controller.close()
  } })
  await assertReleaseSample(sample(split), sampleOptions)
})

test('rejects malformed or inconsistent range metadata and cancels the body', async () => {
  for (const range of ['', 'bytes 0-1/NaN', 'bytes 0-1/*', 'bytes 0-1/999999', 'bytes 1-2/2000000', 'bytes 0-1/2000001']) {
    let cancelled = false
    const response = sample(new ReadableStream({ cancel() { cancelled = true } }), { 'content-range': range })
    await assert.rejects(assertReleaseSample(response, sampleOptions), /range metadata/)
    assert.equal(cancelled, true)
  }
  for (const headers of [
    { 'content-length': '' }, { 'content-length': '3' },
    { 'content-disposition': 'attachment; filename="other.zip"' },
    { 'content-disposition': 'inline; filename="Ovelle-0.1.0-mac-arm64.zip"' },
  ]) await assert.rejects(assertReleaseSample(sample('PK', headers), sampleOptions), /range metadata/)
  for (const size of [NaN, Infinity, 0, 999999, 2_000_000.5]) {
    await assert.rejects(assertReleaseSample(sample(), { ...sampleOptions, size }), /range metadata/)
  }
  await assert.rejects(assertReleaseSample(sample('PK', {}, 200), sampleOptions), /range metadata/)
})

test('rejects empty, wrong, truncated and oversized samples despite claimed length', async () => {
  for (const body of ['', 'P', 'MZ', 'PKextra']) {
    await assert.rejects(assertReleaseSample(sample(body), sampleOptions), /release sample/)
  }
  await assert.rejects(assertReleaseSample(sample(null), sampleOptions), /Missing release sample/)
  let cancelled = false
  const oversized = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array([0x50, 0x4b, 0])) },
    cancel() { cancelled = true },
  })
  await assert.rejects(assertReleaseSample(sample(oversized), sampleOptions), /Oversized/)
  assert.equal(cancelled, true)
})

test('accepts the exact destination with a positive lifetime up to five minutes', () => {
  for (const seconds of ['1', '60', '300']) {
    const url = valid(); url.searchParams.set('X-Amz-Expires', seconds)
    assert.doesNotThrow(() => assertPresignedDownload(url, options))
  }
})

test('rejects missing, ambiguous and noncanonical expiry or algorithm', () => {
  for (const expiry of ['', '0', '-1', '301', 'NaN', 'Infinity', '1e2', '1.5', '0300', ' 300']) {
    const url = valid(); url.searchParams.set('X-Amz-Expires', expiry)
    assert.throws(() => assertPresignedDownload(url, options), /invalid R2/)
  }
  for (const field of ['X-Amz-Expires', 'X-Amz-Algorithm']) {
    const missing = valid(); missing.searchParams.delete(field)
    assert.throws(() => assertPresignedDownload(missing, options), /invalid R2/)
    const duplicate = valid(); duplicate.searchParams.append(field, duplicate.searchParams.get(field))
    assert.throws(() => assertPresignedDownload(duplicate, options), /invalid R2/)
  }
})

test('rejects altered authority, transport, environment or artifact before following the URL', () => {
  for (const mutate of [
    url => { url.protocol = 'http:' }, url => { url.username = 'user' },
    url => { url.password = 'password' }, url => { url.port = '444' },
    url => { url.hash = 'fragment' }, url => { url.hostname = 'foreign.example' },
    url => { url.pathname = url.pathname.replace('development', 'production') },
    url => { url.pathname = url.pathname.replace('arm64', 'x64') },
    url => { url.searchParams.set('X-Amz-Algorithm', 'none') },
  ]) {
    const url = valid(); mutate(url)
    assert.throws(() => assertPresignedDownload(url, options), /invalid R2/)
  }
  assert.throws(() => assertPresignedDownload(valid(), { ...options, accountId: '' }), /required/)
})
