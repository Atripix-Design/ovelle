import './tailwind.css'
import '@ovelle/ui/styles.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import './style.css'
import ComponentPreview from '../../../../shared/ComponentPreview'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {window.location.search.includes("components") ? <ComponentPreview/> : <main>
      <p className="eyebrow">FBLA 2026–2027 · Coding &amp; Programming</p>
      <h1>Ovelle Desktop</h1>
      <p>The desktop app is ready for the project brief and first feature.</p>
      <span className="environment">{import.meta.env.VITE_APP_ENV} environment</span>
    </main>}
  </React.StrictMode>,
)
