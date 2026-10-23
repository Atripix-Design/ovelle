import {env,applyD1Migrations,type D1Migration} from 'cloudflare:test'
import {expect,it} from 'vitest'
import {databaseFixture} from './database'
import {issueSession,resolveSession} from '../../../src/cloudflare/stage0/auth/sessions'
import {createStaffInvitation} from '../../../src/cloudflare/stage0/staff/invitations'
import {changeMembershipGrants} from '../../../src/cloudflare/stage0/staff/memberships'
it('upgrades populated invitation/session/receipt/audit state and retains sealed offers',async()=>{
 const f=await databaseFixture(10),issued=await issueSession(f.ctx,{accountId:'a',method:'passkey'},'browser')
 const ctx={...f.ctx,principal:issued.principal,idempotencyKey:'staff-migration-command-0001',requestDigest:''}
 const input={organizationId:'org-a',email:'new@example.test',preset:'coordinator' as const,grants:[{action:'program.read' as const,scope:{kind:'program_location' as const,programId:'a1'}}]}
 const invitation=await createStaffInvitation(ctx,input,{ip:'127.0.0.1',budgetKey:new Uint8Array(32).fill(29)})
 const before=new Map<string,unknown>()
 for(const table of ['sessions','command_receipts','audit_events','staff_invitations','invitation_grants'])before.set(table,(await f.execute(`SELECT * FROM ${table} ORDER BY id`).all()).results)
 await applyD1Migrations(f.db,(env as unknown as {TEST_MIGRATIONS:D1Migration[]}).TEST_MIGRATIONS)
 for(const [table,rows] of before)expect((await f.execute(`SELECT * FROM ${table} ORDER BY id`).all()).results).toEqual(rows)
 expect((await resolveSession(f.ctx,issued.token,'browser')).accountId).toBe('a')
 expect(await createStaffInvitation(ctx,input,{ip:'127.0.0.1',budgetKey:new Uint8Array(32).fill(29)})).toEqual(invitation)
 expect(f.ctx.sent).toHaveLength(1)
 await expect(f.execute("INSERT INTO invitation_grants(id,invitation_id,organization_id,action,scope_kind) VALUES('late',?,'org-a','program.read','organization')",invitation.id).run()).rejects.toThrow('invitation_grant_immutable')
 expect(await changeMembershipGrants({...ctx,idempotencyKey:'staff-migration-command-0002'},{organizationId:'org-a',membershipId:'md-a',expectedVersion:1,grants:input.grants})).toMatchObject({version:2})
 await expect(f.execute('UPDATE command_receipts SET result=?','{}').run()).rejects.toThrow('command_receipt_immutable')
 await expect(f.execute('DELETE FROM audit_events').run()).rejects.toThrow('audit_append_only')
 expect((await f.execute('PRAGMA foreign_key_check').all()).results).toEqual([])
})
it('requires completion evidence and prevents ownership request rewriting or deletion',async()=>{
 const f=await databaseFixture(),issued=await issueSession(f.ctx,{accountId:'a',method:'passkey'},'browser'),now=f.ctx.clock.now()
 await f.execute("INSERT INTO ownership_transfer_requests(id,organization_id,initiator_account_id,source_session_id,source_transport,target_membership_id,target_account_id,target_membership_version,organization_version,created_at,expires_at) VALUES('transfer','org-a','a',?,'browser','mc-a','c',1,1,?,?)",issued.principal.sessionId,now,now+900000).run()
 await expect(f.execute("UPDATE ownership_transfer_requests SET state='accepted',version=2 WHERE id='transfer'").run()).rejects.toThrow()
 await expect(f.execute("UPDATE ownership_transfer_requests SET target_account_id='d',state='accepted',version=2,finished_at=? WHERE id='transfer'",now).run()).rejects.toThrow('ownership_transfer_immutable')
 await expect(f.execute("DELETE FROM ownership_transfer_requests WHERE id='transfer'").run()).rejects.toThrow('ownership_transfer_retention_required')
})
