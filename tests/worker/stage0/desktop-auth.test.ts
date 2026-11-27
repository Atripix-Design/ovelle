import {beforeEach,expect,it} from 'vitest'
import {databaseFixture} from './database'
import {createDesktopRequest,approveDesktopRequest,exchangeDesktopCode} from '../../../src/cloudflare/stage0/auth/desktop'
import {issueSession,loadLiveSession,resolveSession} from '../../../src/cloudflare/stage0/auth/sessions'
import {randomSecret,secretDigest} from '../../../src/cloudflare/stage0/auth/secrets'
import {beginPasskeyRegistration,finishPasskeyRegistration} from '../../../src/cloudflare/stage0/auth/passkeys/service'
import {passkeyFixture} from './passkey-fixture'
import {getOrganization} from '../../../src/cloudflare/stage0/access/organizations'
import type {IssuedSession} from '../../../src/cloudflare/stage0/auth/sessions'
let f:Awaited<ReturnType<typeof databaseFixture>>,browser:IssuedSession
const ip='127.0.0.1',key=new Uint8Array(32).fill(31),callbackUri='http://127.0.0.1:52143/ovelle-auth/callback'
async function challenge(verifier:string){return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')}
async function pending(){const state=randomSecret(),verifier=randomSecret();const input={state,challenge:await challenge(verifier),callbackUri};return{...await createDesktopRequest(f.ctx,input,ip,key),...input,verifier}}
async function approved(){const start=await pending();const approval=await approveDesktopRequest(f.ctx,browser.principal,{requestId:start.requestId,state:start.state,confirmation:true});const url=new URL(approval.callbackUrl);return{...start,code:url.searchParams.get('code')!,callback:url}}
const proof=({requestId,state,code,verifier,callbackUri}:{requestId:string;state:string;code:string;verifier:string;callbackUri:string})=>({requestId,state,code,verifier,callbackUri})
const exchange=(input:Parameters<typeof proof>[0])=>exchangeDesktopCode(f.ctx,proof(input),ip,key)
beforeEach(async()=>{f=await databaseFixture();browser=await issueSession(f.ctx,{accountId:'a',method:'passkey'},'browser')})
it('stores only proof digests and exact callback, and creates no session before explicit approval and exchange',async()=>{
 const start=await pending();expect(start.expiresAt).toBe(f.ctx.clock.now()+300_000)
 const row=await f.execute('SELECT * FROM desktop_auth_requests WHERE id=?',start.requestId).first()
 const encoded=JSON.stringify(row);expect(encoded).not.toContain(start.state);expect(encoded).not.toContain(start.verifier)
 expect(row).toMatchObject({state_digest:await secretDigest(start.state),challenge:start.challenge,callback_uri:callbackUri,approved_at:null,code_digest:null,consumed_at:null})
 expect(await f.execute("SELECT count(*) FROM sessions WHERE transport='desktop'").first('count(*)')).toBe(0)
})
it('returns only a short-lived code/state to the exact callback and a native token only at exchange',async()=>{
 const start=await approved();expect(start.callback.origin+start.callback.pathname).toBe(callbackUri)
 expect([...start.callback.searchParams.keys()].sort()).toEqual(['code','state']);expect(start.callback.searchParams.get('state')).toBe(start.state)
 const before=await loadLiveSession(f.ctx,browser.principal);f.advance(5_000)
 const issued=await exchange(start);expect(issued.csrfToken).toBeNull();expect(issued.principal).toMatchObject({accountId:'a',transport:'desktop',method:'passkey',assurance:'passkey',authenticatedAt:before.authenticated_at,passkeyVerifiedAt:before.passkey_verified_at})
 const after=await loadLiveSession(f.ctx,issued.principal);expect(after.expires_at).toBe(before.expires_at);expect(after.created_at).toBe(f.ctx.clock.now());expect(after.id).not.toBe(before.id)
 expect(await resolveSession(f.ctx,issued.token,'desktop')).toEqual(issued.principal)
 await expect(resolveSession(f.ctx,issued.token,'browser')).rejects.toMatchObject({code:'unauthenticated'})
 expect((await getOrganization(f.ctx,issued.principal,'org-a')).id).toBe('org-a')
 const rows=JSON.stringify((await f.execute('SELECT * FROM desktop_auth_requests').all()).results)
 expect(rows).not.toContain(start.code);expect(rows).not.toContain(issued.token);expect(rows).not.toContain(start.state)
 const audits=JSON.stringify((await f.execute('SELECT * FROM audit_events').all()).results);for(const secret of [start.code,issued.token,start.state,start.verifier])expect(audits).not.toContain(secret)
 await expect(exchange(start)).rejects.toMatchObject({code:'unauthenticated'})
})
it.each(['https://127.0.0.1:52143/ovelle-auth/callback','http://localhost:52143/ovelle-auth/callback','http://[::1]:52143/ovelle-auth/callback','http://127.1:52143/ovelle-auth/callback','http://127.0.0.1/ovelle-auth/callback','http://127.0.0.1:80/ovelle-auth/callback','http://127.0.0.1:052143/ovelle-auth/callback','http://127.0.0.1:52143/ovelle-auth/callback?x=1','http://127.0.0.1:52143/ovelle-auth/callback#x','http://user@127.0.0.1:52143/ovelle-auth/callback','http://127.0.0.1:52143/a/../ovelle-auth/callback','http://127.0.0.1:52143/ovelle-auth/%63allback','http://127.0.0.1:52143/elsewhere'])('rejects nonexact callback %s',async callbackUri=>{
 await expect(createDesktopRequest(f.ctx,{state:randomSecret(),challenge:await challenge(randomSecret()),callbackUri},ip,key)).rejects.toMatchObject({code:'invalid_input'})
})
it('rejects malformed state, challenge and unbounded or authority-bearing service DTOs',async()=>{
 const valid={state:randomSecret(),challenge:await challenge(randomSecret()),callbackUri}
 for(const input of [{...valid,state:''},{...valid,state:'x'.repeat(44)},{...valid,challenge:'plain'},{...valid,challenge:'x'.repeat(43)},{...valid,method:'plain'},{...valid,accountId:'b'}])await expect(createDesktopRequest(f.ctx,input as never,ip,key)).rejects.toMatchObject({code:'invalid_input'})
})
it('cannot exchange an unapproved request, approve with a wrong state, or approve twice',async()=>{
 const start=await pending()
 await expect(exchange({...start,code:randomSecret()})).rejects.toMatchObject({code:'unauthenticated'})
 await expect(approveDesktopRequest(f.ctx,browser.principal,{requestId:start.requestId,state:randomSecret(),confirmation:true})).rejects.toMatchObject({code:'unauthenticated'})
 await expect(approveDesktopRequest(f.ctx,browser.principal,{requestId:start.requestId,state:start.state,confirmation:false} as never)).rejects.toMatchObject({code:'invalid_input'})
 await approveDesktopRequest(f.ctx,browser.principal,{requestId:start.requestId,state:start.state,confirmation:true})
 await expect(approveDesktopRequest(f.ctx,browser.principal,{requestId:start.requestId,state:start.state,confirmation:true})).rejects.toMatchObject({code:'unauthenticated'})
})
it('binds exchange to request, exact callback, state, code and S256 verifier without burning on a wrong proof',async()=>{
 const start=await approved()
 for(const input of [{...start,requestId:'missing'},{...start,state:randomSecret()},{...start,code:randomSecret()},{...start,verifier:randomSecret()},{...start,callbackUri:'http://127.0.0.1:52144/ovelle-auth/callback'}])await expect(exchange(input)).rejects.toMatchObject({code:'unauthenticated'})
 await expect(exchange(start)).rejects.toMatchObject({code:'rate_limited'})
 expect(await f.execute('SELECT consumed_at FROM desktop_auth_requests WHERE id=?',start.requestId).first('consumed_at')).toBeNull()
 expect((await exchangeDesktopCode(f.ctx,proof(start),'127.0.0.2',key)).principal.transport).toBe('desktop')
})
it('accepts RFC7636 unreserved verifiers from 43 through 128 characters, but never plain or malformed proofs',async()=>{
 for(const verifier of ['a'.repeat(42)+'~','a'.repeat(124)+'-._~']){
 const state=randomSecret(),start=await createDesktopRequest(f.ctx,{state,challenge:await challenge(verifier),callbackUri},ip,key)
 const approved=await approveDesktopRequest(f.ctx,browser.principal,{requestId:start.requestId,state,confirmation:true})
 const code=new URL(approved.callbackUrl).searchParams.get('code')!
 for(const bad of ['a'.repeat(42),'a'.repeat(129),'a'.repeat(42)+'!'])await expect(exchange({requestId:start.requestId,state,code,verifier:bad,callbackUri})).rejects.toMatchObject({code:'invalid_input'})
 expect((await exchange({requestId:start.requestId,state,code,verifier,callbackUri})).principal.transport).toBe('desktop')
 }
})
it('expires requests at five minutes and codes at sixty seconds, with no grace boundary',async()=>{
 const start=await pending();f.advance(300_000)
 await expect(approveDesktopRequest(f.ctx,browser.principal,{requestId:start.requestId,state:start.state,confirmation:true})).rejects.toMatchObject({code:'unauthenticated'})
 const code=await approved();f.advance(60_000);await expect(exchange(code)).rejects.toMatchObject({code:'unauthenticated'})
 expect(await f.execute("SELECT count(*) FROM sessions WHERE transport='desktop'").first('count(*)')).toBe(0)
})
it('caps code validity at request expiry and original session expiry, and never restarts twelve hours',async()=>{
 let start=await pending();f.advance(299_000)
 await approveDesktopRequest(f.ctx,browser.principal,{requestId:start.requestId,state:start.state,confirmation:true})
 expect(await f.execute('SELECT code_expires_at FROM desktop_auth_requests WHERE id=?',start.requestId).first('code_expires_at')).toBe(start.expiresAt)
 f.advance(43_200_000-299_000-1_000);start=await pending()
 const approval=await approveDesktopRequest(f.ctx,browser.principal,{requestId:start.requestId,state:start.state,confirmation:true})
 const source=await loadLiveSession(f.ctx,browser.principal)
 expect(await f.execute('SELECT code_expires_at FROM desktop_auth_requests WHERE id=?',start.requestId).first('code_expires_at')).toBe(source.expires_at)
 const issued=await exchange({...start,code:new URL(approval.callbackUrl).searchParams.get('code')!})
 expect((await loadLiveSession(f.ctx,issued.principal)).expires_at).toBe(source.expires_at)
})
it('denies enrollment and native approval and derives assurance from the database rather than forged principal fields',async()=>{
 await f.execute("UPDATE accounts SET email_verified_at=NULL WHERE id='b'").run()
 const enrollment=await issueSession(f.ctx,{accountId:'b',method:'password'},'browser'),native=await issueSession(f.ctx,{accountId:'a',method:'passkey'},'desktop'),start=await pending()
 for(const principal of [enrollment.principal,native.principal])await expect(approveDesktopRequest(f.ctx,principal,{requestId:start.requestId,state:start.state,confirmation:true})).rejects.toMatchObject({code:'forbidden'})
 browser=await issueSession(f.ctx,{accountId:'c',method:'password'},'browser')
 const approved=await approveDesktopRequest(f.ctx,{...browser.principal,assurance:'passkey',method:'passkey',accountId:'c'},{requestId:start.requestId,state:start.state,confirmation:true})
 const issued=await exchange({...start,code:new URL(approved.callbackUrl).searchParams.get('code')!})
 expect(issued.principal).toMatchObject({accountId:'c',method:'password',assurance:'authenticated',passkeyVerifiedAt:null})
})
it.each(['source-session','account-disabled','security-epoch','email-unverified'])('denies exchange after %s invalidation',async kind=>{
 const start=await approved()
 if(kind==='source-session')await f.execute('UPDATE sessions SET revoked_at=? WHERE id=?',f.ctx.clock.now(),browser.principal.sessionId).run()
 if(kind==='account-disabled')await f.execute("UPDATE accounts SET disabled_at=? WHERE id='a'",f.ctx.clock.now()).run()
 if(kind==='security-epoch')await f.execute("UPDATE accounts SET security_version=security_version+1 WHERE id='a'").run()
 if(kind==='email-unverified')await f.execute("UPDATE accounts SET email_verified_at=NULL WHERE id='a'").run()
 await expect(exchange(start)).rejects.toMatchObject({code:'unauthenticated'})
 expect(await f.execute("SELECT count(*) FROM sessions WHERE transport='desktop'").first('count(*)')).toBe(0)
})
it('allows only one concurrent approval and one concurrent native exchange with one audit/session',async()=>{
 const start=await pending(),input={requestId:start.requestId,state:start.state,confirmation:true as const}
 const approvals=await Promise.allSettled([approveDesktopRequest(f.ctx,browser.principal,input),approveDesktopRequest(f.ctx,browser.principal,input)])
 expect(approvals.filter(r=>r.status==='fulfilled')).toHaveLength(1)
 const approval=approvals.find(r=>r.status==='fulfilled')! as PromiseFulfilledResult<{callbackUrl:string}>
 const code=new URL(approval.value.callbackUrl).searchParams.get('code')!
 const results=await Promise.allSettled([exchange({...start,code}),exchange({...start,code})]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
 expect(await f.execute("SELECT count(*) FROM sessions WHERE transport='desktop'").first('count(*)')).toBe(1)
 expect(await f.execute("SELECT count(*) FROM audit_events e JOIN sessions s ON s.id=e.resource_id WHERE e.action='session.issue' AND s.transport='desktop'").first('count(*)')).toBe(1)
})
it('rechecks source revocation inside the final exchange batch and rolls back code, session and audit together',async()=>{
 const start=await approved(),db=f.db,ctx={...f.ctx};let batches=0
 ctx.db=new Proxy(db,{get(target,key){if(key==='batch')return async(statements:Parameters<typeof db.batch>[0])=>{if(++batches===2)await f.execute('UPDATE sessions SET revoked_at=? WHERE id=?',f.ctx.clock.now(),browser.principal.sessionId).run();return target.batch(statements)};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}})
 await expect(exchangeDesktopCode(ctx,proof(start),ip,key)).rejects.toMatchObject({code:'conflict'})
 expect(await f.execute('SELECT consumed_at FROM desktop_auth_requests WHERE id=?',start.requestId).first('consumed_at')).toBeNull()
 expect(await f.execute("SELECT count(*) FROM sessions WHERE transport='desktop'").first('count(*)')).toBe(0)
})
it('enforces durable creation and failed-exchange budgets without plaintext IPs or unlimited retained requests',async()=>{
 for(let i=0;i<5;i++)await pending()
 await expect(pending()).rejects.toMatchObject({code:'rate_limited'})
 const encoded=JSON.stringify((await f.execute('SELECT * FROM auth_limits').all()).results);expect(encoded).not.toContain(ip)
 f.advance(900_000);await pending()
 expect(await f.execute('SELECT count(*) FROM desktop_auth_requests').first('count(*)')).toBe(1)
})

it('preserves required SAML and its passkey evidence, and native sessions die when either authority is disabled',async()=>{
 await f.execute("INSERT INTO identity_connections(id,organization_id,protocol,provider,issuer,created_at) VALUES('desktop-saml','org-a','saml','enterprise_saml','urn:desktop:saml',?)",f.ctx.clock.now()).run()
 await f.execute("INSERT INTO external_identities(id,account_id,connection_id,issuer,subject,created_at) VALUES('desktop-identity','a','desktop-saml','urn:desktop:saml','subject-a',?)",f.ctx.clock.now()).run()
 await f.execute("UPDATE organizations SET required_connection_id='desktop-saml',version=version+1 WHERE id='org-a'").run()
 browser=await issueSession(f.ctx,{accountId:'a',method:'saml',externalIdentityId:'desktop-identity',identityVersion:1,connectionVersion:1},'browser')
 const begun=await beginPasskeyRegistration(f.ctx,browser.principal,ip,key),authenticator=await passkeyFixture()
 const registered=await finishPasskeyRegistration(f.ctx,browser.principal,begun.flowToken,await authenticator.registration(begun.options.challenge),'Desktop source key',ip,key)
 browser=registered.session
 const input=await approved(),issued=await exchange(input)
 expect(issued.principal).toMatchObject({method:'saml',connectionId:'desktop-saml',connectionVersion:1,assurance:'passkey',passkeyVerifiedAt:browser.principal.passkeyVerifiedAt})
 expect((await loadLiveSession(f.ctx,issued.principal)).passkey_credential_id).toBe(registered.passkey.id)
 expect((await getOrganization(f.ctx,issued.principal,'org-a')).id).toBe('org-a')
 await f.execute('UPDATE passkey_credentials SET disabled_at=?,version=version+1 WHERE id=?',f.ctx.clock.now(),registered.passkey.id).run()
 await expect(resolveSession(f.ctx,issued.token,'desktop')).rejects.toMatchObject({code:'unauthenticated'})
})
it('rejects provider revocation between approval and exchange, and after successful exchange',async()=>{
 await f.execute("INSERT INTO identity_connections(id,protocol,provider,issuer,client_id,created_at) VALUES('desktop-google','oidc','google','https://accounts.google.com','fixture',?)",f.ctx.clock.now()).run()
 await f.execute("INSERT INTO external_identities(id,account_id,connection_id,issuer,subject,created_at) VALUES('desktop-google-a','a','desktop-google','https://accounts.google.com','subject-a',?)",f.ctx.clock.now()).run()
 browser=await issueSession(f.ctx,{accountId:'a',method:'oidc',externalIdentityId:'desktop-google-a',identityVersion:1,connectionVersion:1},'browser')
 const first=await approved(),second=await approved(),issued=await exchange(first)
 expect(issued.principal).toMatchObject({method:'oidc',connectionId:'desktop-google',assurance:'authenticated'})
 await f.execute("UPDATE identity_connections SET enabled=0,version=version+1 WHERE id='desktop-google'").run()
 await expect(exchange(second)).rejects.toMatchObject({code:'unauthenticated'})
 await expect(resolveSession(f.ctx,issued.token,'desktop')).rejects.toMatchObject({code:'unauthenticated'})
})
it('checks a revoked browser again in the approval UPDATE rather than trusting preflight',async()=>{
 const start=await pending(),db=f.db,ctx={...f.ctx}
 ctx.db=new Proxy(db,{get(target,key){if(key==='prepare')return(sql:string)=>{if(sql.startsWith('UPDATE desktop_auth_requests'))return{bind:(...values:Parameters<ReturnType<typeof db.prepare>['bind']>)=>({first:async()=>{await f.execute('UPDATE sessions SET revoked_at=? WHERE id=?',f.ctx.clock.now(),browser.principal.sessionId).run();return target.prepare(sql).bind(...values).first()}})};return target.prepare(sql)};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}})
 await expect(approveDesktopRequest(ctx,browser.principal,{requestId:start.requestId,state:start.state,confirmation:true})).rejects.toMatchObject({code:'unauthenticated'})
 expect(await f.execute('SELECT approved_at FROM desktop_auth_requests WHERE id=?',start.requestId).first('approved_at')).toBeNull()
})
it('rolls back native insertion and code consumption when a later batch statement fails',async()=>{
 const start=await approved(),db=f.db,ctx={...f.ctx};let batches=0
 ctx.db=new Proxy(db,{get(target,key){if(key==='batch')return(statements:Parameters<typeof db.batch>[0])=>target.batch(++batches===2?[...statements,f.execute("INSERT INTO accounts(id,email,display_name,created_at) VALUES('duplicate','a@example.test','Duplicate',1)")]:statements);const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}})
 await expect(exchangeDesktopCode(ctx,proof(start),ip,key)).rejects.toThrow()
 expect(await f.execute('SELECT consumed_at FROM desktop_auth_requests WHERE id=?',start.requestId).first('consumed_at')).toBeNull()
 expect(await f.execute("SELECT count(*) FROM sessions WHERE transport='desktop'").first('count(*)')).toBe(0)
 expect((await exchange(start)).principal.transport).toBe('desktop')
})
