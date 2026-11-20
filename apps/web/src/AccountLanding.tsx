import { useEffect, useState } from 'react'
import { Button } from '@ovelle/ui'
import './desktop-approval.css'

type Ready = { kind: 'ready'; name: string; email: string; assurance: 'authenticated' | 'passkey' | 'enrollment'; csrf: string }
type View = { kind: 'loading' | 'unavailable' } | Ready
const secretPattern = /^[A-Za-z0-9_-]{43}$/
async function account(): Promise<Ready> {
  const response = await fetch('/api/v1/me', { credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' })
  if (!response.ok) throw new Error('unavailable')
  const value: unknown = await response.json()
  if (!value || typeof value !== 'object') throw new Error('unavailable')
  const data = value as Record<string, unknown>, person = data.account, session = data.session
  if (!person || typeof person !== 'object' || !session || typeof session !== 'object') throw new Error('unavailable')
  const { displayName, email } = person as Record<string, unknown>, { assurance } = session as Record<string, unknown>
  if (typeof displayName !== 'string' || typeof email !== 'string' || typeof data.csrfToken !== 'string' || !secretPattern.test(data.csrfToken) || (assurance !== 'authenticated' && assurance !== 'passkey' && assurance !== 'enrollment')) throw new Error('unavailable')
  return { kind: 'ready', name: displayName, email, assurance, csrf: data.csrfToken }
}
export default function AccountLanding() {
  const [view, setView] = useState<View>({ kind: 'loading' }), [busy, setBusy] = useState(false), [error, setError] = useState('')
  useEffect(() => {
    let active = true
    account().then(value => { if (active) setView(value) }).catch(() => { if (active) setView({ kind: 'unavailable' }) })
    return () => { active = false }
  }, [])
  const ceremony = async (kind: 'register' | 'step-up') => {
    if (view.kind !== 'ready' || busy) return
    setBusy(true); setError('')
    try {
      if (!window.PublicKeyCredential || !navigator.credentials || typeof PublicKeyCredential.parseCreationOptionsFromJSON !== 'function' || typeof PublicKeyCredential.parseRequestOptionsFromJSON !== 'function') throw new Error('unsupported')
      const post = (path: string, value: unknown) => fetch(path, { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': view.csrf }, body: JSON.stringify(value) })
      const started = await post(`/api/v1/auth/passkeys/${kind}/start`, {})
      if (!started.ok) throw new Error('unavailable')
      const data: unknown = await started.json()
      if (!data || typeof data !== 'object' || !('options' in data)) throw new Error('unavailable')
      const options = (data as { options: unknown }).options
      const credential = kind === 'register'
        ? await navigator.credentials.create({ publicKey: PublicKeyCredential.parseCreationOptionsFromJSON(options as PublicKeyCredentialCreationOptionsJSON) })
        : await navigator.credentials.get({ publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(options as PublicKeyCredentialRequestOptionsJSON) })
      if (!(credential instanceof PublicKeyCredential) || typeof credential.toJSON !== 'function') throw new Error('unavailable')
      const finished = await post(`/api/v1/auth/passkeys/${kind}/finish`, kind === 'register' ? { response: credential.toJSON(), name: 'My passkey' } : { response: credential.toJSON() })
      if (!finished.ok) throw new Error('unavailable')
      setView(await account())
    } catch { setError('Passkey verification could not be completed. Check your device and try again, or sign in again.') }
    finally { setBusy(false) }
  }
  const signOut = async () => {
    if (view.kind !== 'ready' || busy) return
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', headers: { 'X-CSRF-Token': view.csrf } })
      if (response.status !== 204) throw new Error('unavailable')
      window.location.assign('/account/sign-in')
    } catch { setError('Browser sign-out could not be confirmed. Check your connection and try again.'); setBusy(false) }
  }
  return <main className="desktop-approval"><div className="desktop-approval-brand">ovelle</div><section className="desktop-approval-card"><h1>Ovelle account</h1>{view.kind === 'loading' && <p role="status">Checking your account…</p>}{view.kind === 'unavailable' && <p role="alert">Your account session is unavailable. <a href="/account/sign-in">Sign in again</a>.</p>}{view.kind === 'ready' && <><p>You are signed in as <strong>{view.name}</strong> ({view.email}).</p>{view.assurance === 'passkey' ? <p role="status">Passkey verified. Return to your device approval tab and select Check sign-in, then approve your device.</p> : <><p>Creating an organization requires a verified passkey. Set up your first passkey or verify one you already use.</p><div className="desktop-approval-actions"><Button disabled={busy} onClick={() => void ceremony('register')}>Set up first passkey</Button><Button variant="secondary" disabled={busy} onClick={() => void ceremony('step-up')}>Use existing passkey</Button></div><p>After verification, return to your device approval tab and select Check sign-in.</p></>}<p>Browser sign-out does not sign out an already connected desktop session.</p><Button variant="secondary" disabled={busy} onClick={() => void signOut()}>Sign out of browser</Button>{error && <p role="alert">{error}</p>}</>}</section></main>
}
