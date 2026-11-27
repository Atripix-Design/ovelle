import { expect, it } from 'vitest'
import { databaseFixture } from './database'
import { issueSession } from '../../../src/cloudflare/stage0/auth/sessions'
import { createAssignment } from '../../../src/cloudflare/stage0/volunteer/assignment'

it('checks live grants and atomically records the assignment and audit', async () => {
  const f = await databaseFixture()
  const principal = (await issueSession(f.ctx, { accountId: 'd', method: 'password' }, 'browser')).principal
  const ctx = { ...f.ctx, principal, idempotencyKey: 'assignment-test-0001' }
  const input = { organizationId: 'org-a', occurrenceId: 's', personId: 'p', roleId: 'role', programId: 'a1', locationId: 'ax' }
  await f.execute("INSERT INTO volunteer_people VALUES('p','org-a','Volunteer',1)").run()
  await f.execute("INSERT INTO volunteer_occurrences VALUES('s','org-a','a1','ax','Shift',100,200,1,'published')").run()
  await f.execute("INSERT INTO volunteer_role_requirements VALUES('org-a','s','role','Volunteer',1)").run()
  await f.execute("INSERT INTO volunteer_readiness VALUES('org-a','s','role','p','ready','a',1)").run()
  await f.execute("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind) VALUES('read','md-a','org-a','program.read','organization')").run()
  await expect(createAssignment(ctx, input)).rejects.toMatchObject({ code: 'conflict' })
  await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a','assignment.manage','a1','ax')").run()
  const result = await createAssignment(ctx, input)
  expect(await f.execute('SELECT count(*) AS n FROM volunteer_audit_events WHERE assignment_id=?', result.id).first('n')).toBe(1)
  expect(await createAssignment(ctx, input)).toEqual(result)
  await expect(createAssignment(ctx, { ...input, personId: 'other' })).rejects.toMatchObject({ code: 'conflict' })
  expect(await f.execute('SELECT count(*) AS n FROM volunteer_assignments').first('n')).toBe(1)
  await f.execute("UPDATE organization_memberships SET state='revoked',version=version+1 WHERE id='md-a'").run()
  await expect(createAssignment(ctx, input)).rejects.toMatchObject({ code: 'not_found' })
})
