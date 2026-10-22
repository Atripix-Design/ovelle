import type { Action, Principal, Scope } from '../contracts'
import { parseAction } from '../contracts'
import type { SqlValue } from '../db'
import { Stage0Error } from '../errors'

// Numbered parameters let a correlated policy reuse the same bound scope safely.
// Only fixed repository SQL may supply identifiers; callers supply values only.
export class Bindings {
  readonly values: SqlValue[] = []
  add(value: SqlValue): string { this.values.push(value); return `?${this.values.length}` }
}
export function validateScope(scope: Scope): void {
  if (!scope || (scope.kind !== 'organization' && scope.kind !== 'program_location')) throw new Stage0Error('invalid_input')
  const ids = scope as { programId?: unknown; locationId?: unknown }
  if (scope.kind === 'organization') {
    if (ids.programId !== undefined || ids.locationId !== undefined) throw new Stage0Error('invalid_input')
  } else {
    if (ids.programId === undefined && ids.locationId === undefined) throw new Stage0Error('invalid_input')
    for (const value of [ids.programId, ids.locationId]) if (value !== undefined && (typeof value !== 'string' || value.length < 1 || value.length > 256)) throw new Stage0Error('invalid_input')
  }
}
/** Central row policy used by SELECT predicates and transactional write guards.
 * A cached principal/capability is only a selector. All authority is read in SQL.
 */
export function accessPredicate(b: Bindings, principal: Principal, organizationId: string, action: Action, scope: Scope, now: number, programFromRow = false): string {
  parseAction(action)
  validateScope(scope)
  const org = b.add(organizationId)
  const session = b.add(principal.sessionId)
  const account = b.add(principal.accountId)
  const transport = b.add(principal.transport)
  const time = b.add(now)
  const program = programFromRow ? 'p.id' : scope.kind === 'program_location' && scope.programId !== undefined ? b.add(scope.programId) : 'NULL'
  const location = scope.kind === 'program_location' && scope.locationId !== undefined ? b.add(scope.locationId) : 'NULL'
  const requestedAction = b.add(action)
  const reserved = action === 'staff.manage_admins' || action === 'ownership.transfer'
  const write = ['organization.update', 'program.manage', 'location.manage', 'staff.manage_coordinators', 'staff.manage_admins', 'ownership.transfer'].includes(action)
  const coordinatorAction = ['program.read', 'program.manage', 'location.read', 'location.manage'].includes(action)
  const grant = `EXISTS(SELECT 1 FROM membership_grants g WHERE g.membership_id=m.id AND g.organization_id=o.id AND g.action=${requestedAction}
    AND (g.scope_kind='organization' OR ((g.program_id IS NULL OR g.program_id=${program}) AND (g.location_id IS NULL OR g.location_id=${location}))))`
  return `EXISTS(SELECT 1 FROM organizations o
    JOIN organization_memberships m ON m.organization_id=o.id
    JOIN stage0_live_sessions s ON s.account_id=m.account_id
    LEFT JOIN identity_connections c ON c.id=s.connection_id
    WHERE o.id=${org} AND s.id=${session} AND s.account_id=${account} AND s.transport=${transport}
      AND s.expires_at>${time} AND s.created_at<=${time} AND s.assurance!='enrollment' AND m.state='active'
      AND (s.connection_id IS NULL OR c.organization_id IS NULL OR c.organization_id=o.id)
      AND (o.required_connection_id IS NULL OR (s.method='saml' AND s.connection_id=o.required_connection_id))
      AND (${program} IS NULL OR EXISTS(SELECT 1 FROM programs sp WHERE sp.id=${program} AND sp.organization_id=o.id AND sp.archived_at IS NULL))
      AND (${location} IS NULL OR EXISTS(SELECT 1 FROM locations sl WHERE sl.id=${location} AND sl.organization_id=o.id AND sl.archived_at IS NULL))
      AND (${write ? "m.preset!='admin' OR s.assurance='passkey'" : '1'})
      AND (${reserved ? `o.owner_account_id=s.account_id AND s.assurance='passkey' AND s.passkey_verified_at>=${b.add(now - 300_000)} AND s.passkey_verified_at<=${time}` : action === 'organization.read' ? '1' : `(o.owner_account_id=s.account_id OR (m.preset='admin' AND ${grant}) OR (${coordinatorAction ? '1' : '0'} AND m.preset='coordinator' AND ${grant}))`})
  )`
}
