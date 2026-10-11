import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function deployWorker(environment) {
  if (!['development', 'production'].includes(environment)) throw new Error('Expected development or production')
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  if (!/^[a-f0-9]{32}$/.test(accountId ?? '')) throw new Error('Configure CLOUDFLARE_ACCOUNT_ID before deployment')
  const root = resolve(import.meta.dirname, '../..')
  execFileSync(resolve(root, 'node_modules/.bin/wrangler'), ['deploy', '--env', environment, '--var', `R2_ACCOUNT_ID:${accountId}`],
    { cwd: root, stdio: 'inherit' })
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) deployWorker(process.argv[2])
