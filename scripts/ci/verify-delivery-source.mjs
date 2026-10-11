import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'

const ref = process.env.DELIVERY_SOURCE_REF
const sha = process.env.DELIVERY_SOURCE_SHA
if (process.env.DELIVERY_SOURCE_EVENT !== 'push' || !['refs/heads/development', 'refs/heads/main'].includes(ref) ||
    !/^[a-f0-9]{40}$/.test(sha ?? '')) throw new Error('Delivery requires a push to an application branch')
const branch = ref.slice('refs/heads/'.length)
const current = execFileSync('gh', ['api', `repos/${process.env.GITHUB_REPOSITORY}/git/ref/heads/${branch}`, '--jq', '.object.sha'], { encoding: 'utf8' }).trim()
if (current !== sha) throw new Error('Source is stale; the newer branch commit will be delivered')
const checkout = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
if (checkout !== sha) throw new Error('Checkout differs from the checked source SHA')
appendFileSync(process.env.GITHUB_OUTPUT, `environment=${branch === 'main' ? 'production' : 'development'}\n`)
