import {beforeEach,expect,it} from 'vitest'
import {databaseFixture} from './database'
import {issueSession,type IssuedSession} from '../../../src/cloudflare/stage0/auth/sessions'
import {handleStaffInvitationRequest} from '../../../src/cloudflare/stage0/staff/routes'

let f:Awaited<ReturnType<typeof databaseFixture>>,owner:IssuedSession,recipient:IssuedSession,native:IssuedSession
const deps={trustedIp:'127.0.0.1',budgetKey:new Uint8Array(32).fill(27)}
const root='/api/v1/organizations/org-a/invitations'
let key=0
function request(path=root,method='GET',body?:unknown,session=owner,extra:Record<string,string>={}){
  const headers:Record<string,string>={...(session.principal.transport==='browser'?{Cookie:`ovelle_local_session=${session.token}`,Origin:f.ctx.config.origin,'X-CSRF-Token':session.csrfToken!}:{Authorization:`Bearer ${session.token}`}),...extra}
  if(body!==undefined){headers['Content-Type']='application/json';headers['Idempotency-Key']=`invitation-http-command-${++key}`}
  return new Request(f.ctx.config.origin+path,{method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{})})
}
async function send(req:Request,transport:'browser'|'desktop'='browser'){return handleStaffInvitationRequest(f.ctx,req,transport,deps)}
async function create(){const response=await send(request(root,'POST',{email:'new@example.test',preset:'coordinator',grants:[{action:'program.read',scope:{kind:'program_location',programId:'a1'}}]}));expect(response.status).toBe(201);return await response.json() as {id:string;version:number}}
const secret=()=>new URL(f.ctx.sent.at(-1)!.url).hash.slice('#token='.length)
beforeEach(async()=>{
  key=0;f=await databaseFixture()
  owner=await issueSession(f.ctx,{accountId:'a',method:'passkey'},'browser')
  native=await issueSession(f.ctx,{accountId:'a',method:'passkey'},'desktop')
  await f.execute("INSERT INTO accounts(id,email,display_name,email_verified_at,created_at) VALUES('new','new@example.test','New',?,?)",f.ctx.clock.now(),f.ctx.clock.now()).run()
  recipient=await issueSession(f.ctx,{accountId:'new',method:'password'},'browser')
})
it('composes create/list/detail, read-only GET preview and explicit intended-account POST acceptance',async()=>{
  const invite=await create(),token=secret()
  const list=await send(request());expect(list.status).toBe(200);expect(await list.json()).toMatchObject({invitations:[{id:invite.id}]})
  const detail=await send(request(`${root}/${invite.id}`));expect(detail.status).toBe(200);expect(await detail.json()).toMatchObject({grants:[{action:'program.read'}]})
  for(let i=0;i<2;i++){
    const preview=await send(request('/api/v1/invitations/preview','GET',undefined,recipient,{'X-Invitation-Token':token}))
    expect(preview.status).toBe(200);expect(await preview.json()).toMatchObject({organizationName:'A',state:'pending'})
  }
  expect(await f.execute("SELECT count(*) AS n FROM organization_memberships WHERE account_id='new'").first('n')).toBe(0)
  const get=await send(request('/api/v1/invitations/accept','GET',undefined,recipient,{'X-Invitation-Token':token}));expect(get.status).toBe(405);expect(get.headers.get('Allow')).toBe('POST')
  const accepted=await send(request('/api/v1/invitations/accept','POST',{token},recipient));expect(accepted.status).toBe(200);expect(await accepted.json()).toMatchObject({state:'active',accountId:'new'})
  expect(await f.execute("SELECT count(*) AS n FROM organization_memberships WHERE account_id='new'").first('n')).toBe(1)
})
it('rotates only through explicit resend and composes versioned revocation with safe replay',async()=>{
  const invite=await create(),old=secret()
  const resend=request(`${root}/${invite.id}/resend`,'POST',{expectedVersion:1}),copy=resend.clone()
  expect((await send(resend)).status).toBe(200);expect((await send(copy)).status).toBe(200);expect(f.ctx.sent).toHaveLength(2)
  expect((await send(request('/api/v1/invitations/accept','POST',{token:old},recipient))).status).toBe(401)
  const revoked=await send(request(`${root}/${invite.id}/revoke`,'POST',{expectedVersion:2}));expect(revoked.status).toBe(200)
  expect((await send(request('/api/v1/invitations/accept','POST',{token:secret()},recipient))).status).toBe(409)
})
it('rejects wrong account, foreign organization, revoked staff and forged authority DTOs',async()=>{
  const invite=await create()
  expect((await send(request('/api/v1/invitations/accept','POST',{token:secret()},owner))).status).toBe(403)
  expect((await send(request('/api/v1/organizations/org-b/invitations'))).status).toBe(404)
  expect((await send(request(root,'POST',{email:'x@example.test',preset:'coordinator',grants:[],principal:owner.principal}))).status).toBe(400)
  await f.execute("UPDATE accounts SET security_version=security_version+1 WHERE id='a'").run()
  expect((await send(request(`${root}/${invite.id}`))).status).toBe(401)
})
it('binds the fixed browser/native transport and enforces exact origin and browser CSRF',async()=>{
  expect((await send(request(root,'GET',undefined,native),'desktop')).status).toBe(200)
  expect((await send(request(root,'GET',undefined,native))).status).toBe(401)
  expect((await send(request(),'desktop')).status).toBe(401)
  for(const headers of ([{Origin:'https://evil.test'},{'Sec-Fetch-Site':'cross-site'},{'X-CSRF-Token':'wrong'}] as Record<string,string>[]))expect((await send(request(root,'POST',{email:'x@example.test',preset:'coordinator',grants:[]},owner,headers))).status).toBe(403)
  const missing=request(root,'POST',{email:'x@example.test',preset:'coordinator',grants:[]});missing.headers.delete('Origin');expect((await send(missing)).status).toBe(403)
  const foreign=new Request('https://evil.test'+root,{headers:request().headers});expect((await send(foreign)).status).toBe(403)
  expect(f.ctx.sent).toHaveLength(0)
})
it('requires strict bounded JSON, known fields, valid command keys and read-only secret headers',async()=>{
  const invalid=[null,[],{}, {email:'x@example.test',preset:'coordinator',grants:[],trustedIp:'spoof'}, {email:'x@example.test',preset:'coordinator',grants:[{action:'program.read',scope:{kind:'organization'},owner:true}]}]
  for(const body of invalid)expect((await send(request(root,'POST',body))).status).toBe(400)
  const missing=request(root,'POST',{email:'x@example.test',preset:'coordinator',grants:[]});missing.headers.delete('Idempotency-Key');expect((await send(missing)).status).toBe(400)
  const oversized=request(root,'POST',{email:'x'.repeat(17000)});expect((await send(oversized)).status).toBe(400)
  const malformed=new Request(f.ctx.config.origin+root,{method:'POST',headers:request(root,'POST',{}).headers,body:'{'});expect((await send(malformed)).status).toBe(400)
  const wrong=request(root,'POST',{});wrong.headers.set('Content-Type','text/plain');expect((await send(wrong)).status).toBe(400)
  expect((await send(request('/api/v1/invitations/preview?token=secret'))).status).toBe(400)
  expect((await send(request('/api/v1/invitations/preview'))).status).toBe(401)
  expect(f.ctx.sent).toHaveLength(0)
})
it('does not derive trusted quota identity from client headers and bounds sends before delivery',async()=>{
  for(let i=0;i<5;i++)expect((await send(request(root,'POST',{email:`target${i}@example.test`,preset:'coordinator',grants:[]}))).status).toBe(201)
  expect((await send(request(root,'POST',{email:'different@example.test',preset:'coordinator',grants:[]},owner,{'CF-Connecting-IP':'192.0.2.99','X-Forwarded-For':'192.0.2.99'}))).status).toBe(429)
  expect(f.ctx.sent).toHaveLength(5)
})
it('uses no-store safe responses and never reflects database/provider errors or credentials',async()=>{
  const invite=await create()
  const response=await send(request(`${root}/${invite.id}`))
  for(const [key,value] of [['Cache-Control','no-store'],['Referrer-Policy','no-referrer'],['X-Content-Type-Options','nosniff']])expect(response.headers.get(key)).toBe(value)
  expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false)
  const text=await response.text();for(const privateValue of [secret(),owner.token,owner.csrfToken!,'issued_session_id','token_digest'])expect(text).not.toContain(privateValue)
  const original=f.ctx.db
  f.ctx.db=new Proxy(original,{get(target,key){if(key==='prepare')return()=>{throw new Error('SQL secret provider-token-private')};return Reflect.get(target,key,target)}})
  const failed=await send(request());expect(failed.status).toBe(503);expect(await failed.json()).toEqual({error:'unavailable'})
})
it('rejects unknown routes and unsafe methods without invoking delivery',async()=>{
  expect((await send(request('/api/v1/unknown'))).status).toBe(404)
  expect((await send(request(root,'DELETE'))).status).toBe(405)
  expect((await send(request('/api/v1/organizations/org-a/invitations/%ZZ/revoke','POST',{expectedVersion:1}))).status).toBe(400)
  expect(f.ctx.sent).toHaveLength(0)
})

it('rejects non-string and missing acceptance tokens as malformed DTOs before charging attempts',async()=>{
  await create()
  for(const body of [{token:[secret()]},{token:null},{token:123},{}])expect((await send(request('/api/v1/invitations/accept','POST',body,recipient))).status).toBe(400)
  expect(await f.execute('SELECT count(*) AS n FROM auth_attempts').first('n')).toBe(0)
  expect(await f.execute("SELECT count(*) AS n FROM organization_memberships WHERE account_id='new'").first('n')).toBe(0)
})

it('supports native command credentials without browser cookies and retains admin passkey requirements',async()=>{
  const response=await send(request(root,'POST',{email:'new@example.test',preset:'admin',grants:[{action:'staff.read',scope:{kind:'organization'}}]},native),'desktop')
  expect(response.status).toBe(201)
  const token=secret()
  expect((await send(request('/api/v1/invitations/accept','POST',{token},recipient))).status).toBe(403)
  const authenticated=await issueSession(f.ctx,{accountId:'new',method:'passkey'},'browser')
  expect((await send(request('/api/v1/invitations/accept','POST',{token},authenticated))).status).toBe(200)
})
