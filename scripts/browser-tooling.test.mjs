import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { loadChromium, loadInteractionDriver } from './browser-tooling.mjs'

test('uses the installed Playwright dependency by default and accepts its package name', async () => {
  assert.equal(await loadChromium(''), chromium)
  assert.equal(await loadChromium('playwright'), chromium)
})

test('loads local paths and file URLs and checks the requested capability', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ovelle-tooling-'))
  try {
    const modulePath = join(directory, 'provider with spaces.mjs')
    await writeFile(modulePath, 'export const chromium = { launch: () => "browser" }; export const createInteractionDriver = () => "driver";')
    assert.equal((await loadChromium(modulePath)).launch(), 'browser')
    assert.equal((await loadInteractionDriver(pathToFileURL(modulePath).href))(), 'driver')
    const malformed = join(directory, 'malformed.mjs')
    await writeFile(malformed, 'export const chromium = {}; export const createInteractionDriver = 1;')
    await assert.rejects(loadChromium(malformed), /chromium.launch/)
    await assert.rejects(loadInteractionDriver(malformed), /createInteractionDriver/)
    await assert.rejects(loadInteractionDriver(join(directory, 'missing.mjs')), /Cannot find module/)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('rejects remote, inline and native module loading and empty recording providers', async () => {
  for (const specifier of ['https://example.test/tool.mjs', 'data:text/javascript,throw new Error("executed")', 'node:fs']) {
    await assert.rejects(loadChromium(specifier), /installed local modules/)
    await assert.rejects(loadInteractionDriver(specifier), /installed local modules/)
  }
  await assert.rejects(loadInteractionDriver(''), /specifier is required/)
})
