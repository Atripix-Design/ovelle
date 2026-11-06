import { expect, it } from 'vitest'
import { actionPolicies, grantableActions, parseAction, stage0Actions, validateScope } from '../../../src/cloudflare/stage0/domain/access'
import { normalizedGrants } from '../../../src/cloudflare/stage0/staff/validation'

// Expected permissions are written independently of the implementation's table.
const expected = [
  ['organization.read', false, 'admin'],
  ['organization.update', true, 'admin'],
  ['program.read', false, 'coordinator'],
  ['program.manage', true, 'coordinator'],
  ['location.read', false, 'coordinator'],
  ['location.manage', true, 'coordinator'],
  ['staff.read', false, 'admin'],
  ['staff.manage_coordinators', true, 'admin'],
  ['staff.manage_admins', true, 'owner-only'],
  ['audit.read', false, 'admin'],
  ['ownership.transfer', true, 'owner-only'],
] as const

it('retains the complete action vocabulary and independent write/grant classifications', () => {
  expect(stage0Actions).toEqual(expected.map(([action]) => action))
  for (const [action, write, grant] of expected) expect(actionPolicies[action]).toEqual({ write, grant })
  expect(grantableActions).toEqual([
    'organization.read', 'organization.update', 'program.read', 'program.manage',
    'location.read', 'location.manage', 'staff.read', 'staff.manage_coordinators', 'audit.read',
  ])
  expect(Object.isFrozen(actionPolicies)).toBe(true)
  for (const policy of Object.values(actionPolicies)) expect(Object.isFrozen(policy)).toBe(true)
  expect(Object.isFrozen(stage0Actions)).toBe(true)
  expect(Object.isFrozen(grantableActions)).toBe(true)
})

it.each(expected)('preserves grant issuance boundaries for %s', (action, _write, classification) => {
  const grants = [{ action, scope: { kind: 'organization' } }]
  for (const preset of ['admin', 'coordinator'] as const) {
    const shouldAccept = classification !== 'owner-only' && (preset === 'admin' || classification === 'coordinator')
    if (shouldAccept) expect(normalizedGrants(grants, preset)).toEqual(grants)
    else expect(() => normalizedGrants(grants, preset)).toThrow('invalid_input')
  }
})

it('rejects unknown and inherited action names and malformed scope dimensions', () => {
  for (const value of ['toString', '__proto__', 'constructor', 'program.delete', '', null, 1]) {
    expect(() => parseAction(value)).toThrow('forbidden')
  }
  for (const scope of [null, {}, { kind: 'organization', programId: 'p' }, { kind: 'program_location' }, { kind: 'program_location', locationId: '' }]) {
    expect(() => validateScope(scope as never)).toThrow('invalid_input')
  }
  expect(() => validateScope({ kind: 'program_location', programId: 'p', locationId: 'l' })).not.toThrow()
})
