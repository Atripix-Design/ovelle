import { applyD1Migrations, env, type D1Migration } from 'cloudflare:test'
import { expect, it } from 'vitest'
import { databaseFixture } from './database'
import { issueSession, resolveSession } from '../../../src/cloudflare/stage0/auth/sessions'
async function pending() {
  const f = await databaseFixture(), now = f.ctx.clock.now()
  await f.execute("INSERT INTO identity_connections(id,organization_id,protocol,provider,issuer,created_at) VALUES('saml','org-a','saml','enterprise_saml','urn:fixture',?)", now).run()
  await f.execute(`INSERT INTO saml_enrollments(id,token_digest,organization_id,connection_id,connection_version,settings_digest,issuer,subject,name_id_format,authenticated_at,created_at,expires_at) VALUES('pending',?,'org-a','saml',1,?,'urn:fixture','subject','urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',?,?,?)`, 'a'.repeat(64), 'b'.repeat(64), now, now, now + 900_000).run()
  return { ...f, now }
}
it('upgrades populated identity/session/audit state without creating accounts or inventing contact proof', async () => {
  const f = await databaseFixture(14), session = await issueSession(f.ctx, { accountId: 'd', method: 'password' }, 'browser')
  const audit = (await f.execute('SELECT * FROM audit_events').all()).results
  await applyD1Migrations(f.db, (env as unknown as { TEST_MIGRATIONS: D1Migration[] }).TEST_MIGRATIONS)
  expect((await resolveSession(f.ctx, session.token, 'browser')).accountId).toBe('d')
  expect((await f.execute('SELECT * FROM audit_events').all()).results).toEqual(audit)
  expect(await f.execute('SELECT count(*) AS n FROM accounts').first('n')).toBe(4)
  expect((await f.execute('SELECT * FROM saml_enrollments').all()).results).toEqual([])
  expect((await f.execute('PRAGMA foreign_key_check').all()).results).toEqual([])
})
it('keeps proof selectors, NameID format and original IdP clock immutable', async () => {
  const f = await pending()
  for (const change of ["issuer='other'", "subject='other'", "name_id_format='urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified'", 'connection_version=2', 'authenticated_at=authenticated_at+1', 'session_expires_at=expires_at+1', 'expires_at=expires_at+1', 'consumed_at=created_at']) await expect(f.execute('UPDATE saml_enrollments SET ' + change).run()).rejects.toThrow()
})
it('rejects incomplete contact expiry rather than accepting SQL NULL', async () => {
  const f = await pending()
  await expect(f.execute("UPDATE saml_enrollments SET contact_email='new@example.test',contact_name='New',contact_digest=?,contact_version=1 WHERE id='pending'", 'c'.repeat(64)).run()).rejects.toThrow()
})
it('rejects expired contact consumption and resetting a consumed enrollment', async () => {
  const f = await pending()
  await f.execute("UPDATE saml_enrollments SET contact_email='new@example.test',contact_name='New',contact_digest=?,contact_expires_at=?,contact_version=1 WHERE id='pending'", 'c'.repeat(64), f.now + 1000).run()
  await expect(f.execute('UPDATE saml_enrollments SET consumed_at=?', f.now + 1000).run()).rejects.toThrow()
  await f.execute('UPDATE saml_enrollments SET consumed_at=?', f.now).run()
  await expect(f.execute('UPDATE saml_enrollments SET consumed_at=NULL').run()).rejects.toThrow()
})
