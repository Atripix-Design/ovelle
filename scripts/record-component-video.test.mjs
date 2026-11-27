import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

test('invalid recording requests fail before loading a driver or launching a browser', () => {
  const script = fileURLToPath(new URL('./record-component-video.mjs', import.meta.url))
  for (const [args, message] of [
    [['--chapters', ''], /comma-separated/],
    [['--chapters', '0,'], /comma-separated/],
    [['--chapters', '1.5'], /comma-separated/],
    [['--chapters', '01'], /comma-separated/],
    [['--chapters', '13'], /Unsupported recording chapter/],
    [['--chapters', '0,0'], /Duplicate chapters/],
    [['--chapters'], /argument missing|expects an argument/i],
    [['--unknown'], /Unknown option/],
    [['unexpected'], /Unexpected argument/],
    [['--output', ''], /output directory is required/],
    [['--url', 'file:///tmp/fixture'], /HTTP\(S\)/],
    [['--url', 'https://user:password@example.test'], /without credentials/],
  ]) {
    const result = spawnSync(process.execPath, [script, ...args], {
      encoding: 'utf8', timeout: 5000,
      env: { ...process.env, OVELLE_VIDEO_INTERACTIONS_MODULE: 'missing-recording-driver-fixture' },
    })
    assert.equal(result.error, undefined)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, message, JSON.stringify(args))
    assert.ok(!result.stderr.includes('Cannot find package'), 'Argument validation must precede provider loading')
    assert.ok(!result.stdout.includes('RECORDING_COMPLETE'))
  }
})
