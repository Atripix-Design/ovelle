import { useState } from 'react'
import { Button } from '@ovelle/ui'
type Scope = { organizationId: string; programId: string; locationId: string }
type Props = { request: (input: unknown) => Promise<unknown>; scope: Scope; onCreated: () => void; onBusyChange: (busy: boolean) => void }
/** Names do not establish identity; search is an aid, not a deduplication claim. */
export default function VolunteerSetup({ request, scope, onCreated, onBusyChange }: Props) {
  const [name, setName] = useState(''), [matches, setMatches] = useState<{ displayName: string; id: string }[] | null>(null)
  const [partial, setPartial] = useState(false), [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [pending, setPending] = useState<{ name: string; key: string } | null>(null)
  const search = async () => {
    setBusy(true); onBusyChange(true); setError(''); setMatches(null); setPartial(false); setConfirm(false)
    try { const value = await request({ operation: 'searchVolunteers', ...scope, search: name.trim() }) as { volunteers: { id: string; displayName: string }[]; truncated: boolean }; setMatches(value.volunteers); setPartial(value.truncated) }
    catch { setError('Could not search volunteers in this scope.') }
    finally { setBusy(false); onBusyChange(false) }
  }
  const create = async () => {
    const command = pending ?? { name: name.trim(), key: crypto.randomUUID() }
    setPending(command); setBusy(true); onBusyChange(true); setError('')
    try { await request({ operation: 'createVolunteer', ...scope, displayName: command.name, idempotencyKey: command.key }); setName(''); setMatches(null); setPending(null); setConfirm(false); onCreated() }
    catch { setError('Creation could not be confirmed. Retry the same request or search again before starting over.') }
    finally { setBusy(false); onBusyChange(false) }
  }
  return <div className="workflow-card"><h4>Add a volunteer</h4><p>Search first. Similar names do not establish whether records are the same person.</p><label>Volunteer name <input value={name} maxLength={100} disabled={busy || !!pending} onChange={e => { setName(e.target.value); setMatches(null); setConfirm(false) }} /></label>
    {!pending && <Button variant="secondary" disabled={busy || name.trim().length < 2} onClick={() => void search()}>Search existing volunteers</Button>}
    {matches && <><p>{partial ? 'More matches exist than this view can show. Refine the search before adding.' : matches.length ? 'Review these possible matches before adding:' : 'No matches found in this scope.'}</p>{matches.map(item => <p key={item.id}>{item.displayName}</p>)}{!partial && !pending && (!confirm ? <Button disabled={busy} onClick={() => setConfirm(true)}>Review new volunteer</Button> : <><p>Create a new record for {name.trim()}? A name alone does not prove identity.</p><Button disabled={busy} onClick={() => void create()}>Confirm new volunteer</Button><Button variant="secondary" disabled={busy} onClick={() => setConfirm(false)}>Back</Button></>)}</>}
    {pending && <Button disabled={busy} onClick={() => void create()}>Retry volunteer creation</Button>}{error && <p role="alert">{error}</p>}
  </div>
}
