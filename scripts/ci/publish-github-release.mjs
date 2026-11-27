import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const branch = process.env.DELIVERY_SOURCE_REF
const sha = process.env.DELIVERY_SOURCE_SHA
const repository = process.env.GITHUB_REPOSITORY
const environment = process.argv[2]
const production = environment === 'production'
if (!['production', 'development'].includes(environment) ||
    branch !== (production ? 'refs/heads/main' : 'refs/heads/development') ||
    process.env.DELIVERY_SOURCE_EVENT !== 'push' ||
    !/^[a-f0-9]{40}$/.test(sha ?? '') ||
    repository !== 'Atripix-Design/ovelle') throw new Error('Expected an Ovelle application branch push')
const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' }).trim()
function assertCurrentSource() {
  const remote = gh('api', `repos/${repository}/git/${branch.replace('refs/', 'ref/')}`, '--jq', '.object.sha')
  const checkout = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  if (remote !== sha || checkout !== sha) throw new Error('Desktop release does not match the current branch source')
}
assertCurrentSource()

const version = JSON.parse(readFileSync('apps/desktop/package.json', 'utf8')).version
if (!/^\d+\.\d+\.\d+(?:[-+][\w.+-]+)?$/.test(version)) throw new Error('Invalid desktop version')
const tag = `desktop-${production ? 'prod' : 'dev'}-${sha}`
const expected = await Promise.all(['mac-arm64.zip', 'mac-x64.zip', 'win-x64.exe'].map(async suffix => {
  const name = `Ovelle-${version}-${suffix}`
  const path = resolve('release/desktop', name)
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return { name, path, digest: `sha256:${hash.digest('hex')}`, size: statSync(path).size }
}))
const releases = `repos/${repository}/releases`
// Look up drafts too, so an interrupted upload can be resumed without
// publishing partial assets or overwriting an already published release.
function findRelease() {
  return JSON.parse(gh('api', '--paginate', '--slurp', `${releases}?per_page=100`))
    .flat().find(release => release.tag_name === tag)
}
function checkAsset(asset, file) {
  if (!asset || asset.state !== 'uploaded' || asset.size !== file.size || asset.digest !== file.digest ||
      asset.browser_download_url !== `https://github.com/${repository}/releases/download/${tag}/${file.name}`) {
    throw new Error(`GitHub asset does not match the verified package: ${file.name}`)
  }
}

let release = findRelease()
const refs = `repos/${repository}/git`
const tagRef = JSON.parse(gh('api', `${refs}/matching-refs/tags/${tag}`)).find(ref => ref.ref === `refs/tags/${tag}`)
if (tagRef ? tagRef.object.sha !== sha : !!release) throw new Error('Desktop release tag does not match the verified source')
if (!tagRef) gh('api', '--method', 'POST', `${refs}/refs`, '-f', `ref=refs/tags/${tag}`, '-f', `sha=${sha}`)
if (!release) {
  release = JSON.parse(gh('api', '--method', 'POST', releases, '-f', `tag_name=${tag}`,
    '-f', `name=Ovelle ${version} ${production ? '' : 'Preview ' }(${sha.slice(0, 7)})`,
    '-f', `body=Desktop packages built from ${branch} at ${sha}. macOS packages are unsigned ZIP archives.`,
    '-F', 'draft=true', '-F', `prerelease=${!production}`))
}
if (release.prerelease !== !production) throw new Error('Desktop release has the wrong publication channel')
if (release.draft) {
  const missing = expected.filter(file => !release.assets.some(asset => asset.name === file.name))
  for (const file of expected.filter(file => !missing.includes(file))) checkAsset(release.assets.find(asset => asset.name === file.name), file)
  if (missing.length) gh('release', 'upload', tag, ...missing.map(file => file.path), '--repo', repository)
  release = JSON.parse(gh('api', `${releases}/${release.id}`))
}
for (const file of expected) checkAsset(release.assets.find(asset => asset.name === file.name), file)
assertCurrentSource()
if (release.draft) {
  release = JSON.parse(gh('api', '--method', 'PATCH', `${releases}/${release.id}`, '-F', 'draft=false', '-f', `make_latest=${production}`))
}
if (release.draft || release.prerelease !== !production) throw new Error('GitHub did not publish the release in the expected channel')
console.log(`Published verified desktop assets: https://github.com/${repository}/releases/tag/${tag}`)
