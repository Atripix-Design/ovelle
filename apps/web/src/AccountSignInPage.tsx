import { useEffect, useRef, useState } from 'react'
import { Button } from '@ovelle/ui'
import './desktop-approval.css'

type WidgetOptions = { sitekey: string; action: string; callback: (token: string) => void; 'expired-callback': () => void; 'error-callback': () => void }
type WidgetApi = { render: (element: HTMLElement, options: WidgetOptions) => string; remove: (id: string) => void; reset: (id: string) => void }
declare global { interface Window { turnstile?: WidgetApi } }
type Prelogin = { csrfToken: string; siteKey: string }
const secretPattern = /^[A-Za-z0-9_-]{43}$/
const widgetScript = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

async function prelogin(): Promise<Prelogin> {
  const response = await fetch('/api/v1/auth/prelogin', { credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' })
  if (!response.ok) throw new Error('unavailable')
  const data: unknown = await response.json()
  if (!data || typeof data !== 'object') throw new Error('unavailable')
  const { csrfToken, siteKey } = data as Record<string, unknown>
  if (typeof csrfToken !== 'string' || !secretPattern.test(csrfToken) || typeof siteKey !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(siteKey)) throw new Error('unavailable')
  return { csrfToken, siteKey }
}
// Strict Mode mounts twice. A single request keeps the CSRF value paired with
// the cookie even when the browser has no prelogin cookie yet.
let initial: Promise<Prelogin> | null = null
function initialPrelogin() { return initial ??= prelogin() }

function validProviderUrl(provider: 'google' | 'microsoft', value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    const expected = provider === 'google' ? 'https://accounts.google.com/o/oauth2/v2/auth' : 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize'
    return !url.username && !url.password && !url.hash && url.origin + url.pathname === expected
  } catch { return false }
}

export default function AccountSignInPage() {
  const [config, setConfig] = useState<Prelogin | null>(null), [token, setToken] = useState('')
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const target = useRef<HTMLDivElement>(null), widget = useRef<string | null>(null)
  useEffect(() => {
    let active = true
    initialPrelogin().then(value => { if (active) setConfig(value) }).catch(() => { if (active) setError('Sign-in is currently unavailable. Please try again later.') })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (!config) return
    let active = true
    const render = () => {
      if (!active || !target.current || !window.turnstile || widget.current) return
      widget.current = window.turnstile.render(target.current, { sitekey: config.siteKey, action: 'oidc_login', callback: value => { if (active) setToken(value) }, 'expired-callback': () => { if (active) setToken('') }, 'error-callback': () => { if (active) { setToken(''); setError('Verification is unavailable. Please try again later.') } } })
    }
    let script = document.querySelector<HTMLScriptElement>('script[data-ovelle-turnstile]')
    if (!script) { script = document.createElement('script'); script.src = widgetScript; script.async = true; script.dataset.ovelleTurnstile = 'true'; document.head.append(script) }
    script.addEventListener('load', render)
    const failed = () => { if (active) setError('Verification could not load. Please try again later.') }
    script.addEventListener('error', failed)
    if (window.turnstile) render()
    return () => { active = false; script.removeEventListener('load', render); script.removeEventListener('error', failed); if (widget.current && window.turnstile) window.turnstile.remove(widget.current); widget.current = null }
  }, [config])
  const start = async (provider: 'google' | 'microsoft') => {
    if (!config || !token || busy) return
    setBusy(true); setError('')
    const used = token; setToken('')
    try {
      const response = await fetch(`/api/v1/auth/oidc/${provider}/start`, { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': config.csrfToken }, body: JSON.stringify({ turnstileToken: used }) })
      if (!response.ok) throw new Error('unavailable')
      const data: unknown = await response.json()
      const url = data && typeof data === 'object' ? (data as Record<string, unknown>).authorizationUrl : null
      if (!validProviderUrl(provider, url)) throw new Error('unavailable')
      window.location.assign(url)
    } catch {
      setError('Sign-in could not be started. Complete verification and try again.')
      try { const next = await prelogin(); initial = Promise.resolve(next); setConfig(next) } catch { setConfig(null); setError('Sign-in is currently unavailable. Please try again later.') }
      if (widget.current && window.turnstile) window.turnstile.reset(widget.current)
      setBusy(false)
    }
  }
  return <main className="desktop-approval"><div className="desktop-approval-brand">ovelle</div><section className="desktop-approval-card" aria-labelledby="signin-title"><h1 id="signin-title">Sign in to Ovelle</h1><p>Use your connected account. If you opened this page from a device approval, return to that tab after signing in.</p>{error && <p role="alert">{error}</p>}<div ref={target} aria-label="Security verification" />{!config && !error && <p role="status">Preparing sign-in…</p>}<div className="desktop-approval-actions"><Button disabled={!config || !token || busy} onClick={() => void start('google')}>Continue with Google</Button><Button variant="secondary" disabled={!config || !token || busy} onClick={() => void start('microsoft')}>Continue with Microsoft</Button></div></section></main>
}
