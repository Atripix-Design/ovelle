import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertPresignedDownload } from './desktop-release-validation.mjs'

const options = { accountId: 'fixture-account', environment: 'development', filename: 'Ovelle-0.1.0-mac-arm64.zip' }
const valid = () => new URL('https://fixture-account.r2.cloudflarestorage.com/ovelle-storage-development/releases/desktop/Ovelle-0.1.0-mac-arm64.zip?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=300')

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
