import { useState } from 'react'
import { Button } from '@ovelle/ui'

type Props = { request: (input: unknown) => Promise<unknown>; identity: { organizationId: string; programId: string; locationId: string; occurrenceId: string; roleId: string; personId: string }; name: string; onAssigned: () => void; onBusyChange: (busy: boolean) => void }

/** The server rechecks readiness, capacity and permissions at assignment time. */
export default function ReadinessAssignment({ request, identity, name, onAssigned, onBusyChange }: Props) {
  const [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [key, setKey] = useState<string | null>(null)
  const assign = async () => {
    const attempt = key ?? crypto.randomUUID()
    setKey(attempt); setBusy(true); onBusyChange(true); setError('')
    try { await request({ operation: 'assign', ...identity, idempotencyKey: attempt }); onAssigned() }
    catch { setError('The assignment could not be confirmed. Retry this request or reload the roster before starting over.') }
    finally { setBusy(false); onBusyChange(false) }
  }
  return <div className="live-actions">
    {!confirm ? <Button disabled={busy} onClick={() => setConfirm(true)}>Review assignment</Button> : <div className="workflow-card"><p>Assign {name} to this role? Current readiness and capacity will be checked again.</p><Button disabled={busy} onClick={() => void assign()}>{key ? 'Retry assignment' : 'Confirm assignment'}</Button><Button variant="secondary" disabled={busy} onClick={() => { setConfirm(false); setKey(null) }}>Close</Button></div>}
    {error && <p role="alert">{error}</p>}
  </div>
}
