import { env, applyD1Migrations, type D1Migration } from 'cloudflare:test'
import { expect, it } from 'vitest'
import { databaseFixture } from './database'
import { issueSession, resolveSession } from '../../../src/cloudflare/stage0/auth/sessions'
import { microsoftIssuer, tenant } from './oidc-protocol-fixture'

it('upgrades populated identity/session/audit tables and preserves exact issuer authority', async () => {
  const f = await databaseFixture(4)
  await f.execute("INSERT INTO identity_connections(id,protocol,provider,issuer,client_id,created_at) VALUES('ms','oidc','microsoft',?,'fixture',1)", microsoftIssuer(tenant)).run()
  await f.execute("INSERT INTO external_identities(id,account_id,connection_id,issuer,subject,created_at) VALUES('old','a','ms',?,'subject',1)", microsoftIssuer(tenant)).run()
  await f.execute("INSERT INTO audit_events(id,actor_account_id,action,resource_id,request_id,created_at) VALUES('existing-event','a','account.create','a','upgrade',1)").run()
  // Model an old federated session without relying on the new trusted view.
  await f.execute(`INSERT INTO sessions(id,account_id,token_digest,csrf_digest,transport,method,assurance,account_security_version,external_identity_id,external_identity_version,connection_id,connection_version,created_at,authenticated_at,expires_at)
    VALUES('old-session','a',?,?,'browser','oidc','authenticated',1,'old',1,'ms',1,?,?,?)`, 'a'.repeat(64), 'b'.repeat(64), f.ctx.clock.now(), f.ctx.clock.now(), f.ctx.clock.now() + 43_200_000).run()
  const before = await f.execute('SELECT * FROM audit_events ORDER BY id').all()
  await applyD1Migrations(f.db, (env as unknown as { TEST_MIGRATIONS: D1Migration[] }).TEST_MIGRATIONS)
  expect((await f.execute('SELECT * FROM audit_events ORDER BY id').all()).results).toEqual(before.results)
  expect(await f.execute("SELECT tenant_id FROM external_identities WHERE id='old'").first('tenant_id')).toBe(tenant)
  expect(await f.execute("SELECT id FROM stage0_live_sessions WHERE id='old-session'").first('id')).toBe('old-session')
  expect(await f.execute("SELECT count(*) AS n FROM audit_events WHERE id='existing-event'").first('n')).toBe(1)
  await expect(f.execute("UPDATE audit_events SET request_id='changed'").run()).rejects.toThrow('audit_append_only')
  await expect(f.execute('DELETE FROM audit_events').run()).rejects.toThrow('audit_append_only')
  const issued = await issueSession(f.ctx, { accountId: 'a', method: 'oidc', externalIdentityId: 'old', identityVersion: 1, connectionVersion: 1 }, 'browser')
  expect((await resolveSession(f.ctx, issued.token, 'browser')).accountId).toBe('a')
  await f.execute("UPDATE identity_connections SET issuer=?,version=2 WHERE id='ms'", microsoftIssuer('22222222-2222-4222-8222-222222222222')).run()
  await expect(issueSession(f.ctx, { accountId: 'a', method: 'oidc', externalIdentityId: 'old', identityVersion: 1, connectionVersion: 2 }, 'browser')).rejects.toMatchObject({ code: 'unauthenticated' })
})
