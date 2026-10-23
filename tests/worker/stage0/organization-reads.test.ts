import {beforeEach,expect,it} from 'vitest'
import {databaseFixture} from './database'
import {issueSession} from '../../../src/cloudflare/stage0/auth/sessions'
import {getOrganizationPolicies,listAccessibleOrganizations,listAccessAudit} from '../../../src/cloudflare/stage0/access/reads'
import type {Principal} from '../../../src/cloudflare/stage0/contracts'
let f:Awaited<ReturnType<typeof databaseFixture>>,owner:Principal,admin:Principal,coordinator:Principal
async function event(id:string,action='membership.grants',org='org-a',time=f.ctx.clock.now()){
 await f.execute('INSERT INTO audit_events(id,organization_id,actor_account_id,action,resource_id,request_id,created_at) VALUES(?,?,?,?,?,?,?)',id,org,'a',action,'target','fixture-request',time).run()
}
beforeEach(async()=>{
 f=await databaseFixture();owner=(await issueSession(f.ctx,{accountId:'a',method:'passkey'},'browser')).principal
 admin=(await issueSession(f.ctx,{accountId:'c',method:'password'},'browser')).principal
 coordinator=(await issueSession(f.ctx,{accountId:'d',method:'password'},'desktop')).principal
})
it('lists only organizations accessible to the actual live session with explicit safe snapshots',async()=>{
 expect((await listAccessibleOrganizations(f.ctx,owner)).organizations.map(o=>o.id)).toEqual(['org-a'])
 const result=await listAccessibleOrganizations(f.ctx,admin)
 expect(result.organizations.map(o=>o.id)).toEqual(['org-a','org-b'])
 expect(Object.keys(result.organizations[0]).sort()).toEqual(['contactEmail','id','name','timeZone','version'])
 await expect(listAccessibleOrganizations(f.ctx,{...admin,accountId:'a'})).rejects.toMatchObject({code:'unauthenticated'})
})
it('paginates the own directory without duplicates and rejects malformed/unbounded selectors',async()=>{
 const first=await listAccessibleOrganizations(f.ctx,admin,{limit:1});expect(first.organizations.map(o=>o.id)).toEqual(['org-a']);expect(first.nextCursor).toBe('org-a')
 const next=await listAccessibleOrganizations(f.ctx,admin,{limit:1,cursor:first.nextCursor!});expect(next.organizations.map(o=>o.id)).toEqual(['org-b']);expect(next.nextCursor).toBeNull()
 for(const input of [{limit:0},{limit:101},{limit:1.5},{cursor:''},{cursor:'x'.repeat(257)},{cursor:'\u0000'}])await expect(listAccessibleOrganizations(f.ctx,admin,input)).rejects.toMatchObject({code:'invalid_input'})
})
it('rechecks membership/session revocation and required federation policy in directory queries',async()=>{
 await f.execute("UPDATE organization_memberships SET state='revoked',version=version+1 WHERE id='mc-a'").run()
 expect((await listAccessibleOrganizations(f.ctx,admin)).organizations.map(o=>o.id)).toEqual(['org-b'])
 await f.execute("INSERT INTO identity_connections(id,organization_id,protocol,provider,issuer,created_at) VALUES('saml-b','org-b','saml','enterprise_saml','urn:fixture:b',1)").run()
 await f.execute("UPDATE organizations SET required_connection_id='saml-b',version=version+1 WHERE id='org-b'").run()
 expect((await listAccessibleOrganizations(f.ctx,admin)).organizations).toEqual([])
 await f.execute('UPDATE sessions SET revoked_at=? WHERE id=?',f.ctx.clock.now(),admin.sessionId).run()
 await expect(listAccessibleOrganizations(f.ctx,admin)).rejects.toMatchObject({code:'unauthenticated'})
})
it('does not expose organization information to enrollment-only sessions',async()=>{
 await f.execute("UPDATE accounts SET email_verified_at=NULL WHERE id='a'").run()
 const enrollment=(await issueSession(f.ctx,{accountId:'a',method:'password'},'browser')).principal
 expect((await listAccessibleOrganizations(f.ctx,enrollment)).organizations).toEqual([])
 await expect(getOrganizationPolicies(f.ctx,enrollment,'org-a')).rejects.toMatchObject({code:'not_found'})
})
it('reads only recorded proposed policy and never fabricates a missing record',async()=>{
 await expect(getOrganizationPolicies(f.ctx,owner,'org-a')).rejects.toMatchObject({code:'not_found'})
 await f.execute("INSERT INTO organization_policies(organization_id,status,assignment_review,eligibility_bypass,automatic_hour_approval,created_at) VALUES('org-a','proposed','staff_reviewed',0,0,?)",f.ctx.clock.now()).run()
 expect(await getOrganizationPolicies(f.ctx,coordinator,'org-a')).toEqual({organizationId:'org-a',status:'proposed',assignmentReview:'staff_reviewed',eligibilityBypass:false,automaticHourApproval:false,version:1,createdAt:f.ctx.clock.now()})
 await expect(getOrganizationPolicies(f.ctx,owner,'org-b')).rejects.toMatchObject({code:'not_found'})
})
it('requires organization-level audit.read for admins and never grants audit to coordinators',async()=>{
 await event('access')
 await expect(listAccessAudit(f.ctx,admin,'org-a')).rejects.toMatchObject({code:'forbidden'})
 await f.execute("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind,program_id) VALUES('audit-scoped','mc-a','org-a','audit.read','program_location','a1')").run()
 await expect(listAccessAudit(f.ctx,admin,'org-a')).rejects.toMatchObject({code:'forbidden'})
 await f.execute("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind) VALUES('audit-org','mc-a','org-a','audit.read','organization')").run()
 expect((await listAccessAudit(f.ctx,admin,'org-a')).events.map(e=>e.id)).toEqual(['access'])
 await expect(listAccessAudit(f.ctx,admin,'org-b')).rejects.toMatchObject({code:'forbidden'})
 await f.execute("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind) VALUES('coordinator-audit','md-a','org-a','audit.read','organization')").run()
 await expect(listAccessAudit(f.ctx,coordinator,'org-a')).rejects.toMatchObject({code:'forbidden'})
})
it('filters access-management audit actions and omits session/proof/database fields',async()=>{
 await event('membership');await event('owner','ownership.request');await event('structure','program.update');await event('session','session.issue');await event('foreign','membership.revoke','org-b')
 const result=await listAccessAudit(f.ctx,owner,'org-a')
 expect(result.events.map(e=>e.id)).toEqual(['owner','membership'])
 expect(Object.keys(result.events[0]).sort()).toEqual(['action','actorAccountId','createdAt','id','requestId','resourceId'])
 await expect(listAccessAudit(f.ctx,owner,'org-b')).rejects.toMatchObject({code:'not_found'})
})
it('pages audit by descending time/id, handles equal timestamps and binds cursor to organization',async()=>{
 for(const id of ['a','b','c'])await event(id)
 const first=await listAccessAudit(f.ctx,owner,'org-a',{limit:2});expect(first.events.map(e=>e.id)).toEqual(['c','b']);expect(first.nextCursor).toEqual(expect.any(String))
 await event('newer','ownership.request','org-a',f.ctx.clock.now()+1)
 const next=await listAccessAudit(f.ctx,owner,'org-a',{limit:2,cursor:first.nextCursor!});expect(next.events.map(e=>e.id)).toEqual(['a']);expect(next.nextCursor).toBeNull()
 const secondOwner=(await issueSession(f.ctx,{accountId:'b',method:'passkey'},'browser')).principal
 await expect(listAccessAudit(f.ctx,secondOwner,'org-b',{cursor:first.nextCursor!})).rejects.toMatchObject({code:'invalid_input'})
 for(const input of [{limit:101},{limit:-1},{cursor:'not-json'},{cursor:'x'.repeat(3000)}])await expect(listAccessAudit(f.ctx,owner,'org-a',input)).rejects.toMatchObject({code:'invalid_input'})
})
it('bounds audit pages to 100 records with a continuation cursor',async()=>{
 await f.db.batch(Array.from({length:102},(_,i)=>f.execute("INSERT INTO audit_events(id,organization_id,actor_account_id,action,resource_id,request_id,created_at) VALUES(?,'org-a','a','membership.grants','target','request',?)",`event-${String(i).padStart(3,'0')}`,f.ctx.clock.now())))
 const page=await listAccessAudit(f.ctx,owner,'org-a',{limit:100});expect(page.events).toHaveLength(100);expect(page.nextCursor).toEqual(expect.any(String))
 expect((await listAccessAudit(f.ctx,owner,'org-a',{cursor:page.nextCursor!})).events).toHaveLength(2)
})
it('rechecks audit authority inside the final SELECT after preflight authorization',async()=>{
 await event('access')
 await f.execute("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind) VALUES('audit-org','mc-a','org-a','audit.read','organization')").run()
 const db=f.db,ctx={...f.ctx}
 ctx.db=new Proxy(db,{get(target,key){if(key==='prepare')return(sql:string)=>{if(sql.startsWith('SELECT e.id'))return{bind:(...values:Parameters<ReturnType<typeof db.prepare>['bind']>)=>({all:async()=>{await f.execute("DELETE FROM membership_grants WHERE id='audit-org'").run();return target.prepare(sql).bind(...values).all()}})};return target.prepare(sql)};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}})
 expect((await listAccessAudit(ctx,admin,'org-a')).events).toEqual([])
})
it('rejects nonnumeric page limits instead of silently treating null as the default',async()=>{
 for(const limit of [null,'1',NaN]){
 await expect(listAccessibleOrganizations(f.ctx,admin,{limit} as never)).rejects.toMatchObject({code:'invalid_input'})
 await expect(listAccessAudit(f.ctx,owner,'org-a',{limit} as never)).rejects.toMatchObject({code:'invalid_input'})
 }
})
it('rechecks live session authority inside the directory SELECT after preflight',async()=>{
 const db=f.db,ctx={...f.ctx}
 ctx.db=new Proxy(db,{get(target,key){if(key==='prepare')return(sql:string)=>{if(sql.startsWith('SELECT listed.id'))return{bind:(...values:Parameters<ReturnType<typeof db.prepare>['bind']>)=>({all:async()=>{await f.execute("UPDATE accounts SET security_version=security_version+1 WHERE id='c'").run();return target.prepare(sql).bind(...values).all()}})};return target.prepare(sql)};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}})
 expect((await listAccessibleOrganizations(ctx,admin)).organizations).toEqual([])
})
