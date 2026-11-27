import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { performance } from 'node:perf_hooks'
import { readFile } from 'node:fs/promises'
import { cpus, platform, arch } from 'node:os'

// In-memory dispatch into workerd: no public listener, deployed Worker, D1 or mail.
const bundle = await build({ entryPoints: ['scripts/stage0-password-probe.ts'], bundle: true, format: 'esm', platform: 'browser', write: false })
const runtime = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-10-06', outboundService: () => new Response(null, { status: 503 }) }))
const packageVersion = async (name: string) => JSON.parse(await readFile(`node_modules/${name}/package.json`, 'utf8')).version as string
const samples = 5
try {
  await runtime.ready
  const measure = async (path: string) => {
    const start = performance.now()
    const response = await runtime.dispatchFetch(`http://fixture.invalid${path}`)
    const result = await response.json() as { status?: string; matches?: boolean; message?: string }
    if (!response.ok) throw new Error(`Probe returned HTTP ${response.status}`)
    return { elapsedMs: Number((performance.now() - start).toFixed(3)), result }
  }
  const baseline = await measure('/baseline')
  const candidates = []
  for (const candidate of ['pbkdf2-webcrypto', 'argon2id-noble']) {
    const cold = await measure(`/hash?candidate=${candidate}`)
    const operations = []
    if (cold.result.status === 'ok') {
      if (cold.result.matches !== true) throw new Error(`${candidate}: independent vector mismatch`)
      for (const operation of ['hash', 'verify', 'mismatch']) {
        const timingsMs = []
        for (let index = 0; index < samples; index++) {
          const sample = await measure(`/${operation}?candidate=${candidate}`)
          if (sample.result.status !== 'ok' || sample.result.matches !== (operation !== 'mismatch')) throw new Error(`${candidate}: ${operation} failed`)
          timingsMs.push(sample.elapsedMs)
        }
        operations.push({ operation, timingsMs, medianMs: [...timingsMs].sort((a, b) => a - b)[Math.floor(samples / 2)], maxMs: Math.max(...timingsMs) })
      }
    }
    candidates.push({ candidate, cold, operations })
  }
  console.log(JSON.stringify({ scope: 'local-workerd', compatibilityDate: '2026-10-06', node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model, packages: { wrangler: await packageVersion('wrangler'), miniflare: await packageVersion('miniflare'), workerd: await packageVersion('workerd'), nobleHashes: await packageVersion('@noble/hashes') }, units: 'external wall-clock milliseconds including local dispatch; not hosted CPU', hostedCpuMs: null, hostedCpuHeadroomMs: null, baseline, samples, candidates }, null, 2))
} finally {
  await runtime.dispose()
}
