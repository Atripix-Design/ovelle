import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { deployWorker } from './deploy-worker.mjs'

const environment = process.argv[2]
if (!['development', 'production'].includes(environment)) throw new Error('Expected development or production')
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
if (!/^[a-f0-9]{32}$/.test(accountId ?? '') || !process.env.CLOUDFLARE_API_TOKEN) {
  throw new Error('Configure CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in GitHub Actions')
}
const root = resolve(import.meta.dirname, '../..')
const wrangler = resolve(root, 'node_modules/.bin/wrangler')
const version = JSON.parse(readFileSync(resolve(root, 'apps/desktop/package.json'), 'utf8')).version
for (const filename of [`Ovelle-${version}-mac-arm64.zip`, `Ovelle-${version}-mac-x64.zip`, `Ovelle-${version}-win-x64.exe`]) {
  execFileSync(wrangler, ['r2', 'object', 'put', `ovelle-storage-${environment}/releases/desktop/${filename}`,
    '--file', resolve(root, 'release/desktop', filename),
    '--content-type', filename.endsWith('.zip') ? 'application/zip' : 'application/octet-stream',
    '--content-disposition', `attachment; filename="${filename}"`, '--cache-control', 'no-store', '--remote'],
  { cwd: root, stdio: 'inherit' })
}
deployWorker(environment)
