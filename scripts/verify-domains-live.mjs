import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const version = JSON.parse(readFileSync(resolve(import.meta.dirname, '../apps/desktop/package.json'), 'utf8')).version
const mappings = [
  ['ovelle.org', 'production'],
  ['dev.ovelle.org', 'development'],
]

for (const [host, environment] of mappings) {
  const base = `https://${host}`
  const health = await fetch(`${base}/health`)
  if (!health.ok) throw new Error(`${host} health returned ${health.status}`)
  const result = await health.json()
  if (result.application !== 'ovelle' || result.environment !== environment || result.database !== true) {
    throw new Error(`${host} is not connected to ${environment}`)
  }
  const page = await fetch(base)
  if (!page.ok || !(await page.text()).includes('<title>Ovelle</title>')) {
    throw new Error(`${host} is not serving the Ovelle website`)
  }
  const download = await fetch(`${base}/downloads/Ovelle-${version}-win-x64.exe`, { redirect: 'manual' })
  if (download.status === 302) {
    const location = new URL(download.headers.get('location') ?? 'https://invalid.example')
    if (location.hostname !== '83952a1be987e4a12647732861a60925.r2.cloudflarestorage.com' ||
        !location.searchParams.has('X-Amz-Signature')) {
      throw new Error(`${host} did not redirect to a personal-account R2 presigned URL`)
    }
  } else if (download.status !== 200 || !download.headers.get('content-disposition')?.includes('attachment')) {
    throw new Error(`${host} download failed (${download.status})`)
  }
  await download.body?.cancel()
}

console.log('ovelle custom domains verified')
