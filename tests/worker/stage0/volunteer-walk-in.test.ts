import { expect, it } from 'vitest'
import { databaseFixture } from './database'
import { issueSession } from '../../../src/cloudflare/stage0/auth/sessions'
import { registerWalkIn } from '../../../src/cloudflare/stage0/volunteer/walk-in'

it('atomically assigns and checks in a ready walk-in with both permissions and capacity',async()=>{
 const f=await databaseFixture()
 const principal=(await issueSession(f.ctx,{accountId:'d',method:'password'},'browser')).principal
 const ctx={...f.ctx,principal,idempotencyKey:'walk-in-command-0001'}
 await f.execute("INSERT INTO volunteer_people VALUES('p','org-a','Volunteer',1),('q','org-a','Second',1)").run()
 await f.execute("INSERT INTO volunteer_occurrences VALUES('s','org-a','a1','ax','Shift',100,200,1,'published')").run()
 await f.execute("INSERT INTO volunteer_role_requirements VALUES('org-a','s','role','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_readiness VALUES('org-a','s','role','p','ready','a',1),('org-a','s','role','q','ready','a',1)").run()
 await f.execute("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind) VALUES('read','md-a','org-a','program.read','organization')").run()
 await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a','assignment.manage','a1','ax')").run()
 const input={organizationId:'org-a',occurrenceId:'s',personId:'p',roleId:'role',programId:'a1',locationId:'ax'}
 await expect(registerWalkIn(ctx,input)).rejects.toMatchObject({code:'conflict'})
 expect(await f.execute('SELECT count(*) AS n FROM volunteer_assignments').first('n')).toBe(0)
 await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a','attendance.manage','a1','ax')").run()
 await f.execute("UPDATE volunteer_readiness SET state='blocked' WHERE person_id='p'").run()
 await expect(registerWalkIn(ctx,input)).rejects.toMatchObject({code:'conflict'})
 expect(await f.execute('SELECT count(*) AS n FROM volunteer_attendance').first('n')).toBe(0)
 await f.execute("UPDATE volunteer_readiness SET state='ready' WHERE person_id='p'").run()
 await f.execute("CREATE TRIGGER reject_test_attendance BEFORE INSERT ON volunteer_attendance BEGIN SELECT RAISE(ABORT, 'test failure'); END").run()
 await expect(registerWalkIn(ctx,input)).rejects.toThrow()
 expect(await f.execute('SELECT count(*) AS n FROM volunteer_assignments').first('n')).toBe(0)
 await f.execute('DROP TRIGGER reject_test_attendance').run()
 const result=await registerWalkIn(ctx,input)
 expect(await registerWalkIn(ctx,input)).toEqual(result)
 await expect(registerWalkIn(ctx,{...input,personId:'q'})).rejects.toMatchObject({code:'conflict'})
 await expect(registerWalkIn({...ctx,idempotencyKey:'walk-in-command-0002'},{...input,personId:'q'})).rejects.toMatchObject({code:'conflict'})
 expect(await f.execute('SELECT count(*) AS n FROM volunteer_assignments').first('n')).toBe(1)
 expect(await f.execute('SELECT count(*) AS n FROM volunteer_attendance').first('n')).toBe(1)
 expect(await f.execute("SELECT count(*) AS n FROM volunteer_audit_events WHERE action IN ('assignment.create','attendance.check_in')").first('n')).toBe(2)
 await f.execute("UPDATE organization_memberships SET state='revoked',version=version+1 WHERE id='md-a'").run()
 await expect(registerWalkIn(ctx,input)).rejects.toMatchObject({code:'not_found'})
})
