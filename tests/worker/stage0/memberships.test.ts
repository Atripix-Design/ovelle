import {beforeEach,expect,it} from 'vitest'
import {databaseFixture} from './database'
import {issueSession} from '../../../src/cloudflare/stage0/auth/sessions'
import {getProgram,getOrganization} from '../../../src/cloudflare/stage0/access/organizations'
import {changeMembershipGrants,revokeMembership,listMemberships,getMembership} from '../../../src/cloudflare/stage0/staff/memberships'
import type {CommandContext,Grant,Principal} from '../../../src/cloudflare/stage0/contracts'
let f:Awaited<ReturnType<typeof databaseFixture>>,owner:Principal,admin:Principal,target:Principal,native:Principal
const grant:Grant={action:'program.read',scope:{kind:'program_location',programId:'a1',locationId:'ax'}}
const cmd=(principal=owner,key='membership-command-0001'):CommandContext=>({...f.ctx,principal,idempotencyKey:key,requestDigest:''})
const input=(grants:Grant[]=[grant])=>({organizationId:'org-a',membershipId:'md-a',expectedVersion:1,grants})
beforeEach(async()=>{
 f=await databaseFixture();owner=(await issueSession(f.ctx,{accountId:'a',method:'passkey'},'browser')).principal
 admin=(await issueSession(f.ctx,{accountId:'c',method:'passkey'},'browser')).principal
 target=(await issueSession(f.ctx,{accountId:'d',method:'password'},'browser')).principal
 native=(await issueSession(f.ctx,{accountId:'d',method:'password'},'desktop')).principal
 await f.db.batch([
 f.execute("INSERT INTO organization_memberships(id,organization_id,account_id,preset) VALUES('md-b','org-b','d','coordinator')"),
 f.execute("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind,program_id) VALUES('target-read','md-a','org-a','program.read','program_location','a1')"),
 f.execute("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind,program_id) VALUES('actor-read','mc-a','org-a','program.read','program_location','a1')"),
 f.execute("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind) VALUES('actor-manage','mc-a','org-a','staff.manage_coordinators','organization')"),
 ])
})
it('replaces only reviewed grants atomically, increments version and replays once',async()=>{
 const changed=await changeMembershipGrants(cmd(admin),input());expect(changed).toMatchObject({id:'md-a',version:2,state:'active'})
 expect(await changeMembershipGrants(cmd(admin),input())).toEqual(changed)
 expect((await getMembership(f.ctx,owner,'org-a','md-a')).grants).toEqual([grant])
 expect(await f.execute("SELECT count(*) AS n FROM audit_events WHERE action='membership.grants'").first('n')).toBe(1)
 await expect(changeMembershipGrants(cmd(admin),input([]))).rejects.toMatchObject({code:'conflict'})
})
it('revokes organization access on the next existing browser/native request, retaining unrelated access',async()=>{
 await revokeMembership(cmd(admin),{organizationId:'org-a',membershipId:'md-a',expectedVersion:1})
 for(const principal of [target,native]){
 await expect(getProgram(f.ctx,principal,'org-a','a1')).rejects.toMatchObject({code:'not_found'})
 expect(await getOrganization(f.ctx,principal,'org-b')).toMatchObject({id:'org-b'})
 }
 expect(await f.execute("SELECT count(*) AS n FROM membership_grants WHERE membership_id='md-a'").first('n')).toBe(0)
 expect(await revokeMembership(cmd(admin),{organizationId:'org-a',membershipId:'md-a',expectedVersion:1})).toMatchObject({state:'revoked',version:2})
 await expect(changeMembershipGrants(cmd(owner,'membership-command-0002'),{...input(),expectedVersion:2})).rejects.toMatchObject({code:'conflict'})
})
it('prevents cross-organization, owner/admin target, self-escalation and coordinator management',async()=>{
 await expect(changeMembershipGrants(cmd(admin),{...input(),membershipId:'mc-a'})).rejects.toMatchObject({code:'forbidden'})
 await expect(revokeMembership(cmd(owner),{organizationId:'org-a',membershipId:'owner:org-a',expectedVersion:1})).rejects.toMatchObject({code:'forbidden'})
 await expect(changeMembershipGrants(cmd(target),input())).rejects.toMatchObject({code:'forbidden'})
 await expect(changeMembershipGrants(cmd(admin),{...input(),membershipId:'mc-b'})).rejects.toMatchObject({code:'not_found'})
 await expect(changeMembershipGrants(cmd(admin),input([{action:'program.read',scope:{kind:'organization'}}]))).rejects.toMatchObject({code:'forbidden'})
 await expect(changeMembershipGrants(cmd(owner),input([{action:'staff.manage_admins',scope:{kind:'organization'}}]))).rejects.toMatchObject({code:'invalid_input'})
})
it('requires complete current target and offered scopes, never independently unioned dimensions',async()=>{
 await f.execute("UPDATE membership_grants SET location_id='ax' WHERE id='actor-read'").run()
 await f.execute("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind,program_id,location_id) VALUES('second','mc-a','org-a','program.read','program_location','a2','ay')").run()
 await expect(changeMembershipGrants(cmd(admin),input([{action:'program.read',scope:{kind:'program_location',programId:'a1',locationId:'ay'}}]))).rejects.toMatchObject({code:'forbidden'})
 await expect(revokeMembership(cmd(admin),{organizationId:'org-a',membershipId:'md-a',expectedVersion:1})).rejects.toMatchObject({code:'forbidden'})
 expect(await revokeMembership(cmd(owner),{organizationId:'org-a',membershipId:'md-a',expectedVersion:1})).toMatchObject({state:'revoked'})
})
it('allows owner-only admin edits with exclusive five-minute passkey recency',async()=>{
 await changeMembershipGrants(cmd(owner),{organizationId:'org-a',membershipId:'mc-a',expectedVersion:1,grants:[{action:'staff.read',scope:{kind:'organization'}}]})
 f.advance(300000)
 await expect(revokeMembership(cmd(owner,'membership-command-0002'),{organizationId:'org-a',membershipId:'mc-a',expectedVersion:2})).rejects.toMatchObject({code:'forbidden'})
})
it('shows coordinators their own membership only and requires staff.read for other staff',async()=>{
 expect((await listMemberships(f.ctx,target,'org-a')).map(m=>m.id)).toEqual(['md-a'])
 await expect(getMembership(f.ctx,target,'org-a','mc-a')).rejects.toMatchObject({code:'not_found'})
 expect((await listMemberships(f.ctx,admin,'org-a')).map(m=>m.id)).toEqual(['mc-a'])
 expect((await listMemberships(f.ctx,owner,'org-a')).length).toBe(3)
})
it('races grant replacement and revocation with one version winner',async()=>{
 const results=await Promise.allSettled([changeMembershipGrants(cmd(owner),input()),revokeMembership(cmd(owner,'membership-command-0002'),{organizationId:'org-a',membershipId:'md-a',expectedVersion:1})])
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
 expect(await f.execute("SELECT count(*) AS n FROM audit_events WHERE action IN ('membership.grants','membership.revoke')").first('n')).toBe(1)
})
it('rolls back membership/grants/receipt when audit insertion fails',async()=>{
 await f.execute("CREATE TRIGGER fail_membership_audit BEFORE INSERT ON audit_events WHEN NEW.action='membership.grants' BEGIN SELECT RAISE(ABORT,'fixture'); END").run()
 await expect(changeMembershipGrants(cmd(owner),input())).rejects.toThrow()
 expect(await f.execute("SELECT version FROM organization_memberships WHERE id='md-a'").first('version')).toBe(1)
 expect(await f.execute("SELECT program_id FROM membership_grants WHERE id='target-read'").first('program_id')).toBe('a1')
 expect(await f.execute('SELECT count(*) AS n FROM command_receipts').first('n')).toBe(0)
})
it('rechecks delegated grant authority inside the final mutation batch',async()=>{
 const db=f.db,ctx=cmd(admin)
 ctx.db=new Proxy(db,{get(target,key){if(key==='batch')return async(statements:Parameters<typeof db.batch>[0])=>{await f.execute("DELETE FROM membership_grants WHERE id='actor-read'").run();return target.batch(statements)};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}})
 await expect(changeMembershipGrants(ctx,input())).rejects.toMatchObject({code:'conflict'})
 expect(await f.execute("SELECT version FROM organization_memberships WHERE id='md-a'").first('version')).toBe(1)
 expect(await f.execute("SELECT count(*) AS n FROM command_receipts").first('n')).toBe(0)
})
it('requires owner review and a passkey-ready account for promotion, and supports explicit demotion',async()=>{
 const promotion={...input([]),preset:'admin' as const}
 await expect(changeMembershipGrants(cmd(admin),promotion)).rejects.toMatchObject({code:'forbidden'})
 await expect(changeMembershipGrants(cmd(owner),promotion)).rejects.toMatchObject({code:'forbidden'})
 await f.execute("INSERT INTO passkey_users(account_id,user_handle) VALUES('d',?)",'d'.repeat(43)).run()
 await f.execute("INSERT INTO passkey_credentials(id,account_id,public_key,counter,device_type,backed_up,transports,name,created_at) VALUES('target-key','d','AA',0,'singleDevice',0,'[]','Fixture',?)",f.ctx.clock.now()).run()
 const promoted=await changeMembershipGrants(cmd(owner),promotion);expect(promoted).toMatchObject({preset:'admin',version:2})
 expect(await changeMembershipGrants(cmd(owner),promotion)).toEqual(promoted)
 await expect(changeMembershipGrants(cmd(admin,'membership-command-0002'),{...input(),expectedVersion:2,preset:'coordinator'})).rejects.toMatchObject({code:'forbidden'})
 expect(await changeMembershipGrants(cmd(owner,'membership-command-0002'),{...input(),expectedVersion:2,preset:'coordinator'})).toMatchObject({preset:'coordinator',version:3})
 expect(await changeMembershipGrants(cmd(owner),promotion)).toEqual(promoted)
})

it('rechecks credential readiness at the final administrator promotion batch',async()=>{
 await f.execute("INSERT INTO passkey_users(account_id,user_handle) VALUES('d',?)",'d'.repeat(43)).run()
 await f.execute("INSERT INTO passkey_credentials(id,account_id,public_key,counter,device_type,backed_up,transports,name,created_at) VALUES('target-key','d','AA',0,'singleDevice',0,'[]','Fixture',?)",f.ctx.clock.now()).run()
 const db=f.db,ctx=cmd(owner)
 ctx.db=new Proxy(db,{get(target,key){if(key==='batch')return async(statements:Parameters<typeof db.batch>[0])=>{await f.execute("UPDATE passkey_credentials SET disabled_at=?,version=version+1 WHERE id='target-key'",f.ctx.clock.now()).run();return target.batch(statements)};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}})
 await expect(changeMembershipGrants(ctx,{...input([]),preset:'admin'})).rejects.toMatchObject({code:'conflict'})
 expect(await f.execute("SELECT preset FROM organization_memberships WHERE id='md-a'").first('preset')).toBe('coordinator')
 expect(await f.execute('SELECT count(*) AS n FROM command_receipts').first('n')).toBe(0)
})
