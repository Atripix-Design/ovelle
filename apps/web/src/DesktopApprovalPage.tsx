import { useEffect, useState } from 'react'
import { Button } from '@ovelle/ui'
import { prepareDesktopApproval, type ApprovalStatus } from '../../shared/desktop-approval'
import './desktop-approval.css'

// Initialize once outside React: Strict Mode can mount twice, but the fragment is
// erased immediately and the one-use handoff must survive that second mount.
let controller: ReturnType<typeof prepareDesktopApproval> | null = null
if (window.location.pathname === '/desktop/authorize') {
  try {
    controller = prepareDesktopApproval({
      currentUrl: window.location.href,
      clearFragment: url => window.history.replaceState(null, '', url),
      navigateToCallback: url => window.location.assign(url),
    })
  } catch { /* Render a closed failure state without revealing the handoff. */ }
}

type View = ApprovalStatus | { kind: 'loading' | 'error' | 'cancelled' | 'sending' }

export default function DesktopApprovalPage() {
  const [view, setView] = useState<View>({ kind: controller ? 'loading' : 'error' })
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    if (controller) controller.load().then(value => { if (active) setView(value) }).catch(() => { if (active) setView({ kind: 'error' }) })
    return () => { active = false }
  }, [])
  const retrySession = async () => {
    if (!controller) return
    setBusy(true)
    try { setView(await controller.load()) } catch { setView({ kind: 'error' }) } finally { setBusy(false) }
  }
  const approve = async () => {
    if (!controller || busy) return
    setBusy(true); setView({ kind: 'sending' })
    try { await controller.approve() } catch { setView({ kind: 'error' }); setBusy(false) }
  }
  const cancel = () => { controller?.cancel(); setView({ kind: 'cancelled' }) }
  return <main className="desktop-approval">
    <div className="desktop-approval-brand">ovelle</div>
    <section className="desktop-approval-card" aria-labelledby="approval-title">
      <h1 id="approval-title">Connect Ovelle on this device</h1>
      {view.kind === 'loading' && <p role="status">Checking your account…</p>}
      {view.kind === 'signInRequired' && <><p>Keep this page open, sign in to your Ovelle account in another tab in this browser, then return here and check again. This request expires after a few minutes.</p><p><a href="/account/sign-in" target="_blank" rel="noopener noreferrer">Open sign-in in a new tab</a></p><div className="desktop-approval-actions"><Button disabled={busy} onClick={retrySession}>Check sign-in</Button><Button variant="secondary" disabled={busy} onClick={cancel}>Cancel</Button></div></>}
      {view.kind === 'ready' && <><p>Only approve this request if you started sign-in from the Ovelle app on this device.</p><div className="desktop-approval-account"><span>Signed in as</span><strong>{view.account.displayName}</strong><span>{view.account.email}</span></div><p>The app will receive access as this account. Creating an organization requires passkey verification first. <a href="/account" target="_blank" rel="noopener noreferrer">Open account security in a new tab</a>, then check sign-in again.</p><div className="desktop-approval-actions"><Button disabled={busy} onClick={approve}>Approve device</Button><Button variant="secondary" disabled={busy} onClick={retrySession}>Check sign-in again</Button><Button variant="secondary" disabled={busy} onClick={cancel}>Cancel</Button></div></>}
      {view.kind === 'sending' && <p role="status">Connecting to the app…</p>}
      {view.kind === 'error' && <><p role="alert">This request is unavailable or could not be confirmed. Start sign-in again from the Ovelle app.</p><p>Do not approve an unexpected request.</p></>}
      {view.kind === 'cancelled' && <p role="status">Request cancelled. You can close this page.</p>}
    </section>
  </main>
}
