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
