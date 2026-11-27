import {expect,it} from 'vitest'
import {databaseFixture} from './database'
import {issueSession} from '../../../src/cloudflare/stage0/auth/sessions'
import {createVolunteer,listVolunteers} from '../../../src/cloudflare/stage0/volunteer/people'

it('creates a scoped person once and blocks replay after revocation',async()=>{
 const f=await databaseFixture()
 const principal=(await issueSession(f.ctx,{accountId:'d',method:'password'},'browser')).principal
 const ctx={...f.ctx,principal,idempotencyKey:'volunteer-create-001'}
 const input={organizationId:'org-a',programId:'a1',locationId:'ax',displayName:'Volunteer'}
 await f.execute("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind) VALUES('read','md-a','org-a','program.read','organization')").run()
 await expect(createVolunteer(ctx,input)).rejects.toMatchObject({code:'conflict'})
 await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a','people.create','a1','ax')").run()
 const person=await createVolunteer(ctx,input)
 expect(await createVolunteer(ctx,input)).toEqual(person)
 expect(await listVolunteers(f.ctx,principal,'org-a','a1','ax')).toEqual({volunteers:[],truncated:false,nextCursor:null})
 await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a','people.read','a1','ax')").run()
 expect(await listVolunteers(f.ctx,principal,'org-a','a1','ax')).toEqual({volunteers:[{id:person.id,displayName:'Volunteer'}],truncated:false,nextCursor:null})
 expect(await listVolunteers(f.ctx,principal,'org-a','a1','ay')).toEqual({volunteers:[],truncated:false,nextCursor:null})
 await expect(createVolunteer(ctx,{...input,displayName:'Someone else'})).rejects.toMatchObject({code:'conflict'})
 expect(await f.execute('SELECT count(*) AS n FROM volunteer_people_events').first('n')).toBe(1)
 await f.execute("UPDATE organization_memberships SET state='revoked',version=version+1 WHERE id='md-a'").run()
 await expect(createVolunteer(ctx,input)).rejects.toMatchObject({code:'not_found'})
})
it('allows a scoped people reader to search without granting creation authority',async()=>{
 const f=await databaseFixture(),principal=(await issueSession(f.ctx,{accountId:'d',method:'password'},'browser')).principal
 const ctx={...f.ctx,principal,idempotencyKey:'people-read-only-0001'}
 await f.execute("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind) VALUES('read','md-a','org-a','program.read','organization')").run()
 await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a','people.read','a1','ax')").run()
 await f.execute("INSERT INTO volunteer_people VALUES('p','org-a','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_people_scopes VALUES('org-a','p','a1','ax')").run()
 expect(await listVolunteers(f.ctx,principal,'org-a','a1','ax')).toMatchObject({volunteers:[{id:'p',displayName:'Volunteer'}]})
 expect(await listVolunteers(f.ctx,principal,'org-a','a1','ay')).toMatchObject({volunteers:[]})
 await expect(createVolunteer(ctx,{organizationId:'org-a',programId:'a1',locationId:'ax',displayName:'New person'})).rejects.toMatchObject({code:'conflict'})
})
