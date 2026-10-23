import { env, applyD1Migrations, type D1Migration } from 'cloudflare:test'
import { expect, it } from 'vitest'
import { databaseFixture } from './database'
import { issueSession, resolveSession } from '../../../src/cloudflare/stage0/auth/sessions'
import { getOrganization } from '../../../src/cloudflare/stage0/access/organizations'
import { createOrganization } from '../../../src/cloudflare/stage0/access/commands'

it('upgrades populated organization/audit/session tables without inventing contacts or policy approvals', async () => {
  const f=await databaseFixture(8)
  const session=await issueSession(f.ctx,{accountId:'a',method:'passkey'},'browser')
  const before=(await f.execute('SELECT * FROM audit_events ORDER BY id').all()).results
  await applyD1Migrations(f.db,(env as unknown as {TEST_MIGRATIONS:D1Migration[]}).TEST_MIGRATIONS)
  expect((await f.execute('SELECT * FROM audit_events ORDER BY id').all()).results).toEqual(before)
  expect((await resolveSession(f.ctx,session.token,'browser')).accountId).toBe('a')
  expect(await getOrganization(f.ctx,session.principal,'org-a')).toEqual({id:'org-a',name:'A',version:1,timeZone:'UTC',contactEmail:null})
  expect(await f.execute('SELECT count(*) AS n FROM organization_policies').first('n')).toBe(0)
  await expect(f.execute("UPDATE audit_events SET request_id='changed'").run()).rejects.toThrow('audit_append_only')
  await expect(f.execute('DELETE FROM audit_events').run()).rejects.toThrow('audit_append_only')
  await expect(f.execute("DELETE FROM organizations WHERE id='org-a'").run()).rejects.toThrow('organization_retention_required')
  await expect(f.execute("UPDATE organizations SET created_at=2 WHERE id='org-a'").run()).rejects.toThrow('organization_identity_immutable')
  const creator=(await issueSession(f.ctx,{accountId:'d',method:'passkey'},'browser')).principal
  const org=await createOrganization({...f.ctx,principal:creator,idempotencyKey:'migration-command-0001',requestDigest:'0'.repeat(64)},{name:'New',contactEmail:'new@example.test',timeZone:'UTC',firstProgram:'Program',firstLocation:'Location'})
  expect(org.contactEmail).toBe('new@example.test')
  await expect(f.execute('UPDATE command_receipts SET result=?','{}').run()).rejects.toThrow('command_receipt_immutable')
  await expect(f.execute('DELETE FROM command_receipts').run()).rejects.toThrow('command_receipt_immutable')
})
