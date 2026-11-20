import { useEffect, useState } from 'react'
import './desktop-approval.css'

type View = { kind: 'loading' | 'unavailable' } | { kind: 'ready'; name: string; email: string }
export default function AccountLanding() {
  const [view, setView] = useState<View>({ kind: 'loading' })
  useEffect(() => {
    let active = true
    fetch('/api/v1/me', { credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' }).then(async response => {
      if (!response.ok) throw new Error('unavailable')
      const value: unknown = await response.json()
      if (!value || typeof value !== 'object') throw new Error('unavailable')
      const account = (value as Record<string, unknown>).account
      if (!account || typeof account !== 'object') throw new Error('unavailable')
      const { displayName, email } = account as Record<string, unknown>
      if (typeof displayName !== 'string' || typeof email !== 'string') throw new Error('unavailable')
      if (active) setView({ kind: 'ready', name: displayName, email })
    }).catch(() => { if (active) setView({ kind: 'unavailable' }) })
    return () => { active = false }
  }, [])
  return <main className="desktop-approval"><div className="desktop-approval-brand">ovelle</div><section className="desktop-approval-card"><h1>Ovelle account</h1>{view.kind === 'loading' && <p role="status">Checking your account…</p>}{view.kind === 'unavailable' && <p role="alert">Your account session is unavailable. <a href="/account/sign-in">Sign in again</a>.</p>}{view.kind === 'ready' && <><p>You are signed in as <strong>{view.name}</strong> ({view.email}).</p><p>If you started from a device approval, return to that tab and select Check sign-in.</p></>}</section></main>
}
