const repository = 'Atripix-Design/ovelle'
const api = `https://api.github.com/repos/${repository}/releases`
const developmentTag = /^desktop-dev-[a-f0-9]{40}$/
const safeTag = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

const targets = [
  { platform: 'macOS', title: 'Mac · Apple silicon', description: 'For Macs with an Apple silicon chip.', label: 'Download for Apple silicon', suffixes: ['-mac-arm64.dmg', '-mac-arm64.zip'] },
  { platform: 'macOS', title: 'Mac · Intel', description: 'For Macs with an Intel processor.', label: 'Download for Intel', suffixes: ['-mac-x64.dmg', '-mac-x64.zip'] },
  { platform: 'Windows', title: 'Windows · x64', description: 'Run Ovelle on your Windows computer.', label: 'Download for Windows', suffixes: ['-win-x64.exe'] },
]

interface GitHubAsset {
  name: string
  state: string
  size: number
  browser_download_url: string
}
interface GitHubRelease {
  id: number
  published_at: string | null
  tag_name: string
  draft: boolean
  prerelease: boolean
  assets: GitHubAsset[]
}

function getRelease(url: string) {
  return fetch(url, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Ovelle-Release-Catalog' },
    signal: AbortSignal.timeout(5000),
    // Bound edge staleness and avoid caching upstream errors (including rate limits).
    cf: { cacheEverything: true, cacheTtlByStatus: { '200': 60, '400-599': -1 } },
  })
}

async function latestRelease(production: boolean): Promise<GitHubRelease | undefined> {
  if (production) {
    const response = await getRelease(`${api}/latest`)
    if (response.status === 404) return
    if (!response.ok) throw new Error('GitHub release lookup failed')
    const release = await response.json<GitHubRelease>()
    if (release.draft === false && release.prerelease === false && !developmentTag.test(release.tag_name)) return release
    return
  }
  // The release list is not ordered by publication time. An older draft can
  // be published later, and an earlier page can contain an older prerelease.
  let newest: GitHubRelease | undefined
  let newestAt = Number.NEGATIVE_INFINITY
  for (let page = 1; ; page++) {
    const response = await getRelease(`${api}?per_page=100&page=${page}`)
    if (!response.ok) throw new Error('GitHub prerelease lookup failed')
    for (const release of await response.json<GitHubRelease[]>()) {
      if (release.draft !== false || release.prerelease !== true || !developmentTag.test(release.tag_name) || !release.published_at) continue
      const publishedAt = Date.parse(release.published_at)
      if (publishedAt > newestAt || (publishedAt === newestAt && newest && release.id > newest.id)) {
        newest = release
        newestAt = publishedAt
      }
    }
    if (!response.headers.get('link')?.includes('rel="next"')) return newest
  }
}

export async function githubReleaseCatalog(environment: string) {
  if (environment !== 'production' && environment !== 'development') throw new Error('Unknown release channel')
  const production = environment === 'production'
  const release = await latestRelease(production)
  if (release && (!safeTag.test(release.tag_name) || !Array.isArray(release.assets))) throw new Error('Invalid release metadata')
  const releases = targets.map(({ suffixes, ...target }) => {
    // Match assets actually uploaded to this release. Do not synthesize a link or
    // use a source archive, checksum, incomplete upload, or another repository.
    const matches = release?.assets.filter(asset =>
      /^Ovelle-[A-Za-z0-9.+-]+-(?:mac-(?:arm64|x64)\.(?:dmg|zip)|win-x64\.exe)$/.test(asset.name) &&
      suffixes.some(suffix => asset.name.endsWith(suffix)) && asset.state === 'uploaded' && asset.size > 0 &&
      asset.browser_download_url === `https://github.com/${repository}/releases/download/${release.tag_name}/${asset.name}`)
    const asset = suffixes.map(suffix => matches?.filter(match => match.name.endsWith(suffix)))
      .find(candidates => candidates?.length === 1)?.[0]
    const format = asset?.name.endsWith('.zip') ? 'ZIP archive' : target.platform === 'macOS' ? 'DMG disk image' : 'Windows executable'
    return { ...target, file: asset?.name, available: !!asset, href: asset?.browser_download_url ?? '',
      requirements: format }
  })
  return { tag: release?.tag_name ?? null, releases }
}
