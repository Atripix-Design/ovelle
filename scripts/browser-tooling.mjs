import { chromium } from 'playwright'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

/** Operator-selected, installed tooling only. This is not an application plugin
 * loader and must never accept an HTTP request field or download executable code.
 * Both browser verification and recording use this one capability boundary.
 */
async function installedModule(specifier) {
  if (typeof specifier !== 'string' || !specifier.trim()) throw new Error('A tooling module specifier is required')
  const target = import.meta.resolve(specifier)
  if (!target.startsWith('file:')) throw new Error('Tooling providers must resolve to installed local modules')
  return import(target)
}

export async function loadChromium(specifier = process.env.OVELLE_PLAYWRIGHT_MODULE) {
  if (!specifier) return chromium
  const provider = await installedModule(specifier)
  if (typeof provider.chromium?.launch !== 'function') throw new Error('Playwright provider must export chromium.launch')
  return provider.chromium
}

export async function loadInteractionDriver(specifier = process.env.OVELLE_VIDEO_INTERACTIONS_MODULE ?? resolve(homedir(), '.codex/skills/video-creator/scripts/recording-interactions.mjs')) {
  const provider = await installedModule(specifier)
  if (typeof provider.createInteractionDriver !== 'function') throw new Error('Recording provider must export createInteractionDriver')
  return provider.createInteractionDriver
}
