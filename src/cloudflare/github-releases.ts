const repository = 'Atripix-Design/ovelle'
const api = `https://api.github.com/repos/${repository}/releases`
const developmentTag = /^desktop-dev-[a-f0-9]{40}$/
const safeTag = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

const targets = [
  { platform: 'macOS', title: 'Mac · Apple silicon', description: 'For Macs with an Apple silicon chip.', label: 'Download for Apple silicon', suffix: '-mac-arm64.zip', format: 'ZIP archive' },
  { platform: 'macOS', title: 'Mac · Intel', description: 'For Macs with an Intel processor.', label: 'Download for Intel', suffix: '-mac-x64.zip', format: 'ZIP archive' },
  { platform: 'Windows', title: 'Windows · x64', description: 'Run Ovelle on your Windows computer.', label: 'Download for Windows', suffix: '-win-x64.exe', format: 'Windows executable' },
]

interface GitHubAsset {
  name: string
  state: string
  size: number
  browser_download_url: string
}
interface GitHubRelease {
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
  // GitHub reserves /latest for stable releases. Follow its release ordering and
  // pagination, but only accept published builds from our development channel.
  for (let page = 1; page <= 10; page++) {
    const response = await getRelease(`${api}?per_page=30&page=${page}`)
    if (!response.ok) throw new Error('GitHub prerelease lookup failed')
    const releases = await response.json<GitHubRelease[]>()
    const release = releases.find(item => item.draft === false && item.prerelease === true && developmentTag.test(item.tag_name))
    if (release || !response.headers.get('link')?.includes('rel="next"')) return release
  }
  throw new Error('Development release search exceeded its page limit')
}

export async function githubReleaseCatalog(environment: string) {
  if (environment !== 'production' && environment !== 'development') throw new Error('Unknown release channel')
  const production = environment === 'production'
  const release = await latestRelease(production)
  if (release && (!safeTag.test(release.tag_name) || !Array.isArray(release.assets))) throw new Error('Invalid release metadata')
  const releases = targets.map(({ suffix, format, ...target }) => {
    // Match assets actually uploaded to this release. Do not synthesize a link or
    // use a source archive, checksum, incomplete upload, or another repository.
    const matches = release?.assets.filter(asset =>
      /^Ovelle-[A-Za-z0-9.+-]+-(?:mac-(?:arm64|x64)\.zip|win-x64\.exe)$/.test(asset.name) &&
      asset.name.endsWith(suffix) && asset.state === 'uploaded' && asset.size > 0 &&
      asset.browser_download_url === `https://github.com/${repository}/releases/download/${release.tag_name}/${asset.name}`)
    const asset = matches?.length === 1 ? matches[0] : undefined
    return { ...target, file: asset?.name, available: !!asset, href: asset?.browser_download_url ?? '',
      requirements: format }
  })
  return { tag: release?.tag_name ?? null, releases }
}
