import { expect, it } from 'vitest'
import { databaseFixture } from './database'
import { issueSession } from '../../../src/cloudflare/stage0/auth/sessions'
import { reviewHours, submitHours } from '../../../src/cloudflare/stage0/volunteer/hours'

it('records one scoped review and never silently adjusts an approval', async () => {
 const f=await databaseFixture()
 const principal=(await issueSession(f.ctx,{accountId:'d',method:'password'},'browser')).principal
 const ctx={...f.ctx,principal,idempotencyKey:'hours-review-test-1'}
 await f.execute("INSERT INTO volunteer_people VALUES('p','org-a','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_occurrences VALUES('s','org-a','a1','ax','Shift',100,200,1,'published')").run()
 await f.execute("INSERT INTO volunteer_role_requirements VALUES('org-a','s','role','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_readiness VALUES('org-a','s','role','p','ready','a',1)").run()
 await f.execute("INSERT INTO volunteer_assignments VALUES('a','org-a','s','p','role','confirmed',1)").run()
 await f.execute("INSERT INTO volunteer_hours_submissions VALUES('h','org-a','a',0,7200000,0,'pending')").run()
 await f.execute("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind) VALUES('read','md-a','org-a','program.read','organization')").run()
 const input={organizationId:'org-a',submissionId:'h',programId:'a1',locationId:'ax',decision:'approve',approvedMinutes:120,reason:null}
 await expect(reviewHours(ctx,input)).rejects.toMatchObject({code:'conflict'})
 await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a','hours.review','a1','ax')").run()
 await expect(reviewHours(ctx,{...input,approvedMinutes:100})).rejects.toMatchObject({code:'conflict'})
 const result=await reviewHours(ctx,input)
 expect(await reviewHours(ctx,input)).toEqual(result)
 await expect(reviewHours(ctx,{...input,approvedMinutes:100})).rejects.toMatchObject({code:'conflict'})
 await f.execute("UPDATE organization_memberships SET state='revoked',version=version+1 WHERE id='md-a'").run()
 await expect(reviewHours(ctx,input)).rejects.toMatchObject({code:'not_found'})
 expect(await f.execute("SELECT state FROM volunteer_hours_submissions WHERE id='h'").first('state')).toBe('approved')
 expect(await f.execute("SELECT count(*) AS n FROM volunteer_hours_decisions WHERE submission_id='h'").first('n')).toBe(1)
})


it('creates a pending staff-assisted submission once and requires completed attendance', async () => {
 const f=await databaseFixture()
 const principal=(await issueSession(f.ctx,{accountId:'d',method:'password'},'browser')).principal
 const ctx={...f.ctx,principal,idempotencyKey:'hours-submit-test-1'}
 await f.execute("INSERT INTO volunteer_people VALUES('p','org-a','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_occurrences VALUES('s','org-a','a1','ax','Shift',100,200,1,'published')").run()
 await f.execute("INSERT INTO volunteer_role_requirements VALUES('org-a','s','role','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_readiness VALUES('org-a','s','role','p','ready','a',1)").run()
 await f.execute("INSERT INTO volunteer_assignments VALUES('a','org-a','s','p','role','confirmed',1)").run()
 await f.execute("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind) VALUES('read','md-a','org-a','program.read','organization')").run()
 await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a','attendance.manage','a1','ax')").run()
 const input={organizationId:'org-a',assignmentId:'a',programId:'a1',locationId:'ax',startAt:0,endAt:7200000,breakMinutes:0}
 await expect(submitHours(ctx,input)).rejects.toMatchObject({code:'conflict'})
 await f.execute("INSERT INTO volunteer_attendance VALUES('org-a','a',100,200)").run()
 const result=await submitHours(ctx,input)
 expect(await submitHours(ctx,input)).toEqual(result)
 await expect(submitHours(ctx,{...input,breakMinutes:10})).rejects.toMatchObject({code:'conflict'})
 expect(await f.execute("SELECT state FROM volunteer_hours_submissions WHERE id=?",result.id).first('state')).toBe('pending')
 expect(await f.execute("SELECT count(*) AS n FROM volunteer_audit_events WHERE action='hours.submit'").first('n')).toBe(1)
})
