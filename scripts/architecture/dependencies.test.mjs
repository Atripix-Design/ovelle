import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { analyze, dependencies, resolveLocal } from './dependencies.mjs'

const config = { zones: [
  { id: 'ui', roots: ['ui'], allowed: [], node: false, electron: false, public: ['ui/index.ts'] },
  { id: 'app', roots: ['app'], allowed: ['ui'], node: false, electron: false },
  { id: 'native', roots: ['native'], allowed: [], node: true, electron: true },
] }
const rules = sources => analyze(sources, config, { '@ovelle/ui': ['.', './styles.css'] }).map(v => v.rule)
test('extracts static, dynamic, type, re-export and require dependencies without comment false positives', () => {
  const result = dependencies('a.ts', `// import 'fake'
    import type { T } from './types.js'; export { a } from './a';
    const a = import('./lazy'); const b = require('node:fs');
    type C = import('./contract').C; const dynamic = import(path);`)
  assert.deepEqual(result.map(v => v.specifier), ['./types.js', './a', './lazy', 'node:fs', './contract', null])
})
test('resolves output extension imports and generated UI test targets to source', () => {
  const files = new Set(['ui/a.tsx'])
  assert.equal(resolveLocal('ui/b.ts', './a.js', files), 'ui/a.tsx')
  assert.equal(resolveLocal('test/a.mjs', '../dist/a.js', files, [{ output: 'dist/', source: 'ui/' }]), 'ui/a.tsx')
})
test('detects barrel cycles even when source uses JS output extensions', () => {
  assert.deepEqual(rules({ 'ui/index.ts': "export * from './button.js'", 'ui/button.ts': "import { x } from './index.js'" }), ['cycle'])
})
test('enforces direction and public entry points, including type-only imports', () => {
  assert.ok(rules({ 'ui/index.ts': "import type { X } from '../native/a'", 'native/a.ts': '' }).includes('dependency-direction'))
  assert.ok(rules({ 'app/a.ts': "import '../ui/private'", 'ui/private.ts': '' }).includes('private-import'))
  assert.deepEqual(rules({ 'app/a.ts': "import '../ui/index'", 'ui/index.ts': '' }), [])
})
test('blocks package internals, native access and Node builtins in browser code', () => {
  assert.deepEqual(rules({ 'app/a.ts': "import '@ovelle/ui/src/button'; import 'electron'; import 'fs/promises'" }).sort(), ['native-boundary', 'node-in-browser', 'private-package-import'].sort())
  assert.deepEqual(rules({ 'native/a.ts': "import 'electron'; import 'node:fs'" }), [])
})
test('unknown ownership, unresolved imports and dynamic imports fail closed', () => {
  assert.throws(() => rules({ 'unknown/a.ts': '' }), /expected one architecture owner/)
  assert.deepEqual(rules({ 'app/a.ts': "import './missing'; import(variable)" }), ['unresolved-local-import', 'dynamic-import'])
})
test('overlapping ownership cannot silently change a boundary', () => {
  assert.throws(() => analyze({ 'ui/a.ts': '' }, { zones: [...config.zones, config.zones[0]] }), /found 2/)
})

test('a domain carve-out has its own owner and cannot import I/O or its parent backend', () => {
  const domain = { zones: [
    { id: 'backend', roots: ['backend'], excludes: ['backend/domain'], allowed: ['domain'], node: true },
    { id: 'domain', roots: ['backend/domain'], allowed: [], external: [], node: false },
  ] }
  const findings = analyze({
    'backend/service.ts': "import './domain/policy'",
    'backend/storage.ts': '',
    'backend/domain/policy.ts': "import '../storage'; import '@vendor/database'",
  }, domain)
  assert.deepEqual(findings.map(v => v.rule), ['dependency-direction', 'external-dependency'])
  assert.throws(() => analyze({ 'backend/orphan.ts': '' }, { zones: [
    { id: 'backend', roots: ['backend'], excludes: ['backend/orphan.ts'], allowed: [] },
  ] }), /expected one architecture owner/)
})


test('the repository service boundary rejects route and composition back-imports', () => {
  const contract = JSON.parse(readFileSync(new URL('../../architecture/ownership.json', import.meta.url), 'utf8'))
  const findings = analyze({
    'src/cloudflare/stage0/auth/accounts.ts': "import './routes'; import '../backend'",
    'src/cloudflare/stage0/auth/routes.ts': '',
    'src/cloudflare/stage0/backend.ts': '',
  }, contract)
  assert.deepEqual(findings.map(v => v.rule), ['dependency-direction', 'dependency-direction'])
  assert.deepEqual(analyze({
    'src/cloudflare/stage0/auth/routes.ts': "import './accounts'; import '../http/response'",
    'src/cloudflare/stage0/auth/accounts.ts': '',
    'src/cloudflare/stage0/http/response.ts': '',
  }, contract), [])
})

test('desktop contracts stay platform independent and cannot grant renderer native access', () => {
  const contract = JSON.parse(readFileSync(new URL('../../architecture/ownership.json', import.meta.url), 'utf8'))
  assert.deepEqual(analyze({
    'apps/desktop/src/main/index.ts': "import '../contracts/downloads'",
    'apps/desktop/src/preload/index.ts': "import '../contracts/downloads'",
    'apps/desktop/src/contracts/downloads.ts': '',
  }, contract), [])
  const findings = analyze({
    'apps/desktop/src/renderer/src/main.tsx': "import '../../main/downloads'",
    'apps/desktop/src/main/downloads.ts': '',
    'apps/desktop/src/contracts/downloads.ts': "import '../main/downloads'; import 'electron'; import 'node:fs'",
  }, contract)
  for (const rule of ['dependency-direction', 'native-boundary', 'node-in-browser']) {
    assert.ok(findings.some(finding => finding.rule === rule))
  }
})

test('staff normalization cannot acquire request or delivery capabilities', () => {
  const contract = JSON.parse(readFileSync(new URL('../../architecture/ownership.json', import.meta.url), 'utf8'))
  const findings = analyze({
    'src/cloudflare/stage0/staff/validation.ts': "import type { RequestContext } from '../contracts'; import './invitation-delivery'",
    'src/cloudflare/stage0/contracts.ts': '',
    'src/cloudflare/stage0/staff/invitation-delivery.ts': '',
  }, contract)
  assert.deepEqual(findings.map(finding => finding.rule), ['dependency-direction', 'dependency-direction'])
})
