import { applyD1Migrations, env, type D1Migration } from 'cloudflare:test'
import { expect, it } from 'vitest'
import { databaseFixture } from './database'
import { issueSession, resolveSession } from '../../../src/cloudflare/stage0/auth/sessions'

it('upgrades populated transactions sessions recovery sets and audit without losing evidence', async () => {
  const f=await databaseFixture(15)
  const session=await issueSession(f.ctx,{accountId:'c',method:'password'},'browser')
  await f.execute("INSERT INTO identity_connections(id,protocol,provider,issuer,client_id,created_at) VALUES('google','oidc','google','https://accounts.google.com','fixture-client',1)").run()
  await f.execute("INSERT INTO oidc_transactions(state_digest,binding_digest,provider,connection_id,connection_version,purpose,created_at,expires_at) VALUES(?,?,'google','google',1,'login',?,?)",'1'.repeat(64),'2'.repeat(64),f.ctx.clock.now(),f.ctx.clock.now()+300000).run()
  await f.execute("INSERT INTO recovery_code_sets(account_id,version,rotated_at) VALUES('c',1,?)",f.ctx.clock.now()).run()
  await f.execute("INSERT INTO recovery_codes(account_id,position,code_digest) VALUES('c',1,?)",'a'.repeat(64)).run()
  const before=new Map<string,unknown>()
  for(const table of ['accounts','sessions','oidc_transactions','recovery_codes','recovery_code_sets','audit_events']) before.set(table,(await f.execute(`SELECT * FROM ${table}`).all()).results)
  await applyD1Migrations(f.db,(env as unknown as {TEST_MIGRATIONS:D1Migration[]}).TEST_MIGRATIONS)
  for(const [table,rows] of before) expect((await f.execute(`SELECT * FROM ${table}`).all()).results).toEqual(rows)
  expect((await resolveSession(f.ctx,session.token,'browser')).accountId).toBe('c')
  expect((await f.execute('PRAGMA foreign_key_check').all()).results).toEqual([])
  await expect(f.execute("UPDATE oidc_transactions SET purpose='recovery'").run()).rejects.toThrow('oidc_transaction_immutable')
  await expect(f.execute("UPDATE audit_events SET request_id='changed'").run()).rejects.toThrow('audit_append_only')
  await expect(f.execute('DELETE FROM audit_events').run()).rejects.toThrow('audit_append_only')
  await expect(f.execute('INSERT INTO recovery_provider_proofs(session_id,account_id,authenticated_at) VALUES(?,?,?)',session.principal.sessionId,'c',f.ctx.clock.now()).run()).rejects.toThrow('recovery_proof_source')
  await expect(f.execute('INSERT INTO recovery_enrollments(session_id,account_id,created_at,expires_at) VALUES(?,?,?,?)',session.principal.sessionId,'c',f.ctx.clock.now(),f.ctx.clock.now()+300000).run()).rejects.toThrow('recovery_enrollment_source')
})
