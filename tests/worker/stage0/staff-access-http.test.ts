import {beforeEach,expect,it} from 'vitest'
import {databaseFixture} from './database'
import {issueSession,type IssuedSession} from '../../../src/cloudflare/stage0/auth/sessions'
import {passkeyFixture} from './passkey-fixture'
import {beginPasskeyRegistration,finishPasskeyRegistration} from '../../../src/cloudflare/stage0/auth/passkeys/service'
import {handleStaffAccessRequest} from '../../../src/cloudflare/stage0/staff/access-routes'
let f:Awaited<ReturnType<typeof databaseFixture>>,owner:IssuedSession,admin:IssuedSession,coordinator:IssuedSession,native:IssuedSession,otherNative:IssuedSession
let key=0
const root='/api/v1/organizations/org-a',members=`${root}/memberships`,transfers=`${root}/ownership-transfer`
const grant={action:'program.read',scope:{kind:'program_location',programId:'a1'}}
function request(path=members,method='GET',body?:unknown,session=owner,extra:Record<string,string>={}){
 const headers:Record<string,string>={...(session.principal.transport==='browser'?{Cookie:`ovelle_local_session=${session.token}`,Origin:f.ctx.config.origin,'X-CSRF-Token':session.csrfToken!}:{Authorization:`Bearer ${session.token}`}),...extra}
 if(body!==undefined){headers['Content-Type']='application/json';headers['Idempotency-Key']=`staff-access-http-command-${++key}`}
 return new Request(f.ctx.config.origin+path,{method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{})})
}
const send=(req:Request,transport:'browser'|'desktop'='browser')=>handleStaffAccessRequest(f.ctx,req,transport)
async function transfer(){const response=await send(request(transfers,'POST',{targetMembershipId:'mc-a',expectedOwnerVersion:1,expectedTargetVersion:1}));expect(response.status).toBe(201);return await response.json() as {id:string;version:number}}
beforeEach(async()=>{
 key=0;f=await databaseFixture()
 owner=await issueSession(f.ctx,{accountId:'a',method:'passkey'},'browser')
 admin=await issueSession(f.ctx,{accountId:'c',method:'passkey'},'browser')
 coordinator=await issueSession(f.ctx,{accountId:'d',method:'password'},'browser')
 native=await issueSession(f.ctx,{accountId:'a',method:'passkey'},'desktop')
 otherNative=await issueSession(f.ctx,{accountId:'d',method:'password'},'desktop')
 await f.execute("INSERT INTO passkey_users(account_id,user_handle) VALUES('c',?)",'c'.repeat(43)).run()
 await f.execute("INSERT INTO passkey_credentials(id,account_id,public_key,counter,device_type,backed_up,transports,name,created_at) VALUES('target-key','c','AA',0,'singleDevice',0,'[]','Fixture',?)",f.ctx.clock.now()).run()
 await f.execute("INSERT INTO organization_memberships(id,organization_id,account_id,preset) VALUES('md-b','org-b','d','coordinator')").run()
})
it('composes authorized list/detail and versioned grant replacement with safe retry',async()=>{
 expect((await send(request())).status).toBe(200)
 const detail=await send(request(`${members}/md-a`));expect(detail.status).toBe(200);expect(await detail.json()).toMatchObject({accountId:'d',grants:[]})
 const patch=request(`${members}/md-a/grants`,'PATCH',{expectedVersion:1,grants:[grant]}),retry=patch.clone()
 const result=await send(patch);expect(result.status).toBe(200);expect(await result.json()).toMatchObject({version:2})
 expect((await send(retry)).status).toBe(200)
 expect(await f.execute("SELECT count(*) AS n FROM audit_events WHERE action='membership.grants'").first('n')).toBe(1)
 expect((await send(request(`${members}/md-a/grants`,'PATCH',{expectedVersion:1,grants:[]}))).status).toBe(409)
})
it('revokes existing browser/native organization access on their next request, retaining other organizations',async()=>{
 for(const [session,transport] of [[coordinator,'browser'],[otherNative,'desktop']] as const)expect((await send(request(members,'GET',undefined,session),transport)).status).toBe(200)
 expect((await send(request(`${members}/md-a/revoke`,'POST',{expectedVersion:1}))).status).toBe(200)
 for(const [session,transport] of [[coordinator,'browser'],[otherNative,'desktop']] as const){
 expect((await send(request(members,'GET',undefined,session),transport)).status).toBe(404)
 expect((await send(request('/api/v1/organizations/org-b/memberships','GET',undefined,session),transport)).status).toBe(200)
 }
})
it('allows native mutations only with fixed native credentials and preserves administrator role requirements',async()=>{
 expect((await send(request(`${members}/mc-a/grants`,'PATCH',{expectedVersion:1,preset:'coordinator',grants:[grant]},native),'desktop')).status).toBe(200)
 const promoted=await send(request(`${members}/mc-a/grants`,'PATCH',{expectedVersion:2,preset:'admin',grants:[]},native),'desktop')
 expect(promoted.status).toBe(200);expect(await promoted.json()).toMatchObject({preset:'admin',version:3})
 expect((await send(request(`${members}/mc-a/grants`,'PATCH',{expectedVersion:3,preset:'coordinator',grants:[]},admin))).status).toBe(403)
})
it('requires current organization authority and ignores no forged DTO field',async()=>{
 expect((await send(request('/api/v1/organizations/org-b/memberships'))).status).toBe(404)
 expect((await send(request(`${members}/mc-b`))).status).toBe(404)
 expect((await send(request('/api/v1/organizations/org-b/memberships/mc-b/grants','PATCH',{expectedVersion:1,grants:[]},admin))).status).toBe(403)
 expect((await send(request(`${members}/md-a/grants`,'PATCH',{expectedVersion:1,grants:[grant]},coordinator))).status).toBe(403)
 expect((await send(request(`${members}/owner%3Aorg-a/revoke`,'POST',{expectedVersion:1}))).status).toBe(403)
 for(const field of ['principal','organizationId','membershipId','assurance','transport','requestDigest'])expect((await send(request(`${members}/md-a/grants`,'PATCH',{expectedVersion:1,grants:[],[field]:'forged'}))).status).toBe(400)
 expect(await f.execute("SELECT version FROM organization_memberships WHERE id='md-a'").first('version')).toBe(1)
})
it('restricts membership and transfer reads to authorized staff/participants',async()=>{
 const response=await send(request(members,'GET',undefined,coordinator));expect(await response.json()).toMatchObject({memberships:[{id:'md-a'}]})
 expect((await send(request(`${members}/mc-a`,'GET',undefined,coordinator))).status).toBe(404)
 const pending=await transfer()
 expect((await send(request(`${transfers}/${pending.id}`,'GET',undefined,admin))).status).toBe(200)
 expect((await send(request(`${transfers}/${pending.id}`,'GET',undefined,coordinator))).status).toBe(404)
})
it('requires exact origin/CSRF for every browser mutation family',async()=>{
 const commands=[request(`${members}/md-a/grants`,'PATCH',{expectedVersion:1,grants:[]}),request(`${members}/md-a/revoke`,'POST',{expectedVersion:1}),request(transfers,'POST',{targetMembershipId:'mc-a',expectedOwnerVersion:1,expectedTargetVersion:1}),request(`${transfers}/x/accept`,'POST',{expectedVersion:1}),request(`${transfers}/x/revoke`,'POST',{expectedVersion:1})]
 for(const original of commands)for(const mode of ['missing-origin','null-origin','foreign-origin','missing-csrf','wrong-csrf','cross-site']){
 const req=original.clone()
 if(mode==='missing-origin')req.headers.delete('Origin')
 if(mode==='null-origin')req.headers.set('Origin','null')
 if(mode==='foreign-origin')req.headers.set('Origin','https://evil.test')
 if(mode==='missing-csrf')req.headers.delete('X-CSRF-Token')
 if(mode==='wrong-csrf')req.headers.set('X-CSRF-Token','wrong')
 if(mode==='cross-site')req.headers.set('Sec-Fetch-Site','cross-site')
 expect((await send(req)).status).toBe(403)
 }
 expect(await f.execute('SELECT count(*) AS n FROM command_receipts').first('n')).toBe(0)
})
it('rejects mixed native/browser credentials and enrollment sessions',async()=>{
 expect((await send(request(members,'GET',undefined,native))).status).toBe(401)
 expect((await send(request(),'desktop')).status).toBe(401)
 for(const name of ['Cookie','Origin','Sec-Fetch-Site'])expect((await send(request(members,'GET',undefined,native,{[name]:'same-origin'}),'desktop')).status).toBe(401)
 const foreign=new Request('https://evil.test'+members,{headers:request().headers});expect((await send(foreign)).status).toBe(403)
 await f.execute("UPDATE accounts SET email_verified_at=NULL WHERE id='a'").run()
 const enrollment=await issueSession(f.ctx,{accountId:'a',method:'password'},'browser')
 expect((await send(request(members,'GET',undefined,enrollment))).status).toBe(404)
})
it('requires strict JSON field/type/size and command-key validation',async()=>{
 for(const body of [null,[],{}, {expectedVersion:1,grants:[],preset:null},{expectedVersion:1,grants:[{...grant,owner:true}]},{expectedVersion:1,grants:[{action:'program.read',scope:{kind:'organization',extra:'bad'}}]},{expectedVersion:'1',grants:[]},{expectedVersion:1,grants:[],preset:'owner'}])expect((await send(request(`${members}/md-a/grants`,'PATCH',body))).status).toBe(400)
 const missing=request(`${members}/md-a/grants`,'PATCH',{expectedVersion:1,grants:[]});missing.headers.delete('Idempotency-Key');expect((await send(missing)).status).toBe(400)
 const large=request(`${members}/md-a/grants`,'PATCH',{expectedVersion:1,grants:[],padding:'x'.repeat(17000)});expect((await send(large)).status).toBe(400)
 const malformed=new Request(f.ctx.config.origin+`${members}/md-a/grants`,{method:'PATCH',headers:request(members,'PATCH',{}).headers,body:'{'});expect((await send(malformed)).status).toBe(400)
 const wrong=request(`${members}/md-a/grants`,'PATCH',{});wrong.headers.set('Content-Type','text/plain');expect((await send(wrong)).status).toBe(400)
 expect(await f.execute('SELECT count(*) AS n FROM command_receipts').first('n')).toBe(0)
})
it('composes explicit ownership request/read/accept and retains the previous administrator',async()=>{
 const pending=await transfer()
 for(let i=0;i<2;i++)expect((await send(request(`${transfers}/${pending.id}`))).status).toBe(200)
 expect(await f.execute("SELECT owner_account_id FROM organizations WHERE id='org-a'").first('owner_account_id')).toBe('a')
 expect((await send(request(`${transfers}/${pending.id}/accept`,'GET',undefined,admin))).status).toBe(405)
 expect((await send(request(`${transfers}/${pending.id}/accept`,'POST',{expectedVersion:1},coordinator))).status).toBe(403)
 const accept=request(`${transfers}/${pending.id}/accept`,'POST',{expectedVersion:1},admin),retry=accept.clone()
 expect((await send(accept)).status).toBe(200);expect((await send(retry)).status).toBe(200)
 expect(await f.execute("SELECT owner_account_id FROM organizations WHERE id='org-a'").first('owner_account_id')).toBe('c')
 expect(await f.execute("SELECT preset||':'||state AS state FROM organization_memberships WHERE id='owner:org-a'").first('state')).toBe('admin:active')
})
it('composes explicit cancellation and orders concurrent accept/cancel once',async()=>{
 const pending=await transfer(),cancel=request(`${transfers}/${pending.id}/revoke`,'POST',{expectedVersion:1}),retry=cancel.clone()
 expect((await send(cancel)).status).toBe(200);expect((await send(retry)).status).toBe(200)
 expect((await send(request(`${transfers}/${pending.id}/accept`,'POST',{expectedVersion:1},admin))).status).toBe(409)
 const next=await transfer()
 const results=await Promise.all([send(request(`${transfers}/${next.id}/accept`,'POST',{expectedVersion:1},admin)),send(request(`${transfers}/${next.id}/revoke`,'POST',{expectedVersion:1}))])
 expect(results.map(r=>r.status).sort()).toEqual([200,409])
})
it('rechecks ownership version and session revocation on acceptance',async()=>{
 const pending=await transfer()
 await f.execute("UPDATE organizations SET required_connection_id=NULL,version=version+1 WHERE id='org-a'").run()
 expect((await send(request(`${transfers}/${pending.id}/accept`,'POST',{expectedVersion:1},admin))).status).toBe(409)
 await f.execute("UPDATE sessions SET revoked_at=? WHERE id=?",f.ctx.clock.now(),admin.principal.sessionId).run()
 expect((await send(request(members,'GET',undefined,admin))).status).toBe(401)
})
it('rejects unsafe methods, query parameters and malformed encoded IDs without side effects',async()=>{
 for(const [path,method,allow] of [[members,'POST','GET'],[`${members}/md-a`,'DELETE','GET'],[`${members}/md-a/grants`,'POST','PATCH'],[transfers,'GET','POST'],[`${transfers}/x/accept`,'GET','POST']] as const){const response=await send(request(path,method));expect(response.status).toBe(405);expect(response.headers.get('Allow')).toBe(allow)}
 for(const path of [`${members}?role=owner`,`${members}/%ZZ`,`${members}/a%2Fb`,`${transfers}/x%00/accept`])expect((await send(request(path,path.endsWith('accept')?'POST':'GET'))).status).toBe(400)
 expect((await send(request('/api/v1/unknown'))).status).toBe(404)
 expect(await f.execute('SELECT count(*) AS n FROM command_receipts').first('n')).toBe(0)
})
it('uses safe no-store responses and redacts unexpected failures and session/proof fields',async()=>{
 const pending=await transfer(),response=await send(request(`${transfers}/${pending.id}`))
 for(const [name,value] of [['Cache-Control','no-store'],['Referrer-Policy','no-referrer'],['X-Content-Type-Options','nosniff'],['X-Request-ID',f.ctx.requestId]])expect(response.headers.get(name)).toBe(value)
 expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false)
 const text=await response.text();for(const secret of [owner.token,owner.csrfToken!,JSON.stringify(owner.principal.sessionId),'source_session_id','token_digest','public_key'])expect(text).not.toContain(secret)
 const db=f.ctx.db;f.ctx.db=new Proxy(db,{get(target,key){if(key==='prepare')return()=>{throw new Error('private SQL bearer secret')};return Reflect.get(target,key,target)}})
 const failed=await send(request());expect(failed.status).toBe(503);expect(await failed.json()).toEqual({error:'unavailable'})
})

