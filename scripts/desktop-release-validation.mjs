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

export function releaseSample({ filename, size }) {
  const marker = filename.endsWith('.dmg') ? 'koly' : filename.endsWith('.zip') ? 'PK' : 'MZ'
  // Apple UDIF identifies the image in its 512-byte trailer, not its header.
  const start = filename.endsWith('.dmg') ? size - 512 : 0
  return { marker, start, range: `bytes=${start}-${start + marker.length - 1}` }
}

/** Validate the exact bounded sample, not the integrity of the entire file. */
export async function assertReleaseSample(response, { filename, size }) {
  const { marker, start } = releaseSample({ filename, size })
  const end = start + marker.length - 1
  if (!Number.isSafeInteger(size) || size < 1_000_000 || response.status !== 206 ||
      response.headers.get('content-range') !== `bytes ${start}-${end}/${size}` ||
      response.headers.get('content-length') !== String(marker.length) ||
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
      if (bytes.length + value.length > marker.length) throw new Error(`Oversized release sample: ${filename}`)
      bytes.push(...value)
    }
    if (Buffer.from(bytes).toString('ascii') !== marker) {
      throw new Error(`Invalid release sample bytes: ${filename}`)
    }
  } finally {
    await reader.cancel()
    reader.releaseLock()
  }
}
