import { useEffect, useState } from 'react'
import { Button } from '@ovelle/ui'
import './desktop-approval.css'

const secretPattern = /^[A-Za-z0-9_-]{43}$/
type Enrollment = { csrfToken: string; emailHint: string | null; displayNameHint: string | null }
async function enrollment(): Promise<Enrollment> {
  const response = await fetch('/api/v1/auth/enrollment', { credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' })
  if (!response.ok) throw new Error('unavailable')
  const value: unknown = await response.json()
  if (!value || typeof value !== 'object') throw new Error('unavailable')
  const { csrfToken, emailHint, displayNameHint } = value as Record<string, unknown>
  if (typeof csrfToken !== 'string' || !secretPattern.test(csrfToken) || !(emailHint === null || typeof emailHint === 'string') || !(displayNameHint === null || typeof displayNameHint === 'string')) throw new Error('unavailable')
  return { csrfToken, emailHint, displayNameHint }
}
export default function AccountEnrollmentPage() {
  const [details, setDetails] = useState<Enrollment | null>(null), [name, setName] = useState(''), [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false), [sent, setSent] = useState(false), [error, setError] = useState('')
  useEffect(() => {
    let active = true
    enrollment().then(value => { if (active) { setDetails(value); setName(value.displayNameHint ?? ''); setEmail(value.emailHint ?? '') } }).catch(() => { if (active) setError('This enrollment is unavailable. Start sign-in again.') })
    return () => { active = false }
  }, [])
  const submit = async () => {
    if (!details || busy) return
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/v1/auth/enrollment/contact', { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': details.csrfToken }, body: JSON.stringify({ displayName: name.trim(), email: email.trim() }) })
      if (response.status !== 202) throw new Error('unavailable')
      const me = await fetch('/api/v1/me', { credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' })
      if (me.ok) window.location.assign('/account')
      else setSent(true)
    } catch { setError('The request could not be confirmed. Check your email before trying again, or restart sign-in.') }
    finally { setBusy(false) }
  }
  return <main className="desktop-approval"><div className="desktop-approval-brand">ovelle</div><section className="desktop-approval-card"><h1>Complete your account</h1>{error && <p role="alert">{error}</p>}{!details && !error && <p role="status">Loading account details…</p>}{details && !sent && <><p>Confirm the name and contact email you want to use with Ovelle.</p><div className="account-fields"><label>Name <input value={name} maxLength={120} disabled={busy} onChange={e => setName(e.target.value)} autoComplete="name" /></label><label>Contact email <input type="email" value={email} maxLength={254} disabled={busy} onChange={e => setEmail(e.target.value)} autoComplete="email" /></label></div><div className="desktop-approval-actions"><Button disabled={busy || !name.trim() || !email.trim()} onClick={() => void submit()}>Continue</Button></div></>}{sent && <p role="status">If this contact can be verified, check your email for a confirmation link. Open it in this same browser. If you already have an account, sign in using its linked provider.</p>}</section></main>
}