it('preserves source OIDC provenance through real signed passkey step-up and denies a disabled connection',async()=>{
 await f.execute("INSERT INTO identity_connections(id,protocol,provider,issuer,client_id,created_at) VALUES('google','oidc','google','https://accounts.google.com','fixture-client',1)").run()
 await f.execute("INSERT INTO external_identities(id,account_id,connection_id,issuer,subject,created_at) VALUES('google-a','a','google','https://accounts.google.com','subject-a',1)").run()
 const primary=await issueSession(f.ctx,{accountId:'a',method:'oidc',externalIdentityId:'google-a',identityVersion:1,connectionVersion:1},'browser')
 const budget=new Uint8Array(32).fill(31),start=await beginPasskeyRegistration(f.ctx,primary.principal,'127.0.0.1',budget),authenticator=await passkeyFixture()
 owner=(await finishPasskeyRegistration(f.ctx,primary.principal,start.flowToken,await authenticator.registration(start.options.challenge),'Owner fixture','127.0.0.1',budget)).session
 expect(owner.principal).toMatchObject({method:'oidc',connectionId:'google',assurance:'passkey'})
 const pending=await transfer()
 await f.execute("UPDATE identity_connections SET enabled=0,version=version+1 WHERE id='google'").run()
 expect((await send(request(`${transfers}/${pending.id}/accept`,'POST',{expectedVersion:1},admin))).status).toBe(409)
 expect(await f.execute("SELECT owner_account_id FROM organizations WHERE id='org-a'").first('owner_account_id')).toBe('a')
})
it('applies required SAML policy to existing target sessions before transfer reads or acceptance',async()=>{
 const pending=await transfer()
 await f.execute("INSERT INTO identity_connections(id,organization_id,protocol,provider,issuer,created_at) VALUES('saml-a','org-a','saml','enterprise_saml','urn:fixture:a',1)").run()
 await f.execute("UPDATE organizations SET required_connection_id='saml-a',version=version+1 WHERE id='org-a'").run()
 expect((await send(request(`${transfers}/${pending.id}`,'GET',undefined,admin))).status).toBe(404)
 expect((await send(request(`${transfers}/${pending.id}/accept`,'POST',{expectedVersion:1},admin))).status).toBe(404)
})
it('supports native target acceptance and rejects password-only and stale browser confirmation',async()=>{
 const pending=await transfer(),password=await issueSession(f.ctx,{accountId:'c',method:'password'},'browser')
 expect((await send(request(`${transfers}/${pending.id}/accept`,'POST',{expectedVersion:1},password))).status).toBe(403)
 f.advance(300000)
 expect((await send(request(`${transfers}/${pending.id}/accept`,'POST',{expectedVersion:1},admin))).status).toBe(403)
 const target=await issueSession(f.ctx,{accountId:'c',method:'passkey'},'desktop')
 expect((await send(request(`${transfers}/${pending.id}/accept`,'POST',{expectedVersion:1},target),'desktop')).status).toBe(200)
})
it('rejects unknown or missing ownership transition fields and forged target identity',async()=>{
 for(const body of [{},{targetMembershipId:'mc-a',expectedOwnerVersion:1,expectedTargetVersion:1,principal:owner.principal},{targetMembershipId:['mc-a'],expectedOwnerVersion:1,expectedTargetVersion:1}])expect((await send(request(transfers,'POST',body))).status).toBe(400)
 const pending=await transfer()
 for(const suffix of ['accept','revoke'])for(const body of [{},{expectedVersion:'1'},{expectedVersion:1,targetAccountId:'a'}])expect((await send(request(`${transfers}/${pending.id}/${suffix}`,'POST',body,admin))).status).toBe(400)
 expect(await f.execute('SELECT state FROM ownership_transfer_requests WHERE id=?',pending.id).first('state')).toBe('pending')
})
