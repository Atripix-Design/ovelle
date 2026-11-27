import { useState } from 'react'
import { Button } from '@ovelle/ui'

type Props = { request: (input: unknown) => Promise<unknown>; scope: { organizationId: string; programId: string; locationId: string }; assignmentId: string; name: string; onSubmitted: () => void; onCancel: () => void; onBusyChange: (busy: boolean) => void }
/** Submission is separate from attendance and does not approve hours. */
export default function HoursSubmission({ request, scope, assignmentId, name, onSubmitted, onCancel, onBusyChange }: Props) {
  const [start, setStart] = useState(''), [end, setEnd] = useState(''), [breaks, setBreaks] = useState('0')
  const [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [pending, setPending] = useState<{ startAt: number; endAt: number; breakMinutes: number; key: string } | null>(null)
  const startAt = new Date(start).getTime(), endAt = new Date(end).getTime(), breakMinutes = Number(breaks)
  const valid = breaks.trim() !== '' && Number.isSafeInteger(startAt) && startAt >= 0 && Number.isSafeInteger(endAt) && endAt > startAt && (endAt - startAt) % 60000 === 0 && Number.isSafeInteger(breakMinutes) && breakMinutes >= 0 && breakMinutes * 60000 < endAt - startAt
  const submit = async () => {
    const command = pending ?? { startAt, endAt, breakMinutes, key: crypto.randomUUID() }
    setPending(command); setBusy(true); onBusyChange(true); setError('')
    try { await request({ operation: 'submitHours', ...scope, assignmentId, startAt: command.startAt, endAt: command.endAt, breakMinutes: command.breakMinutes, idempotencyKey: command.key }); onSubmitted() }
    catch { setError('The submission could not be confirmed. Retry these same hours or check Hours review before starting over.') }
    finally { setBusy(false); onBusyChange(false) }
  }
  return <div className="workflow-card" role="region" aria-label={`Submit hours for ${name}`}>
    <h3>Submit hours for {name}</h3>
    <p>Enter the actual times in this device’s time zone. This sends hours for review; it does not approve them. A different submission for the same assignment requires a correction.</p>
    <label>Hours start <input type="datetime-local" value={start} disabled={busy || !!pending} onChange={e => { setStart(e.target.value); setConfirm(false) }} /></label>
    <label>Hours end <input type="datetime-local" value={end} disabled={busy || !!pending} onChange={e => { setEnd(e.target.value); setConfirm(false) }} /></label>
    <label>Unpaid break minutes <input type="number" min="0" step="1" value={breaks} disabled={busy || !!pending} onChange={e => { setBreaks(e.target.value); setConfirm(false) }} /></label>
    {!pending && (!confirm ? <Button disabled={busy || !valid} onClick={() => setConfirm(true)}>Review submission</Button> : <><p>Submit {(endAt - startAt) / 60000 - breakMinutes} minutes for review?</p><Button disabled={busy} onClick={() => void submit()}>Confirm submission</Button><Button variant="secondary" disabled={busy} onClick={() => setConfirm(false)}>Back</Button></>)}
    {pending && <Button disabled={busy} onClick={() => void submit()}>Retry submission</Button>}
    <Button variant="secondary" disabled={busy} onClick={onCancel}>Close</Button>
    {error && <p role="alert">{error}</p>}
  </div>
}
