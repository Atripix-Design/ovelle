import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const version = JSON.parse(readFileSync(resolve(import.meta.dirname, '../apps/desktop/package.json'), 'utf8')).version
const mappings = [
  ['ovelle.org', 'cdn.ovelle.org', 'production'],
  ['dev.ovelle.org', 'cdn.dev.ovelle.org', 'development'],
]

for (const [host, cdnHost, environment] of mappings) {
  const base = `https://${host}`
  const health = await fetch(`${base}/health`)
  if (!health.ok) throw new Error(`${host} health returned ${health.status}`)
  const result = await health.json()
  if (result.application !== 'ovelle' || result.environment !== environment || result.database !== true) {
    throw new Error(`${host} is not connected to ${environment}`)
  }
  const page = await fetch(base)
  const html = await page.text()
  if (!page.ok || !html.includes('<title>Ovelle</title>')) {
    throw new Error(`${host} is not serving the Ovelle website`)
  }
  const scriptPath = html.match(/src="(\/assets\/[^\"]+\.js)"/)?.[1]
  if (!scriptPath) throw new Error(`${host} has no application script`)
  const javascript = await (await fetch(new URL(scriptPath, base))).text()
  if (!javascript.includes(cdnHost) || !javascript.includes('/releases/desktop/') || !javascript.includes('?v=')) {
    throw new Error(`${host} is not linking downloads to ${cdnHost}`)
  }
  const downloadUrl = `https://${cdnHost}/releases/desktop/Ovelle-${version}-mac-arm64.zip?v=${Date.now()}`
  const metadata = await fetch(downloadUrl, { method: 'HEAD' })
  if (!metadata.ok || !metadata.headers.get('cache-control')?.includes('no-store')) {
    throw new Error(`${cdnHost} is missing no-store metadata (${metadata.status})`)
  }
  const download = await fetch(downloadUrl, { headers: { Range: 'bytes=0-1' } })
  if (download.status !== 206 || !download.headers.get('content-disposition')?.includes('attachment') ||
      Number(download.headers.get('content-range')?.split('/')[1]) < 1_000_000 ||
      Buffer.from(await download.arrayBuffer()).toString('ascii') !== 'PK') {
    throw new Error(`${cdnHost} did not serve a ranged ZIP download (${download.status})`)
  }
}

console.log('ovelle custom domains verified')
