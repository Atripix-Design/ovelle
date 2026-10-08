import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const config = JSON.parse(readFileSync(resolve(root, 'wrangler.jsonc'), 'utf8'))
const expected = ['development', 'production']
const mode = process.argv[2]
if (mode !== 'workers' && mode !== 'resources') throw new Error('Expected workers or resources')

if (mode === 'workers') {
  for (const environment of expected) {
    const base = `https://ovelle-${environment}.jeremymathew100.workers.dev`
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
  if (config.account_id !== '83952a1be987e4a12647732861a60925') throw new Error('Wrong Cloudflare account')
  const wranglerEnvironment = {
    ...process.env,
    XDG_CONFIG_HOME: join(homedir(), '.config/ovelle-auth-flow'),
    CLOUDFLARE_ACCOUNT_ID: config.account_id,
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
