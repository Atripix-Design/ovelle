import { expect, it } from 'vitest'
import { encodeBase64Url } from '../../../src/cloudflare/stage0/domain/base64url'
import { randomSecret, secretDigest, secretPattern } from '../../../src/cloudflare/stage0/auth/secrets'
import { sessionCsrfSecret } from '../../../src/cloudflare/stage0/auth/sessions'

it('preserves unpadded URL-safe encoding across byte boundaries', () => {
  expect(encodeBase64Url(new Uint8Array())).toBe('')
  expect(encodeBase64Url(new Uint8Array([102]))).toBe('Zg')
  expect(encodeBase64Url(new Uint8Array([102, 111]))).toBe('Zm8')
  expect(encodeBase64Url(new Uint8Array([102, 111, 111]))).toBe('Zm9v')
  expect(encodeBase64Url(new Uint8Array([251, 255]))).toBe('-_8')
})

it('preserves stored SHA-256 hex digests and the existing raw-string CSRF MAC domain', async () => {
  expect(await secretDigest('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  // Independently calculated HMAC-SHA256 of the exact original raw-string input.
  // A JSON-wrapped context or decoded key would invalidate existing sessions.
  expect(await sessionCsrfSecret('A'.repeat(43))).toBe('2oYb6Cn8B384yiOg5T_K-dBt_G8BF6yJqU_ozJD_6so')
  await expect(sessionCsrfSecret('invalid')).rejects.toMatchObject({ code: 'unauthenticated' })
})

it('generates canonical 32-byte secrets rather than padded or truncated strings', () => {
  for (let index = 0; index < 8; index++) {
    const secret = randomSecret()
    expect(secretPattern.test(secret)).toBe(true)
    const decoded = Uint8Array.from(atob(secret.replaceAll('-', '+').replaceAll('_', '/')), value => value.charCodeAt(0))
    expect(decoded.byteLength).toBe(32)
    expect(encodeBase64Url(decoded)).toBe(secret)
  }
})
