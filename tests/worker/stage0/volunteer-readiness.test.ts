import {expect,it} from 'vitest'
import {databaseFixture} from './database'
import {issueSession} from '../../../src/cloudflare/stage0/auth/sessions'
import {decideReadiness,openReadiness} from '../../../src/cloudflare/stage0/volunteer/readiness'

it('requires a scoped reviewer and records the decision with its evidence reference',async()=>{
 const f=await databaseFixture()
 const principal=(await issueSession(f.ctx,{accountId:'d',method:'password'},'browser')).principal
 const ctx={...f.ctx,principal,idempotencyKey:'readiness-test-0001'}
 await f.execute("INSERT INTO volunteer_people VALUES('p','org-a','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_occurrences VALUES('s','org-a','a1','ax','Shift',100,200,1,'published')").run()
 await f.execute("INSERT INTO volunteer_role_requirements VALUES('org-a','s','role','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_readiness VALUES('org-a','s','role','p','pending',NULL,NULL)").run()
 await f.execute("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind) VALUES('read','md-a','org-a','program.read','organization')").run()
 const input={organizationId:'org-a',occurrenceId:'s',roleId:'role',personId:'p',programId:'a1',locationId:'ax',state:'ready' as const,evidenceNote:'Reviewed agreement v3'}
 await expect(decideReadiness(ctx,input)).rejects.toMatchObject({code:'conflict'})
 await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a','readiness.review','a1','ax')").run()
 await expect(decideReadiness(ctx,{...input,evidenceNote:''})).rejects.toMatchObject({code:'invalid_input'})
 const result=await decideReadiness(ctx,input)
 expect(await decideReadiness(ctx,input)).toEqual(result)
 await expect(decideReadiness(ctx,{...input,state:'blocked'})).rejects.toMatchObject({code:'conflict'})
 expect(await f.execute("SELECT state,reviewed_by FROM volunteer_readiness WHERE person_id='p'").first()).toEqual({state:'ready',reviewed_by:'d'})
 expect(await f.execute("SELECT evidence_note FROM volunteer_readiness_decisions WHERE person_id='p'").first('evidence_note')).toBe('Reviewed agreement v3')
})

it('opens one pending readiness case for an existing volunteer and role',async()=>{
 const f=await databaseFixture()
 const principal=(await issueSession(f.ctx,{accountId:'d',method:'password'},'browser')).principal
 const ctx={...f.ctx,principal,idempotencyKey:'readiness-open-test'}
 await f.execute("INSERT INTO volunteer_people VALUES('p','org-a','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_occurrences VALUES('s','org-a','a1','ax','Shift',100,200,1,'published')").run()
 await f.execute("INSERT INTO volunteer_role_requirements VALUES('org-a','s','role','Volunteer',1)").run()
 await f.execute("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind) VALUES('read','md-a','org-a','program.read','organization')").run()
 const input={organizationId:'org-a',occurrenceId:'s',roleId:'role',personId:'p',programId:'a1',locationId:'ax'}
 await expect(openReadiness(ctx,input)).rejects.toMatchObject({code:'conflict'})
 await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a','readiness.review','a1','ax')").run()
 await expect(openReadiness(ctx,input)).rejects.toMatchObject({code:'conflict'})
 await f.execute("INSERT INTO volunteer_people_scopes VALUES('org-a','p','a1','ax')").run()
 expect(await openReadiness(ctx,input)).toEqual({status:'pending'})
 expect(await openReadiness(ctx,input)).toEqual({status:'existing'})
 expect(await f.execute('SELECT count(*) AS n FROM volunteer_readiness_open_events').first('n')).toBe(1)
})
