import { useEffect, useState } from 'react'
import { Button } from '@ovelle/ui'

type Scope = { organizationId: string; programId: string; locationId: string }
type Props = { request: (input: unknown) => Promise<unknown>; scope: Scope; occurrenceId: string; onOpened: () => void; onBusyChange: (busy: boolean) => void }
type Option = { id: string; name: string }

/** Opening a case does not assign a person or assert their eligibility. */
export default function ReadinessIntake({ request, scope, occurrenceId, onOpened, onBusyChange }: Props) {
  const [roles, setRoles] = useState<Option[]>([]), [people, setPeople] = useState<Option[]>([])
  const [role, setRole] = useState(''), [person, setPerson] = useState('')
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [partial, setPartial] = useState(false)
  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setRoles([]); setPeople([]); setRole(''); setPerson(''); setPartial(false)
    Promise.all([
      request({ operation: 'occurrence', ...scope, occurrenceId }) as Promise<{ roles: Option[]; truncated: boolean }>,
      request({ operation: 'volunteers', ...scope }) as Promise<{ volunteers: { id: string; displayName: string }[]; truncated: boolean }>,
    ]).then(([occurrence, volunteers]) => {
      if (!active) return
      setRoles(occurrence.roles); setPeople(volunteers.volunteers.map(item => ({ id: item.id, name: item.displayName })))
      setPartial(occurrence.truncated || volunteers.truncated)
    }).catch(() => { if (active) setError('Could not load available roles or volunteers for this scope.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [request, scope.organizationId, scope.programId, scope.locationId, occurrenceId])
  const open = async () => {
    setBusy(true); onBusyChange(true); setError('')
    try { await request({ operation: 'openReadiness', ...scope, occurrenceId, roleId: role, personId: person, idempotencyKey: crypto.randomUUID() }); onOpened() }
    catch { setError('Could not open the case. Check access and retry; opening an existing case is safe.') }
    finally { setBusy(false); onBusyChange(false) }
  }
  return <div className="workflow-card">
    <h3>Start a readiness review</h3>
    <p>Choose an existing volunteer and role for the occurrence selected in Schedule. Opening a review does not assign the volunteer.</p>
    {partial && <p>Only the first page of roles or volunteers is shown.</p>}
    <label>Volunteer <select value={person} disabled={loading || busy} onChange={e => setPerson(e.target.value)}><option value="">Choose volunteer</option>{people.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label>Review role <select value={role} disabled={loading || busy} onChange={e => setRole(e.target.value)}><option value="">Choose role</option>{roles.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <Button disabled={loading || busy || !person || !role} onClick={() => void open()}>Open review</Button>
    {error && <p role="alert">{error}</p>}
  </div>
}
