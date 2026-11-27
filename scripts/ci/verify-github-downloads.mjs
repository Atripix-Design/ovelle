import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { assertReleaseSample, releaseSample } from '../desktop-release-validation.mjs'
import { verifyRemote } from './verify-network.mjs'

const environment = process.argv[2]
const sha = process.env.DELIVERY_SOURCE_SHA
if (!['development', 'production'].includes(environment) || !/^[a-f0-9]{40}$/.test(sha ?? '')) {
  throw new Error('Expected environment and delivered source SHA')
}
const production = environment === 'production'
const base = production ? 'https://ovelle.org' : 'https://dev.ovelle.org'
const tag = `desktop-${production ? 'prod' : 'dev'}-${sha}`
const version = JSON.parse(readFileSync('apps/desktop/package.json', 'utf8')).version
const filenames = ['mac-arm64.dmg', 'mac-x64.dmg', 'win-x64.exe'].map(suffix => `Ovelle-${version}-${suffix}`)
const assetUrl = filename => `https://github.com/Atripix-Design/ovelle/releases/download/${tag}/${filename}`

// A previous catalog may remain at the edge for up to 60 seconds.
const deadline = Date.now() + 90_000
for (;;) {
  const ready = await verifyRemote(`${environment} GitHub release catalog`, async signal => {
    const response = await fetch(`${base}/api/releases`, { signal })
    if (!response.ok) throw new Error(`Unexpected catalog response (${response.status})`)
    const catalog = await response.json()
    return catalog.tag === tag && filenames.every(filename =>
      catalog.releases.some(release => release.file === filename && release.available && release.href === assetUrl(filename)))
  })
  if (ready) break
  if (Date.now() >= deadline) throw new Error(`Website did not advertise ${tag} and its packaged assets`)
  await new Promise(resolveDelay => setTimeout(resolveDelay, 5000))
}

for (const filename of filenames) {
  const size = statSync(resolve('release/desktop', filename)).size
  await verifyRemote(`GitHub asset ${filename}`, async signal => {
    const response = await fetch(assetUrl(filename), { signal, headers: { Range: releaseSample({ filename, size }).range } })
    await assertReleaseSample(response, { filename, size })
  })
}
console.log(`${environment} catalog and all three GitHub package downloads verified for ${tag}`)
