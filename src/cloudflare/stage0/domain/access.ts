import { Stage0Error } from '../errors'

/** Authoritative action classifications. SQL enforcement and grant validation
 * consume this vocabulary; neither may independently broaden a role's powers.
 * A classification never authorizes a request: current session, membership,
 * tenant, scope and assurance must still be checked at the database boundary.
 */
const policies = {
  'organization.read': { write: false, grant: 'admin' },
  'organization.update': { write: true, grant: 'admin' },
  'program.read': { write: false, grant: 'coordinator' },
  'program.manage': { write: true, grant: 'coordinator' },
  'location.read': { write: false, grant: 'coordinator' },
  'location.manage': { write: true, grant: 'coordinator' },
  'staff.read': { write: false, grant: 'admin' },
  'staff.manage_coordinators': { write: true, grant: 'admin' },
  'staff.manage_admins': { write: true, grant: 'owner-only' },
  'audit.read': { write: false, grant: 'admin' },
  'ownership.transfer': { write: true, grant: 'owner-only' },
} as const

export type Action = keyof typeof policies
Object.values(policies).forEach(Object.freeze)
export const actionPolicies = Object.freeze(policies)
export const stage0Actions = Object.freeze(Object.keys(policies) as Action[])
export const grantableActions = Object.freeze(stage0Actions.filter(action => policies[action].grant !== 'owner-only'))

export function parseAction(value: unknown): Action {
  if (typeof value !== 'string' || !Object.hasOwn(policies, value)) throw new Stage0Error('forbidden')
  return value as Action
}

export type Scope = { kind: 'organization' } | ({ kind: 'program_location' } & (
  { programId: string; locationId?: string } | { programId?: string; locationId: string }
))

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
