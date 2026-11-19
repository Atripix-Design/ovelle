import {expect,it} from 'vitest'
import {databaseFixture} from './database'
import {issueSession} from '../../../src/cloudflare/stage0/auth/sessions'
import {createOccurrence,createRole,publishOccurrence,getOccurrence} from '../../../src/cloudflare/stage0/volunteer/schedule'

it('creates an authorized draft exactly once and rechecks scope on retry',async()=>{
 const f=await databaseFixture()
 const principal=(await issueSession(f.ctx,{accountId:'d',method:'password'},'browser')).principal
 const ctx={...f.ctx,principal,idempotencyKey:'occurrence-test-0001'}
 const input={organizationId:'org-a',programId:'a1',locationId:'ax',title:'Community shift',startsAt:100,endsAt:200,capacity:5}
 await f.execute("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind) VALUES('read','md-a','org-a','program.read','organization')").run()
 await expect(createOccurrence(ctx,input)).rejects.toMatchObject({code:'conflict'})
 await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a','schedule.manage','a1','ax')").run()
 const result=await createOccurrence(ctx,input)
 expect(await createOccurrence(ctx,input)).toEqual(result)
 expect(await f.execute('SELECT status FROM volunteer_occurrences WHERE id=?',result.id).first('status')).toBe('draft')
 expect(await f.execute('SELECT count(*) AS n FROM volunteer_occurrence_events').first('n')).toBe(1)
 await expect(createOccurrence(ctx,{...input,title:'Different'})).rejects.toMatchObject({code:'conflict'})
 await f.execute("UPDATE organization_memberships SET state='revoked',version=version+1 WHERE id='md-a'").run()
 await expect(createOccurrence(ctx,input)).rejects.toMatchObject({code:'not_found'})
})

it('adds roles within an authorized draft and protects retries',async()=>{
 const f=await databaseFixture()
 const principal=(await issueSession(f.ctx,{accountId:'d',method:'password'},'browser')).principal
 const ctx={...f.ctx,principal,idempotencyKey:'create-role-test-0001'}
 await f.execute("INSERT INTO volunteer_occurrences VALUES('s','org-a','a1','ax','Shift',100,200,2,'draft')").run()
 await f.execute("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind) VALUES('read','md-a','org-a','program.read','organization')").run()
 const input={organizationId:'org-a',occurrenceId:'s',programId:'a1',locationId:'ax',name:'Lead',capacity:1}
 await expect(createRole(ctx,input)).rejects.toMatchObject({code:'conflict'})
 await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a','schedule.manage','a1','ax')").run()
 const role=await createRole(ctx,input)
 expect(await createRole(ctx,input)).toEqual(role)
 await expect(createRole(ctx,{...input,capacity:2})).rejects.toMatchObject({code:'conflict'})
 expect(await f.execute("SELECT count(*) AS n FROM volunteer_occurrence_events WHERE action='role.create'").first('n')).toBe(1)
})

it('publishes only a scoped draft with capacity and a role',async()=>{
 const f=await databaseFixture()
 const principal=(await issueSession(f.ctx,{accountId:'d',method:'password'},'browser')).principal
 const ctx={...f.ctx,principal,idempotencyKey:'publish-shift-0001'}
 await f.execute("INSERT INTO volunteer_occurrences VALUES('s','org-a','a1','ax','Shift',100,200,2,'draft')").run()
 await f.execute("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind) VALUES('read','md-a','org-a','program.read','organization')").run()
 await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a','schedule.manage','a1','ax')").run()
 const input={organizationId:'org-a',occurrenceId:'s',programId:'a1',locationId:'ax'}
 await expect(publishOccurrence(ctx,input)).rejects.toMatchObject({code:'conflict'})
 await f.execute("INSERT INTO volunteer_role_requirements VALUES('org-a','s','role','Lead',1)").run()
 expect(await publishOccurrence(ctx,input)).toEqual({id:'s',status:'published'})
 expect(await publishOccurrence(ctx,input)).toEqual({id:'s',status:'published'})
 expect(await f.execute("SELECT count(*) AS n FROM volunteer_occurrence_events WHERE action='occurrence.publish'").first('n')).toBe(1)
})

it('uses one observation time for occurrence and role holds at an expiry boundary',async()=>{
 const f=await databaseFixture()
 const principal=(await issueSession(f.ctx,{accountId:'d',method:'password'},'browser')).principal
 const base=f.ctx.clock.now()
 await f.execute("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind) VALUES('read','md-a','org-a','program.read','organization')").run()
 await f.execute("INSERT INTO volunteer_people VALUES('p','org-a','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_occurrences VALUES('s','org-a','a1','ax','Shift',100,200,2,'published')").run()
 await f.execute("INSERT INTO volunteer_role_requirements VALUES('org-a','s','role','Lead',2)").run()
 await f.execute("INSERT INTO volunteer_readiness VALUES('org-a','s','role','p','ready','a',1)").run()
 await f.execute("INSERT INTO volunteer_waitlist VALUES('w','org-a','s','role','p','d',?,'request',?,'waiting')",principal.sessionId,base).run()
 await f.execute("INSERT INTO volunteer_offers VALUES('offer','org-a','w','s','role','p','offered',?,?,'d',?,'request')",base+450,base,principal.sessionId).run()
 let reads=0
 const ctx={...f.ctx,clock:{now:()=>base+100*reads++}}
 const result=await getOccurrence(ctx,principal,'org-a','s',{programId:'a1',locationId:'ax'})
 expect(result.occurrence).toMatchObject({held:1})
 expect(result.roles).toEqual([expect.objectContaining({id:'role',held:1})])
})
