import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createWorkflowService } from './workflow-service.ts'
const origin='https://dev.ovelle.org',token='T'.repeat(43)
const auth=async()=>({token,expiresAt:Date.now()+60_000})
const identity={account:{id:'account',email:'volunteer@example.test',displayName:'Volunteer',verifiedAt:1},session:{assurance:'authenticated',method:'oidc',authenticatedAt:1,passkeyVerifiedAt:null},csrfToken:null}

test('allows only named workflow calls and keeps the bearer in main',async()=>{
 const calls=[]
 const fetcher=async(url,init)=>{calls.push({url,init});return Response.json({occurrences:[{id:'shift'}]})}
 const service=createWorkflowService({origin,fetcher,handoff:auth,openApproval:async()=>{}})
 assert.deepEqual(await service.status(),{signedIn:false,persistent:false})
 const schedule={operation:'schedule',organizationId:'org-a',programId:'program',locationId:'site',from:1,until:100}
 await assert.rejects(service.request(schedule),/Sign in required/)
 await assert.rejects(service.request({...schedule,operation:'fetch',url:'https://evil.test'}),/Invalid/)
 await assert.rejects(service.request({...schedule,organizationId:'../other'}),/Invalid/)
 await assert.rejects(service.request({...schedule,organizationId:'..'}),/Invalid/)
 await assert.rejects(service.request({...schedule,extra:true}),/Invalid/)
 assert.equal(calls.length,0)
 assert.equal(await service.signIn(),undefined)
 assert.deepEqual(await service.status(),{signedIn:true,persistent:false})
 const result=await service.request(schedule)
 assert.deepEqual(result,{occurrences:[{id:'shift'}]});assert.equal(JSON.stringify(result).includes(token),false)
 assert.equal(calls[0].url,`${origin}/api/v1/native/organizations/org-a/volunteer-schedule?programId=program&locationId=site&from=1&until=100`)
 assert.equal(calls[0].init.headers.Authorization,`Bearer ${token}`)
 assert.equal(calls[0].init.redirect,'error')
 const body={operation:'assign',organizationId:'org-a',programId:'program',locationId:'site',occurrenceId:'shift',roleId:'role',personId:'person',idempotencyKey:'operation-key-1234'}
 await service.request(body)
 assert.deepEqual(JSON.parse(calls[1].init.body),{programId:'program',locationId:'site',occurrenceId:'shift',roleId:'role',personId:'person'})
 assert.equal(calls[1].init.headers['Idempotency-Key'],body.idempotencyKey)
 await assert.rejects(service.request({...body,idempotencyKey:'short'}),/Invalid/)
 const grant={action:'assignment.manage',programId:'program',locationId:'site'}
 await service.request({operation:'replaceVolunteerGrants',organizationId:'org-a',membershipId:'member',expectedVersion:1,grants:[grant],idempotencyKey:'operation-key-5678'})
 assert.equal(calls[2].init.method,'PATCH');assert.deepEqual(JSON.parse(calls[2].init.body),{expectedVersion:1,grants:[grant]})
 await assert.rejects(service.request({operation:'replaceVolunteerGrants',organizationId:'org-a',membershipId:'member',expectedVersion:1,grants:[{...grant,extra:true}],idempotencyKey:'operation-key-5678'}),/Invalid/)
 await service.request({operation:'searchVolunteers',organizationId:'org-a',programId:'program',locationId:'site',search:'Alice'})
 assert.equal(calls[3].url,`${origin}/api/v1/native/organizations/org-a/volunteers/search`)
 assert.equal(calls[3].init.headers['Idempotency-Key'],undefined);assert.equal(JSON.parse(calls[3].init.body).search,'Alice')
})

test('revocation and concurrent sign-out cannot revive a native session',async()=>{
 let finish
 const handoff=()=>new Promise(resolve=>{finish=resolve})
 const service=createWorkflowService({origin,handoff,fetcher:async()=>new Response(null,{status:204}),openApproval:async()=>{}})
 const pending=service.signIn()
 await Promise.resolve()
 assert.deepEqual(await service.signOut(),{revoked:false,localCleared:true})
 finish({token,expiresAt:Date.now()+60_000})
 await assert.rejects(pending,/unavailable/)
 assert.deepEqual(await service.status(),{signedIn:false,persistent:false})
 const signed=createWorkflowService({origin,handoff:auth,fetcher:async()=>new Response(null,{status:204}),openApproval:async()=>{}})
 await signed.signIn();assert.deepEqual(await signed.signOut(),{revoked:true,localCleared:true});assert.deepEqual(await signed.status(),{signedIn:false,persistent:false})
})

test('clears a revoked session and rejects oversized service replies',async()=>{
 let mode='unauthorized'
 const fetcher=async()=>mode==='unauthorized'?new Response(null,{status:401}):new Response('x'.repeat(1_048_577),{status:200})
 const service=createWorkflowService({origin,handoff:auth,fetcher,openApproval:async()=>{}})
 await service.signIn()
 await assert.rejects(service.request({operation:'organizations'}),/Sign in required/)
 assert.deepEqual(await service.status(),{signedIn:false,persistent:false})
 mode='large';await service.signIn()
 await assert.rejects(service.request({operation:'organizations'}),/unavailable/)
 assert.throws(()=>createWorkflowService({origin:'https://evil.test',handoff:auth,openApproval:async()=>{}}),/unavailable/)
})

