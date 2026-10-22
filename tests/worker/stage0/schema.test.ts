import { beforeEach, expect, it } from 'vitest'
import { databaseFixture } from './database'

let f: Awaited<ReturnType<typeof databaseFixture>>
beforeEach(async () => { f = await databaseFixture() })

it('accounts need no password or external identity, and emails remain unique', async () => {
  expect(await f.execute('SELECT count(*) AS n FROM accounts').first('n')).toBe(4)
  await expect(f.execute("INSERT INTO accounts(id,email,display_name,created_at) VALUES('e','a@example.test','E',1)").run()).rejects.toThrow()
  await expect(f.execute("INSERT INTO accounts(id,email,display_name,created_at) VALUES('e',' A@example.test ','E',1)").run()).rejects.toThrow()
})
it('prevents duplicate memberships and cross-organization grant references', async () => {
  await expect(f.execute("INSERT INTO organization_memberships(id,organization_id,account_id,preset) VALUES('dup','org-a','d','coordinator')").run()).rejects.toThrow()
  for (const [membership, program, location] of [['mc-b', 'a1', null], ['md-a', 'b1', null], ['md-a', 'a1', 'bx']]) {
    await expect(f.execute("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind,program_id,location_id) VALUES('g',?,'org-a','program.read','program_location',?,?)", membership, program, location).run()).rejects.toThrow()
  }
})
it('rejects empty scopes, unknown actions and invalid owner membership transitions', async () => {
  await expect(f.execute("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind) VALUES('g','md-a','org-a','program.read','program_location')").run()).rejects.toThrow()
  await expect(f.execute("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind) VALUES('g','md-a','org-a','finance.read','organization')").run()).rejects.toThrow()
  for (const sql of ["UPDATE organization_memberships SET state='revoked' WHERE id='owner:org-a'", "UPDATE organization_memberships SET preset='coordinator' WHERE id='owner:org-a'", "DELETE FROM organization_memberships WHERE id='owner:org-a'", "UPDATE organizations SET owner_account_id='d' WHERE id='org-a'", "UPDATE organizations SET created_by_account_id='d' WHERE id='org-a'"]) {
    await expect(f.execute(sql).run()).rejects.toThrow()
  }
})
it('creates the required owner membership atomically with the organization', async () => {
  await f.execute("INSERT INTO organizations(id,name,owner_account_id,created_by_account_id,created_at) VALUES('new-org','New','d','d',1)").run()
  expect(await f.execute("SELECT state,preset FROM organization_memberships WHERE organization_id='new-org' AND account_id='d'").first()).toEqual({ state:'active',preset:'admin' })
})
it('external identities preserve issuer/subject and cannot attach twice or cross a connection issuer', async () => {
  await f.execute("INSERT INTO identity_connections(id,protocol,provider,issuer,client_id,created_at) VALUES('google','oidc','google','https://accounts.google.com','fixture-client',1)").run()
  await f.execute("INSERT INTO external_identities(id,account_id,connection_id,issuer,subject,created_at) VALUES('i1','a','google','https://accounts.google.com','Subject-A',1)").run()
  await expect(f.execute("INSERT INTO external_identities(id,account_id,connection_id,issuer,subject,created_at) VALUES('i2','b','google','https://accounts.google.com','Subject-A',1)").run()).rejects.toThrow()
  await expect(f.execute("INSERT INTO external_identities(id,account_id,connection_id,issuer,subject,created_at) VALUES('i2','b','google','https://evil.example','Subject-B',1)").run()).rejects.toThrow()
  await f.execute("INSERT INTO external_identities(id,account_id,connection_id,issuer,subject,created_at) VALUES('i2','b','google','https://accounts.google.com','subject-a',1)").run()
  expect(await f.execute('SELECT count(*) AS n FROM external_identities').first('n')).toBe(2)
})
it('rejects OIDC connections missing a client identifier', async () => {
  await expect(f.execute("INSERT INTO identity_connections(id,protocol,provider,issuer,created_at) VALUES('bad','oidc','google','https://accounts.google.com',1)").run()).rejects.toThrow()
})
