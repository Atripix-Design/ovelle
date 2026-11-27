import {env,applyD1Migrations,type D1Migration} from 'cloudflare:test'
import {beforeEach,expect,it} from 'vitest'
import {databaseFixture} from './database'
import {issueSession,resolveSession} from '../../../src/cloudflare/stage0/auth/sessions'
let f:Awaited<ReturnType<typeof databaseFixture>>
beforeEach(async()=>{f=await databaseFixture()})
async function pending(id='pending'){
 const now=f.ctx.clock.now();await f.execute('INSERT INTO desktop_auth_requests(id,origin,state_digest,challenge,callback_uri,created_at,expires_at) VALUES(?,?,?,?,?,?,?)',id,f.ctx.config.origin,'0'.repeat(64),'A'.repeat(43),'http://127.0.0.1:51234/ovelle-auth/callback',now,now+300_000).run();return now
}
async function approved(){const now=await pending();const issued=await issueSession(f.ctx,{accountId:'a',method:'passkey'},'browser');await f.execute('UPDATE desktop_auth_requests SET account_id=?,session_id=?,approved_at=?,code_digest=?,code_expires_at=? WHERE id=?','a',issued.principal.sessionId,now,'1'.repeat(64),now+60_000,'pending').run();return{now,issued}}
it('adds the handoff table to populated prior schema without rewriting accounts, sessions, audit or memberships',async()=>{
 f=await databaseFixture(11);const session=await issueSession(f.ctx,{accountId:'a',method:'passkey'},'browser')
 const before=await f.execute('SELECT * FROM audit_events').all(),members=await f.execute('SELECT * FROM organization_memberships ORDER BY id').all()
 await applyD1Migrations(f.db,(env as unknown as{TEST_MIGRATIONS:D1Migration[]}).TEST_MIGRATIONS)
 expect((await f.execute('SELECT * FROM audit_events').all()).results).toEqual(before.results)
 expect((await f.execute('SELECT * FROM organization_memberships ORDER BY id').all()).results).toEqual(members.results)
 expect(await resolveSession(f.ctx,session.token,'browser')).toEqual(session.principal)
 await pending();expect(await f.execute('SELECT count(*) FROM desktop_auth_requests').first('count(*)')).toBe(1)
})
it('rejects partial approval, malformed digests and invalid request/code lifetime invariants',async()=>{
 const now=await pending(),issued=await issueSession(f.ctx,{accountId:'a',method:'passkey'},'browser')
 for(const sql of ["UPDATE desktop_auth_requests SET account_id='a' WHERE id='pending'","UPDATE desktop_auth_requests SET approved_at=1 WHERE id='pending'","UPDATE desktop_auth_requests SET code_digest='raw' WHERE id='pending'","UPDATE desktop_auth_requests SET expires_at=expires_at+1 WHERE id='pending'","UPDATE desktop_auth_requests SET challenge='plain' WHERE id='pending'"])await expect(f.execute(sql).run()).rejects.toThrow()
 for(const expiry of [null,now,now+60_001,now+300_001])await expect(f.execute('UPDATE desktop_auth_requests SET account_id=?,session_id=?,approved_at=?,code_digest=?,code_expires_at=? WHERE id=?','a',issued.principal.sessionId,now,'1'.repeat(64),expiry,'pending').run()).rejects.toThrow()
 expect(await f.execute('SELECT approved_at FROM desktop_auth_requests').first('approved_at')).toBeNull()
})
it('keeps request binding and approval evidence immutable across consumption',async()=>{
 const {now}=await approved()
 for(const sql of ["UPDATE desktop_auth_requests SET callback_uri='http://evil.example' WHERE id='pending'","UPDATE desktop_auth_requests SET state_digest='"+'2'.repeat(64)+"' WHERE id='pending'","UPDATE desktop_auth_requests SET account_id='b' WHERE id='pending'","UPDATE desktop_auth_requests SET code_digest='"+'2'.repeat(64)+"' WHERE id='pending'","UPDATE desktop_auth_requests SET code_expires_at=code_expires_at+1 WHERE id='pending'","UPDATE desktop_auth_requests SET approved_at=NULL,account_id=NULL,session_id=NULL,code_digest=NULL,code_expires_at=NULL WHERE id='pending'"])await expect(f.execute(sql).run()).rejects.toThrow()
 await expect(f.execute('UPDATE desktop_auth_requests SET consumed_at=? WHERE id=?',now-1,'pending').run()).rejects.toThrow()
 await expect(f.execute('UPDATE desktop_auth_requests SET consumed_at=? WHERE id=?',now+60_000,'pending').run()).rejects.toThrow()
 await f.execute('UPDATE desktop_auth_requests SET consumed_at=? WHERE id=?',now+1,'pending').run()
 await expect(f.execute("UPDATE desktop_auth_requests SET consumed_at=NULL WHERE id='pending'").run()).rejects.toThrow()
})
it('rejects account/session mismatch, enrollment or native approval sources and preapproved insertion',async()=>{
 const now=await pending(),browser=await issueSession(f.ctx,{accountId:'a',method:'passkey'},'browser'),native=await issueSession(f.ctx,{accountId:'a',method:'passkey'},'desktop')
 await f.execute("UPDATE accounts SET email_verified_at=NULL WHERE id='b'").run();const enrollment=await issueSession(f.ctx,{accountId:'b',method:'password'},'browser')
 for(const [account,session] of [['b',browser.principal.sessionId],['a',native.principal.sessionId],['b',enrollment.principal.sessionId]])await expect(f.execute('UPDATE desktop_auth_requests SET account_id=?,session_id=?,approved_at=?,code_digest=?,code_expires_at=? WHERE id=?',account,session,now,'1'.repeat(64),now+60_000,'pending').run()).rejects.toThrow()
 await expect(f.execute('INSERT INTO desktop_auth_requests(id,origin,state_digest,challenge,callback_uri,created_at,expires_at,account_id,session_id,approved_at,code_digest,code_expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)','forged',f.ctx.config.origin,'0'.repeat(64),'A'.repeat(43),'http://127.0.0.1:51234/ovelle-auth/callback',now,now+300_000,'a',browser.principal.sessionId,now,'1'.repeat(64),now+60_000).run()).rejects.toThrow()
})
