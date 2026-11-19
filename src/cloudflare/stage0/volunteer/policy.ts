import type { Principal, Scope } from '../contracts'
import { Bindings } from '../db'
import { accessPredicate } from '../access/policy'

export const volunteerActions = Object.freeze(['people.read','people.create','schedule.manage','assignment.manage','readiness.review','attendance.manage','hours.review'] as const)
export type VolunteerAction = typeof volunteerActions[number]

/** Compose existing live-session and scope enforcement with a separate grant.
 * This SQL belongs in the same guarded transaction as the protected write.
 */
export function volunteerWritePredicate(b: Bindings, principal: Principal, organizationId: string, scope: Scope & { kind: 'program_location'; programId: string; locationId: string }, action: VolunteerAction, now: number): string {
  const base = accessPredicate(b, principal, organizationId, 'program.read', scope, now)
  const org = b.add(organizationId)
  const account = b.add(principal.accountId)
  const program = b.add(scope.programId)
  const location = b.add(scope.locationId)
  const requested = b.add(action)
  return `(${base}) AND EXISTS(SELECT 1 FROM organizations vo JOIN organization_memberships vm ON vm.organization_id=vo.id
    JOIN stage0_live_sessions vs ON vs.account_id=vm.account_id AND vs.id=${b.add(principal.sessionId)}
    WHERE vo.id=${org} AND vm.account_id=${account} AND vm.state='active'
      AND (vm.preset!='admin' OR vs.assurance='passkey')
      AND (vo.owner_account_id=vm.account_id OR EXISTS(SELECT 1 FROM volunteer_grants vg
        WHERE vg.organization_id=vo.id AND vg.membership_id=vm.id AND vg.action=${requested}
          AND (vg.program_id IS NULL OR vg.program_id=${program}) AND (vg.location_id IS NULL OR vg.location_id=${location}))))`
}
