import './tailwind.css'
import '@ovelle/ui/styles.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import './style.css'
import ComponentPreview from '../../../../shared/ComponentPreview'
import Home from '../../../../shared/Home'
import type { DesktopRelease } from '@ovelle/ui'
declare global { interface Window { ovelleDownloads?: { loadReleases: () => Promise<DesktopRelease[]>; emailLink: (email: string) => Promise<void> } } }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {window.location.search.includes("components") ? <ComponentPreview/> : <Home desktop emailSender={window.ovelleDownloads?.emailLink} loadReleases={window.ovelleDownloads?.loadReleases}/>}
  </React.StrictMode>,
)
