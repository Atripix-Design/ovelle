import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const node = process.execPath

test('delivery accepts only the exact current SHA of an application-branch push', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ovelle-source-test-'))
  try {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
    const gh = join(dir, 'gh')
    writeFileSync(gh, '#!/bin/sh\nprintf "%s\\n" "$TEST_BRANCH_SHA"\n'); chmodSync(gh, 0o755)
    const env = { ...process.env, PATH: `${dir}:${process.env.PATH}`, GITHUB_REPOSITORY: 'example/app',
      GITHUB_OUTPUT: join(dir, 'output'), TEST_BRANCH_SHA: sha, DELIVERY_SOURCE_EVENT: 'push',
      DELIVERY_SOURCE_REF: 'refs/heads/development', DELIVERY_SOURCE_SHA: sha }
    const run = changes => spawnSync(node, ['scripts/ci/verify-delivery-source.mjs'], { cwd: root, env: { ...env, ...changes }, encoding: 'utf8' })
    assert.equal(run({}).status, 0)
    assert.equal(readFileSync(env.GITHUB_OUTPUT, 'utf8'), 'environment=development\n')
    assert.equal(run({ DELIVERY_SOURCE_REF: 'refs/heads/main' }).status, 0)
    for (const changes of [
      { DELIVERY_SOURCE_EVENT: 'pull_request' }, { DELIVERY_SOURCE_REF: 'refs/heads/feature' },
      { DELIVERY_SOURCE_SHA: 'invalid' }, { TEST_BRANCH_SHA: 'b'.repeat(40) },
      { TEST_BRANCH_SHA: 'a'.repeat(40), DELIVERY_SOURCE_SHA: 'a'.repeat(40) },
    ]) assert.notEqual(run(changes).status, 0)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('publishing uploads all packages before deployment and injects account configuration', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ovelle-publish-test-'))
  try {
    for (const path of ['scripts/ci', 'apps/desktop', 'node_modules/.bin']) mkdirSync(join(dir, path), { recursive: true })
    for (const file of ['deliver.mjs', 'deploy-worker.mjs']) copyFileSync(join(root, 'scripts/ci', file), join(dir, 'scripts/ci', file))
    writeFileSync(join(dir, 'apps/desktop/package.json'), JSON.stringify({ version: '1.2.3' }))
    const wrangler = join(dir, 'node_modules/.bin/wrangler')
    writeFileSync(wrangler, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$TEST_COMMAND_LOG"\nif [ "$TEST_FAIL_UPLOAD" = 1 ] && [ "$1" = r2 ]; then exit 1; fi\n'); chmodSync(wrangler, 0o755)
    const log = join(dir, 'commands')
    const run = changes => spawnSync(node, [join(dir, 'scripts/ci/deliver.mjs'), 'development'], { env: {
      ...process.env, CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_API_TOKEN: 'test-only', TEST_COMMAND_LOG: log, ...changes }, encoding: 'utf8' })
    assert.equal(run({}).status, 0)
    const commands = readFileSync(log, 'utf8').trim().split('\n')
    assert.equal(commands.length, 4)
    assert.ok(commands.slice(0, 3).every(command => command.startsWith('r2 object put ovelle-storage-development/releases/desktop/Ovelle-1.2.3-') && command.includes('--cache-control no-store')))
    assert.equal(commands[3], `deploy --env development --var R2_ACCOUNT_ID:${'a'.repeat(32)}`)
    writeFileSync(log, '')
    assert.notEqual(run({ TEST_FAIL_UPLOAD: '1' }).status, 0)
    assert.ok(!readFileSync(log, 'utf8').includes('deploy --env'))
    writeFileSync(log, '')
    assert.notEqual(run({ CLOUDFLARE_ACCOUNT_ID: '' }).status, 0)
    assert.equal(readFileSync(log, 'utf8'), '')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
