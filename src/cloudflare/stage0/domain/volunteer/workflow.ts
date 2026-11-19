/** Pure decisions for volunteer service. Persistence must enforce these checks
 * against current tenant-scoped records in the same transaction as each write.
 */
export type Interval = { start: number; end: number }
export type AssignmentCheck = {
  capacity: number
  assigned: number
  readiness: 'ready' | 'pending' | 'blocked'
  occurrence: Interval
  commitments: Interval[]
  alreadyAssigned: boolean
}

export type AssignmentResult = 'allowed' | 'already_assigned' | 'invalid' | 'not_ready' | 'full' | 'conflict'

function validInterval(interval: Interval): boolean {
  return Number.isSafeInteger(interval.start) && Number.isSafeInteger(interval.end) && interval.start < interval.end
}

/** Adjacent shifts do not overlap. A repeated assignment is never a new seat. */
export function checkAssignment(input: AssignmentCheck): AssignmentResult {
  if (!Number.isSafeInteger(input.capacity) || input.capacity < 0 || !Number.isSafeInteger(input.assigned) || input.assigned < 0 || input.assigned > input.capacity || !validInterval(input.occurrence) || input.commitments.some(item => !validInterval(item))) return 'invalid'
  if (input.alreadyAssigned) return 'already_assigned'
  if (input.readiness !== 'ready') return 'not_ready'
  if (input.assigned >= input.capacity) return 'full'
  if (input.commitments.some(item => item.start < input.occurrence.end && input.occurrence.start < item.end)) return 'conflict'
  return 'allowed'
}

export type AttendanceState = 'expected' | 'present' | 'departed' | 'no_show' | 'canceled'
export type AttendanceAction = 'check_in' | 'check_out' | 'mark_no_show'

/** Repeated arrival/departure events are treated as existing records, not new attendance. */
export function attendanceTransition(state: AttendanceState, action: AttendanceAction): 'apply' | 'already_recorded' | 'invalid' {
  if (action === 'check_in') return state === 'expected' ? 'apply' : state === 'present' || state === 'departed' ? 'already_recorded' : 'invalid'
  if (action === 'check_out') return state === 'present' ? 'apply' : state === 'departed' ? 'already_recorded' : 'invalid'
  return state === 'expected' ? 'apply' : state === 'no_show' ? 'already_recorded' : 'invalid'
}

/** Reviewed time remains distinct from attendance and must be a positive interval. */
export function submittedMinutes(service: Interval, breakMinutes: number): number | null {
  if (!validInterval(service) || !Number.isSafeInteger(breakMinutes) || breakMinutes < 0) return null
  const elapsed = (service.end - service.start) / 60_000
  if (!Number.isInteger(elapsed) || elapsed <= breakMinutes) return null
  return elapsed - breakMinutes
}
