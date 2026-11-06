/** Validate the Worker redirect before the verifier follows it. This proves the
 * destination and lifetime contract, not the signature or artifact contents;
 * the caller must still make and check the bounded download request.
 */
export function assertPresignedDownload(url, { accountId, environment, filename }) {
  if (!accountId) throw new Error('CLOUDFLARE_ACCOUNT_ID is required to verify signed downloads')
  const expiry = url.searchParams.getAll('X-Amz-Expires')
  const algorithm = url.searchParams.getAll('X-Amz-Algorithm')
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash ||
      url.hostname !== `${accountId}.r2.cloudflarestorage.com` ||
      url.pathname !== `/ovelle-storage-${environment}/releases/desktop/${filename}` ||
      algorithm.length !== 1 || algorithm[0] !== 'AWS4-HMAC-SHA256' ||
      expiry.length !== 1 || !/^[1-9][0-9]*$/.test(expiry[0]) || Number(expiry[0]) > 300) {
    throw new Error(`${environment} issued an invalid R2 presigned download: ${filename}`)
  }
}

/** Consume only the requested two-byte release sample. Metadata and magic bytes
 * establish range behavior, not full artifact integrity or code signing.
 */
export async function assertReleaseSample(response, { filename, size }) {
  if (!Number.isSafeInteger(size) || size < 1_000_000 || response.status !== 206 ||
      response.headers.get('content-range') !== `bytes 0-1/${size}` ||
      response.headers.get('content-length') !== '2' ||
      !/^attachment(?:;|$)/i.test(response.headers.get('content-disposition') ?? '') ||
      !response.headers.get('content-disposition')?.includes(filename)) {
    await response.body?.cancel()
    throw new Error(`Invalid release range metadata: ${filename} (${response.status})`)
  }
  const reader = response.body?.getReader()
  if (!reader) throw new Error(`Missing release sample: ${filename}`)
  const bytes = []
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (bytes.length + value.length > 2) throw new Error(`Oversized release sample: ${filename}`)
      bytes.push(...value)
    }
    const expected = filename.endsWith('.zip') ? [0x50, 0x4b] : [0x4d, 0x5a]
    if (bytes.length !== 2 || bytes.some((byte, index) => byte !== expected[index])) {
      throw new Error(`Invalid release sample bytes: ${filename}`)
    }
  } finally {
    await reader.cancel()
    reader.releaseLock()
  }
}
