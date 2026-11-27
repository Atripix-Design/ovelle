import { describe, expect, it } from 'vitest'
import { attendanceTransition, checkAssignment, submittedMinutes } from '../../../src/cloudflare/stage0/domain/volunteer/workflow'

const candidate = { capacity: 2, assigned: 1, readiness: 'ready' as const, occurrence: { start: 100, end: 200 }, commitments: [], alreadyAssigned: false }

describe('volunteer workflow decisions', () => {
  it('rejects full, unready and overlapping assignments while permitting adjacent shifts', () => {
    expect(checkAssignment(candidate)).toBe('allowed')
    expect(checkAssignment({ ...candidate, assigned: 2 })).toBe('full')
    expect(checkAssignment({ ...candidate, readiness: 'pending' })).toBe('not_ready')
    expect(checkAssignment({ ...candidate, commitments: [{ start: 199, end: 300 }] })).toBe('conflict')
    expect(checkAssignment({ ...candidate, commitments: [{ start: 200, end: 300 }] })).toBe('allowed')
    expect(checkAssignment({ ...candidate, alreadyAssigned: true, assigned: 2 })).toBe('already_assigned')
    expect(checkAssignment({ ...candidate, capacity: -1 })).toBe('invalid')
  })

  it('does not duplicate attendance or allow checkout before arrival', () => {
    expect(attendanceTransition('expected', 'check_in')).toBe('apply')
    expect(attendanceTransition('present', 'check_in')).toBe('already_recorded')
    expect(attendanceTransition('expected', 'check_out')).toBe('invalid')
    expect(attendanceTransition('present', 'check_out')).toBe('apply')
    expect(attendanceTransition('departed', 'check_out')).toBe('already_recorded')
    expect(attendanceTransition('canceled', 'mark_no_show')).toBe('invalid')
  })

  it('calculates actual service with explicit breaks and rejects invalid intervals', () => {
    expect(submittedMinutes({ start: 0, end: 4 * 60 * 60_000 }, 30)).toBe(210)
    expect(submittedMinutes({ start: 0, end: 60_000 }, 1)).toBeNull()
    expect(submittedMinutes({ start: 10, end: 10 }, 0)).toBeNull()
    expect(submittedMinutes({ start: 0, end: 60_001 }, 0)).toBeNull()
  })
})
