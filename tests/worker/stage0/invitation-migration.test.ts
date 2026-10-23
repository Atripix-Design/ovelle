import { env, applyD1Migrations, type D1Migration } from 'cloudflare:test'
import { expect, it } from 'vitest'
import { databaseFixture } from './database'
import { issueSession, resolveSession } from '../../../src/cloudflare/stage0/auth/sessions'
import { createOrganization, updateOrganization } from '../../../src/cloudflare/stage0/access/commands'

it('preserves populated sessions, receipts and audit through the invitation migration',async()=>{
  const f=await databaseFixture(9)
  const issued=await issueSession(f.ctx,{accountId:'d',method:'passkey'},'browser')
  const command={...f.ctx,principal:issued.principal,idempotencyKey:'migration-invitation-0001',requestDigest:'0'.repeat(64)}
  const input={name:'Before migration',contactEmail:'contact@example.test',timeZone:'UTC',firstProgram:'Program',firstLocation:'Location'}
  const created=await createOrganization(command,input)
  const receipts=(await f.execute('SELECT * FROM command_receipts ORDER BY id').all()).results
  const audit=(await f.execute('SELECT * FROM audit_events ORDER BY id').all()).results
  const sessions=(await f.execute('SELECT * FROM sessions ORDER BY id').all()).results
  await applyD1Migrations(f.db,(env as unknown as {TEST_MIGRATIONS:D1Migration[]}).TEST_MIGRATIONS)
  expect((await f.execute('SELECT * FROM command_receipts ORDER BY id').all()).results).toEqual(receipts)
  expect((await f.execute('SELECT * FROM audit_events ORDER BY id').all()).results).toEqual(audit)
  expect((await f.execute('SELECT * FROM sessions ORDER BY id').all()).results).toEqual(sessions)
  expect((await resolveSession(f.ctx,issued.token,'browser')).accountId).toBe('d')
  expect(await createOrganization(command,input)).toEqual(created)
  expect(await updateOrganization({...command,idempotencyKey:'migration-invitation-0002'},{organizationId:created.id,expectedVersion:1,name:'After migration',contactEmail:'contact@example.test',timeZone:'UTC'})).toMatchObject({name:'After migration',version:2})
  await expect(f.execute('UPDATE command_receipts SET result=?','{}').run()).rejects.toThrow('command_receipt_immutable')
  await expect(f.execute('DELETE FROM command_receipts').run()).rejects.toThrow('command_receipt_immutable')
  await expect(f.execute("UPDATE audit_events SET request_id='changed'").run()).rejects.toThrow('audit_append_only')
  await expect(f.execute('DELETE FROM audit_events').run()).rejects.toThrow('audit_append_only')
  expect((await f.execute('PRAGMA foreign_key_check').all()).results).toEqual([])
})
