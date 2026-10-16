import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const config = JSON.parse(readFileSync(resolve(root, 'wrangler.jsonc'), 'utf8'))
const expected = ['development', 'production']
const mode = process.argv[2]
if (!['workers', 'resources', 'releases'].includes(mode)) throw new Error('Expected workers, resources or releases')

if (mode === 'releases') {
  // Verify the deployed bytes without requiring local installers or downloading
  // entire packages. The CDN must honor ranges and preserve release metadata.
  const version = JSON.parse(readFileSync(resolve(root, 'apps/desktop/package.json'), 'utf8')).version
  for (const environment of expected) {
    const host = environment === 'production' ? 'cdn.ovelle.org' : 'cdn.dev.ovelle.org'
    for (const suffix of ['mac-arm64.zip', 'mac-x64.zip', 'win-x64.exe']) {
      const filename = `Ovelle-${version}-${suffix}`
      const url = `https://${host}/releases/desktop/${filename}?v=${Date.now()}`
      const metadata = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(15000) })
      const size = Number(metadata.headers.get('content-length'))
      if (!metadata.ok || !Number.isSafeInteger(size) || size < 1_000_000 ||
          !metadata.headers.get('cache-control')?.includes('no-store') ||
          !metadata.headers.get('content-disposition')?.includes(filename)) {
        throw new Error(`${environment} release metadata failed: ${filename} (${metadata.status})`)
      }
      const sample = await fetch(url, { headers: { Range: 'bytes=0-1' }, signal: AbortSignal.timeout(15000) })
      if (sample.status !== 206 || sample.headers.get('content-range') !== `bytes 0-1/${size}` ||
          sample.headers.get('content-length') !== '2') {
        await sample.body?.cancel()
        throw new Error(`${environment} release range failed: ${filename} (${sample.status})`)
      }
      const magic = Buffer.from(await sample.arrayBuffer()).toString('ascii')
      if (magic !== (filename.endsWith('.zip') ? 'PK' : 'MZ')) {
        throw new Error(`${environment} invalid release bytes: ${filename}`)
      }
    }
  }
  console.log('ovelle public releases verified: development, production')
} else if (mode === 'workers') {
  for (const environment of expected) {
    const base = environment === 'production' ? 'https://ovelle.org' : 'https://dev.ovelle.org'
    const healthResponse = await fetch(`${base}/health`)
    if (!healthResponse.ok) throw new Error(`${environment} health returned ${healthResponse.status}`)
    const health = await healthResponse.json()
    if (health.application !== 'ovelle' || health.environment !== environment || health.database !== true) {
      throw new Error(`${environment} health did not verify its D1 binding`)
    }
    const page = await fetch(base)
    const html = await page.text()
    if (!page.ok || !html.includes('<title>Ovelle</title>')) throw new Error(`${environment} site is not serving Ovelle`)
    const scriptPath = html.match(/src="(\/assets\/[^\"]+\.js)"/)?.[1]
    if (!scriptPath) throw new Error(`${environment} asset URL missing`)
    const javascript = await (await fetch(new URL(scriptPath, base))).text()
    const cdnHost = environment === 'production' ? 'cdn.ovelle.org' : 'cdn.dev.ovelle.org'
    if (!javascript.includes('mac-arm64.zip') || !javascript.includes(environment) ||
        !javascript.includes(cdnHost) || !javascript.includes('/releases/desktop/') || !javascript.includes('?v=')) {
      throw new Error(`${environment} bundle has unexpected content`)
    }
  }
  console.log('ovelle workers verified')
} else {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  if (!accountId) throw new Error('CLOUDFLARE_ACCOUNT_ID is required')
  const wranglerEnvironment = {
    ...process.env,
    CLOUDFLARE_ACCOUNT_ID: accountId,
  }
  const d1 = JSON.parse(execFileSync(resolve(root, 'node_modules/.bin/wrangler'), ['d1', 'list', '--json'], { cwd: root, encoding: 'utf8', env: wranglerEnvironment }))
  const buckets = execFileSync(resolve(root, 'node_modules/.bin/wrangler'), ['r2', 'bucket', 'list'], { cwd: root, encoding: 'utf8', env: wranglerEnvironment })
  const databaseIds = new Set()
  for (const environment of expected) {
    const env = config.env[environment]
    if (env.name !== `ovelle-${environment}` || env.vars.APP_ENV !== environment) throw new Error(`Wrong ${environment} Worker name or variable`)
    const database = env.d1_databases.find((binding) => binding.binding === 'DB')
    const actual = d1.find((item) => item.name === `ovelle-db-${environment}`)
    if (!actual || database.database_id !== actual.uuid || database.database_name !== actual.name) throw new Error(`Wrong ${environment} D1 binding`)
    databaseIds.add(actual.uuid)
    const bucket = env.r2_buckets.find((binding) => binding.binding === 'STORAGE')
    if (bucket?.bucket_name !== `ovelle-storage-${environment}` || !new RegExp(`^name:\\s+${bucket.bucket_name}$`, 'm').test(buckets)) {
      throw new Error(`Wrong ${environment} R2 binding`)
    }
  }
  if (databaseIds.size !== 2) throw new Error('D1 databases are not isolated')
  console.log('ovelle resources verified')
}
