import { useState } from 'react'
import { Button } from '@ovelle/ui'
type Props = { request: (input: unknown) => Promise<unknown>; onCreated: () => void; onBusyChange: (busy: boolean) => void }
/** Organization creation is explicit; the service enforces passkey assurance. */
export default function OrganizationSetup({ request, onCreated, onBusyChange }: Props) {
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [program, setProgram] = useState(''), [location, setLocation] = useState('')
  const [timeZone, setTimeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || '')
  const [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [pending, setPending] = useState<{ values: Record<string, string>; key: string } | null>(null)
  const valid = [name, email, program, location, timeZone].every(value => !!value.trim()) && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email.trim())
  const create = async () => {
    const command = pending ?? { key: crypto.randomUUID(), values: { name: name.trim(), contactEmail: email.trim(), timeZone: timeZone.trim(), firstProgram: program.trim(), firstLocation: location.trim() } }
    setPending(command); setBusy(true); onBusyChange(true); setError('')
    try { await request({ operation: 'createOrganization', ...command.values, idempotencyKey: command.key }); onCreated() }
    catch { setError('Creation could not be confirmed. Retry this request or check your organizations before starting over. Creating an organization requires a passkey-verified session.') }
    finally { setBusy(false); onBusyChange(false) }
  }
  return <section className="workflow-card"><h2>Set up your organization</h2><p>Create your first organization, program and location. Your account must have completed passkey verification before connecting this device.</p>
    <div className="account-fields"><label>Organization name <input value={name} maxLength={120} disabled={busy || !!pending} onChange={e => setName(e.target.value)} /></label><label>Organization contact email <input type="email" value={email} maxLength={254} disabled={busy || !!pending} onChange={e => setEmail(e.target.value)} /></label><label>Time zone <input value={timeZone} maxLength={120} disabled={busy || !!pending} onChange={e => setTimeZone(e.target.value)} /></label><label>First program <input value={program} maxLength={120} disabled={busy || !!pending} onChange={e => setProgram(e.target.value)} /></label><label>First location <input value={location} maxLength={120} disabled={busy || !!pending} onChange={e => setLocation(e.target.value)} /></label></div>
    {!pending && (!confirm ? <Button disabled={busy || !valid} onClick={() => setConfirm(true)}>Review organization</Button> : <><p>Create {name} with {program} at {location}?</p><Button disabled={busy} onClick={() => void create()}>Confirm organization</Button><Button variant="secondary" disabled={busy} onClick={() => setConfirm(false)}>Back</Button></>)}
    {pending && <Button disabled={busy} onClick={() => void create()}>Retry organization setup</Button>}{error && <p role="alert">{error}</p>}
  </section>
}
