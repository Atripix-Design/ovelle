import { applyD1Migrations, env, type D1Migration } from 'cloudflare:test'
import { expect, it } from 'vitest'
import { databaseFixture } from './database'
import { issueSession, resolveSession } from '../../../src/cloudflare/stage0/auth/sessions'
it('adds SAML durable state without changing populated accounts, sessions or append-only audit', async () => {
  const f = await databaseFixture(13), session = await issueSession(f.ctx, { accountId: 'd', method: 'password' }, 'browser')
  await f.execute("INSERT INTO identity_connections(id,organization_id,protocol,provider,issuer,created_at) VALUES('legacy-saml','org-a','saml','enterprise_saml','urn:legacy',1)").run()
  await f.execute("INSERT INTO external_identities(id,account_id,connection_id,issuer,subject,created_at) VALUES('legacy-identity','d','legacy-saml','urn:legacy','exact-legacy',1)").run()
  const before = (await f.execute('SELECT * FROM audit_events').all()).results
  await applyD1Migrations(f.db, (env as unknown as { TEST_MIGRATIONS: D1Migration[] }).TEST_MIGRATIONS)
  expect((await f.execute('SELECT * FROM audit_events').all()).results).toEqual(before)
  expect((await resolveSession(f.ctx, session.token, 'browser')).accountId).toBe('d')
  expect(await f.execute("SELECT saml_name_id_format FROM external_identities WHERE id='legacy-identity'").first('saml_name_id_format')).toBeNull()
  await expect(f.execute("UPDATE external_identities SET saml_name_id_format='urn:oasis:names:tc:SAML:2.0:nameid-format:persistent' WHERE id='legacy-identity'").run()).rejects.toThrow('saml_identity_format_immutable')
  expect((await f.execute('SELECT * FROM saml_transactions').all()).results).toEqual([])
  expect((await f.execute('SELECT * FROM saml_replays').all()).results).toEqual([])
  expect((await f.execute('PRAGMA foreign_key_check').all()).results).toEqual([])
})
it('keeps pending requests immutable, single-use and bound to the correct initiating account/session', async () => {
  const f = await databaseFixture(), now = f.ctx.clock.now()
  await f.execute("INSERT INTO identity_connections(id,organization_id,protocol,provider,issuer,created_at) VALUES('saml-a','org-a','saml','enterprise_saml','urn:fixture:a',?)", now).run()
  const source = await issueSession(f.ctx, { accountId: 'd', method: 'password' }, 'browser')
  const insert = (account: string | null, session: string | null, consumed: number | null = null) => f.execute(`INSERT INTO saml_transactions(request_id,relay_digest,binding_digest,settings_digest,organization_id,connection_id,connection_version,purpose,account_id,session_id,created_at,expires_at,consumed_at) VALUES(?,?,?,?,'org-a','saml-a',1,'link',?,?,?,?,?)`, '_' + 'r'.repeat(43), 'a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64), account, session, now, now + 300_000, consumed).run()
  await expect(insert('a', source.principal.sessionId)).rejects.toThrow()
  await expect(insert('d', source.principal.sessionId, now)).rejects.toThrow()
  await insert('d', source.principal.sessionId)
  for (const sql of ["UPDATE saml_transactions SET relay_digest='changed'", "UPDATE saml_transactions SET account_id='a'", 'UPDATE saml_transactions SET expires_at=expires_at+1', 'UPDATE saml_transactions SET consumed_at=created_at+300000']) await expect(f.execute(sql).run()).rejects.toThrow()
  await f.execute('UPDATE saml_transactions SET consumed_at=created_at').run()
  await expect(f.execute('UPDATE saml_transactions SET consumed_at=created_at').run()).rejects.toThrow('saml_transaction_immutable')
  await expect(f.execute('UPDATE saml_transactions SET consumed_at=NULL').run()).rejects.toThrow('saml_transaction_immutable')
})
it('keeps replay records digest-only, unique and immutable until bounded expiry cleanup', async () => {
  const f = await databaseFixture(), now = f.ctx.clock.now()
  for (const digest of ['raw-saml-id', 'G'.repeat(64), 'f'.repeat(63)]) await expect(f.execute('INSERT INTO saml_replays(digest,created_at,expires_at) VALUES(?,?,?)', digest, now, now + 300_000).run()).rejects.toThrow()
  await f.execute('INSERT INTO saml_replays(digest,created_at,expires_at) VALUES(?,?,?)', 'a'.repeat(64), now, now + 300_000).run()
  await expect(f.execute('INSERT INTO saml_replays(digest,created_at,expires_at) VALUES(?,?,?)', 'a'.repeat(64), now, now + 300_000).run()).rejects.toThrow()
  await expect(f.execute('UPDATE saml_replays SET expires_at=expires_at+300000').run()).rejects.toThrow('saml_replay_immutable')
})
