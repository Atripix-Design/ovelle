import {beforeEach,expect,it} from 'vitest'
import {databaseFixture} from './database'
import {issueSession,revokeSession} from '../../../src/cloudflare/stage0/auth/sessions'
import {requestOwnershipTransfer,acceptOwnershipTransfer,revokeOwnershipTransfer,getOwnershipTransfer} from '../../../src/cloudflare/stage0/staff/ownership'
import type {CommandContext,Principal} from '../../../src/cloudflare/stage0/contracts'
let f:Awaited<ReturnType<typeof databaseFixture>>,owner:Principal,target:Principal,other:Principal
const cmd=(principal=owner,key='ownership-command-0001'):CommandContext=>({...f.ctx,principal,idempotencyKey:key,requestDigest:''})
const input=()=>({organizationId:'org-a',targetMembershipId:'mc-a',expectedOwnerVersion:1,expectedTargetVersion:1})
async function request(){return requestOwnershipTransfer(cmd(),input())}
beforeEach(async()=>{
 f=await databaseFixture()
 // Synthetic credential/session fixtures exercise authority, not a new WebAuthn ceremony.
 for(const id of ['c','d']){
 await f.execute('INSERT INTO passkey_users(account_id,user_handle) VALUES(?,?)',id,id.repeat(43)).run()
 await f.execute("INSERT INTO passkey_credentials(id,account_id,public_key,counter,device_type,backed_up,transports,name,created_at) VALUES(?,?,'AA',0,'singleDevice',0,'[]','Fixture',?)",`key-${id}`,id,f.ctx.clock.now()).run()
 }
 owner=(await issueSession(f.ctx,{accountId:'a',method:'passkey'},'browser')).principal
 target=(await issueSession(f.ctx,{accountId:'c',method:'passkey'},'browser')).principal
 other=(await issueSession(f.ctx,{accountId:'d',method:'passkey'},'browser')).principal
})
it('requests without changing ownership and accepts atomically, retaining the old owner as admin',async()=>{
 const transfer=await request();expect(transfer).toMatchObject({state:'pending',expiresAt:f.ctx.clock.now()+900000})
 expect(await f.execute("SELECT owner_account_id FROM organizations WHERE id='org-a'").first('owner_account_id')).toBe('a')
 const body={organizationId:'org-a',transferId:transfer.id,expectedVersion:1}
 const result=await acceptOwnershipTransfer(cmd(target),body);expect(result).toMatchObject({id:'org-a',version:2})
 expect(await acceptOwnershipTransfer(cmd(target),body)).toEqual(result)
 expect(await f.execute("SELECT owner_account_id FROM organizations WHERE id='org-a'").first('owner_account_id')).toBe('c')
 expect(await f.execute("SELECT preset||':'||state AS disposition FROM organization_memberships WHERE id='owner:org-a'").first('disposition')).toBe('admin:active')
 expect(await f.execute("SELECT count(*) AS n FROM audit_events WHERE action='ownership.accept'").first('n')).toBe(1)
})
it('requires the current recent owner and an existing active passkey-ready admin target',async()=>{
 await expect(requestOwnershipTransfer(cmd(target),input())).rejects.toMatchObject({code:'forbidden'})
 await expect(requestOwnershipTransfer(cmd(),{...input(),targetMembershipId:'md-a'})).rejects.toMatchObject({code:'forbidden'})
 await f.execute("UPDATE passkey_credentials SET disabled_at=?,version=version+1 WHERE id='key-c'",f.ctx.clock.now()).run()
 await expect(request()).rejects.toMatchObject({code:'forbidden'})
 f.advance(300000)
 await expect(request()).rejects.toMatchObject({code:'forbidden'})
})
it('requires intended target recent passkey and does not let a coordinator accept',async()=>{
 const transfer=await request(),body={organizationId:'org-a',transferId:transfer.id,expectedVersion:1}
 await expect(acceptOwnershipTransfer(cmd(other),body)).rejects.toMatchObject({code:'forbidden'})
 const password=(await issueSession(f.ctx,{accountId:'c',method:'password'},'browser')).principal
 await expect(acceptOwnershipTransfer(cmd(password),body)).rejects.toMatchObject({code:'forbidden'})
 f.advance(300000)
 await expect(acceptOwnershipTransfer(cmd(target),body)).rejects.toMatchObject({code:'forbidden'})
 expect(await f.execute("SELECT owner_account_id FROM organizations WHERE id='org-a'").first('owner_account_id')).toBe('a')
})
it('allows target fresh acceptance after ten minutes but rejects exact fifteen-minute expiry',async()=>{
 const transfer=await request();f.advance(600000)
 target=(await issueSession(f.ctx,{accountId:'c',method:'passkey'},'browser')).principal
 expect(await acceptOwnershipTransfer(cmd(target),{organizationId:'org-a',transferId:transfer.id,expectedVersion:1})).toMatchObject({version:2})
})
it('rejects expired requests and reports derived expiry without consuming them',async()=>{
 const transfer=await request();f.advance(900000)
 target=(await issueSession(f.ctx,{accountId:'c',method:'passkey'},'browser')).principal
 expect(await getOwnershipTransfer(f.ctx,target,'org-a',transfer.id)).toMatchObject({state:'expired'})
 await expect(acceptOwnershipTransfer(cmd(target),{organizationId:'org-a',transferId:transfer.id,expectedVersion:1})).rejects.toMatchObject({code:'conflict'})
})
it.each(['source logout','source security','target revoked','target version','target key','organization version'])('invalidates pending requests after %s changes',async change=>{
 const transfer=await request()
 if(change==='source logout')await revokeSession(f.ctx,owner,owner.sessionId)
 if(change==='source security')await f.execute("UPDATE accounts SET security_version=security_version+1 WHERE id='a'").run()
 if(change==='target revoked')await f.execute("UPDATE organization_memberships SET state='revoked',version=version+1 WHERE id='mc-a'").run()
 if(change==='target version')await f.execute("UPDATE organization_memberships SET version=version+1 WHERE id='mc-a'").run()
 if(change==='target key')await f.execute("UPDATE passkey_credentials SET disabled_at=?,version=version+1 WHERE id='key-c'",f.ctx.clock.now()).run()
 if(change==='organization version')await f.execute("UPDATE organizations SET version=version+1 WHERE id='org-a'").run()
 await expect(acceptOwnershipTransfer(cmd(target),{organizationId:'org-a',transferId:transfer.id,expectedVersion:1})).rejects.toThrow()
 expect(await f.execute("SELECT owner_account_id FROM organizations WHERE id='org-a'").first('owner_account_id')).toBe('a')
})
it('permits one ownership transition among competing requests and preserves owner constraints',async()=>{
 await f.execute("UPDATE organization_memberships SET preset='admin',version=version+1 WHERE id='md-a'").run()
 const first=await request(),second=await requestOwnershipTransfer(cmd(owner,'ownership-command-0002'),{...input(),targetMembershipId:'md-a',expectedTargetVersion:2})
 const results=await Promise.allSettled([acceptOwnershipTransfer(cmd(target),{organizationId:'org-a',transferId:first.id,expectedVersion:1}),acceptOwnershipTransfer(cmd(other),{organizationId:'org-a',transferId:second.id,expectedVersion:1})])
 expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1)
 expect(await f.execute("SELECT count(*) AS n FROM audit_events WHERE action='ownership.accept'").first('n')).toBe(1)
 const winning=await f.execute("SELECT owner_account_id FROM organizations WHERE id='org-a'").first<string>('owner_account_id')
 await expect(f.execute("UPDATE organization_memberships SET state='revoked',version=version+1 WHERE organization_id='org-a' AND account_id=?",winning).run()).rejects.toThrow('owner_membership_required')
})
it('supports explicit owner cancellation and rejects target revival',async()=>{
 const transfer=await request(),body={organizationId:'org-a',transferId:transfer.id,expectedVersion:1}
 expect(await revokeOwnershipTransfer(cmd(owner,'ownership-command-0002'),body)).toMatchObject({state:'revoked',version:2})
 await expect(acceptOwnershipTransfer(cmd(target),body)).rejects.toMatchObject({code:'conflict'})
 await expect(getOwnershipTransfer(f.ctx,other,'org-a',transfer.id)).rejects.toMatchObject({code:'not_found'})
})
it('rolls back owner, transfer and receipt if audit insertion fails',async()=>{
 const transfer=await request()
 await f.execute("CREATE TRIGGER fail_transfer BEFORE INSERT ON audit_events WHEN NEW.action='ownership.accept' BEGIN SELECT RAISE(ABORT,'fixture'); END").run()
 await expect(acceptOwnershipTransfer(cmd(target),{organizationId:'org-a',transferId:transfer.id,expectedVersion:1})).rejects.toThrow()
 expect(await f.execute("SELECT owner_account_id FROM organizations WHERE id='org-a'").first('owner_account_id')).toBe('a')
 expect(await f.execute('SELECT state FROM ownership_transfer_requests WHERE id=?',transfer.id).first('state')).toBe('pending')
})
it('rechecks initiating owner session inside the final acceptance batch',async()=>{
 const transfer=await request(),db=f.db,ctx=cmd(target)
 ctx.db=new Proxy(db,{get(target,key){if(key==='batch')return async(statements:Parameters<typeof db.batch>[0])=>{await f.execute('UPDATE sessions SET revoked_at=? WHERE id=?',f.ctx.clock.now(),owner.sessionId).run();return target.batch(statements)};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}})
 await expect(acceptOwnershipTransfer(ctx,{organizationId:'org-a',transferId:transfer.id,expectedVersion:1})).rejects.toMatchObject({code:'conflict'})
 expect(await f.execute("SELECT owner_account_id FROM organizations WHERE id='org-a'").first('owner_account_id')).toBe('a')
 expect(await f.execute('SELECT state FROM ownership_transfer_requests WHERE id=?',transfer.id).first('state')).toBe('pending')
})
it('replays simultaneous requests and accepts without duplicate transitions or audit',async()=>{
 const transfers=await Promise.all([request(),request()]);expect(transfers[0]).toEqual(transfers[1])
 const body={organizationId:'org-a',transferId:transfers[0].id,expectedVersion:1}
 const results=await Promise.all([acceptOwnershipTransfer(cmd(target),body),acceptOwnershipTransfer(cmd(target),body)]);expect(results[0]).toEqual(results[1])
 expect(await f.execute("SELECT count(*) AS n FROM audit_events WHERE action='ownership.request'").first('n')).toBe(1)
 expect(await f.execute("SELECT count(*) AS n FROM audit_events WHERE action='ownership.accept'").first('n')).toBe(1)
})
it('orders cancellation and acceptance with exactly one successful transition',async()=>{
 const transfer=await request(),body={organizationId:'org-a',transferId:transfer.id,expectedVersion:1}
 const results=await Promise.allSettled([acceptOwnershipTransfer(cmd(target),body),revokeOwnershipTransfer(cmd(owner,'ownership-command-0002'),body)])
 expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1)
})
