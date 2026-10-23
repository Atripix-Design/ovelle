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
