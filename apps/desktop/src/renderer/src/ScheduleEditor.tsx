import { useEffect, useState } from 'react'
import { Button } from '@ovelle/ui'

type Scope = { organizationId: string; programId: string; locationId: string }
type Props = { request: (value: unknown) => Promise<unknown>; scope: Scope; draft: { id: string; title: string } | null; refresh: () => void; onPublished: () => void }

/** Draft creation, role setup and publication are separate server operations. */
export default function ScheduleEditor({ request, scope, draft, refresh, onPublished }: Props) {
  const [title, setTitle] = useState(''), [start, setStart] = useState(''), [end, setEnd] = useState(''), [capacity, setCapacity] = useState('1')
  const [role, setRole] = useState(''), [roleCapacity, setRoleCapacity] = useState('1')
  const [criterionRole, setCriterionRole] = useState(''), [criterionName, setCriterionName] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [details, setDetails] = useState<{ roles: { id: string; name: string; capacity: number }[]; criteria: { id: string; roleId: string; name: string }[]; truncated: boolean; criteriaTruncated: boolean } | null>(null)
  const [detailVersion, setDetailVersion] = useState(0)
  useEffect(() => {
    let active = true
    setDetails(null); setConfirmPublish(false)
    if (draft) request({ operation: 'occurrence', ...scope, occurrenceId: draft.id }).then(value => {
      if (active) setDetails(value as typeof details)
    }).catch(() => { if (active) setError('Could not load draft roles and requirements.') })
    return () => { active = false }
  }, [draft?.id, scope.organizationId, scope.programId, scope.locationId, request, detailVersion])
  // Reuse the key on an ambiguous network failure; edits are disabled until resolved.
  const [pending, setPending] = useState<{ operation: string; fields: Record<string, unknown>; key: string } | null>(null)
  const send = async (operation: string, fields: Record<string, unknown>) => {
    const command = pending ?? { operation, fields, key: crypto.randomUUID() }
    setPending(command); setBusy(true); setError(''); setNotice('')
    try {
      await request({ operation: command.operation, ...scope, ...command.fields, idempotencyKey: command.key })
      setPending(null); setConfirmPublish(false)
      setNotice(command.operation === 'createOccurrence' ? 'Draft created. Select it below to add roles.' : command.operation === 'createRole' ? 'Role added to draft.' : command.operation === 'createCriterion' ? 'Requirement added to role.' : 'Occurrence published.')
      if (command.operation === 'createOccurrence') { setTitle(''); setStart(''); setEnd(''); setCapacity('1') }
      if (command.operation === 'createRole') { setRole(''); setDetailVersion(v => v + 1) }
      if (command.operation === 'createCriterion') { setCriterionName(''); setDetailVersion(v => v + 1) }
      if (command.operation === 'publishOccurrence') onPublished()
      refresh()
    } catch {
      setError('The result could not be confirmed. Retry the same operation to avoid creating a duplicate, or refresh the schedule before starting over.')
    } finally { setBusy(false) }
  }
  const startAt = new Date(start).getTime(), endAt = new Date(end).getTime(), seats = Number(capacity), roleSeats = Number(roleCapacity)
  const validDraft = title.trim().length > 0 && title.trim().length <= 200 && Number.isSafeInteger(startAt) && startAt >= 0 && Number.isSafeInteger(endAt) && endAt > startAt && Number.isSafeInteger(seats) && seats > 0 && seats <= 100000
  return <div className="workflow-card">
    <h3>Create a schedule draft</h3>
    <p>Dates and times use this device’s time zone. The draft is not published until you add a role and publish it.</p>
    <label>Title <input value={title} maxLength={200} disabled={busy || !!pending} onChange={e => setTitle(e.target.value)} /></label>
    <label>Start <input type="datetime-local" value={start} disabled={busy || !!pending} onChange={e => setStart(e.target.value)} /></label>
    <label>End <input type="datetime-local" value={end} disabled={busy || !!pending} onChange={e => setEnd(e.target.value)} /></label>
    <label>Capacity <input type="number" min="1" max="100000" value={capacity} disabled={busy || !!pending} onChange={e => setCapacity(e.target.value)} /></label>
    {!pending && <Button disabled={busy || !validDraft} onClick={() => void send('createOccurrence', { title: title.trim(), startsAt: startAt, endsAt: endAt, capacity: seats })}>Create draft</Button>}
    {draft && <div>
      <h3>Set up {draft.title}</h3>
      <p>Add roles and the requirements volunteers must meet before publishing.</p>
      {!details ? <p>Loading draft details…</p> : <>
        {(details.truncated || details.criteriaTruncated) && <p>Some roles or requirements are not shown. Publication is unavailable in this view.</p>}
        {details.roles.length === 0 ? <p>No roles yet.</p> : details.roles.map(item => <p key={item.id}><strong>{item.name}</strong> · {item.capacity} places · {details.criteria.filter(criterion => criterion.roleId === item.id).map(criterion => criterion.name).join(', ') || 'No requirements recorded'}</p>)}
      </>}
      <label>Role name <input value={role} maxLength={200} disabled={busy || !!pending} onChange={e => setRole(e.target.value)} /></label>
      <label>Role capacity <input type="number" min="1" max="100000" value={roleCapacity} disabled={busy || !!pending} onChange={e => setRoleCapacity(e.target.value)} /></label>
      {!pending && <Button variant="secondary" disabled={busy || !role.trim() || !Number.isSafeInteger(roleSeats) || roleSeats < 1 || roleSeats > 100000} onClick={() => void send('createRole', { occurrenceId: draft.id, name: role.trim(), capacity: roleSeats })}>Add role</Button>}
      {details && details.roles.length > 0 && <div>
        <label>Role for requirement <select value={criterionRole} disabled={busy || !!pending} onChange={e => setCriterionRole(e.target.value)}><option value="">Choose role</option>{details.roles.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Requirement name <input value={criterionName} maxLength={200} disabled={busy || !!pending} onChange={e => setCriterionName(e.target.value)} /></label>
        {!pending && <Button variant="secondary" disabled={busy || !details.roles.some(item => item.id === criterionRole) || !criterionName.trim()} onClick={() => void send('createCriterion', { occurrenceId: draft.id, roleId: criterionRole, name: criterionName.trim() })}>Add requirement</Button>}
      </div>}
      {!pending && (!confirmPublish ? <Button disabled={busy || !details || details.truncated || details.criteriaTruncated || details.roles.length === 0} onClick={() => setConfirmPublish(true)}>Review publication</Button> : <div><p>Publish this occurrence? Check its roles and requirements first.</p><Button disabled={busy} onClick={() => void send('publishOccurrence', { occurrenceId: draft.id })}>Confirm publication</Button><Button variant="secondary" disabled={busy} onClick={() => setConfirmPublish(false)}>Back</Button></div>)}
    </div>}
    {pending && <div><Button disabled={busy} onClick={() => void send(pending.operation, pending.fields)}>Retry operation</Button><p>Keep this view open while retrying. The same request key is reused.</p></div>}
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
  </div>
}
