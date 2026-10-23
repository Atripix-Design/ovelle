import { execFileSync } from 'node:child_process'
import { closeSync, openSync, readFileSync, readSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { verifyRemote } from './ci/verify-network.mjs'

const version = JSON.parse(readFileSync(resolve(import.meta.dirname, '../apps/desktop/package.json'), 'utf8')).version
const filenames = [
  `Ovelle-${version}-mac-arm64.zip`,
  `Ovelle-${version}-mac-x64.zip`,
  `Ovelle-${version}-win-x64.exe`,
]

const mode = process.argv[2]
if (mode && !['local', 'development', 'production'].includes(mode)) throw new Error('Expected local, development or production')
const releaseDir = resolve(process.env.OVELLE_RELEASE_DIR || 'release/desktop')
const environments = mode === 'local' ? ['local'] : mode ? [mode] : ['development', 'production']
for (const environment of environments) {
  if (environment !== 'local') {
    const base = environment === 'production' ? 'https://ovelle.org' : 'https://dev.ovelle.org'
    await verifyRemote(`${environment} health`, async signal => {
      const response = await fetch(`${base}/health`, { signal })
      const health = await response.json()
      if (!response.ok || health.application !== 'ovelle' || health.environment !== environment || health.database !== true) {
        throw new Error(`${environment} Worker health or D1 binding did not verify`)
      }
    })
  }
  const cdnHost = environment === 'production' ? 'cdn.ovelle.org' : 'cdn.dev.ovelle.org'
  for (const filename of filenames) {
    const path = join(releaseDir, filename)
    const size = statSync(path).size
    if (size < 1_000_000 || size > 300 * 1024 * 1024) throw new Error(`Unexpected package size: ${path}`)
    const descriptor = openSync(path, 'r')
    const header = Buffer.alloc(2)
    readSync(descriptor, header, 0, 2, 0)
    closeSync(descriptor)
    const magic = header.toString('ascii')
    if (magic !== (filename.endsWith('.zip') ? 'PK' : 'MZ')) throw new Error(`Invalid package header: ${path}`)
    if (filename.endsWith('.zip')) {
      const entries = execFileSync('unzip', ['-Z', '-1', path], { encoding: 'utf8' })
      if (!entries.includes('Ovelle.app/Contents/MacOS/Ovelle')) throw new Error(`Missing macOS executable: ${path}`)
    }
    if (environment === 'local') continue
    const base = environment === 'production' ? 'https://ovelle.org' : 'https://dev.ovelle.org'
    const cdnUrl = `https://${cdnHost}/releases/desktop/${filename}?v=${Date.now()}`
    await verifyRemote(`${cdnHost} metadata ${filename}`, async signal => {
      const metadata = await fetch(cdnUrl, { method: 'HEAD', signal })
      if (!metadata.ok || !metadata.headers.get('cache-control')?.includes('no-store')) {
        throw new Error(`${cdnHost} missing no-store metadata: ${filename} (${metadata.status})`)
      }
      await metadata.body?.cancel()
    })
    await verifyRemote(`${cdnHost} sample ${filename}`, async signal => {
      const cdn = await fetch(cdnUrl, { headers: { Range: 'bytes=0-1' }, signal })
      const contentRange = cdn.headers.get('content-range')
      if (cdn.status !== 206 || contentRange !== `bytes 0-1/${size}` ||
          !cdn.headers.get('content-disposition')?.includes(filename)) {
        throw new Error(`${cdnHost} download mismatch: ${filename} (${cdn.status})`)
      }
      const cdnHeader = Buffer.from(await cdn.arrayBuffer()).toString('ascii')
      if (cdnHeader !== (filename.endsWith('.zip') ? 'PK' : 'MZ')) {
        throw new Error(`${cdnHost} served an invalid package header: ${filename}`)
      }
    })
    await verifyRemote(`${environment} download metadata ${filename}`, async signal => {
      const response = await fetch(`${base}/downloads/${filename}`, { method: 'HEAD', signal })
      if (!response.ok || Number(response.headers.get('content-length')) !== size) {
        throw new Error(`${environment} download mismatch: ${filename}`)
      }
      await response.body?.cancel()
    })
    await verifyRemote(`${environment} download ${filename}`, async signal => {
      const redirect = await fetch(`${base}/downloads/${filename}`, {
        redirect: 'manual', signal,
      })
      if (redirect.status === 302) {
        const signed = new URL(redirect.headers.get('location') ?? 'https://invalid.example')
        const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
        if (!accountId) throw new Error('CLOUDFLARE_ACCOUNT_ID is required to verify signed downloads')
        if (signed.hostname !== `${accountId}.r2.cloudflarestorage.com` ||
            signed.pathname !== `/ovelle-storage-${environment}/releases/desktop/${filename}` ||
            signed.searchParams.get('X-Amz-Algorithm') !== 'AWS4-HMAC-SHA256' ||
            Number(signed.searchParams.get('X-Amz-Expires')) > 300) {
          throw new Error(`${environment} issued an invalid R2 presigned download: ${filename}`)
        }
        const sample = await fetch(signed, { headers: { Range: 'bytes=0-0' }, signal })
        if (sample.status !== 206 || !sample.headers.get('content-disposition')?.includes(filename)) {
          throw new Error(`${environment} presigned download failed: ${filename} (${sample.status})`)
        }
        await sample.body?.cancel()
      } else if (redirect.status !== 200 || !redirect.headers.get('content-disposition')?.includes(filename)) {
        throw new Error(`${environment} download failed: ${filename} (${redirect.status})`)
      }
      await redirect.body?.cancel()
    })
    console.log(`ovelle ${environment} download verified: ${filename}`)
  }
}
console.log(`ovelle desktop releases verified: ${environments.join(', ')}`)
