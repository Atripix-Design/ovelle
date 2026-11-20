import { useEffect, useState } from 'react'
import { Button } from '@ovelle/ui'
import './desktop-approval.css'
const secretPattern = /^[A-Za-z0-9_-]{43}$/
// Keep the one-time token out of browser history before rendering.
let contactToken = ''
if (window.location.pathname === '/account/verify-contact') {
  const url = new URL(window.location.href), fields = new URLSearchParams(url.hash.slice(1)); url.hash = ''
  window.history.replaceState(null, '', url.href)
  if (!url.search && [...fields.keys()].join(',') === 'token' && secretPattern.test(fields.get('token') ?? '')) contactToken = fields.get('token') ?? ''
}
export default function AccountVerifyContactPage() {
  const [csrf, setCsrf] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(contactToken ? '' : 'This confirmation link is invalid. Start sign-in again.')
  useEffect(() => {
    let active = true
    if (contactToken) fetch('/api/v1/auth/enrollment', { credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' }).then(async response => {
      if (!response.ok) throw new Error('unavailable')
      const value: unknown = await response.json(), token = value && typeof value === 'object' ? (value as Record<string, unknown>).csrfToken : null
      if (typeof token !== 'string' || !secretPattern.test(token)) throw new Error('unavailable')
      if (active) setCsrf(token)
    }).catch(() => { if (active) setError('This confirmation is unavailable. Open the link in the browser where you started sign-in.') })
    return () => { active = false }
  }, [])
  const confirm = async () => {
    if (!csrf || !contactToken || busy) return
    setBusy(true)
    const token = contactToken; contactToken = ''
    try {
      const response = await fetch('/api/v1/auth/enrollment/confirm', { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ token }) })
      if (response.status !== 204) throw new Error('unavailable')
      window.location.assign('/account')
    } catch { setError('The confirmation could not be completed. Start sign-in again.'); setBusy(false) }
  }
  return <main className="desktop-approval"><div className="desktop-approval-brand">ovelle</div><section className="desktop-approval-card"><h1>Confirm your contact email</h1><p>Only confirm if you started this Ovelle sign-in.</p>{error && <p role="alert">{error}</p>}{!error && <Button disabled={!csrf || busy} onClick={() => void confirm()}>Confirm email</Button>}</section></main>
}
