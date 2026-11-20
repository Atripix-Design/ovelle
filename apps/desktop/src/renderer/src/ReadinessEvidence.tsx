import { useState } from 'react'
import { Button } from '@ovelle/ui'

type Props = {
  request: (value: unknown) => Promise<unknown>
  identity: { organizationId: string; programId: string; locationId: string; occurrenceId: string; roleId: string; personId: string }
  criterion: { id: string; name: string; evidenceId: string | null }
  onRecorded: () => void
  onCancel: () => void
  onBusyChange: (busy: boolean) => void
}

/** Evidence revisions are append-only and compare the previously observed ID. */
export default function ReadinessEvidence({ request, identity, criterion, onRecorded, onCancel, onBusyChange }: Props) {
  const [state, setState] = useState<'verified' | 'revoked'>('verified')
  const [validFrom, setValidFrom] = useState(''), [validUntil, setValidUntil] = useState(''), [note, setNote] = useState('')
  const [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [pending, setPending] = useState<{ fields: Record<string, unknown>; key: string } | null>(null)
  const from = new Date(validFrom).getTime(), until = validUntil ? new Date(validUntil).getTime() : null
  const valid = !!note.trim() && note.trim().length <= 2000 && (state === 'revoked' || (Number.isSafeInteger(from) && from >= 0 && (until === null || (Number.isSafeInteger(until) && until > from))))
  const submit = async () => {
    const command = pending ?? { key: crypto.randomUUID(), fields: { ...identity, criterionId: criterion.id, state, validFrom: state === 'verified' ? from : null, validUntil: state === 'verified' ? until : null, note: note.trim(), expectedEvidenceId: criterion.evidenceId } }
    setPending(command); setBusy(true); onBusyChange(true); setError('')
    try {
      await request({ operation: 'recordEvidence', ...command.fields, idempotencyKey: command.key })
      onRecorded()
    } catch { setError('The result could not be confirmed. Retry this same request or return to the case and reload its evidence before starting over.') }
    finally { setBusy(false); onBusyChange(false) }
  }
  return <div className="workflow-card" role="region" aria-label={`Evidence for ${criterion.name}`}>
    <h3>Record evidence: {criterion.name}</h3>
    <p>Dates use this device’s time zone. Recording evidence does not make the readiness decision for you.</p>
    <label>Evidence state <select value={state} disabled={busy || !!pending} onChange={e => { setState(e.target.value as 'verified' | 'revoked'); setConfirm(false) }}><option value="verified">Verified</option><option value="revoked">Revoked</option></select></label>
    {state === 'verified' && <><label>Valid from <input type="datetime-local" value={validFrom} disabled={busy || !!pending} onChange={e => { setValidFrom(e.target.value); setConfirm(false) }} /></label><label>Valid until (optional) <input type="datetime-local" value={validUntil} disabled={busy || !!pending} onChange={e => { setValidUntil(e.target.value); setConfirm(false) }} /></label></>}
    <label>Evidence note <textarea value={note} maxLength={2000} disabled={busy || !!pending} onChange={e => { setNote(e.target.value); setConfirm(false) }} /></label>
    {!pending && (!confirm ? <Button disabled={busy || !valid} onClick={() => setConfirm(true)}>Review evidence</Button> : <><p>Record this {state} evidence for {criterion.name}?</p><Button disabled={busy} onClick={() => void submit()}>Confirm evidence</Button><Button variant="secondary" disabled={busy} onClick={() => setConfirm(false)}>Back</Button></>)}
    {pending && <Button disabled={busy} onClick={() => void submit()}>Retry evidence</Button>}
    <Button variant="secondary" disabled={busy} onClick={onCancel}>Close</Button>
    {error && <p role="alert">{error}</p>}
  </div>
}
