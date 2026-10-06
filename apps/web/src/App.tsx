import './App.css'

export default function App() {
  return (
    <main className="app-shell">
      <p className="eyebrow">FBLA 2026–2027 · Coding &amp; Programming</p>
      <h1>Ovelle</h1>
      <p>The web app is ready for the project brief and first feature.</p>
      <span className="environment">{import.meta.env.VITE_APP_ENV} environment</span>
    </main>
  )
}
