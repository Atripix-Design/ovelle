import { beforeEach, expect, it } from 'vitest'
import { databaseFixture } from './database'
import { issueSession } from '../../../src/cloudflare/stage0/auth/sessions'
import type { CommandContext, Grant, Principal } from '../../../src/cloudflare/stage0/contracts'
import { createStaffInvitation, acceptStaffInvitation, revokeStaffInvitation, resendStaffInvitation, getStaffInvitation, previewStaffInvitation, listStaffInvitations } from '../../../src/cloudflare/stage0/staff/invitations'

let f: Awaited<ReturnType<typeof databaseFixture>>
let owner: Principal, admin: Principal, recipient: Principal
const admission = { ip:'127.0.0.1', budgetKey:new Uint8Array(32).fill(19) }
const grants: Grant[] = [{action:'program.read',scope:{kind:'program_location',programId:'a1',locationId:'ax'}}]
function command(principal=owner,key='invitation-command-0001'): CommandContext { return {...f.ctx,principal,idempotencyKey:key,requestDigest:'0'.repeat(64)} }
async function create(email='new@example.test',principal=owner,key='invitation-command-0001',offered=grants,preset:'admin'|'coordinator'='coordinator') {
  return createStaffInvitation(command(principal,key),{organizationId:'org-a',email,preset,grants:offered},admission)
}
function token(index=f.ctx.sent.length-1) { return new URL(f.ctx.sent[index].url).hash.slice('#token='.length) }
async function newRecipient(email='new@example.test',method:'password'|'passkey'='password') {
  await f.execute('INSERT INTO accounts(id,email,display_name,email_verified_at,created_at) VALUES(?,?,?,?,?)',email,email,'New staff',f.ctx.clock.now(),f.ctx.clock.now()).run()
  return (await issueSession(f.ctx,{accountId:email,method},'browser')).principal
}
beforeEach(async()=>{
  f=await databaseFixture()
  owner=(await issueSession(f.ctx,{accountId:'a',method:'passkey'},'browser')).principal
  admin=(await issueSession(f.ctx,{accountId:'c',method:'passkey'},'browser')).principal
  recipient=await newRecipient()
  await f.db.batch([
    f.execute("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind) VALUES('invite-coordinators','mc-a','org-a','staff.manage_coordinators','organization')"),
    f.execute("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind,program_id) VALUES('delegated-read','mc-a','org-a','program.read','program_location','a1')"),
    f.execute("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind) VALUES('staff-read','mc-a','org-a','staff.read','organization')"),
  ])
})
it('creates only pending authority, sends after commit, and previews without consuming or activating membership',async()=>{
  f.ctx.mailer.send=async mail=>{
    expect(await f.execute("SELECT state FROM staff_invitations WHERE email='new@example.test'").first('state')).toBe('pending')
    expect(await f.execute("SELECT count(*) AS n FROM organization_memberships WHERE account_id='new@example.test'").first('n')).toBe(0)
    f.ctx.sent.push(mail);return {status:'accepted',providerId:'fixture'}
  }
  const invite=await create()
  expect(invite).toMatchObject({email:'new@example.test',preset:'coordinator',state:'pending',version:1,delivery:'pending',expiresAt:f.ctx.clock.now()+259_200_000})
  expect(await getStaffInvitation(f.ctx,owner,'org-a',invite.id)).toMatchObject({delivery:'accepted'})
  expect(await previewStaffInvitation(f.ctx,token())).toEqual({organizationName:'A',state:'pending',expiresAt:f.ctx.clock.now()+259_200_000})
  await previewStaffInvitation(f.ctx,token())
  expect(await f.execute('SELECT state FROM staff_invitations WHERE id=?',invite.id).first('state')).toBe('pending')
  expect(await f.execute("SELECT count(*) AS n FROM organization_memberships WHERE account_id='new@example.test'").first('n')).toBe(0)
  const result=await acceptStaffInvitation(command(recipient),{token:token()},admission)
  expect(result).toMatchObject({organizationId:'org-a',accountId:'new@example.test',preset:'coordinator',state:'active',version:1})
  expect((await f.execute('SELECT action,program_id,location_id FROM membership_grants WHERE membership_id=?',result.id).all()).results).toEqual([{action:'program.read',program_id:'a1',location_id:'ax'}])
  expect(await acceptStaffInvitation(command(recipient),{token:token()},admission)).toEqual(result)
})
it('replays create once without resending or accepting a changed body, and never persists the raw token',async()=>{
  const results=await Promise.all([create(),create()])
  expect(results[0]).toEqual(results[1]);expect(f.ctx.sent).toHaveLength(1)
  await expect(create('changed@example.test')).rejects.toMatchObject({code:'conflict'})
  const secret=token()
  expect(JSON.stringify((await f.execute('SELECT * FROM staff_invitations').all()).results)).not.toContain(secret)
  expect(JSON.stringify((await f.execute('SELECT * FROM command_receipts').all()).results)).not.toContain(secret)
  expect(JSON.stringify((await f.execute('SELECT * FROM audit_events').all()).results)).not.toContain(secret)
})
it('lets an admin delegate only complete covered scopes and reserves administrator offers to the recent owner',async()=>{
  await create('new@example.test',admin)
  await expect(create('x@example.test',admin,'invitation-command-0002',[{action:'program.read',scope:{kind:'program_location',locationId:'ax'}}])).rejects.toMatchObject({code:'forbidden'})
  await expect(create('x@example.test',admin,'invitation-command-0003',[{action:'program.read',scope:{kind:'organization'}}])).rejects.toMatchObject({code:'forbidden'})
  await expect(create('x@example.test',admin,'invitation-command-0004',grants,'admin')).rejects.toMatchObject({code:'forbidden'})
  await create('admin@example.test',owner,'invitation-command-0005',[{action:'staff.read',scope:{kind:'organization'}}],'admin')
  f.advance(300_000)
  await expect(create('late@example.test',owner,'invitation-command-0006',grants,'admin')).rejects.toMatchObject({code:'forbidden'})
})
it('rejects forged role/assurance, coordinator administrative offers, foreign scopes and active targets',async()=>{
  const primary=(await issueSession(f.ctx,{accountId:'c',method:'password'},'browser')).principal
  await expect(create('new@example.test',{...primary,assurance:'passkey'})).rejects.toMatchObject({code:'forbidden'})
  await expect(create('new@example.test',owner,'invitation-command-0002',[{action:'staff.read',scope:{kind:'organization'}}])).rejects.toMatchObject({code:'invalid_input'})
  await expect(create('new@example.test',owner,'invitation-command-0003',[{action:'program.read',scope:{kind:'program_location',programId:'b1'}}])).rejects.toMatchObject({code:'not_found'})
  await expect(create('c@example.test')).rejects.toMatchObject({code:'conflict'})
  await expect(create('new@example.test',owner,'invitation-command-0004',[{action:'ownership.transfer',scope:{kind:'organization'}}],'admin')).rejects.toMatchObject({code:'invalid_input'})
})
it('requires the intended verified account and passkey assurance for administrator acceptance',async()=>{
  await create('new@example.test',owner,'invitation-command-0001',grants,'admin')
  await expect(acceptStaffInvitation(command(admin),{token:token()},admission)).rejects.toMatchObject({code:'forbidden'})
  await expect(acceptStaffInvitation(command(recipient),{token:token()},admission)).rejects.toMatchObject({code:'forbidden'})
  const stepped=(await issueSession(f.ctx,{accountId:recipient.accountId,method:'passkey'},'browser')).principal
  await f.execute('UPDATE accounts SET email_verified_at=NULL WHERE id=?',recipient.accountId).run()
  await expect(acceptStaffInvitation(command(stepped),{token:token()},admission)).rejects.toMatchObject({code:'unauthenticated'})
  await f.execute('UPDATE accounts SET email_verified_at=? WHERE id=?',f.ctx.clock.now(),recipient.accountId).run()
  expect(await acceptStaffInvitation(command(stepped),{token:token()},admission)).toMatchObject({preset:'admin'})
})
it('rejects expired capabilities exactly at 72 hours and never revives revoked invitations',async()=>{
  const invite=await create()
  const old=token()
  f.advance(259_200_000)
  recipient=(await issueSession(f.ctx,{accountId:recipient.accountId,method:'password'},'browser')).principal
  owner=(await issueSession(f.ctx,{accountId:'a',method:'passkey'},'browser')).principal
  await expect(acceptStaffInvitation(command(recipient),{token:old},admission)).rejects.toMatchObject({code:'conflict'})
  await expect(resendStaffInvitation(command(owner,'invitation-command-0002'),{organizationId:'org-a',invitationId:invite.id,expectedVersion:1},admission)).rejects.toMatchObject({code:'conflict'})
  const replacement=await create('new@example.test',owner,'invitation-command-0003')
  expect(replacement.id).not.toBe(invite.id)
  expect(await f.execute('SELECT state FROM staff_invitations WHERE id=?',invite.id).first('state')).toBe('expired')
  await revokeStaffInvitation(command(owner,'invitation-command-0004'),{organizationId:'org-a',invitationId:replacement.id,expectedVersion:1})
  await expect(resendStaffInvitation(command(owner,'invitation-command-0005'),{organizationId:'org-a',invitationId:replacement.id,expectedVersion:2},admission)).rejects.toMatchObject({code:'conflict'})
})
it.each(['grant','membership','account','owner'])('rechecks current inviter %s authority at acceptance',async change=>{
  const issuer=change==='owner'?owner:admin
  await create('new@example.test',issuer,'invitation-command-0001',grants,change==='owner'?'admin':'coordinator')
  if(change==='grant')await f.execute("DELETE FROM membership_grants WHERE id='delegated-read'").run()
  if(change==='membership')await f.execute("UPDATE organization_memberships SET state='revoked',version=version+1 WHERE id='mc-a'").run()
  if(change==='account')await f.execute("UPDATE accounts SET security_version=security_version+1 WHERE id='c'").run()
  if(change==='owner')await f.execute("UPDATE organizations SET owner_account_id='c',version=version+1 WHERE id='org-a'").run()
  const target=change==='owner'?(await issueSession(f.ctx,{accountId:recipient.accountId,method:'passkey'},'browser')).principal:recipient
  await expect(acceptStaffInvitation(command(target),{token:token()},admission)).rejects.toMatchObject({code:'conflict'})
  expect(await f.execute("SELECT count(*) AS n FROM organization_memberships WHERE account_id='new@example.test'").first('n')).toBe(0)
})
it('preserves the invitation through ordinary issuer logout/expiry without retaining revoked authority',async()=>{
  await create('new@example.test',admin)
  await f.execute('UPDATE sessions SET revoked_at=? WHERE id=?',f.ctx.clock.now(),admin.sessionId).run()
  f.advance(43_200_001)
  recipient=(await issueSession(f.ctx,{accountId:recipient.accountId,method:'password'},'browser')).principal
  expect(await acceptStaffInvitation(command(recipient),{token:token()},admission)).toMatchObject({state:'active'})
})
it('handles failed delivery independently, rotates on explicit resend and invalidates the old link',async()=>{
  f.ctx.mailer.send=async mail=>{f.ctx.sent.push(mail);return {status:'failed',retryable:true}}
  const invite=await create()
  const old=token()
  expect(await getStaffInvitation(f.ctx,owner,'org-a',invite.id)).toMatchObject({state:'pending',delivery:'failed'})
  f.ctx.mailer.send=async mail=>{f.ctx.sent.push(mail);return {status:'accepted',providerId:'fixture'}}
  const input={organizationId:'org-a',invitationId:invite.id,expectedVersion:1}
  const next=await resendStaffInvitation(command(owner,'invitation-command-0002'),input,admission)
  expect(next).toMatchObject({version:2,delivery:'pending'})
  const fresh=token()
  expect(fresh).not.toBe(old)
  await expect(acceptStaffInvitation(command(recipient),{token:old},admission)).rejects.toMatchObject({code:'unauthenticated'})
  await resendStaffInvitation(command(owner,'invitation-command-0002'),input,admission)
  expect(f.ctx.sent).toHaveLength(2)
  expect(await acceptStaffInvitation(command(recipient),{token:fresh},admission)).toMatchObject({state:'active'})
})
it('does not let late old delivery overwrite a newer send or activate membership',async()=>{
  let release!:()=>void
  let entered!:()=>void
  const ready=new Promise<void>(resolve=>{entered=resolve})
  const held=new Promise<void>(resolve=>{release=resolve})
  f.ctx.mailer.send=async mail=>{f.ctx.sent.push(mail);if(f.ctx.sent.length===1){entered();await held;return {status:'failed',retryable:false}}return {status:'accepted',providerId:'new'}}
  const first=create()
  await ready
  const row=await f.execute("SELECT id FROM staff_invitations WHERE email='new@example.test'").first<string>('id')
  await resendStaffInvitation(command(owner,'invitation-command-0002'),{organizationId:'org-a',invitationId:row!,expectedVersion:1},admission)
  release();await first
  expect(await getStaffInvitation(f.ctx,owner,'org-a',row!)).toMatchObject({version:2,delivery:'accepted',state:'pending'})
  expect(await f.execute("SELECT count(*) AS n FROM organization_memberships WHERE account_id='new@example.test'").first('n')).toBe(0)
})
it('allows only one accept/revoke order and one membership across concurrent accepts',async()=>{
  const invite=await create()
  const secret=token()
  const outcomes=await Promise.allSettled([
    acceptStaffInvitation(command(recipient),{token:secret},admission),
    revokeStaffInvitation(command(owner,'invitation-command-0002'),{organizationId:'org-a',invitationId:invite.id,expectedVersion:1}),
  ])
  expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1)
  const active=await f.execute("SELECT count(*) AS n FROM organization_memberships WHERE organization_id='org-a' AND account_id='new@example.test'").first('n')
  expect(active).toBe(outcomes[0].status==='fulfilled'?1:0)
})
it('replays simultaneous acceptance once without duplicate membership/grants/audit',async()=>{
  await create()
  const secret=token()
  const results=await Promise.all([acceptStaffInvitation(command(recipient),{token:secret},admission),acceptStaffInvitation(command(recipient),{token:secret},admission)])
  expect(results[0]).toEqual(results[1])
  expect(await f.execute("SELECT count(*) AS n FROM audit_events WHERE action='invitation.accept'").first('n')).toBe(1)
})
it('reactivates revoked memberships with only newly reviewed grants and protects former admin targets',async()=>{
  await f.execute("UPDATE organization_memberships SET state='revoked',version=version+1 WHERE id='md-a'").run()
  await f.execute("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind,program_id) VALUES('old-grant','md-a','org-a','program.manage','program_location','a2')").run()
  await create('d@example.test',admin)
  const target=(await issueSession(f.ctx,{accountId:'d',method:'password'},'browser')).principal
  const result=await acceptStaffInvitation(command(target),{token:token()},admission)
  expect(result).toMatchObject({id:'md-a',version:3,preset:'coordinator'})
  expect((await f.execute("SELECT action,program_id FROM membership_grants WHERE membership_id='md-a'").all()).results).toEqual([{action:'program.read',program_id:'a1'}])
  await f.execute("UPDATE organization_memberships SET state='revoked',preset='admin',version=version+1 WHERE id='md-a'").run()
  await expect(create('d@example.test',admin,'invitation-command-0002')).rejects.toMatchObject({code:'forbidden'})
})
it('rolls back acceptance completely if a grant or audit fails and permits retry after repair',async()=>{
  const invite=await create()
  const secret=token()
  await f.execute("CREATE TRIGGER fail_invite_grant BEFORE INSERT ON membership_grants WHEN NEW.membership_id NOT IN ('mc-a','mc-b','md-a','owner:org-a','owner:org-b') BEGIN SELECT RAISE(ABORT,'fixture_failure'); END").run()
  await expect(acceptStaffInvitation(command(recipient),{token:secret},admission)).rejects.toThrow()
  expect(await f.execute('SELECT state FROM staff_invitations WHERE id=?',invite.id).first('state')).toBe('pending')
  expect(await f.execute("SELECT count(*) AS n FROM organization_memberships WHERE account_id='new@example.test'").first('n')).toBe(0)
  await f.execute('DROP TRIGGER fail_invite_grant').run()
  expect(await acceptStaffInvitation(command(recipient),{token:secret},admission)).toMatchObject({state:'active'})
})
it('seals offered grants after creation so later inserts cannot expand an accepted offer',async()=>{
  const invite=await create()
  await expect(f.execute("INSERT INTO invitation_grants(id,invitation_id,organization_id,action,scope_kind,program_id) VALUES('late-offer',?,'org-a','program.manage','program_location','a2')",invite.id).run()).rejects.toThrow('invitation_grant_immutable')
  const details=await getStaffInvitation(f.ctx,owner,'org-a',invite.id)
  expect(details.grants).toEqual(grants)
  expect((await listStaffInvitations(f.ctx,owner,'org-a')).map(i=>i.id)).toEqual([invite.id])
  await expect(getStaffInvitation(f.ctx,admin,'org-b',invite.id)).rejects.toMatchObject({code:'forbidden'})
})
it('does not union dimensions from separate inviter grants or widen a retained offer on resend',async()=>{
  await f.execute("UPDATE membership_grants SET location_id='ax' WHERE id='delegated-read'").run()
  await f.execute("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind,program_id,location_id) VALUES('second-scope','mc-a','org-a','program.read','program_location','a2','ay')").run()
  await expect(create('new@example.test',admin,'invitation-command-0001',[{action:'program.read',scope:{kind:'program_location',programId:'a1',locationId:'ay'}}])).rejects.toMatchObject({code:'forbidden'})
  const invite=await create('new@example.test',admin,'invitation-command-0002')
  await f.execute("DELETE FROM membership_grants WHERE id='delegated-read'").run()
  await expect(resendStaffInvitation(command(admin,'invitation-command-0003'),{organizationId:'org-a',invitationId:invite.id,expectedVersion:1},admission)).rejects.toMatchObject({code:'forbidden'})
})
it.each(['create','accept'])('rechecks grant authority inside the final %s batch',async change=>{
  if(change==='accept')await create('new@example.test',admin)
  const db=f.db,ctx=command(change==='create'?admin:recipient)
  let batches=0,intervened=false
  ctx.db=new Proxy(db,{get(target,key){
    if(key==='batch')return async(statements:Parameters<typeof db.batch>[0])=>{
      if(++batches===2){await f.execute("DELETE FROM membership_grants WHERE id='delegated-read'").run();intervened=true}
      return target.batch(statements)
    }
    const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value
  }})
  if(change==='create')await expect(createStaffInvitation(ctx,{organizationId:'org-a',email:'new@example.test',preset:'coordinator',grants},admission)).rejects.toMatchObject({code:'conflict'})
  else await expect(acceptStaffInvitation(ctx,{token:token()},admission)).rejects.toMatchObject({code:'conflict'})
  expect(intervened).toBe(true)
  expect(await f.execute("SELECT count(*) AS n FROM organization_memberships WHERE account_id='new@example.test'").first('n')).toBe(0)
  if(change==='create')expect(f.ctx.sent).toHaveLength(0)
})
it('races resend against an old-link acceptance without installing obsolete authority',async()=>{
  const invite=await create(),secret=token()
  const outcomes=await Promise.allSettled([
    resendStaffInvitation(command(owner,'invitation-command-0002'),{organizationId:'org-a',invitationId:invite.id,expectedVersion:1},admission),
    acceptStaffInvitation(command(recipient),{token:secret},admission),
  ])
  expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1)
  if(outcomes[0].status==='fulfilled')await expect(acceptStaffInvitation(command(recipient,'invitation-command-0003'),{token:secret},admission)).rejects.toMatchObject({code:'unauthenticated'})
})
it('charges shared email limits before sends, keeps delivery failure bounded and does not send on replay',async()=>{
  const invite=await create()
  for(let v=1;v<=4;v++)await resendStaffInvitation(command(owner,`invitation-command-resend-${v}`),{organizationId:'org-a',invitationId:invite.id,expectedVersion:v},admission)
  await expect(resendStaffInvitation(command(owner,'invitation-command-resend-5'),{organizationId:'org-a',invitationId:invite.id,expectedVersion:5},admission)).rejects.toMatchObject({code:'rate_limited'})
  expect(f.ctx.sent).toHaveLength(5)
  expect(await getStaffInvitation(f.ctx,owner,'org-a',invite.id)).toMatchObject({version:5,state:'pending'})
})