test('restored sessions require online validation and sign-out clears the vault',async()=>{
 const saved=await auth();let stored=saved,requests=[]
 const vault={load:async()=>stored,save:async(value)=>{stored=value;return true},clear:async()=>{stored=null;return true}}
 const service=createWorkflowService({origin,vault,handoff:auth,openApproval:async()=>{},fetcher:async(url)=>{requests.push(url);return String(url).endsWith('/native/me')?Response.json(identity):new Response(null,{status:204})}})
 assert.deepEqual(await service.status(),{signedIn:true,persistent:true})
 assert.deepEqual(await service.signOut(),{revoked:true,localCleared:true});assert.equal(stored,null)
 assert.deepEqual(requests,[`${origin}/api/v1/native/me`,`${origin}/api/v1/native/auth/logout`])
 stored=saved
 const offline=createWorkflowService({origin,vault,handoff:auth,openApproval:async()=>{},fetcher:async()=>{throw Error('offline')}})
 assert.deepEqual(await offline.status(),{signedIn:false,persistent:false});assert.deepEqual(stored,saved)
 assert.deepEqual(await offline.signOut(),{revoked:false,localCleared:true});assert.equal(stored,null)
 stored=saved
 const rejected=createWorkflowService({origin,vault,handoff:auth,openApproval:async()=>{},fetcher:async()=>new Response(null,{status:401})})
 assert.deepEqual(await rejected.status(),{signedIn:false,persistent:false});assert.equal(stored,null)
})

test('does not trust unrelated successful responses to restore or revoke a session',async()=>{
 const saved=await auth();let stored=saved
 const vault={load:async()=>stored,save:async()=>true,clear:async()=>{stored=null;return true}}
 for(const response of [()=>new Response(null,{status:204}),()=>new Response('<html>proxy</html>',{status:200}),()=>Response.json({account:{id:'account'}}),()=>Response.json({...identity,csrfToken:'browser-only'})]){
  stored=saved
  const service=createWorkflowService({origin,vault,handoff:auth,openApproval:async()=>{},fetcher:async()=>response()})
  assert.deepEqual(await service.status(),{signedIn:false,persistent:false})
 }
 stored=saved
 const service=createWorkflowService({origin,vault,handoff:auth,openApproval:async()=>{},fetcher:async(url)=>String(url).endsWith('/native/me')?Response.json(identity):new Response('unexpected',{status:200})})
 assert.deepEqual(await service.status(),{signedIn:true,persistent:true})
 assert.deepEqual(await service.signOut(),{revoked:false,localCleared:true})
})

test('sign-out waits for an in-progress vault write and removes it',async()=>{
 let stored=null,finishSave,startedSave
 const started=new Promise(resolve=>{startedSave=resolve})
 const vault={load:async()=>null,save:async(value)=>{startedSave();await new Promise(resolve=>{finishSave=resolve});stored=value;return true},clear:async()=>{stored=null;return true}}
 const service=createWorkflowService({origin,vault,handoff:auth,openApproval:async()=>{},fetcher:async()=>new Response(null,{status:204})})
 const login=service.signIn();await started
 const logout=service.signOut();finishSave()
 await assert.rejects(login,/unavailable/);assert.deepEqual(await logout,{revoked:false,localCleared:true})
 assert.equal(stored,null);assert.deepEqual(await service.status(),{signedIn:false,persistent:false})
})

test('a failed secure save removes the previous stored account when possible',async()=>{
 const old={token:'O'.repeat(43),expiresAt:Date.now()+60_000};let stored=old
 const vault={load:async()=>stored,save:async()=>false,clear:async()=>{stored=null;return true}}
 const service=createWorkflowService({origin,vault,handoff:auth,openApproval:async()=>{},fetcher:async()=>{throw Error('offline')}})
 assert.deepEqual(await service.status(),{signedIn:false,persistent:false})
 await service.signIn()
 assert.deepEqual(await service.status(),{signedIn:true,persistent:false});assert.equal(stored,null)
})

test('retries an offline saved session when sign-in is requested after reconnecting',async()=>{
 let stored=await auth(),online=false,handoffs=0,checks=0
 const vault={load:async()=>stored,save:async()=>true,clear:async()=>{stored=null;return true}}
 const service=createWorkflowService({origin,vault,handoff:async()=>{handoffs++;return auth()},openApproval:async()=>{},fetcher:async()=>{checks++;if(!online)throw Error('offline');return Response.json(identity)}})
 assert.deepEqual(await service.status(),{signedIn:false,persistent:false})
 online=true
 await Promise.all([service.signIn(),service.signIn()])
 assert.deepEqual(await service.status(),{signedIn:true,persistent:true})
 assert.equal(checks,2);assert.equal(handoffs,0)
})

test('sign-out during reconnect validation cannot restore a saved session',async()=>{
 let stored=await auth(),online=false,finish,started,handedOff=false
 const pending=new Promise(resolve=>{started=resolve})
 const vault={load:async()=>stored,save:async()=>true,clear:async()=>{stored=null;return true}}
 const service=createWorkflowService({origin,vault,handoff:async()=>{handedOff=true;return auth()},openApproval:async()=>{},fetcher:async(url)=>{
  if(String(url).endsWith('/logout'))return new Response(null,{status:204})
  if(!online)throw Error('offline')
  started();return new Promise(resolve=>{finish=resolve})
 }})
 assert.deepEqual(await service.status(),{signedIn:false,persistent:false})
 online=true
 const login=service.signIn();await pending
 const logout=await service.signOut();finish(Response.json(identity))
 await assert.rejects(login,/unavailable/)
 assert.deepEqual(logout,{revoked:true,localCleared:true});assert.equal(stored,null);assert.equal(handedOff,false)
 assert.deepEqual(await service.status(),{signedIn:false,persistent:false})
})
