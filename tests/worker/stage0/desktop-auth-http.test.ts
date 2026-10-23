import {beforeEach,expect,it} from 'vitest'
import {databaseFixture} from './database'
import {handleDesktopAuthRequest} from '../../../src/cloudflare/stage0/auth/desktop-routes'
import {issueSession,resolveSession} from '../../../src/cloudflare/stage0/auth/sessions'
import {randomSecret} from '../../../src/cloudflare/stage0/auth/secrets'
import type {IssuedSession} from '../../../src/cloudflare/stage0/auth/sessions'
let f:Awaited<ReturnType<typeof databaseFixture>>,browser:IssuedSession
const key=new Uint8Array(32).fill(61),ip='127.0.0.1',callbackUri='http://127.0.0.1:53412/ovelle-auth/callback'
const url=(action:string)=>`${f.ctx.config.origin}/api/v1/auth/desktop/${action}`
const browserHeaders=()=>({Cookie:`ovelle_local_session=${browser.token}`,Origin:f.ctx.config.origin,'X-CSRF-Token':browser.csrfToken!})
function call(action:string,body:unknown,headers:Record<string,string>={},method='POST'){return handleDesktopAuthRequest(f.ctx,new Request(url(action),{method,headers:{'Content-Type':'application/json',...headers},...(method==='GET'?{}:{body:JSON.stringify(body)})}),ip,key)}
async function start(){const state=randomSecret(),verifier=randomSecret(),bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))),challenge=btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');const response=await call('requests',{state,challenge,callbackUri});expect(response.status).toBe(201);return{...await response.json() as {requestId:string;expiresAt:number},state,verifier}}
async function approved(){const pending=await start();const response=await call('approve',{requestId:pending.requestId,state:pending.state,confirmation:true},browserHeaders());expect(response.status).toBe(200);const result=await response.json() as {callbackUrl:string};return{...pending,code:new URL(result.callbackUrl).searchParams.get('code')!}}
beforeEach(async()=>{f=await databaseFixture();browser=await issueSession(f.ctx,{accountId:'a',method:'passkey'},'browser')})
it('composes all three steps and returns a native-only credential with safe no-store headers',async()=>{
 const pending=await approved(),response=await call('exchange',{requestId:pending.requestId,state:pending.state,code:pending.code,verifier:pending.verifier,callbackUri})
 expect(response.status).toBe(200);expect(response.headers.get('Set-Cookie')).toBeNull();expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
 expect(response.headers.get('Cache-Control')).toBe('no-store');expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'none'")
 const body=await response.json() as {token:string;expiresAt:number};expect(Object.keys(body).sort()).toEqual(['expiresAt','token']);expect(body.expiresAt).toBe(f.ctx.clock.now()+43_200_000)
 expect((await resolveSession(f.ctx,body.token,'desktop')).accountId).toBe('a')
 await expect(resolveSession(f.ctx,body.token,'browser')).rejects.toMatchObject({code:'unauthenticated'})
})
it('requires exact trusted browser origin and CSRF for every approval',async()=>{
 const pending=await start(),body={requestId:pending.requestId,state:pending.state,confirmation:true}
 for(const headers of ([{},{Cookie:`ovelle_local_session=${browser.token}`},{...browserHeaders(),Origin:'null'},{...browserHeaders(),Origin:'https://evil.example'},{...browserHeaders(),'X-CSRF-Token':randomSecret()},{...browserHeaders(),'Sec-Fetch-Site':'cross-site'}] as Record<string,string>[]))expect((await call('approve',body,headers)).status).toBeGreaterThanOrEqual(400)
 expect(await f.execute('SELECT approved_at FROM desktop_auth_requests WHERE id=?',pending.requestId).first('approved_at')).toBeNull()
 expect((await call('approve',body,browserHeaders())).status).toBe(200)
})
it.each(['requests','exchange'])('rejects browser metadata, cookies and bearer auth on unprivileged native %s',async action=>{
 for(const headers of ([{Origin:f.ctx.config.origin},{Origin:'null'},{Cookie:'x=y'},{'Sec-Fetch-Site':'none'},{Authorization:`Bearer ${browser.token}`}] as Record<string,string>[]))expect((await call(action,{},headers)).status).toBe(403)
 expect(await f.execute('SELECT count(*) FROM desktop_auth_requests').first('count(*)')).toBe(0)
})
it('does not treat a valid native bearer as browser approval',async()=>{
 const native=await issueSession(f.ctx,{accountId:'a',method:'passkey'},'desktop'),pending=await start()
 const response=await call('approve',{requestId:pending.requestId,state:pending.state,confirmation:true},{Authorization:`Bearer ${native.token}`})
 expect(response.status).toBe(401)
})
it('GET/HEAD/OPTIONS and unknown routes never consume a request or code',async()=>{
 const pending=await approved()
 for(const action of ['requests','approve','exchange'])for(const method of ['GET','HEAD','OPTIONS']){
 const response=await handleDesktopAuthRequest(f.ctx,new Request(url(action),{method}),ip,key);expect(response.status).toBe(405);expect(response.headers.get('Allow')).toBe('POST');expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
 }
 expect((await call('missing',{})).status).toBe(404)
 expect(await f.execute('SELECT consumed_at FROM desktop_auth_requests WHERE id=?',pending.requestId).first('consumed_at')).toBeNull()
 expect((await call('exchange',{requestId:pending.requestId,state:pending.state,code:pending.code,verifier:pending.verifier,callbackUri})).status).toBe(200)
})
it('rejects authority overrides, malformed inputs, unknown keys, query parameters and oversized bodies',async()=>{
 const pending=await start(),approval={requestId:pending.requestId,state:pending.state,confirmation:true}
 for(const body of [{...approval,accountId:'b'},{...approval,principal:browser.principal},{...approval,callbackUri},{...approval,confirmation:false},{...approval,state:null},[],null])expect((await call('approve',body,browserHeaders())).status).toBe(400)
 for(const path of ['requests?accountId=a','approve?state=x','exchange?code=x'])expect((await call(path,{})).status).toBe(400)
 expect((await call('requests',{state:'x'.repeat(5000)})).status).toBe(400)
 const malformed=new Request(url('requests'),{method:'POST',headers:{'Content-Type':'application/json'},body:'{"state":'})
 expect((await handleDesktopAuthRequest(f.ctx,malformed,ip,key)).status).toBe(400)
 const wrongType=new Request(url('requests'),{method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'})
 expect((await handleDesktopAuthRequest(f.ctx,wrongType,ip,key)).status).toBe(400)
})
it('denies off-origin request URLs and never accepts body-supplied IP or quota keys',async()=>{
 const response=await handleDesktopAuthRequest(f.ctx,new Request('https://evil.example/api/v1/auth/desktop/requests',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),ip,key)
 expect(response.status).toBe(403)
 expect((await call('requests',{state:randomSecret(),challenge:randomSecret(),callbackUri,ip:'1.2.3.4',budgetKey:'client'})).status).toBe(400)
})
it('redacts database failures and denies unsupported auth without leaking protocol secrets',async()=>{
 const broken={...f.ctx,db:{prepare(){throw new Error('SQL secret raw native bearer private data')}} as never}
 const response=await handleDesktopAuthRequest(broken,new Request(url('requests'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:randomSecret(),challenge:'A'.repeat(43),callbackUri})}),ip,key)
 expect(response.status).toBe(503);expect(await response.text()).not.toMatch(/SQL|bearer|private/)
 expect(response.headers.get('Cache-Control')).toBe('no-store')
})
it('rejects enrollment-only or revoked browser approval, and revoked source exchange',async()=>{
 const pending=await start();await f.execute("UPDATE accounts SET email_verified_at=NULL WHERE id='b'").run();browser=await issueSession(f.ctx,{accountId:'b',method:'password'},'browser')
 expect((await call('approve',{requestId:pending.requestId,state:pending.state,confirmation:true},browserHeaders())).status).toBe(403)
 browser=await issueSession(f.ctx,{accountId:'a',method:'passkey'},'browser');const valid=await approved()
 await f.execute('UPDATE sessions SET revoked_at=? WHERE id=?',f.ctx.clock.now(),browser.principal.sessionId).run()
 expect((await call('approve',{requestId:pending.requestId,state:pending.state,confirmation:true},browserHeaders())).status).toBe(401)
 expect((await call('exchange',{requestId:valid.requestId,state:valid.state,code:valid.code,verifier:valid.verifier,callbackUri})).status).toBe(401)
})
