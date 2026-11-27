import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { renderTokenCSS } from './sync-design-tokens.mjs'

test('renders existing selectors and independent hex/RGB expectations deterministically', () => {
  const tokens = { light: { 'text/primary': '#012aff' }, dark: { 'text/primary': '#f0a010' } }
  const before = JSON.stringify(tokens)
  assert.equal(renderTokenCSS(tokens), `/* Semantic colors resolved from Figma Light/Dark variables. */
@layer components {
  .ov, [data-ovelle-theme] {
    --ov-text-primary: #012aff;
    --ov-text-primary-channels: 1 42 255;
  }
  [data-ovelle-theme="dark"], [data-ovelle-theme="dark"] .ov {
    --ov-text-primary: #f0a010;
    --ov-text-primary-channels: 240 160 16;
  }
}
`)
  assert.equal(JSON.stringify(tokens), before)
})

test('rejects missing modes, mismatched names and unsafe token values', () => {
  for (const input of [null, [], {}, { light: {} }, { light: {}, dark: {} },
    { light: { a: '#000000' }, dark: { b: '#000000' } },
    { light: [], dark: [] }, { light: {}, dark: {}, extra: {} }]) {
    assert.throws(() => renderTokenCSS(input))
  }
  for (const [name, color] of [['text/x;}', '#000000'], ['a', '#fff'], ['a', 'red'], ['a', '#GG0000'], ['a', null], ['a', '#000000; color:red']]) {
    assert.throws(() => renderTokenCSS({ light: { [name]: color }, dark: { [name]: color } }), /Invalid/)
  }
})

test('rejects both normalized-name and derived-channel collisions in either order', () => {
  for (const names of [['text/a', 'text-a'], ['text/a', 'text/a-channels'], ['text/a-channels', 'text/a']]) {
    const values = Object.fromEntries(names.map(name => [name, '#000000']))
    assert.throws(() => renderTokenCSS({ light: values, dark: values }), /Colliding CSS token/)
  }
})

test('CLI checks never rewrite drift and only explicit generation writes CSS', () => {
  const root = mkdtempSync(join(tmpdir(), 'ovelle-token-cli-'))
  try {
    mkdirSync(join(root, 'scripts'))
    mkdirSync(join(root, 'packages/ui/src'), { recursive: true })
    const script = join(root, 'scripts/sync-design-tokens.mjs')
    const source = join(root, 'packages/ui/tokens.json')
    const artifact = join(root, 'packages/ui/src/tokens.css')
    copyFileSync(new URL('./sync-design-tokens.mjs', import.meta.url), script)
    writeFileSync(source, JSON.stringify({ light: { a: '#ffffff' }, dark: { a: '#000000' } }))
    const run = (...args) => execFileSync(process.execPath, [script, ...args], { stdio: 'pipe' })
    assert.throws(() => run(), /Expected --check or --write/)
    run('--write')
    const generated = readFileSync(artifact, 'utf8')
    run('--check')
    writeFileSync(artifact, `${generated}/* unexpected change */\n`)
    const drifted = readFileSync(artifact, 'utf8')
    assert.throws(() => run('--check'), /Token CSS drift/)
    assert.equal(readFileSync(artifact, 'utf8'), drifted)
    run('--write')
    assert.equal(readFileSync(artifact, 'utf8'), generated)
    writeFileSync(source, '{}')
    assert.throws(() => run('--write'), /Expected light and dark/)
    assert.equal(readFileSync(artifact, 'utf8'), generated)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
