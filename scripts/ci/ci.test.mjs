import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const node = process.execPath

test('packaging stays secret-free while delivery and cleanup require a separate runner group', async () => {
  const { load } = await import('js-yaml')
  const { jobs } = load(readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8'))
  assert.equal(jobs.build['runs-on'].group, 'atripix-private-builders')
  const packaging = jobs.build.steps.find(step => step.name === 'Package desktop applications')
  assert.equal(packaging.run, 'npm run package:all -w @ovelle/desktop')
  assert.equal(packaging.if, "github.event_name == 'push'")
  assert.ok(!JSON.stringify(jobs.build).includes('secrets.'))
  const transfer = jobs.build.steps.find(step => step.id === 'packages')
  assert.match(transfer.uses, /^actions\/upload-artifact@[a-f0-9]{40}$/)
  assert.equal(transfer.with['retention-days'], 1)
  assert.equal(transfer.with['compression-level'], 0)
  assert.equal(transfer.with['if-no-files-found'], 'error')
  assert.equal(transfer.with.path.trim().split('\n').length, 3)
  assert.equal(jobs.deploy['runs-on'].group, 'atripix-ovelle-publishers')
  assert.ok(!jobs.deploy.steps.some(step => step.run?.includes('package:all')))
  for (const job of [jobs.deploy, jobs['cleanup-packages']]) assert.ok(job.steps.some(step => step.uses === './.github/actions/setup-github-cli'))
  const download = jobs.deploy.steps.find(step => step.uses?.startsWith('actions/download-artifact@'))
  assert.equal(download.with.name, transfer.with.name)
  assert.equal(download.with.path, 'release/desktop')
  assert.equal(jobs['cleanup-packages']['runs-on'].group, 'atripix-ovelle-publishers')
  assert.ok(jobs['cleanup-packages'].if.includes('always()'))
  assert.equal(jobs['cleanup-packages'].permissions.actions, 'write')
  assert.ok(jobs['cleanup-packages'].needs.includes('deploy'))
  assert.ok(jobs['cleanup-packages'].steps.find(step => step.name === 'Delete temporary package transfer').run.includes('--method DELETE'))
})

test('identity deployment gate requires protocol matrices and the existing passkey ceremony', async () => {
  const { load } = await import('js-yaml')
  const { jobs } = load(readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8'))
  const browser = jobs['saml-browser']
  assert.equal(browser.name, 'Identity browser acceptance')
  assert.equal(browser['runs-on'].group, 'atripix-private-builders')
  assert.ok(browser['runs-on'].labels.includes('atripix-browser'))
  assert.ok(browser.steps.some(step => step.with?.['node-version'] === '22.12.0'))
  assert.deepEqual(browser.permissions, { contents: 'read' })
  assert.ok(jobs.deploy.needs.includes('saml-browser'))
  assert.ok(!browser['continue-on-error'])
  assert.ok(!JSON.stringify(browser).includes('secrets.'))
  assert.ok(browser.steps.some(step => step.run === 'npx playwright install chromium firefox webkit'))
  assert.ok(browser.steps.some(step => step.run === 'node --test scripts/stage0-browser-proxy.test.mjs'))
  assert.ok(browser.steps.some(step => step.run === 'npm run test:stage0-saml-browser'))
  assert.ok(browser.steps.some(step => step.run === 'npm run test:stage0-oidc-browser'))
  assert.ok(browser.steps.some(step => step.run === 'npm run test:stage0-passkey-browser'))
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

test('every workflow fails closed to isolated self-hosted capacity', async () => {
  const { load } = await import('js-yaml')
  const { readdirSync } = await import('node:fs')
  function validate(workflow) {
    for (const job of Object.values(workflow.jobs)) {
      const route = job['runs-on']
      assert.ok(route && typeof route === 'object', 'explicit grouped routing required')
      assert.ok(route.labels.includes('self-hosted'), 'hosted capacity forbidden')
      assert.ok(route.labels.includes('atripix-ephemeral'), 'disposable capacity required')
      const publisher = route.group === 'atripix-ovelle-publishers'
      assert.ok(publisher || route.group === 'atripix-private-builders', 'unknown trust boundary')
      if (!publisher) {
        assert.ok(!JSON.stringify(job).includes('secrets.'), 'secrets forbidden on ordinary builders')
        assert.ok(!Object.values(job.permissions || {}).includes('write'), 'write tokens require publisher isolation')
      }
      assert.ok(!JSON.stringify(job).includes('--with-deps'), 'OS dependencies must be provisioned in the runner image')
    }
  }
  for (const file of readdirSync(join(root, '.github/workflows'))) {
    const workflow = load(readFileSync(join(root, '.github/workflows', file), 'utf8'))
    validate(workflow)
    assert.ok(!JSON.stringify(workflow).includes('force_hosted'))
    assert.ok(!JSON.stringify(workflow).includes('dispatch-hosted-fallback'))
  }
  const control = load(readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8'))
  validate(control)
  const hosted = structuredClone(control)
  hosted.jobs.build['runs-on'] = 'ubuntu-latest'
  assert.throws(() => validate(hosted), /grouped routing/)
  const leaked = structuredClone(control)
  leaked.jobs.build.steps.push({ env: { TOKEN: '${{ secrets.PROVIDER_TOKEN }}' }, run: 'publish' })
  assert.throws(() => validate(leaked), /secrets forbidden/)
  const privileged = structuredClone(control)
  privileged.jobs.build.steps.push({ run: 'npx playwright install --with-deps' })
  assert.throws(() => validate(privileged), /OS dependencies/)
})

test('development deployments preserve a separate sender-restricted authentication binding', () => {
  const config = JSON.parse(readFileSync(join(root, 'wrangler.jsonc'), 'utf8'))
  const bindings = config.env.development.send_email
  assert.deepEqual(bindings.find(binding => binding.name === 'AUTH_EMAIL'), {
    name: 'AUTH_EMAIL', allowed_sender_addresses: ['accounts@dev.mail.ovelle.org'],
  })
  assert.deepEqual(bindings.find(binding => binding.name === 'EMAIL').allowed_sender_addresses, ['downloads@dev.mail.ovelle.org'])
  assert.equal(config.env.production.send_email, undefined)
  for (const name of ['AUTH_ADMISSION_KEY', 'TURNSTILE_SECRET_KEY']) {
    assert.ok(!(name in config.env.development.vars), 'secret values must stay out of deployment vars')
  }
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
