import { expect, it } from 'vitest'
import { databaseFixture } from './database'
import { issueSession } from '../../../src/cloudflare/stage0/auth/sessions'
import { checkIn, checkOut } from '../../../src/cloudflare/stage0/volunteer/attendance'

it('checks readiness and current permission while recording one arrival and audit', async () => {
  const f = await databaseFixture()
  const principal = (await issueSession(f.ctx, { accountId: 'd', method: 'password' }, 'browser')).principal
  const ctx = { ...f.ctx, principal, idempotencyKey: 'attendance-test-0001' }
  await f.execute("INSERT INTO volunteer_people VALUES('p','org-a','Volunteer',1)").run()
  await f.execute("INSERT INTO volunteer_occurrences VALUES('s','org-a','a1','ax','Shift',100,200,1,'published')").run()
  await f.execute("INSERT INTO volunteer_role_requirements VALUES('org-a','s','role','Volunteer',1)").run()
  await f.execute("INSERT INTO volunteer_readiness VALUES('org-a','s','role','p','ready','a',1)").run()
  await f.execute("INSERT INTO volunteer_assignments VALUES('assignment','org-a','s','p','role','confirmed',1)").run()
  await f.execute("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind) VALUES('read','md-a','org-a','program.read','organization')").run()
  const input = { organizationId:'org-a', assignmentId:'assignment', programId:'a1', locationId:'ax' }
  await expect(checkIn(ctx,input)).rejects.toMatchObject({code:'conflict'})
  await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a','attendance.manage','a1','ax')").run()
  await f.execute("UPDATE volunteer_readiness SET state='blocked' WHERE person_id='p'").run()
  await expect(checkIn(ctx,input)).rejects.toMatchObject({code:'conflict'})
  await f.execute("UPDATE volunteer_readiness SET state='ready' WHERE person_id='p'").run()
  await expect(checkOut(ctx,input)).rejects.toMatchObject({code:'conflict'})
  const first = await checkIn(ctx,input)
  f.advance(1000)
  expect(await checkIn(ctx,input)).toEqual(first)
  expect(await f.execute("SELECT count(*) AS n FROM volunteer_audit_events WHERE action='attendance.check_in'").first('n')).toBe(1)
  const departure = await checkOut(ctx,input)
  f.advance(1000)
  expect(await checkOut(ctx,input)).toEqual(departure)
  expect(await f.execute("SELECT count(*) AS n FROM volunteer_audit_events WHERE action='attendance.check_out'").first('n')).toBe(1)
  expect(await f.execute('SELECT count(*) AS n FROM volunteer_hours_submissions').first('n')).toBe(0)
  await f.execute("UPDATE organization_memberships SET state='revoked',version=version+1 WHERE id='md-a'").run()
  await expect(checkIn(ctx,input)).rejects.toMatchObject({code:'conflict'})
})
