import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const script = new URL('./publish-github-release.mjs', import.meta.url).pathname
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const repository = 'Atripix-Design/ovelle'
for (const environment of ['development', 'production']) {
  test(`publisher checks exact source and digests before publishing a ${environment} release`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'ovelle-release-test-'))
    try {
      mkdirSync(join(dir, 'apps/desktop'), { recursive: true })
      mkdirSync(join(dir, 'release/desktop'), { recursive: true })
      writeFileSync(join(dir, 'apps/desktop/package.json'), '{"version":"7.8.9"}')
      const tag = `desktop-${environment === 'production' ? 'prod' : 'dev'}-${sha}`
      const assets = ['mac-arm64.zip', 'mac-x64.zip', 'win-x64.exe'].map(suffix => {
        const name = `Ovelle-7.8.9-${suffix}`
        writeFileSync(join(dir, 'release/desktop', name), suffix)
        return { name, state: 'uploaded', size: suffix.length, digest: `sha256:${createHash('sha256').update(suffix).digest('hex')}`,
          browser_download_url: `https://github.com/${repository}/releases/download/${tag}/${name}` }
      })
      const release = { id: 5, draft: true, prerelease: environment === 'development', tag_name: tag, assets: [] }
      const git = join(dir, 'git')
      writeFileSync(git, '#!/bin/sh\nprintf "%s\n" "$SOURCE_SHA"\n')
      chmodSync(git, 0o755)
      const gh = join(dir, 'gh')
      writeFileSync(gh, `#!${process.execPath}
const fs = require('node:fs')
const args = process.argv.slice(2)
fs.appendFileSync('calls', JSON.stringify(args) + '\\n')
const release = JSON.parse(process.env.RELEASE)
const snapshot = { ...release, assets: JSON.parse(process.env.ASSETS) }
if (process.env.WRONG_DIGEST) snapshot.assets[0].digest = 'sha256:wrong'
const command = args.join(' ')
if (command.includes('/git/ref/heads/')) console.log(process.env.REMOTE_SHA)
else if (args.includes('--slurp')) console.log('[[]]')
else if (command.includes('/git/matching-refs/')) console.log('[]')
else if (command.includes('POST') && command.includes('/git/refs')) console.log('{}')
else if (command.includes('POST') && command.includes('/releases')) console.log(JSON.stringify(release))
else if (command.includes('PATCH') && command.includes('/releases/5')) console.log(JSON.stringify({ ...snapshot, draft: false }))
else if (command.includes('/releases/5')) console.log(JSON.stringify(snapshot))
else if (command.startsWith('release upload')) console.log('uploaded')
else process.exit(1)
`)
      chmodSync(gh, 0o755)
      const run = changes => spawnSync(process.execPath, [script, environment], { cwd: dir, encoding: 'utf8', env: {
        ...process.env, PATH: `${dir}:${process.env.PATH}`, SOURCE_SHA: sha, REMOTE_SHA: sha,
        GITHUB_REPOSITORY: repository, DELIVERY_SOURCE_SHA: sha, DELIVERY_SOURCE_EVENT: 'push',
        DELIVERY_SOURCE_REF: environment === 'production' ? 'refs/heads/main' : 'refs/heads/development',
        RELEASE: JSON.stringify(release), ASSETS: JSON.stringify(assets), ...changes,
      } })
      const calls = () => readFileSync(join(dir, 'calls'), 'utf8')
      const success = run({})
      assert.equal(success.status, 0, success.stderr)
      assert.match(calls(), /draft=true/)
      assert.match(calls(), /release","upload/)
      assert.ok(calls().includes(`make_latest=${environment === 'production'}`))
      writeFileSync(join(dir, 'calls'), '')
      const wrongDigest = run({ WRONG_DIGEST: '1' })
      assert.notEqual(wrongDigest.status, 0)
      assert.match(wrongDigest.stderr, /does not match the verified package/)
      assert.doesNotMatch(calls(), /PATCH/)
      writeFileSync(join(dir, 'calls'), '')
      assert.notEqual(run({ REMOTE_SHA: 'b'.repeat(40) }).status, 0)
      assert.doesNotMatch(calls(), /POST|PATCH|upload/)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
}
