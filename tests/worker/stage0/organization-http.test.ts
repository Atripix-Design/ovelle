import {beforeEach,expect,it} from 'vitest'
import {databaseFixture} from './database'
import {issueSession,type IssuedSession} from '../../../src/cloudflare/stage0/auth/sessions'
import {handleOrganizationRequest} from '../../../src/cloudflare/stage0/access/routes'
let f:Awaited<ReturnType<typeof databaseFixture>>,owner:IssuedSession,admin:IssuedSession,coordinator:IssuedSession,native:IssuedSession,key=0
const root='/api/v1/organizations/org-a',settings={name:'Updated A',contactEmail:'staff@example.test',timeZone:'America/New_York'}
function request(path=root,method='GET',body?:unknown,session=owner,extra:Record<string,string>={}){
 const headers:Record<string,string>={...(session.principal.transport==='browser'?{Cookie:`ovelle_local_session=${session.token}`,Origin:f.ctx.config.origin,'X-CSRF-Token':session.csrfToken!}:{Authorization:`Bearer ${session.token}`}),...extra}
 if(body!==undefined){headers['Content-Type']='application/json';headers['Idempotency-Key']=`organization-http-command-${++key}`}
 return new Request(f.ctx.config.origin+path,{method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{})})
}
const send=(req:Request,transport:'browser'|'desktop'='browser')=>handleOrganizationRequest(f.ctx,req,transport)
beforeEach(async()=>{
 f=await databaseFixture();key=0
 owner=await issueSession(f.ctx,{accountId:'a',method:'passkey'},'browser');admin=await issueSession(f.ctx,{accountId:'c',method:'passkey'},'browser')
 coordinator=await issueSession(f.ctx,{accountId:'d',method:'password'},'browser');native=await issueSession(f.ctx,{accountId:'a',method:'passkey'},'desktop')
 for(const [id,action] of [['read-program','program.read'],['read-location','location.read']])await f.execute("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind,program_id,location_id) VALUES(?,'md-a','org-a',?,'program_location','a1','ax')",id,action).run()
})
it('composes safe organization directory/read/update with version and replay contracts',async()=>{
 const directory=await send(request('/api/v1/me/organizations?limit=1','GET',undefined,admin));expect(directory.status).toBe(200);expect(await directory.json()).toMatchObject({organizations:[{id:'org-a'}],nextCursor:'org-a'})
 const next=await send(request('/api/v1/me/organizations?limit=1&cursor=org-a','GET',undefined,admin));expect(await next.json()).toMatchObject({organizations:[{id:'org-b'}],nextCursor:null})
 expect((await send(request())).status).toBe(200)
 const patch=request(root,'PATCH',{...settings,expectedVersion:1}),retry=patch.clone()
 expect((await send(patch)).status).toBe(200);expect((await send(retry)).status).toBe(200)
 expect(await (await send(request())).json()).toMatchObject({...settings,version:2})
 expect((await send(request(root,'PATCH',{...settings,expectedVersion:1}))).status).toBe(409)
 expect(await f.execute("SELECT count(*) AS n FROM audit_events WHERE action='organization.update'").first('n')).toBe(1)
})
it('creates organization/initial structure/proposed policy through the existing atomic service',async()=>{
 const input={...settings,firstProgram:'Community',firstLocation:'Center'},req=request('/api/v1/organizations','POST',input,admin),retry=req.clone()
 const response=await send(req);expect(response.status).toBe(201);const org=await response.json() as {id:string}
 expect((await send(retry)).status).toBe(201)
 for(const part of ['programs','locations','policies'])expect((await send(request(`/api/v1/organizations/${org.id}/${part}`,'GET',undefined,admin))).status).toBe(200)
 const policy=await (await send(request(`/api/v1/organizations/${org.id}/policies`,'GET',undefined,admin))).json()
 expect(policy).toMatchObject({status:'proposed',assignmentReview:'staff_reviewed',eligibilityBypass:false,automaticHourApproval:false,version:1})
 expect((await send(request('/api/v1/organizations','POST',input,admin))).status).toBe(409)
 expect((await send(request('/api/v1/organizations','POST',input,coordinator))).status).toBe(403)
})
it.each(['programs','locations'])('composes %s creation/detail/rename/archive without changing historical references',async kind=>{
 const response=await send(request(`${root}/${kind}`,'POST',{name:'New structure'}));expect(response.status).toBe(201);const item=await response.json() as {id:string}
 expect((await send(request(`${root}/${kind}/${item.id}`))).status).toBe(200)
 expect((await send(request(`${root}/${kind}/${item.id}`,'PATCH',{name:'Renamed',expectedVersion:1}))).status).toBe(200)
 const archive=request(`${root}/${kind}/${item.id}`,'PATCH',{name:'Renamed',expectedVersion:2,archived:true}),retry=archive.clone()
 expect((await send(archive)).status).toBe(200);expect((await send(retry)).status).toBe(200)
 expect((await send(request(`${root}/${kind}/${item.id}`))).status).toBe(404)
 expect(await f.execute(`SELECT archived_at FROM ${kind} WHERE id=?`,item.id).first('archived_at')).toBe(f.ctx.clock.now())
})
it('preserves complete scoped read intersections without accepting write scope overrides',async()=>{
 expect(await (await send(request(`${root}/programs?locationId=ax`,'GET',undefined,coordinator))).json()).toEqual({programs:[{id:'a1',name:'A1',version:1}]})
 expect(await (await send(request(`${root}/locations?programId=a1`,'GET',undefined,coordinator))).json()).toEqual({locations:[{id:'ax',name:'AX',version:1}]})
 expect(await (await send(request(`${root}/programs`,'GET',undefined,coordinator))).json()).toEqual({programs:[]})
 expect((await send(request(`${root}/programs/a2?locationId=ax`,'GET',undefined,coordinator))).status).toBe(404)
 expect((await send(request(`${root}/programs/a1`,'PATCH',{name:'No broadening',expectedVersion:1,locationId:'ax'},coordinator))).status).toBe(400)
 expect((await send(request('/api/v1/organizations/org-b/programs/b1','PATCH',{name:'No role transfer',expectedVersion:1},admin))).status).toBe(403)
 expect((await send(request('/api/v1/organizations/org-b'))).status).toBe(404)
})
it('composes scoped audit pagination and blocks unrelated events and unauthorized readers',async()=>{
 for(const id of ['a','b','c'])await f.execute("INSERT INTO audit_events(id,organization_id,actor_account_id,action,resource_id,request_id,created_at) VALUES(?,'org-a','a','membership.grants','target','audit-fixture',?)",id,f.ctx.clock.now()).run()
 const first=await send(request(`${root}/audit?limit=2`));expect(first.status).toBe(200);const page=await first.json() as {events:{id:string}[];nextCursor:string};expect(page.events.map(e=>e.id)).toEqual(['c','b'])
 const next=await send(request(`${root}/audit?limit=2&cursor=${encodeURIComponent(page.nextCursor)}`));expect(await next.json()).toMatchObject({events:[{id:'a'}],nextCursor:null})
 expect((await send(request(`${root}/audit`,'GET',undefined,admin))).status).toBe(403)
 expect((await send(request(`${root}/audit`,'GET',undefined,coordinator))).status).toBe(403)
 expect((await send(request(`${root}/policies`))).status).toBe(404)
})
it('requires browser Origin and CSRF for all command families and isolates native transport',async()=>{
 const commands=[request('/api/v1/organizations','POST',{...settings,firstProgram:'P',firstLocation:'L'},admin),request(root,'PATCH',{...settings,expectedVersion:1}),request(`${root}/programs`,'POST',{name:'P'}),request(`${root}/programs/a1`,'PATCH',{name:'P',expectedVersion:1}),request(`${root}/locations`,'POST',{name:'L'}),request(`${root}/locations/ax`,'PATCH',{name:'L',expectedVersion:1})]
 for(const original of commands)for(const mode of ['missing-origin','null-origin','foreign-origin','missing-csrf','wrong-csrf','cross-site']){
 const req=original.clone();if(mode==='missing-origin')req.headers.delete('Origin');if(mode==='null-origin')req.headers.set('Origin','null');if(mode==='foreign-origin')req.headers.set('Origin','https://evil.test');if(mode==='missing-csrf')req.headers.delete('X-CSRF-Token');if(mode==='wrong-csrf')req.headers.set('X-CSRF-Token','wrong');if(mode==='cross-site')req.headers.set('Sec-Fetch-Site','cross-site')
 expect((await send(req)).status).toBe(403)
 }
 expect((await send(request(root,'GET',undefined,native),'desktop')).status).toBe(200)
 expect((await send(request(`${root}/programs`,'POST',{name:'Native'},native),'desktop')).status).toBe(201)
 expect((await send(request(root,'GET',undefined,native))).status).toBe(401)
 expect((await send(request(),'desktop')).status).toBe(401)
 for(const name of ['Cookie','Origin','Sec-Fetch-Site'])expect((await send(request(root,'GET',undefined,native,{[name]:'same-origin'}),'desktop')).status).toBe(401)
})
it('rejects malformed DTOs, optional field types, forged authority and oversized input before mutation',async()=>{
 for(const body of [null,[],{name:'P',archived:null},{name:'P',archived:'true'},{name:'P',id:'forced'},{name:'P',organizationId:'org-b'},{name:'P',principal:owner.principal}])expect((await send(request(`${root}/programs`,'POST',body))).status).toBe(400)
 for(const body of [{...settings,expectedVersion:'1'},{...settings,expectedVersion:1,ownerAccountId:'d'},{name:'x'.repeat(17000)}])expect((await send(request(root,'PATCH',body))).status).toBe(400)
 const missing=request(`${root}/programs`,'POST',{name:'P'});missing.headers.delete('Idempotency-Key');expect((await send(missing)).status).toBe(400)
 const malformed=new Request(f.ctx.config.origin+root,{method:'PATCH',headers:request(root,'PATCH',{}).headers,body:'{'});expect((await send(malformed)).status).toBe(400)
 const wrong=request(`${root}/programs`,'POST',{name:'P'});wrong.headers.set('Content-Type','text/plain');expect((await send(wrong)).status).toBe(400)
 expect(await f.execute('SELECT count(*) AS n FROM command_receipts').first('n')).toBe(0)
})
it('rejects unknown/duplicate/malformed query selectors, unsafe methods and invalid route IDs',async()=>{
 for(const path of [`${root}?owner=true`,`${root}/programs?locationId=ax&locationId=ay`,`${root}/locations?locationId=ax`,`${root}/programs?locationId=`,`${root}/audit?limit=101`,`${root}/audit?limit=1e2`,`${root}/audit?cursor=bad`, '/api/v1/me/organizations?limit=0',`${root}/programs/%ZZ`,`${root}/locations/a%2Fb`])expect((await send(request(path))).status).toBe(400)
 for(const [path,method,allow] of [['/api/v1/organizations','GET','POST'],[root,'DELETE','GET, PATCH'],[`${root}/policies`,'POST','GET'],[`${root}/audit`,'POST','GET'],[`${root}/programs`,'PATCH','GET, POST'],[`${root}/locations/ax`,'POST','GET, PATCH']] as const){const response=await send(request(path,method));expect(response.status).toBe(405);expect(response.headers.get('Allow')).toBe(allow)}
 expect((await send(request('/api/v1/unknown'))).status).toBe(404)
 expect(await f.execute('SELECT count(*) AS n FROM command_receipts').first('n')).toBe(0)
})
it('rechecks current session, membership and required SSO for reads and writes',async()=>{
 await f.execute("UPDATE organization_memberships SET state='revoked',version=version+1 WHERE id='md-a'").run()
 expect((await send(request(root,'GET',undefined,coordinator))).status).toBe(404)
 await f.execute("INSERT INTO identity_connections(id,organization_id,protocol,provider,issuer,created_at) VALUES('saml-a','org-a','saml','enterprise_saml','urn:fixture:a',1)").run()
 await f.execute("UPDATE organizations SET required_connection_id='saml-a',version=version+1 WHERE id='org-a'").run()
 expect((await send(request(root))).status).toBe(404)
 expect((await send(request(root,'PATCH',{...settings,expectedVersion:2}))).status).toBe(404)
 expect(await (await send(request('/api/v1/me/organizations'))).json()).toMatchObject({organizations:[]})
 await f.execute('UPDATE sessions SET revoked_at=? WHERE id=?',f.ctx.clock.now(),owner.principal.sessionId).run()
 expect((await send(request('/api/v1/me/organizations'))).status).toBe(401)
})
it('uses safe response headers and never reflects database failures or credential fields',async()=>{
 const response=await send(request())
 for(const [name,value] of [['Cache-Control','no-store'],['Referrer-Policy','no-referrer'],['X-Content-Type-Options','nosniff'],['X-Request-ID',f.ctx.requestId]])expect(response.headers.get(name)).toBe(value)
 expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false)
 const text=await response.text();for(const value of [owner.token,owner.csrfToken!,'owner_account_id','created_by_account_id','security_version'])expect(text).not.toContain(value)
 const db=f.ctx.db;f.ctx.db=new Proxy(db,{get(target,key){if(key==='prepare')return()=>{throw new Error('secret SQL token')};return Reflect.get(target,key,target)}})
 const failed=await send(request());expect(failed.status).toBe(503);expect(await failed.json()).toEqual({error:'unavailable'})
})
it('authenticates scoped assignment creation and rejects forged inputs',async()=>{
 await f.execute("INSERT INTO volunteer_people VALUES('p','org-a','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_occurrences VALUES('s','org-a','a1','ax','Shift',100,200,1,'published')").run()
 await f.execute("INSERT INTO volunteer_role_requirements VALUES('org-a','s','role','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_readiness VALUES('org-a','s','role','p','ready','a',1)").run()
 await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a','assignment.manage','a1','ax')").run()
 const path=`${root}/volunteer-assignments`,body={occurrenceId:'s',personId:'p',roleId:'role',programId:'a1',locationId:'ax'}
 const bad=request(path,'POST',{...body,organizationId:'org-b'},coordinator)
 expect((await send(bad)).status).toBe(400)
 const missingOrigin=request(path,'POST',body,coordinator);missingOrigin.headers.delete('Origin')
 expect((await send(missingOrigin)).status).toBe(403)
 const valid=request(path,'POST',body,coordinator),retry=valid.clone()
 const first=await send(valid);expect(first.status).toBe(201);const result=await first.json()
 const second=await send(retry);expect(second.status).toBe(201);expect(await second.json()).toEqual(result)
 expect(await f.execute('SELECT count(*) AS n FROM volunteer_assignments').first('n')).toBe(1)
})
it('releases a vacancy once and fills it without losing cancellation history',async()=>{
 await f.execute("INSERT INTO volunteer_occurrences VALUES('s','org-a','a1','ax','Shift',100,200,1,'published')").run()
 await f.execute("INSERT INTO volunteer_role_requirements VALUES('org-a','s','role','Volunteer',1)").run()
 for(const person of ['p','q']){
  await f.execute("INSERT INTO volunteer_people VALUES(?,'org-a',?,1)",person,person).run()
  await f.execute("INSERT INTO volunteer_readiness VALUES('org-a','s','role',?,'ready','a',1)",person).run()
 }
 for(const action of ['assignment.manage','attendance.manage'])await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a',?,'a1','ax')",action).run()
 const scope={programId:'a1',locationId:'ax'}, identity={...scope,occurrenceId:'s',roleId:'role'}
 const first=await send(request(`${root}/volunteer-assignments`,'POST',{...identity,personId:'p'},coordinator));expect(first.status).toBe(201)
 const {id}=await first.json() as {id:string}
 expect((await send(request(`${root}/volunteer-assignments`,'POST',{...identity,personId:'q'},coordinator))).status).toBe(409)
 const cancel=request(`${root}/volunteer-assignments/${id}/cancel`,'POST',{...scope,reason:'Volunteer unavailable'},coordinator),retry=cancel.clone()
 expect((await send(cancel)).status).toBe(200);expect((await send(retry)).status).toBe(200)
 expect((await send(request(`${root}/volunteer-assignments`,'POST',{...identity,personId:'q'},coordinator))).status).toBe(201)
 const roster=await (await send(request(`${root}/volunteer-occurrences/s/roster?programId=a1&locationId=ax`,'GET',undefined,coordinator))).json() as {volunteers:{name:string}[]}
 expect(roster.volunteers.map(v=>v.name)).toEqual(['q'])
 expect(await f.execute('SELECT reason FROM volunteer_assignment_cancellations WHERE assignment_id=?',id).first('reason')).toBe('Volunteer unavailable')
 expect(await f.execute("SELECT count(*) AS n FROM volunteer_audit_events WHERE action='assignment.cancel'").first('n')).toBe(1)
})
it('cannot cancel an arrival or use another scope to release a place',async()=>{
 await f.execute("INSERT INTO volunteer_people VALUES('p','org-a','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_occurrences VALUES('s','org-a','a1','ax','Shift',100,200,1,'published')").run()
 await f.execute("INSERT INTO volunteer_role_requirements VALUES('org-a','s','role','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_readiness VALUES('org-a','s','role','p','ready','a',1)").run()
 await f.execute("INSERT INTO volunteer_assignments VALUES('assignment','org-a','s','p','role','confirmed',1)").run()
 await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a','assignment.manage','a1','ax')").run()
 const path=`${root}/volunteer-assignments/assignment/cancel`,body={programId:'a1',locationId:'ax',reason:'Unavailable'}
 expect((await send(request(path,'POST',{...body,locationId:'ay'},coordinator))).status).toBe(409)
 await f.execute("INSERT INTO volunteer_attendance VALUES('org-a','assignment',100,NULL)").run()
 expect((await send(request(path,'POST',body,coordinator))).status).toBe(409)
 expect(await f.execute("SELECT status FROM volunteer_assignments WHERE id='assignment'").first('status')).toBe('confirmed')
 expect(await f.execute('SELECT count(*) AS n FROM volunteer_assignment_cancellations').first('n')).toBe(0)
})
it('holds a canceled place for one offer and confirms only current eligibility',async()=>{
 const now=f.ctx.clock.now(),scope={programId:'a1',locationId:'ax'}
 await f.execute("INSERT INTO volunteer_occurrences VALUES('s','org-a','a1','ax','Shift',?,?,1,'published')",now+60000,now+120000).run()
 await f.execute("INSERT INTO volunteer_role_requirements VALUES('org-a','s','role','Volunteer',1)").run()
 for(const person of ['p','q','r']){
  await f.execute("INSERT INTO volunteer_people VALUES(?,'org-a',?,1)",person,person).run()
  await f.execute("INSERT INTO volunteer_people_scopes VALUES('org-a',?,'a1','ax')",person).run()
  await f.execute("INSERT INTO volunteer_readiness VALUES('org-a','s','role',?,'ready','a',1)",person).run()
 }
 for(const action of ['assignment.manage','attendance.manage'])await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a',?,'a1','ax')",action).run()
 const identity={...scope,occurrenceId:'s',roleId:'role'}
 const assigned=await send(request(`${root}/volunteer-assignments`,'POST',{...identity,personId:'p'},coordinator));expect(assigned.status).toBe(201)
 const first=await assigned.json() as {id:string}
 const entries=[] as {id:string}[]
 for(const personId of ['q','r']){const response=await send(request(`${root}/volunteer-occurrences/s/waitlist`,'POST',{...scope,roleId:'role',personId},coordinator));expect(response.status).toBe(201);entries.push(await response.json() as {id:string})}
 const makeOffer=(id:string)=>request(`${root}/volunteer-waitlist/${id}/offers`,'POST',{...scope,expiresAt:now+30000},coordinator)
 expect((await send(makeOffer(entries[0].id))).status).toBe(409)
 expect((await send(request(`${root}/volunteer-assignments/${first.id}/cancel`,'POST',{...scope,reason:'Unavailable'},coordinator))).status).toBe(200)
 const offers=await Promise.all(entries.map(entry=>send(makeOffer(entry.id))))
 expect(offers.map(response=>response.status).sort()).toEqual([201,409])
 const winner=offers.findIndex(response=>response.status===201),offer=await offers[winner].json() as {id:string},person=['q','r'][winner],other=['r','q'][winner]
 expect(await (await send(request(`${root}/volunteer-occurrences/s?programId=a1&locationId=ax`,'GET',undefined,coordinator))).json()).toMatchObject({occurrence:{assigned:0,held:1},roles:[{held:1}]})
 expect((await send(request(`${root}/volunteer-assignments`,'POST',{...identity,personId:other},coordinator))).status).toBe(409)
 await f.execute("UPDATE volunteer_readiness SET state='blocked' WHERE person_id=?",person).run()
 const confirm=()=>request(`${root}/volunteer-offers/${offer.id}/confirm`,'POST',{...scope,confirmationNote:'Volunteer accepted by phone'},coordinator)
 expect((await send(confirm())).status).toBe(409)
 await f.execute("UPDATE volunteer_readiness SET state='ready' WHERE person_id=?",person).run()
 const original=confirm(),retry=original.clone(),accepted=await send(original);expect(accepted.status).toBe(200)
 const assignment=await accepted.json() as {id:string};expect(await (await send(retry)).json()).toEqual(assignment)
 expect(await f.execute("SELECT count(*) AS n FROM volunteer_assignments WHERE status='confirmed'").first('n')).toBe(1)
 const roster=await (await send(request(`${root}/volunteer-occurrences/s/roster?programId=a1&locationId=ax`,'GET',undefined,coordinator))).json()
 expect(roster).toMatchObject({volunteers:[{name:person}]})
 const queue=await (await send(request(`${root}/volunteer-occurrences/s/waitlist?programId=a1&locationId=ax`,'GET',undefined,coordinator))).json() as {entries:{name:string;state:string}[]}
 expect(queue.entries.find(entry=>entry.name===person)?.state).toBe('assigned')
 expect(queue.entries.find(entry=>entry.name===other)?.state).toBe('waiting')
})
it('releases expired holds before a new direct assignment',async()=>{
 const now=f.ctx.clock.now(),scope={programId:'a1',locationId:'ax'}
 await f.execute("INSERT INTO volunteer_occurrences VALUES('s','org-a','a1','ax','Shift',?,?,1,'published')",now+60000,now+120000).run()
 await f.execute("INSERT INTO volunteer_role_requirements VALUES('org-a','s','role','Volunteer',1)").run()
 for(const person of ['p','q']){
  await f.execute("INSERT INTO volunteer_people VALUES(?,'org-a',?,1)",person,person).run()
  await f.execute("INSERT INTO volunteer_people_scopes VALUES('org-a',?,'a1','ax')",person).run()
  await f.execute("INSERT INTO volunteer_readiness VALUES('org-a','s','role',?,'ready','a',1)",person).run()
 }
 await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a','assignment.manage','a1','ax')").run()
 const queued=await send(request(`${root}/volunteer-occurrences/s/waitlist`,'POST',{...scope,roleId:'role',personId:'p'},coordinator));const entry=await queued.json() as {id:string}
 const offerRequest=request(`${root}/volunteer-waitlist/${entry.id}/offers`,'POST',{...scope,expiresAt:now+1000},coordinator),retry=offerRequest.clone()
 const response=await send(offerRequest);expect(response.status).toBe(201);const offer=await response.json() as {id:string}
 f.advance(1000)
 expect(await (await send(retry)).json()).toEqual(offer)
 expect((await send(request(`${root}/volunteer-offers/${offer.id}/confirm`,'POST',{...scope,confirmationNote:'Late reply'},coordinator))).status).toBe(409)
 const direct=await send(request(`${root}/volunteer-assignments`,'POST',{...scope,occurrenceId:'s',roleId:'role',personId:'q'},coordinator));expect(direct.status).toBe(201)
 expect(await f.execute('SELECT state FROM volunteer_offers WHERE id=?',offer.id).first('state')).toBe('expired')
})
it('withdraws a waiting person and their offer together, allowing a later return',async()=>{
 const now=f.ctx.clock.now(),scope={programId:'a1',locationId:'ax'}
 await f.execute("INSERT INTO volunteer_occurrences VALUES('s','org-a','a1','ax','Shift',?,?,1,'published')",now+60000,now+120000).run()
 await f.execute("INSERT INTO volunteer_role_requirements VALUES('org-a','s','role','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_people VALUES('p','org-a','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_people_scopes VALUES('org-a','p','a1','ax')").run()
 await f.execute("INSERT INTO volunteer_readiness VALUES('org-a','s','role','p','ready','a',1)").run()
 await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a','assignment.manage','a1','ax')").run()
 const queuePath=`${root}/volunteer-occurrences/s/waitlist`,body={...scope,roleId:'role',personId:'p'}
 const entry=await (await send(request(queuePath,'POST',body,coordinator))).json() as {id:string}
 const offered=await send(request(`${root}/volunteer-waitlist/${entry.id}/offers`,'POST',{...scope,expiresAt:now+30000},coordinator));expect(offered.status).toBe(201)
 const firstOffer=await offered.json() as {id:string}
 const withdraw=request(`${root}/volunteer-offers/${firstOffer.id}/withdraw`,'POST',{...scope,reason:'Offer withdrawn'},coordinator),withdrawRetry=withdraw.clone()
 expect((await send(withdraw)).status).toBe(200);expect((await send(withdrawRetry)).status).toBe(200)
 const replacement=await send(request(`${root}/volunteer-waitlist/${entry.id}/offers`,'POST',{...scope,expiresAt:now+30000},coordinator));expect(replacement.status).toBe(201)
 const offer=await replacement.json() as {id:string}
 const leave=request(`${root}/volunteer-waitlist/${entry.id}/withdraw`,'POST',{...scope,reason:'No longer available'},coordinator),retry=leave.clone()
 expect((await send(leave)).status).toBe(200);expect((await send(retry)).status).toBe(200)
 expect(await f.execute('SELECT state FROM volunteer_offers WHERE id=?',offer.id).first('state')).toBe('withdrawn')
 expect((await send(request(`${root}/volunteer-offers/${offer.id}/confirm`,'POST',{...scope,confirmationNote:'Late acceptance'},coordinator))).status).toBe(409)
 const returned=await send(request(queuePath,'POST',body,coordinator));expect(returned.status).toBe(201)
 expect((await returned.json() as {id:string}).id).not.toBe(entry.id)
})
it('checks in using authenticated browser and desktop transports without duplicate events',async()=>{
 await f.execute("INSERT INTO volunteer_people VALUES('p','org-a','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_occurrences VALUES('s','org-a','a1','ax','Shift',100,200,1,'published')").run()
 await f.execute("INSERT INTO volunteer_role_requirements VALUES('org-a','s','role','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_readiness VALUES('org-a','s','role','p','ready','a',1)").run()
 await f.execute("INSERT INTO volunteer_assignments VALUES('assignment','org-a','s','p','role','confirmed',1)").run()
 await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a','attendance.manage','a1','ax')").run()
 const path=`${root}/volunteer-assignments/assignment/check-in`,body={programId:'a1',locationId:'ax'}
 const bad=request(path,'POST',body,coordinator);bad.headers.delete('X-CSRF-Token')
 expect((await send(bad)).status).toBe(403)
 expect((await send(request(path,'POST',{...body,assignmentId:'different'},coordinator))).status).toBe(400)
 const first=await send(request(path,'POST',body,coordinator));expect(first.status).toBe(200)
 const firstBody=await first.json()
 const retry=await send(request(path,'POST',body,native),'desktop');expect(retry.status).toBe(200);expect(await retry.json()).toEqual(firstBody)
 expect(await f.execute("SELECT count(*) AS n FROM volunteer_audit_events WHERE action='attendance.check_in'").first('n')).toBe(1)
})
it('limits schedule to the current program and location grant and time window',async()=>{
 await f.execute("INSERT INTO volunteer_occurrences VALUES('s','org-a','a1','ax','Shift',100,200,2,'published')").run()
 await f.execute("INSERT INTO volunteer_occurrences VALUES('other','org-a','a2','ay','Other',100,200,2,'published')").run()
 const path=`${root}/volunteer-schedule?programId=a1&locationId=ax&from=100&until=200`
 const response=await send(request(path,'GET',undefined,coordinator));expect(response.status).toBe(200)
 expect(await response.json()).toEqual({occurrences:[{id:'s',title:'Shift',startsAt:100,endsAt:200,capacity:2,status:'published',assigned:0,held:0}],truncated:false,nextCursor:null})
 expect(await (await send(request(`${root}/volunteer-schedule?programId=a2&locationId=ay&from=100&until=200`,'GET',undefined,coordinator))).json()).toEqual({occurrences:[],truncated:false,nextCursor:null})
 expect((await send(request(`${root}/volunteer-schedule?programId=a1&locationId=ax&from=200&until=100`,'GET',undefined,coordinator))).status).toBe(400)
})
it('restricts the roster to attendance managers and excludes private evidence',async()=>{
 await f.execute("INSERT INTO volunteer_people VALUES('p','org-a','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_occurrences VALUES('s','org-a','a1','ax','Shift',100,200,1,'published')").run()
 await f.execute("INSERT INTO volunteer_role_requirements VALUES('org-a','s','role','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_readiness VALUES('org-a','s','role','p','ready','a',1)").run()
 await f.execute("INSERT INTO volunteer_assignments VALUES('assignment','org-a','s','p','role','confirmed',1)").run()
 const path=`${root}/volunteer-occurrences/s/roster?programId=a1&locationId=ax`
 expect((await send(request(path,'GET',undefined,coordinator))).status).toBe(404)
 await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a','attendance.manage','a1','ax')").run()
 const response=await send(request(path,'GET',undefined,coordinator));expect(response.status).toBe(200)
 expect(await response.json()).toEqual({occurrence:{id:'s',title:'Shift',startsAt:100,endsAt:200},volunteers:[{assignmentId:'assignment',name:'Volunteer',role:'Volunteer',readiness:'ready',checkedInAt:null,checkedOutAt:null,presence:'expected',presenceEventId:null}],truncated:false,nextCursor:null,summary:{expected:1,onSite:0,departed:0,canceled:0,noShow:0},observedAt:f.ctx.clock.now()})
 expect((await send(request(`${root}/volunteer-occurrences/s/roster?programId=a1&locationId=ay`,'GET',undefined,coordinator))).status).toBe(404)
})
it('pages the complete roster and counts presence across all pages',async()=>{
 await f.execute("INSERT INTO volunteer_occurrences VALUES('s','org-a','a1','ax','Shift',100,200,102,'published')").run()
 await f.execute("INSERT INTO volunteer_role_requirements VALUES('org-a','s','role','Volunteer',102)").run()
 await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a','attendance.manage','a1','ax')").run()
 for(let i=0;i<102;i++){
  const suffix=String(i).padStart(3,'0'),person=`p${suffix}`,assignment=`a${suffix}`
  await f.execute("INSERT INTO volunteer_people VALUES(?,'org-a','Volunteer',1)",person).run()
  await f.execute("INSERT INTO volunteer_readiness VALUES('org-a','s','role',?,'ready','a',1)",person).run()
  await f.execute("INSERT INTO volunteer_assignments VALUES(?,'org-a','s',?,'role','confirmed',1)",assignment,person).run()
 }
 await f.execute("INSERT INTO volunteer_attendance VALUES('org-a','a000',100,NULL)").run()
 await f.execute("INSERT INTO volunteer_attendance VALUES('org-a','a101',100,200)").run()
 await f.execute("UPDATE volunteer_assignments SET status='canceled' WHERE id='a100'").run()
 const path=`${root}/volunteer-occurrences/s/roster?programId=a1&locationId=ax`
 const first=await (await send(request(path,'GET',undefined,coordinator))).json() as {volunteers:{assignmentId:string}[];nextCursor:string;summary:unknown;truncated:boolean;observedAt:number}
 expect(first.volunteers).toHaveLength(100);expect(first.truncated).toBe(true);expect(first.nextCursor).toBeTruthy()
 expect(atob(first.nextCursor.replaceAll('-','+').replaceAll('_','/'))).not.toContain('Volunteer')
 expect(first.summary).toEqual({expected:99,onSite:1,departed:1,canceled:1,noShow:0});expect(first.observedAt).toBe(f.ctx.clock.now())
 const second=await (await send(request(`${path}&cursor=${first.nextCursor}`,'GET',undefined,coordinator))).json() as {volunteers:{assignmentId:string}[];nextCursor:null;summary:unknown}
 expect(second.volunteers.map(row=>row.assignmentId)).toEqual(['a101']);expect(second.nextCursor).toBeNull();expect(second.summary).toEqual(first.summary)
 expect((await send(request(`${path}&cursor=bad`,'GET',undefined,coordinator))).status).toBe(400)
 expect((await send(request(`${root}/volunteer-occurrences/s/roster?programId=a1&locationId=ay&cursor=${first.nextCursor}`,'GET',undefined,coordinator))).status).toBe(400)
})
it('records a confirmed no-show and safely reverses it for a late arrival',async()=>{
 await f.execute("INSERT INTO volunteer_people VALUES('p','org-a','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_occurrences VALUES('s','org-a','a1','ax','Shift',100,200,1,'published')").run()
 await f.execute("INSERT INTO volunteer_role_requirements VALUES('org-a','s','role','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_readiness VALUES('org-a','s','role','p','ready','a',1)").run()
 await f.execute("INSERT INTO volunteer_assignments VALUES('assignment','org-a','s','p','role','confirmed',1)").run()
 await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a','attendance.manage','a1','ax')").run()
 const scope={programId:'a1',locationId:'ax'},path=`${root}/volunteer-assignments/assignment/presence`,mark={...scope,state:'no_show',expectedEventId:null,reason:'Site lead confirmed',confirmation:true}
 expect((await send(request(path,'POST',{...mark,confirmation:false},coordinator))).status).toBe(400)
 const original=request(path,'POST',mark,coordinator),retry=original.clone(),marked=await send(original);expect(marked.status).toBe(200)
 const event=await marked.json() as {id:string};expect(await (await send(retry)).json()).toEqual(event)
 const rosterPath=`${root}/volunteer-occurrences/s/roster?programId=a1&locationId=ax`
 expect(await (await send(request(rosterPath,'GET',undefined,coordinator))).json()).toMatchObject({summary:{expected:0,onSite:0,departed:0,noShow:1},volunteers:[{presence:'no_show',presenceEventId:event.id}]})
 expect((await send(request(`${root}/volunteer-assignments/assignment/check-in`,'POST',scope,coordinator))).status).toBe(409)
 const clear={...scope,state:'expected',expectedEventId:event.id,reason:'Volunteer arrived late',confirmation:true}
 expect((await send(request(path,'POST',{...clear,expectedEventId:'stale'},coordinator))).status).toBe(409)
 expect((await send(request(path,'POST',clear,coordinator))).status).toBe(200)
 expect((await send(request(`${root}/volunteer-assignments/assignment/check-in`,'POST',scope,coordinator))).status).toBe(200)
 expect(await (await send(request(rosterPath,'GET',undefined,coordinator))).json()).toMatchObject({summary:{expected:0,onSite:1,departed:0,noShow:0},volunteers:[{presence:'on_site'}]})
 expect((await send(request(path,'POST',mark,coordinator))).status).toBe(409)
 expect(await f.execute('SELECT count(*) AS n FROM volunteer_presence_events').first('n')).toBe(2)
})
it('does not simultaneously record a no-show and an arrival',async()=>{
 await f.execute("INSERT INTO volunteer_people VALUES('p','org-a','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_occurrences VALUES('s','org-a','a1','ax','Shift',100,200,1,'published')").run()
 await f.execute("INSERT INTO volunteer_role_requirements VALUES('org-a','s','role','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_readiness VALUES('org-a','s','role','p','ready','a',1)").run()
 await f.execute("INSERT INTO volunteer_assignments VALUES('assignment','org-a','s','p','role','confirmed',1)").run()
 await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a','attendance.manage','a1','ax')").run()
 const scope={programId:'a1',locationId:'ax'}
 const [absent,arrival]=await Promise.all([
  send(request(`${root}/volunteer-assignments/assignment/presence`,'POST',{...scope,state:'no_show',expectedEventId:null,reason:'Site lead confirmed',confirmation:true},coordinator)),
  send(request(`${root}/volunteer-assignments/assignment/check-in`,'POST',scope,coordinator)),
 ])
 expect([absent.status,arrival.status].sort()).toEqual([200,409])
 const recorded=await f.execute('SELECT (SELECT count(*) FROM volunteer_presence_events)+(SELECT count(*) FROM volunteer_attendance) AS n').first('n')
 expect(recorded).toBe(1)
})
it('reviews submitted hours through authenticated scoped transport and retries once',async()=>{
 await f.execute("INSERT INTO volunteer_people VALUES('p','org-a','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_occurrences VALUES('s','org-a','a1','ax','Shift',100,200,1,'published')").run()
 await f.execute("INSERT INTO volunteer_role_requirements VALUES('org-a','s','role','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_readiness VALUES('org-a','s','role','p','ready','a',1)").run()
 await f.execute("INSERT INTO volunteer_assignments VALUES('a','org-a','s','p','role','confirmed',1)").run()
 await f.execute("INSERT INTO volunteer_hours_submissions VALUES('h','org-a','a',0,7200000,0,'pending')").run()
 const path=`${root}/volunteer-hours/h/review`,body={programId:'a1',locationId:'ax',decision:'approve',approvedMinutes:120,reason:null}
 expect((await send(request(path,'POST',body,coordinator))).status).toBe(409)
 await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a','hours.review','a1','ax')").run()
 const missing=request(path,'POST',body,coordinator);missing.headers.delete('Origin');expect((await send(missing)).status).toBe(403)
 const valid=request(path,'POST',body,coordinator),retry=valid.clone()
 const first=await send(valid);expect(first.status).toBe(200);const result=await first.json()
 const second=await send(retry);expect(second.status).toBe(200);expect(await second.json()).toEqual(result)
 expect(await f.execute('SELECT count(*) AS n FROM volunteer_hours_decisions').first('n')).toBe(1)
})
it('records a staff-supplied clarification and resumes review without accepting stale decisions',async()=>{
 await f.execute("INSERT INTO volunteer_people VALUES('p','org-a','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_occurrences VALUES('s','org-a','a1','ax','Shift',100,200,1,'published')").run()
 await f.execute("INSERT INTO volunteer_role_requirements VALUES('org-a','s','role','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_readiness VALUES('org-a','s','role','p','ready','a',1)").run()
 await f.execute("INSERT INTO volunteer_assignments VALUES('assignment','org-a','s','p','role','confirmed',1)").run()
 await f.execute("INSERT INTO volunteer_attendance VALUES('org-a','assignment',100,200)").run()
 await f.execute("INSERT INTO volunteer_hours_submissions VALUES('h','org-a','assignment',0,7200000,0,'pending')").run()
 const scope={programId:'a1',locationId:'ax'},base=`${root}/volunteer-hours/h`,history=`${base}/history?programId=a1&locationId=ax`
 expect((await send(request(history,'GET',undefined,coordinator))).status).toBe(404)
 await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a','hours.review','a1','ax')").run()
 const question=await send(request(`${base}/review`,'POST',{...scope,decision:'clarify',approvedMinutes:null,reason:'Was a break taken?'},coordinator));expect(question.status).toBe(200)
 const decision=await question.json() as {id:string}
 expect((await send(request(`${base}/review`,'POST',{...scope,decision:'approve',approvedMinutes:120,reason:null},coordinator))).status).toBe(409)
 const reply={...scope,expectedDecisionId:decision.id,response:'Volunteer reported no break'}
 expect((await send(request(`${base}/clarification`,'POST',{...reply,expectedDecisionId:'stale'},coordinator))).status).toBe(409)
 const original=request(`${base}/clarification`,'POST',reply,coordinator),retry=original.clone(),recorded=await send(original);expect(recorded.status).toBe(201)
 const response=await recorded.json();expect(await (await send(retry)).json()).toEqual(response)
 expect((await send(request(`${base}/review`,'POST',{...scope,decision:'approve',approvedMinutes:120,reason:null},coordinator))).status).toBe(409)
 expect((await send(request(`${base}/review`,'POST',{...scope,decision:'approve',approvedMinutes:120,reason:null,expectedDecisionId:decision.id},coordinator))).status).toBe(200)
 const result=await (await send(request(history,'GET',undefined,coordinator))).json() as {submission:{state:string};decisions:{decision:string;reason:string;response:string;responseSource:string}[]}
 expect(result.submission.state).toBe('approved')
 expect(result.decisions.map(item=>item.decision)).toEqual(['clarify','approve'])
 expect(result.decisions.find(item=>item.decision==='clarify')).toMatchObject({reason:'Was a break taken?',response:'Volunteer reported no break',responseSource:'staff_recorded'})
 expect(result.decisions.find(item=>item.decision==='approve')).toBeTruthy()
 expect(await f.execute('SELECT count(*) AS n FROM volunteer_hours_clarification_responses').first('n')).toBe(1)
 await expect(f.execute('DELETE FROM volunteer_hours_clarification_responses').run()).rejects.toThrow()
})
it('pages decision history in recorded order without exposing response text in cursors',async()=>{
 await f.execute("INSERT INTO volunteer_people VALUES('p','org-a','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_occurrences VALUES('s','org-a','a1','ax','Shift',100,200,1,'published')").run()
 await f.execute("INSERT INTO volunteer_role_requirements VALUES('org-a','s','role','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_readiness VALUES('org-a','s','role','p','ready','a',1)").run()
 await f.execute("INSERT INTO volunteer_assignments VALUES('assignment','org-a','s','p','role','confirmed',1)").run()
 await f.execute("INSERT INTO volunteer_hours_submissions VALUES('h','org-a','assignment',0,60000,0,'pending')").run()
 for(let i=0;i<102;i++)await f.execute("INSERT INTO volunteer_hours_decisions VALUES(?,'org-a','h','a','clarify',NULL,'Private question',1)",`d${String(101-i).padStart(3,'0')}`).run()
 const path=`${root}/volunteer-hours/h/history?programId=a1&locationId=ax`
 const first=await (await send(request(path))).json() as {decisions:{id:string}[];nextCursor:string}
 expect(first.decisions).toHaveLength(100);expect(first.decisions[0].id).toBe('d101');expect(first.decisions[99].id).toBe('d002')
 expect(atob(first.nextCursor.replaceAll('-','+').replaceAll('_','/'))).not.toContain('Private question')
 const second=await (await send(request(`${path}&cursor=${first.nextCursor}`))).json() as {decisions:{id:string}[];nextCursor:null}
 expect(second.decisions.map(row=>row.id)).toEqual(['d001','d000']);expect(second.nextCursor).toBeNull()
})
it('returns one scoped hours queue with attendance evidence only to reviewers',async()=>{
 await f.execute("INSERT INTO volunteer_people VALUES('p','org-a','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_occurrences VALUES('s','org-a','a1','ax','Shift',100,200,1,'published')").run()
 await f.execute("INSERT INTO volunteer_role_requirements VALUES('org-a','s','role','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_readiness VALUES('org-a','s','role','p','ready','a',1)").run()
 await f.execute("INSERT INTO volunteer_assignments VALUES('a','org-a','s','p','role','confirmed',1)").run()
 await f.execute("INSERT INTO volunteer_hours_submissions VALUES('h','org-a','a',0,7200000,0,'pending')").run()
 await f.execute("INSERT INTO volunteer_attendance VALUES('org-a','a',100,200)").run()
 const path=`${root}/volunteer-hours?programId=a1&locationId=ax`
 expect(await (await send(request(path,'GET',undefined,coordinator))).json()).toEqual({submissions:[],truncated:false,nextCursor:null})
 await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a','hours.review','a1','ax')").run()
 const result=await (await send(request(path,'GET',undefined,coordinator))).json()
 expect(result).toEqual({submissions:[{id:'h',state:'pending',startAt:0,endAt:7200000,breakMinutes:0,name:'Volunteer',title:'Shift',occurrenceStart:100,checkedInAt:100,checkedOutAt:200}],truncated:false,nextCursor:null})
})
it('pages approved service records without including submissions awaiting review',async()=>{
 await f.execute("INSERT INTO volunteer_occurrences VALUES('s','org-a','a1','ax','Shift',100,200,102,'published')").run()
 await f.execute("INSERT INTO volunteer_role_requirements VALUES('org-a','s','role','Volunteer',102)").run()
 for(let i=0;i<102;i++){
  const n=String(i).padStart(3,'0'),person=`p${n}`,assignment=`a${n}`,submission=`h${n}`
  await f.execute("INSERT INTO volunteer_people VALUES(?,'org-a','Volunteer',1)",person).run()
  await f.execute("INSERT INTO volunteer_people_scopes VALUES('org-a',?,'a1','ax')",person).run()
  await f.execute("INSERT INTO volunteer_readiness VALUES('org-a','s','role',?,'ready','a',1)",person).run()
  await f.execute("INSERT INTO volunteer_assignments VALUES(?,'org-a','s',?,'role','confirmed',1)",assignment,person).run()
  await f.execute("INSERT INTO volunteer_attendance VALUES('org-a',?,1,2)",assignment).run()
  await f.execute("INSERT INTO volunteer_waitlist VALUES(?,'org-a','s','role',?,'a',?,'fixture',1,'waiting')",`w${n}`,person,owner.principal.sessionId).run()
  await f.execute("INSERT INTO volunteer_correction_requests VALUES(?,'org-a',?,'Review','a',?,'fixture',1)",`c${n}`,assignment,owner.principal.sessionId).run()
  await f.execute("INSERT INTO volunteer_hours_submissions VALUES(?,'org-a',?,0,60000,0,?)",submission,assignment,i===101?'pending':'approved').run()
  if(i!==101)await f.execute("INSERT INTO volunteer_hours_decisions VALUES(?,'org-a',?,'a','approve',1,NULL,1)",`d${n}`,submission).run()
 }
 const path=`${root}/volunteer-service-history?programId=a1&locationId=ax`
 const first=await (await send(request(path))).json() as {records:{submissionId:string}[];nextCursor:string|null}
 expect(first.records).toHaveLength(100);expect(first.nextCursor).toBe('h099')
 const second=await (await send(request(`${path}&cursor=${first.nextCursor}`))).json() as {records:{submissionId:string}[];nextCursor:string|null}
 expect(second.records.map(record=>record.submissionId)).toEqual(['h100']);expect(second.nextCursor).toBeNull()
 await f.execute("INSERT INTO volunteer_role_requirements VALUES('org-a','s','role2','Other role',1)").run()
 await f.execute("INSERT INTO volunteer_readiness VALUES('org-a','s','role2','p000','ready','a',1)").run()
 for(const [kind,url,property] of [
  ['people',`${root}/volunteers?programId=a1&locationId=ax`,'volunteers'],
  ['readiness',`${root}/volunteer-readiness?programId=a1&locationId=ax`,'cases'],
  ['hours',`${root}/volunteer-hours?programId=a1&locationId=ax`,'submissions'],
  ['waitlist',`${root}/volunteer-occurrences/s/waitlist?programId=a1&locationId=ax`,'entries'],
  ['corrections',`${root}/volunteer-corrections?programId=a1&locationId=ax`,'corrections'],
 ] as const){
  const page=await (await send(request(url))).json() as {nextCursor:string;truncated:boolean;[key:string]:unknown}
  expect(page[property],kind).toHaveLength(100);expect(page.truncated,kind).toBe(true)
  expect(atob(page.nextCursor.replaceAll('-','+').replaceAll('_','/')),kind).not.toContain('Volunteer')
  const rest=await (await send(request(`${url}&cursor=${page.nextCursor}`))).json() as {nextCursor:null;[key:string]:unknown}
  expect(rest[property],kind).toHaveLength(kind==='readiness'?3:2);expect(rest.nextCursor,kind).toBeNull()
  expect((await send(request(`${url}&cursor=bad`))).status,kind).toBe(400)
 }
 const searchPath=`${root}/volunteers/search`,searchBody={programId:'a1',locationId:'ax',search:'Volunteer'}
 const searchFirst=await (await send(request(searchPath,'POST',searchBody))).json() as {volunteers:{id:string}[];nextCursor:string}
 expect(searchFirst.volunteers).toHaveLength(100);expect(atob(searchFirst.nextCursor.replaceAll('-','+').replaceAll('_','/'))).not.toContain('Volunteer')
 const searchNext=await (await send(request(searchPath,'POST',{...searchBody,cursor:searchFirst.nextCursor}))).json() as {volunteers:{id:string}[];nextCursor:null}
 expect(searchNext.volunteers).toHaveLength(2);expect(searchNext.nextCursor).toBeNull()
 expect((await send(request(searchPath,'POST',{...searchBody,search:'Someone',cursor:searchFirst.nextCursor}))).status).toBe(400)
 for(let i=0;i<101;i++)await f.execute("INSERT INTO volunteer_occurrences VALUES(?,'org-a','a1','ax','Shift',100,200,1,'draft')",`shift${String(i).padStart(3,'0')}`).run()
 const schedule=`${root}/volunteer-schedule?programId=a1&locationId=ax&from=0&until=300`
 const scheduleFirst=await (await send(request(schedule))).json() as {occurrences:{id:string}[];nextCursor:string}
 const scheduleNext=await (await send(request(`${schedule}&cursor=${scheduleFirst.nextCursor}`))).json() as {occurrences:{id:string}[];nextCursor:null}
 expect(scheduleFirst.occurrences).toHaveLength(100);expect(scheduleNext.occurrences).toHaveLength(2);expect(scheduleNext.nextCursor).toBeNull()
 expect(new Set([...scheduleFirst.occurrences,...scheduleNext.occurrences].map(row=>row.id)).size).toBe(102)
 expect((await send(request(`${root}/volunteer-schedule?programId=a1&locationId=ax&from=0&until=301&cursor=${scheduleFirst.nextCursor}`))).status).toBe(400)
})
it('carries a staff-assisted attendance entry through the scoped hours queue and approval',async()=>{
 await f.execute("INSERT INTO volunteer_people VALUES('p','org-a','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_occurrences VALUES('s','org-a','a1','ax','Shift',100,200,1,'published')").run()
 await f.execute("INSERT INTO volunteer_role_requirements VALUES('org-a','s','role','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_readiness VALUES('org-a','s','role','p','ready','a',1)").run()
 for(const action of ['assignment.manage','attendance.manage','hours.review']) await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a',?,'a1','ax')",action).run()
 const scope={programId:'a1',locationId:'ax'}
 const created=await send(request(`${root}/volunteer-assignments`,'POST',{...scope,occurrenceId:'s',personId:'p',roleId:'role'},coordinator));expect(created.status).toBe(201)
 const {id}=await created.json() as {id:string}
 expect((await send(request(`${root}/volunteer-assignments/${id}/check-in`,'POST',scope,coordinator))).status).toBe(200)
 f.advance(7200000)
 expect((await send(request(`${root}/volunteer-assignments/${id}/check-out`,'POST',scope,coordinator))).status).toBe(200)
 const entry={...scope,startAt:0,endAt:7200000,breakMinutes:0}
 const submitted=await send(request(`${root}/volunteer-assignments/${id}/hours`,'POST',entry,coordinator));expect(submitted.status).toBe(201)
 const submission=await submitted.json() as {id:string}
 const queue=await (await send(request(`${root}/volunteer-hours?programId=a1&locationId=ax`,'GET',undefined,coordinator))).json() as {submissions:{id:string;state:string}[]}
 expect(queue.submissions).toMatchObject([{id:submission.id,state:'pending'}])
 const history=`${root}/volunteer-service-history?programId=a1&locationId=ax`
 expect(await (await send(request(history,'GET',undefined,coordinator))).json()).toEqual({records:[],nextCursor:null})
 const reviewed=await send(request(`${root}/volunteer-hours/${submission.id}/review`,'POST',{...scope,decision:'approve',approvedMinutes:120,reason:null},coordinator));expect(reviewed.status).toBe(200)
 const decision=await reviewed.json() as {id:string}
 expect(await f.execute('SELECT state FROM volunteer_hours_submissions WHERE id=?',submission.id).first('state')).toBe('approved')
 expect(await (await send(request(history,'GET',undefined,coordinator))).json()).toMatchObject({records:[{submissionId:submission.id,assignmentId:id,personId:'p',name:'Volunteer',occurrenceId:'s',title:'Shift',role:'Volunteer',decisionId:decision.id,approvedMinutes:120}],nextCursor:null})
 const correctionPath=`${root}/volunteer-assignments/${id}/corrections`,correctionRequest=request(correctionPath,'POST',{...scope,reason:'Arrival time was recorded early'},coordinator),correctionRetry=correctionRequest.clone()
 const correctionResponse=await send(correctionRequest);expect(correctionResponse.status).toBe(201);const correction=await correctionResponse.json() as {id:string}
 expect(await (await send(correctionRetry)).json()).toEqual(correction)
 expect(await (await send(request(history,'GET',undefined,coordinator))).json()).toMatchObject({records:[{submissionId:submission.id,approvedMinutes:120,correctionPending:true}]})
 const queuePath=`${root}/volunteer-corrections?programId=a1&locationId=ax`
 expect(await (await send(request(queuePath,'GET',undefined,coordinator))).json()).toMatchObject({corrections:[{id:correction.id,latestDecisionId:decision.id,approvedMinutes:120}]})
 const recorded=await f.execute('SELECT checked_in_at,checked_out_at FROM volunteer_attendance WHERE assignment_id=?',id).first<{checked_in_at:number;checked_out_at:number}>()
 const resolution={...scope,expectedDecisionId:decision.id,checkedInAt:recorded!.checked_in_at+60_000,checkedOutAt:recorded!.checked_out_at,approvedMinutes:119,reason:'Corrected arrival'}
 const resolutionPath=`${root}/volunteer-corrections/${correction.id}/resolve`
 expect((await send(request(resolutionPath,'POST',{...resolution,expectedDecisionId:'stale'},coordinator))).status).toBe(409)
 const resolutionRequest=request(resolutionPath,'POST',resolution,coordinator),resolutionRetry=resolutionRequest.clone()
 const resolved=await send(resolutionRequest);expect(resolved.status).toBe(200);expect(await (await send(resolutionRetry)).json()).toEqual(await resolved.json())
 expect(await (await send(request(queuePath,'GET',undefined,coordinator))).json()).toEqual({corrections:[],truncated:false,nextCursor:null})
 expect(await (await send(request(history,'GET',undefined,coordinator))).json()).toMatchObject({records:[{submissionId:submission.id,approvedMinutes:119,correctionPending:false}]})
 expect(await f.execute('SELECT checked_in_at,checked_out_at FROM volunteer_attendance WHERE assignment_id=?',id).first()).toEqual(recorded)
 expect(await f.execute('SELECT count(*) AS n FROM volunteer_hours_decisions WHERE submission_id=?',submission.id).first('n')).toBe(2)
 await expect(f.execute('DELETE FROM volunteer_correction_requests WHERE id=?',correction.id).run()).rejects.toThrow()
 await expect(f.execute('DELETE FROM volunteer_correction_resolutions WHERE correction_id=?',correction.id).run()).rejects.toThrow()
 const correctedRoster=await (await send(request(`${root}/volunteer-occurrences/s/roster?programId=a1&locationId=ax`,'GET',undefined,coordinator))).json()
 expect(correctedRoster).toMatchObject({volunteers:[{checkedInAt:recorded!.checked_in_at+60_000,checkedOutAt:recorded!.checked_out_at}]})
 expect(await (await send(request(`${history}&personId=other`,'GET',undefined,coordinator))).json()).toEqual({records:[],nextCursor:null})
 expect(await (await send(request(`${root}/volunteer-service-history?programId=a1&locationId=ay`,'GET',undefined,coordinator))).json()).toEqual({records:[],nextCursor:null})
 await f.execute("DELETE FROM volunteer_grants WHERE membership_id='md-a' AND action='hours.review'").run()
 expect(await (await send(request(history,'GET',undefined,coordinator))).json()).toEqual({records:[],nextCursor:null})
})
it('records a missing checkout as a correction without inventing an approval',async()=>{
 await f.execute("INSERT INTO volunteer_people VALUES('p','org-a','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_occurrences VALUES('s','org-a','a1','ax','Shift',100,200,1,'published')").run()
 await f.execute("INSERT INTO volunteer_role_requirements VALUES('org-a','s','role','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_readiness VALUES('org-a','s','role','p','ready','a',1)").run()
 await f.execute("INSERT INTO volunteer_assignments VALUES('assignment','org-a','s','p','role','confirmed',1)").run()
 await f.execute("INSERT INTO volunteer_attendance VALUES('org-a','assignment',100,NULL)").run()
 await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a','attendance.manage','a1','ax')").run()
 const scope={programId:'a1',locationId:'ax'},submissionPath=`${root}/volunteer-assignments/assignment/hours`
 expect((await send(request(submissionPath,'POST',{...scope,startAt:0,endAt:60000,breakMinutes:0},coordinator))).status).toBe(409)
 const requested=await send(request(`${root}/volunteer-assignments/assignment/corrections`,'POST',{...scope,reason:'Forgot checkout'},coordinator));expect(requested.status).toBe(201)
 const correction=await requested.json() as {id:string}
 const resolutionPath=`${root}/volunteer-corrections/${correction.id}/resolve`,body={...scope,expectedDecisionId:null,checkedInAt:100,checkedOutAt:200,approvedMinutes:null,reason:'Confirmed departure'}
 expect(await (await send(request(`${root}/volunteer-corrections?programId=a1&locationId=ax`,'GET',undefined,coordinator))).json()).toEqual({corrections:[],truncated:false,nextCursor:null})
 expect((await send(request(resolutionPath,'POST',body,coordinator))).status).toBe(409)
 await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a','hours.review','a1','ax')").run()
 const resolved=await send(request(resolutionPath,'POST',body,coordinator));expect(resolved.status).toBe(200)
 expect(await f.execute("SELECT checked_out_at FROM volunteer_attendance WHERE assignment_id='assignment'").first('checked_out_at')).toBeNull()
 expect(await f.execute('SELECT count(*) AS n FROM volunteer_hours_decisions').first('n')).toBe(0)
 expect(await (await send(request(`${root}/volunteer-assignments/assignment/check-out`,'POST',scope,coordinator))).json()).toEqual({checkedOutAt:200})
 expect((await send(request(submissionPath,'POST',{...scope,startAt:0,endAt:60000,breakMinutes:0},coordinator))).status).toBe(201)
})
it('shows readiness cases only to reviewers with the matching scope',async()=>{
 await f.execute("INSERT INTO volunteer_people VALUES('p','org-a','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_occurrences VALUES('s','org-a','a1','ax','Shift',100,200,1,'published')").run()
 await f.execute("INSERT INTO volunteer_role_requirements VALUES('org-a','s','role','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_readiness VALUES('org-a','s','role','p','pending',NULL,NULL)").run()
 const path=`${root}/volunteer-readiness?programId=a1&locationId=ax`
 expect(await (await send(request(path,'GET',undefined,coordinator))).json()).toEqual({cases:[],truncated:false,nextCursor:null})
 await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a','readiness.review','a1','ax')").run()
 const response=await send(request(path,'GET',undefined,coordinator));expect(response.status).toBe(200)
 expect(await response.json()).toEqual({cases:[{occurrenceId:'s',roleId:'role',personId:'p',name:'Volunteer',role:'Volunteer',title:'Shift',startsAt:100,state:'pending',reviewedAt:null,latestDecisionId:null}],truncated:false,nextCursor:null})
 await f.execute("UPDATE organization_memberships SET state='revoked',version=version+1 WHERE id='md-a'").run()
 expect(await (await send(request(path,'GET',undefined,coordinator))).json()).toEqual({cases:[],truncated:false,nextCursor:null})
})
it('authenticates readiness decisions, replays safely and rejects forged scope',async()=>{
 await f.execute("INSERT INTO volunteer_people VALUES('p','org-a','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_occurrences VALUES('s','org-a','a1','ax','Shift',100,200,1,'published')").run()
 await f.execute("INSERT INTO volunteer_role_requirements VALUES('org-a','s','role','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_readiness VALUES('org-a','s','role','p','pending',NULL,NULL)").run()
 const path=`${root}/volunteer-readiness/decision`,body={occurrenceId:'s',roleId:'role',personId:'p',programId:'a1',locationId:'ax',state:'ready',evidenceNote:'Reviewed agreement'}
 expect((await send(request(path,'POST',body,coordinator))).status).toBe(409)
 await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a','readiness.review','a1','ax')").run()
 const noCsrf=request(path,'POST',body,coordinator);noCsrf.headers.delete('X-CSRF-Token')
 expect((await send(noCsrf)).status).toBe(403)
 expect((await send(request(path,'POST',{...body,organizationId:'org-b'},coordinator))).status).toBe(400)
 const valid=request(path,'POST',body,coordinator),retry=valid.clone()
 const first=await send(valid);expect(first.status).toBe(200);const result=await first.json()
 const second=await send(retry);expect(second.status).toBe(200);expect(await second.json()).toEqual(result)
 expect(await f.execute('SELECT count(*) AS n FROM volunteer_readiness_decisions').first('n')).toBe(1)
})
it('creates a draft occurrence through scoped authenticated requests',async()=>{
 const path=`${root}/volunteer-schedule`,body={programId:'a1',locationId:'ax',title:'Shift',startsAt:100,endsAt:200,capacity:2}
 expect((await send(request(path,'POST',body,coordinator))).status).toBe(409)
 await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a','schedule.manage','a1','ax')").run()
 const invalid=request(path,'POST',{...body,organizationId:'org-b'},coordinator);expect((await send(invalid)).status).toBe(400)
 const req=request(path,'POST',body,coordinator),retry=req.clone()
 const first=await send(req);expect(first.status).toBe(201);const result=await first.json()
 const second=await send(retry);expect(second.status).toBe(201);expect(await second.json()).toEqual(result)
 expect(await f.execute("SELECT count(*) AS n FROM volunteer_occurrences WHERE status='draft'").first('n')).toBe(1)
})
it('creates a role within an authorized draft occurrence',async()=>{
 await f.execute("INSERT INTO volunteer_occurrences VALUES('s','org-a','a1','ax','Shift',100,200,2,'draft')").run()
 const path=`${root}/volunteer-occurrences/s/roles`,body={programId:'a1',locationId:'ax',name:'Lead',capacity:1}
 expect((await send(request(path,'POST',body,coordinator))).status).toBe(409)
 await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a','schedule.manage','a1','ax')").run()
 const valid=request(path,'POST',body,coordinator),retry=valid.clone()
 const first=await send(valid);expect(first.status).toBe(201);const result=await first.json()
 const second=await send(retry);expect(second.status).toBe(201);expect(await second.json()).toEqual(result)
 expect(await f.execute("SELECT count(*) AS n FROM volunteer_role_requirements WHERE occurrence_id='s'").first('n')).toBe(1)
})
it('creates, configures and publishes a scoped occurrence',async()=>{
 await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a','schedule.manage','a1','ax')").run()
 const scope={programId:'a1',locationId:'ax'}
 const created=await send(request(`${root}/volunteer-schedule`,'POST',{...scope,title:'Shift',startsAt:100,endsAt:200,capacity:2},coordinator));expect(created.status).toBe(201)
 const occurrence=await created.json() as {id:string}
 const path=`${root}/volunteer-occurrences/${occurrence.id}`
 expect((await send(request(`${path}/publish`,'POST',scope,coordinator))).status).toBe(409)
 expect((await send(request(`${path}/roles`,'POST',{...scope,name:'Lead',capacity:1},coordinator))).status).toBe(201)
 const publish=request(`${path}/publish`,'POST',scope,coordinator),retry=publish.clone()
 expect((await send(publish)).status).toBe(200)
 expect((await send(retry)).status).toBe(200)
 expect(await f.execute("SELECT count(*) AS n FROM volunteer_occurrence_events WHERE action='occurrence.publish'").first('n')).toBe(1)
})
it('reads occurrence roles only in the authorized program and location',async()=>{
 await f.execute("INSERT INTO volunteer_occurrences VALUES('s','org-a','a1','ax','Shift',100,200,2,'draft')").run()
 await f.execute("INSERT INTO volunteer_role_requirements VALUES('org-a','s','role','Lead',1)").run()
 const path=`${root}/volunteer-occurrences/s`
 const response=await send(request(`${path}?programId=a1&locationId=ax`,'GET',undefined,coordinator))
 expect(response.status).toBe(200)
 expect(await response.json()).toMatchObject({occurrence:{id:'s',title:'Shift',assigned:0},roles:[{id:'role',name:'Lead',capacity:1,assigned:0}],truncated:false})
 expect((await send(request(`${path}?programId=a1&locationId=ay`,'GET',undefined,coordinator))).status).toBe(404)
 expect((await send(request(path,'GET',undefined,coordinator))).status).toBe(400)
})
it('opens readiness, records review and assigns an eligible volunteer',async()=>{
 await f.execute("INSERT INTO volunteer_people VALUES('p','org-a','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_people_scopes VALUES('org-a','p','a1','ax')").run()
 await f.execute("INSERT INTO volunteer_occurrences VALUES('s','org-a','a1','ax','Shift',100,200,1,'published')").run()
 await f.execute("INSERT INTO volunteer_role_requirements VALUES('org-a','s','role','Volunteer',1)").run()
 for(const action of ['readiness.review','assignment.manage']) await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a',?,'a1','ax')",action).run()
 const identity={occurrenceId:'s',roleId:'role',personId:'p',programId:'a1',locationId:'ax'}
 const assignment=()=>request(`${root}/volunteer-assignments`,'POST',identity,coordinator)
 expect((await send(assignment())).status).toBe(409)
 expect((await send(request(`${root}/volunteer-readiness`,'POST',identity,coordinator))).status).toBe(201)
 expect((await send(request(`${root}/volunteer-readiness/decision`,'POST',{...identity,state:'ready',evidenceNote:'Reviewed agreement'},coordinator))).status).toBe(200)
 expect((await send(assignment())).status).toBe(201)
 expect(await f.execute("SELECT state FROM volunteer_readiness WHERE person_id='p'").first('state')).toBe('ready')
})
it('applies newer readiness decisions to an existing roster and rejects stale reviews',async()=>{
 await f.execute("INSERT INTO volunteer_people VALUES('p','org-a','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_people_scopes VALUES('org-a','p','a1','ax')").run()
 await f.execute("INSERT INTO volunteer_occurrences VALUES('s','org-a','a1','ax','Shift',100,200,1,'published')").run()
 await f.execute("INSERT INTO volunteer_role_requirements VALUES('org-a','s','role','Volunteer',1)").run()
 for(const action of ['readiness.review','assignment.manage','attendance.manage'])await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a',?,'a1','ax')",action).run()
 const scope={programId:'a1',locationId:'ax'},identity={...scope,occurrenceId:'s',roleId:'role',personId:'p'},path=`${root}/volunteer-readiness/decision`
 expect((await send(request(`${root}/volunteer-readiness`,'POST',identity,coordinator))).status).toBe(201)
 const ready=await send(request(path,'POST',{...identity,state:'ready',evidenceNote:'Reviewed'},coordinator));expect(ready.status).toBe(200)
 const first=await ready.json() as {id:string}
 const assignment=await send(request(`${root}/volunteer-assignments`,'POST',identity,coordinator));expect(assignment.status).toBe(201)
 const {id}=await assignment.json() as {id:string}
 const blocked=await send(request(path,'POST',{...identity,state:'blocked',evidenceNote:'Requirement changed',expectedDecisionId:first.id},coordinator));expect(blocked.status).toBe(200)
 const second=await blocked.json() as {id:string}
 expect((await send(request(path,'POST',{...identity,state:'ready',evidenceNote:'Stale review',expectedDecisionId:first.id},coordinator))).status).toBe(409)
 const roster=await (await send(request(`${root}/volunteer-occurrences/s/roster?programId=a1&locationId=ax`,'GET',undefined,coordinator))).json() as {volunteers:{readiness:string}[]}
 expect(roster.volunteers[0].readiness).toBe('blocked')
 expect((await send(request(`${root}/volunteer-assignments/${id}/check-in`,'POST',scope,coordinator))).status).toBe(409)
 expect((await send(request(path,'POST',{...identity,state:'ready',evidenceNote:'Requirement resolved',expectedDecisionId:second.id},coordinator))).status).toBe(200)
 expect((await send(request(`${root}/volunteer-assignments/${id}/check-in`,'POST',scope,coordinator))).status).toBe(200)
 expect(await f.execute('SELECT count(*) AS n FROM volunteer_readiness_decisions').first('n')).toBe(3)
})
it('checks role evidence through the full shift and reflects revocation on the roster',async()=>{
 await f.execute("INSERT INTO volunteer_people VALUES('p','org-a','Volunteer',1)").run()
 await f.execute("INSERT INTO volunteer_people_scopes VALUES('org-a','p','a1','ax')").run()
 await f.execute("INSERT INTO volunteer_occurrences VALUES('s','org-a','a1','ax','Shift',100,200,1,'draft')").run()
 await f.execute("INSERT INTO volunteer_role_requirements VALUES('org-a','s','role','Volunteer',1)").run()
 for(const action of ['schedule.manage','readiness.review','assignment.manage','attendance.manage'])await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a',?,'a1','ax')",action).run()
 const scope={programId:'a1',locationId:'ax'},identity={...scope,occurrenceId:'s',roleId:'role',personId:'p'},criterionPath=`${root}/volunteer-occurrences/s/roles/role/criteria`
 const criterionRequest=request(criterionPath,'POST',{...scope,name:'Waiver'},coordinator),criterionRetry=criterionRequest.clone()
 const criterionResponse=await send(criterionRequest);expect(criterionResponse.status).toBe(201)
 const criterion=await criterionResponse.json() as {id:string}
 expect(await (await send(criterionRetry)).json()).toEqual(criterion)
 const detail=await (await send(request(`${root}/volunteer-occurrences/s?programId=a1&locationId=ax`,'GET',undefined,coordinator))).json()
 expect(detail).toMatchObject({criteria:[{id:criterion.id,roleId:'role',name:'Waiver'}],criteriaTruncated:false})
 expect((await send(request(`${root}/volunteer-occurrences/s/publish`,'POST',scope,coordinator))).status).toBe(200)
 expect((await send(request(criterionPath,'POST',{...scope,name:'Late criterion'},coordinator))).status).toBe(409)
 expect((await send(request(`${root}/volunteer-readiness`,'POST',identity,coordinator))).status).toBe(201)
 expect((await send(request(`${root}/volunteer-readiness/decision`,'POST',{...identity,state:'ready',evidenceNote:'Manual review'},coordinator))).status).toBe(200)
 const assign=()=>request(`${root}/volunteer-assignments`,'POST',identity,coordinator)
 expect((await send(assign())).status).toBe(409)
 const evidencePath=`${root}/volunteer-readiness/evidence`,base={...identity,criterionId:criterion.id,state:'verified',validFrom:0,validUntil:150,note:'Private waiver reference',expectedEvidenceId:null}
 const denied=request(evidencePath,'POST',base,coordinator);denied.headers.delete('X-CSRF-Token');expect((await send(denied)).status).toBe(403)
 const evidenceRequest=request(evidencePath,'POST',base,coordinator),evidenceRetry=evidenceRequest.clone()
 const evidence=await send(evidenceRequest);expect(evidence.status).toBe(201)
 const first=await evidence.json() as {id:string}
 expect(await (await send(evidenceRetry)).json()).toEqual(first)
 const readiness=await (await send(request(`${root}/volunteer-readiness?programId=a1&locationId=ax`,'GET',undefined,coordinator))).json()
 expect(readiness).toMatchObject({cases:[{state:'expiring'}]})
 expect((await send(assign())).status).toBe(409)
 const renewed=await send(request(evidencePath,'POST',{...base,validUntil:200,expectedEvidenceId:first.id},coordinator));expect(renewed.status).toBe(201)
 const second=await renewed.json() as {id:string}
 const assignment=await send(assign());expect(assignment.status).toBe(201);const {id}=await assignment.json() as {id:string}
 expect((await send(request(evidencePath,'POST',{...base,state:'revoked',validFrom:null,validUntil:null,expectedEvidenceId:first.id},coordinator))).status).toBe(409)
 expect((await send(request(evidencePath,'POST',{...base,state:'revoked',validFrom:null,validUntil:null,expectedEvidenceId:second.id},coordinator))).status).toBe(201)
 const roster=await send(request(`${root}/volunteer-occurrences/s/roster?programId=a1&locationId=ax`,'GET',undefined,coordinator))
 const rosterText=await roster.text();expect(rosterText).toContain('requirements_missing');expect(rosterText).not.toContain('Private waiver reference')
 expect((await send(request(`${root}/volunteer-assignments/${id}/check-in`,'POST',scope,coordinator))).status).toBe(409)
 const query=`?programId=a1&locationId=ax&occurrenceId=s&roleId=role&personId=p`
 expect(await (await send(request(evidencePath+query,'GET',undefined,coordinator))).json()).toMatchObject({criteria:[{id:criterion.id,state:'revoked'}]})
 await f.execute("DELETE FROM volunteer_grants WHERE membership_id='md-a' AND action='readiness.review'").run()
 expect(await (await send(request(evidencePath+query,'GET',undefined,coordinator))).json()).toEqual({criteria:[],truncated:false})
})
it('creates a volunteer and opens their readiness case using scoped permissions',async()=>{
 await f.execute("INSERT INTO volunteer_occurrences VALUES('s','org-a','a1','ax','Shift',100,200,1,'published')").run()
 await f.execute("INSERT INTO volunteer_role_requirements VALUES('org-a','s','role','Volunteer',1)").run()
 const scope={programId:'a1',locationId:'ax'}
 for(const action of ['people.create','readiness.review']) await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a',?,'a1','ax')",action).run()
 const path=`${root}/volunteers`,body={...scope,displayName:'Volunteer'}
 const denied=request(path,'POST',body,coordinator);denied.headers.delete('X-CSRF-Token');expect((await send(denied)).status).toBe(403)
 const original=request(path,'POST',body,coordinator),retry=original.clone()
 const response=await send(original);expect(response.status).toBe(201);const person=await response.json() as {id:string}
 expect(await (await send(retry)).json()).toEqual(person)
 const opened=await send(request(`${root}/volunteer-readiness`,'POST',{...scope,personId:person.id,occurrenceId:'s',roleId:'role'},coordinator))
 expect(opened.status).toBe(201)
 expect(await f.execute('SELECT count(*) AS n FROM volunteer_people_events').first('n')).toBe(1)
})
it('searches scoped volunteers using a read grant without granting creation',async()=>{
 for(const [id,name,location] of [['p','Alice Sample','ax'],['q','Bob Sample','ax'],['r','Alice Hidden','ay']] as const){
  await f.execute("INSERT INTO volunteer_people VALUES(?,'org-a',?,1)",id,name).run()
  await f.execute("INSERT INTO volunteer_people_scopes VALUES('org-a',?,'a1',?)",id,location).run()
 }
 await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a','people.read','a1','ax')").run()
 const path=`${root}/volunteers/search`,body={programId:'a1',locationId:'ax',search:'AL'}
 const noCsrf=request(path,'POST',body,coordinator);noCsrf.headers.delete('X-CSRF-Token');expect((await send(noCsrf)).status).toBe(403)
 const found=await send(request(path,'POST',body,coordinator));expect(found.status).toBe(200)
 expect(await found.json()).toEqual({volunteers:[{id:'p',displayName:'Alice Sample'}],truncated:false,nextCursor:null})
 expect((await send(request(path,'POST',{...body,search:'a'},coordinator))).status).toBe(400)
 expect((await send(request(path,'POST',{...body,role:'admin'},coordinator))).status).toBe(400)
 expect((await send(request(`${root}/volunteers`,'POST',{programId:'a1',locationId:'ax',displayName:'New'},coordinator))).status).toBe(409)
 expect((await send(request(path,'GET',undefined,coordinator))).status).toBe(405)
})
