import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import sharp from 'sharp'
import { inspectMacWindowImage } from './check-macos-window-visual.mjs'

test('native screenshot analysis rejects squashed controls, missing controls and a misaligned wordmark', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ovelle-window-visual-'))
  const capture = async (name, { radiusY = 14, wordY = 38, omitGreen = false } = {}) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="180"><rect width="600" height="180" fill="white"/><ellipse cx="50" cy="50" rx="14" ry="${radiusY}" fill="#ff5f57"/><ellipse cx="96" cy="50" rx="14" ry="14" fill="#ffbd2e"/>${omitGreen ? '' : '<ellipse cx="142" cy="50" rx="14" ry="14" fill="#28c840"/>'}<rect x="190" y="${wordY}" width="95" height="24" fill="#172b3d"/></svg>`
    const path = join(dir, `${name}.png`)
    await sharp(Buffer.from(svg)).png().toFile(path)
    return path
  }
  try {
    await inspectMacWindowImage(await capture('normal'))
    await assert.rejects(inspectMacWindowImage(await capture('squashed', { radiusY: 7 })), /squashed/)
    await assert.rejects(inspectMacWindowImage(await capture('misaligned', { wordY: 65 })), /misaligned/)
    await assert.rejects(inspectMacWindowImage(await capture('missing', { omitGreen: true })), /not found/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
