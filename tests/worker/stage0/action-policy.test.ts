import { expect, it } from 'vitest'
import { actionPolicies, grantableActions, parseAction, stage0Actions, validateScope } from '../../../src/cloudflare/stage0/domain/access'
import { normalizedGrants } from '../../../src/cloudflare/stage0/staff/validation'
import { issueSession } from '../../../src/cloudflare/stage0/auth/sessions'
import { databaseFixture } from './database'

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

it('keeps the migrated membership vocabulary aligned without treating stored grants as authorization', async () => {
  const f = await databaseFixture()
  // Historical storage recognizes owner-only actions; live authorization still
  // requires ownership. Invitation issuance has the narrower contract below.
  for (const [action] of expected) {
    await f.execute("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind) VALUES(?,'mc-a','org-a',?,'organization')", action, action).run()
  }
  expect((await f.execute('SELECT action FROM membership_grants ORDER BY action').all<{ action: string }>()).results.map(row => row.action))
    .toEqual(expected.map(([action]) => action).sort())
  for (const action of ['finance.read', 'program.delete', 'toString', '', 'PROGRAM.READ']) {
    await expect(f.execute("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind) VALUES(?,'mc-a','org-a',?,'organization')", action, action).run())
      .rejects.toThrow('CHECK constraint failed')
  }
})

it('enforces the independent invitation grant matrix in the migrated database', async () => {
  const f = await databaseFixture()
  const issued = await issueSession(f.ctx, { accountId: 'a', method: 'passkey' }, 'browser')
  const now = f.ctx.clock.now()
  for (const [index, preset] of (['admin', 'coordinator'] as const).entries()) {
    await f.execute(`INSERT INTO staff_invitations
      (id,organization_id,email,preset,inviter_account_id,issued_session_id,token_digest,created_at,updated_at,expires_at)
      VALUES(?,'org-a',?,?,'a',?,?,?,?,?)`,
    preset, `${preset}@example.test`, preset, issued.principal.sessionId, String(index).repeat(64), now, now, now + 259200000).run()
    for (const [action, _write, classification] of expected) {
      const insert = f.execute("INSERT INTO invitation_grants(id,invitation_id,organization_id,action,scope_kind) VALUES(?,?,'org-a',?,'organization')", `${preset}:${action}`, preset, action)
      const accepted = classification !== 'owner-only' && (preset === 'admin' || classification === 'coordinator')
      if (accepted) await insert.run()
      else await expect(insert.run()).rejects.toThrow(preset === 'coordinator' ? 'invitation_grant_preset' : 'CHECK constraint failed')
    }
    expect((await f.execute('SELECT action FROM invitation_grants WHERE invitation_id=? ORDER BY action', preset).all<{ action: string }>()).results.map(row => row.action))
      .toEqual(expected.filter(([, , classification]) => classification !== 'owner-only' && (preset === 'admin' || classification === 'coordinator')).map(([action]) => action).sort())
    await expect(f.execute("INSERT INTO invitation_grants(id,invitation_id,organization_id,action,scope_kind) VALUES(?,?,'org-a','finance.read','organization')", `${preset}:unknown`, preset).run()).rejects.toThrow()
  }
  expect((await f.execute('PRAGMA foreign_key_check').all()).results).toEqual([])
})
