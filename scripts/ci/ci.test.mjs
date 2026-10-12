import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const node = process.execPath

test('packaging uses the routed build slot while delivery and artifact cleanup stay hosted', async () => {
  const { load } = await import('js-yaml')
  const { jobs } = load(readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8'))
  assert.equal(jobs.build['runs-on'], '${{ fromJSON(needs.route.outputs.slot_1) }}')
  const packaging = jobs.build.steps.find(step => step.name === 'Package desktop applications')
  assert.equal(packaging.run, 'npm run package:all -w @ovelle/desktop')
  assert.equal(packaging.if, "(inputs.source_event || github.event_name) == 'push'")
  assert.ok(!JSON.stringify(jobs.build).includes('secrets.'))
  const transfer = jobs.build.steps.find(step => step.id === 'packages')
  assert.match(transfer.uses, /^actions\/upload-artifact@[a-f0-9]{40}$/)
  assert.equal(transfer.with['retention-days'], 1)
  assert.equal(transfer.with['compression-level'], 0)
  assert.equal(transfer.with['if-no-files-found'], 'error')
  assert.equal(transfer.with.path.trim().split('\n').length, 3)
  assert.equal(jobs.deploy['runs-on'], 'ubuntu-latest')
  assert.ok(!jobs.deploy.steps.some(step => step.run?.includes('package:all')))
  const download = jobs.deploy.steps.find(step => step.uses?.startsWith('actions/download-artifact@'))
  assert.equal(download.with.name, transfer.with.name)
  assert.equal(download.with.path, 'release/desktop')
  assert.equal(jobs['cleanup-packages']['runs-on'], 'ubuntu-latest')
  assert.ok(jobs['cleanup-packages'].if.includes('always()'))
  assert.equal(jobs['cleanup-packages'].permissions.actions, 'write')
  assert.ok(jobs['cleanup-packages'].needs.includes('deploy'))
  assert.ok(jobs['cleanup-packages'].steps[0].run.includes('--method DELETE'))
})

test('delivery accepts only the exact current SHA of an application-branch push', () => {
  const dir = mkdtempSync(join(root, '.ci-source-test-'))
  try {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
    const gh = join(dir, 'gh')
    writeFileSync(gh, '#!/bin/sh\nprintf "%s\\n" "$TEST_BRANCH_SHA"\n'); chmodSync(gh, 0o755)
    const env = { ...process.env, PATH: `${dir}:${process.env.PATH}`, GITHUB_REPOSITORY: 'example/app',
      GITHUB_OUTPUT: join(dir, 'output'), TEST_BRANCH_SHA: sha, DELIVERY_SOURCE_EVENT: 'push',
      DELIVERY_SOURCE_REF: 'refs/heads/development', DELIVERY_SOURCE_SHA: sha }
    const run = changes => spawnSync(node, ['scripts/ci/verify-delivery-source.mjs'], { cwd: root, env: { ...env, ...changes }, encoding: 'utf8' })
    const successful = run({})
    assert.equal(successful.status, 0, successful.stderr)
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
  const dir = mkdtempSync(join(root, '.ci-publish-test-'))
  try {
    for (const path of ['scripts/ci', 'apps/desktop', 'node_modules/.bin']) mkdirSync(join(dir, path), { recursive: true })
    for (const file of ['deliver.mjs', 'deploy-worker.mjs']) copyFileSync(join(root, 'scripts/ci', file), join(dir, 'scripts/ci', file))
    writeFileSync(join(dir, 'apps/desktop/package.json'), JSON.stringify({ version: '1.2.3' }))
    const wrangler = join(dir, 'node_modules/.bin/wrangler')
    writeFileSync(wrangler, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$TEST_COMMAND_LOG"\nif [ "$TEST_FAIL_UPLOAD" = 1 ] && [ "$1" = r2 ]; then exit 1; fi\n'); chmodSync(wrangler, 0o755)
    const log = join(dir, 'commands')
    const run = changes => spawnSync(node, [join(dir, 'scripts/ci/deliver.mjs'), 'development'], { env: {
      ...process.env, CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_API_TOKEN: 'test-only', TEST_COMMAND_LOG: log, ...changes }, encoding: 'utf8' })
    const successful = run({})
    assert.equal(successful.status, 0, successful.stderr)
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

test('public selector fails hosted unless repository and runner group explicitly permit local work', () => {
  const dir = mkdtempSync(join(root, '.ci-routing-test-'))
  try {
    const workflow = readFileSync(join(root, '.github/workflows/select-runners.yml'), 'utf8')
    const script = workflow.split('        run: |\n')[1].split('\n').map(line => line.replace(/^          /, '')).join('\n')
    writeFileSync(join(dir, 'select.sh'), script)
    const curl = join(dir, 'curl')
    writeFileSync(curl, `#!/bin/bash
case "\${*: -1}" in
  */installation) printf '%s' '{"id":1}' ;;
  */access_tokens) printf '%s' '{"token":"test-only"}' ;;
  *runner-groups\\?*) if [ "$TEST_GROUP_FAILURE" = 1 ]; then exit 1; fi; printf '%s' "$TEST_GROUPS" ;;
  */repositories?*) printf '%s' "$TEST_REPOSITORIES" ;;
  */runners?*) printf '%s' "$TEST_RUNNERS" ;;
  *) exit 1 ;;
esac
`); chmodSync(curl, 0o755)
    const key = execFileSync('openssl', ['genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    const group = { id: 1, name: 'atripix-private-builders', allows_public_repositories: true, visibility: 'selected', restricted_to_workflows: true, selected_workflows: ['example/app/.github/workflows/ci.yml@refs/heads/development'] }
    const runners = Array.from({ length: 3 }, (_, index) => ({ name: `atripix-jit-${index + 1}`, status: 'online', busy: false, ephemeral: true,
      labels: ['self-hosted', 'linux', 'x64', 'atripix-build', 'atripix-ephemeral'].map(name => ({ name })) }))
    const env = { ...process.env, PATH: `${dir}:${process.env.PATH}`, APP_ID: '1', APP_PRIVATE_KEY: key,
      CALLER_WORKFLOW: 'example/app/.github/workflows/ci.yml@refs/heads/development', DESIRED_SLOTS: '3', FORCE_HOSTED: 'false', TRUSTED: 'true', ORGANIZATION: 'example', REPOSITORY_ID: '7',
      LANE_NAMES_JSON: '["build","typecheck","lint"]', GITHUB_OUTPUT: join(dir, 'output'),
      TEST_GROUPS: JSON.stringify({ runner_groups: [group] }), TEST_REPOSITORIES: '{"repositories":[{"id":7}]}', TEST_RUNNERS: JSON.stringify({ runners }) }
    const run = changes => {
      writeFileSync(env.GITHUB_OUTPUT, '')
      const result = spawnSync('bash', [join(dir, 'select.sh')], { env: { ...env, ...changes }, encoding: 'utf8' })
      assert.equal(result.status, 0, result.stderr)
      return Object.fromEntries(readFileSync(env.GITHUB_OUTPUT, 'utf8').trim().split('\n').map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]))
    }
    const allocated = run({})
    assert.equal(allocated.local_slot_count, '3', allocated.allocation_summary)
    for (const changes of [
      { TRUSTED: 'false' }, { FORCE_HOSTED: 'true' }, { TEST_GROUP_FAILURE: '1' },
      { TEST_REPOSITORIES: '{"repositories":[{"id":8}]}' }, { TEST_RUNNERS: '{"runners":[]}' },
      { TEST_GROUPS: JSON.stringify({ runner_groups: [{ ...group, allows_public_repositories: false }] }) },
      { TEST_GROUPS: JSON.stringify({ runner_groups: [{ ...group, visibility: 'all' }] }) },
      { TEST_GROUPS: JSON.stringify({ runner_groups: [{ ...group, restricted_to_workflows: false }] }) },
      { CALLER_WORKFLOW: 'example/app/.github/workflows/ci.yml@refs/pull/1/merge' },
    ]) { const result = run(changes); assert.equal(result.local_slot_count, '0'); assert.equal(result.slot_1, '"ubuntu-latest"') }
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('vendored CI components match their recorded reviewed source adaptations', async () => {
  const { createHash } = await import('node:crypto')
  const manifest = JSON.parse(readFileSync(join(root, '.github/ci-platform-source.json'), 'utf8'))
  for (const component of manifest.components) {
    assert.match(component.commit, /^[a-f0-9]{40}$/)
    assert.equal(createHash('sha256').update(readFileSync(join(root, component.target))).digest('hex'), component.vendoredSha256)
  }
})

test('live verifier distinguishes successful PR checks from successful delivery', () => {
  const dir = mkdtempSync(join(root, '.ci-monitor-test-'))
  try {
    const gh = join(dir, 'gh')
    writeFileSync(gh, `#!/bin/sh
case "$2" in
  */git/ref/heads/*) printf '%s' aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ;;
  */workflows/ci.yml/runs*) printf '%s' '{"workflow_runs":[{"id":1,"event":"pull_request","conclusion":"success"},{"id":2,"event":"push","conclusion":"success"}]}' ;;
  */runs/2/jobs*) if [ "$TEST_DELIVERY_OK" = 1 ]; then printf '%s' '{"jobs":[{"name":"build","conclusion":"success"},{"name":"typecheck","conclusion":"success"},{"name":"lint","conclusion":"success"},{"name":"Deploy application","conclusion":"success"}]}'; else printf '%s' '{"jobs":[]}'; fi ;;
  *) exit 1 ;;
esac
`); chmodSync(gh, 0o755)
    const run = success => spawnSync(node, ['scripts/verify-ci-live.mjs', 'development'], { cwd: root, encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, TEST_DELIVERY_OK: success ? '1' : '0' } })
    const valid = run(true); assert.equal(valid.status, 0, valid.stderr)
    assert.notEqual(run(false).status, 0)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
