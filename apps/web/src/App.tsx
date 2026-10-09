import './App.css'
import ComponentPreview from '../../shared/ComponentPreview'
import { version as desktopVersion } from '../../desktop/package.json'

const downloads = [
  { label: 'Mac · Apple silicon', file: `Ovelle-${desktopVersion}-mac-arm64.zip` },
  { label: 'Mac · Intel', file: `Ovelle-${desktopVersion}-mac-x64.zip` },
  { label: 'Windows · x64', file: `Ovelle-${desktopVersion}-win-x64.exe` },
]
const cdnHost = import.meta.env.VITE_APP_ENV === 'production' ? 'cdn.ovelle.org' : 'cdn.dev.ovelle.org'
const releaseId = import.meta.env.VITE_RELEASE_SHA || desktopVersion

export default function App() {
  if (window.location.pathname === "/components") return <ComponentPreview/>;
  return (
    <main className="app-shell">
      <p className="eyebrow">FBLA 2026–2027 · Coding &amp; Programming</p>
      <h1>Ovelle</h1>
      <p>The web app is ready for the project brief and first feature.</p>
      <span className="environment">{import.meta.env.VITE_APP_ENV} environment</span>
      <section className="downloads" aria-labelledby="downloads-title">
        <h2 id="downloads-title">Desktop downloads</h2>
        <p>Preview build {desktopVersion}. The Mac and Windows packages are unsigned.</p>
        <div className="download-links">
          {downloads.map(({ label, file }) => (
            <a key={file} href={`https://${cdnHost}/releases/desktop/${file}?v=${encodeURIComponent(releaseId)}`}>{label}</a>
          ))}
        </div>
      </section>
    </main>
  )
}
