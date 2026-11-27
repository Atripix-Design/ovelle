import { applyD1Migrations, env, type D1Migration } from 'cloudflare:test'
import { expect, it } from 'vitest'
import { databaseFixture } from './database'
import { issueSession, resolveSession } from '../../../src/cloudflare/stage0/auth/sessions'

it('upgrades populated account/session/audit state and retains immutable audit history', async () => {
  const f = await databaseFixture(12)
  const session = await issueSession(f.ctx, { accountId: 'c', method: 'password' }, 'browser')
  const before = new Map<string, unknown>()
  for (const table of ['accounts', 'sessions', 'audit_events']) before.set(table, (await f.execute(`SELECT * FROM ${table} ORDER BY id`).all()).results)
  await applyD1Migrations(f.db, (env as unknown as { TEST_MIGRATIONS: D1Migration[] }).TEST_MIGRATIONS)
  for (const [table, rows] of before) expect((await f.execute(`SELECT * FROM ${table} ORDER BY id`).all()).results).toEqual(rows)
  expect((await resolveSession(f.ctx, session.token, 'browser')).accountId).toBe('c')
  expect((await f.execute('PRAGMA foreign_key_check').all()).results).toEqual([])
  await expect(f.execute("UPDATE audit_events SET request_id='changed'").run()).rejects.toThrow('audit_append_only')
  await expect(f.execute('DELETE FROM audit_events').run()).rejects.toThrow('audit_append_only')
  await f.execute("INSERT INTO audit_events(id,actor_account_id,session_id,action,resource_id,request_id,created_at) VALUES('rotate','c',?,'recovery.rotate','c','upgrade',?)", session.principal.sessionId, f.ctx.clock.now()).run()
})
it('bounds each account to eight digest-only positions and prevents secret rewriting', async () => {
  const f = await databaseFixture()
  await f.execute("INSERT INTO recovery_code_sets(account_id,version,rotated_at) VALUES('c',1,?)", f.ctx.clock.now()).run()
  await expect(f.execute("INSERT INTO recovery_codes(account_id,position,code_digest) VALUES('d',1,?)", '1'.repeat(64)).run()).rejects.toThrow()
  for (const invalid of ['plain-recovery-code', 'G'.repeat(64), 'a'.repeat(63)]) await expect(f.execute("INSERT INTO recovery_codes(account_id,position,code_digest) VALUES('c',1,?)", invalid).run()).rejects.toThrow()
  for (let index = 1; index <= 8; index++) await f.execute("INSERT INTO recovery_codes(account_id,position,code_digest) VALUES('c',?,?)", index, index.toString().repeat(64)).run()
  for (const index of [0, 9, 1.5]) await expect(f.execute("INSERT INTO recovery_codes(account_id,position,code_digest) VALUES('c',?,?)", index, 'a'.repeat(64)).run()).rejects.toThrow()
  await expect(f.execute("UPDATE recovery_codes SET code_digest=? WHERE account_id='c' AND position=1", 'a'.repeat(64)).run()).rejects.toThrow('recovery_code_immutable')
  expect(await f.execute('SELECT count(*) AS n FROM recovery_codes').first('n')).toBe(8)
})
it('preserves monotonic safe versions so stale rotations cannot reset or skip a generation', async () => {
  const f = await databaseFixture()
  await f.execute("INSERT INTO recovery_code_sets(account_id,version,rotated_at) VALUES('c',1,?)", f.ctx.clock.now()).run()
  for (const version of [0, 1, 3, 1.5]) await expect(f.execute("UPDATE recovery_code_sets SET version=? WHERE account_id='c'", version).run()).rejects.toThrow()
  await expect(f.execute("DELETE FROM recovery_code_sets WHERE account_id='c'").run()).rejects.toThrow('recovery_set_retention')
  await f.execute("UPDATE recovery_code_sets SET version=2 WHERE account_id='c'").run()
  expect(await f.execute("SELECT version FROM recovery_code_sets WHERE account_id='c'").first('version')).toBe(2)
})
