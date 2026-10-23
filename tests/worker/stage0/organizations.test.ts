import { beforeEach, expect, it } from 'vitest'
import { databaseFixture } from './database'
import { issueSession } from '../../../src/cloudflare/stage0/auth/sessions'
import type { CommandContext, Principal } from '../../../src/cloudflare/stage0/contracts'
import { createOrganization, updateOrganization } from '../../../src/cloudflare/stage0/access/commands'
import { beginPasskeyRegistration, finishPasskeyRegistration } from '../../../src/cloudflare/stage0/auth/passkeys/service'
import { passkeyFixture } from './passkey-fixture'

let f: Awaited<ReturnType<typeof databaseFixture>>
let creator: Principal
const input = { name: 'Community group', contactEmail: 'Contact@example.test', timeZone: 'America/New_York', firstProgram: 'Food support', firstLocation: 'Town center' }
function command(principal = creator, key = 'organization-command-0001'): CommandContext {
  return { ...f.ctx, principal, idempotencyKey: key, requestDigest: '0'.repeat(64) }
}
beforeEach(async () => {
  f = await databaseFixture()
  creator = (await issueSession(f.ctx, { accountId: 'd', method: 'passkey' }, 'browser')).principal
})
it('creates one complete organization and returns its recorded identity without verification claims', async () => {
  const org = await createOrganization(command(), input)
  expect(org).toMatchObject({ name: 'Community group', contactEmail: 'contact@example.test', timeZone: 'America/New_York', version: 1 })
  expect(Object.keys(org).sort()).toEqual(['contactEmail', 'id', 'name', 'timeZone', 'version'])
  expect(await f.execute('SELECT owner_account_id,created_by_account_id FROM organizations WHERE id=?', org.id).first()).toEqual({ owner_account_id: 'd', created_by_account_id: 'd' })
  expect(await f.execute('SELECT preset,state FROM organization_memberships WHERE organization_id=? AND account_id=?', org.id, 'd').first()).toEqual({ preset: 'admin', state: 'active' })
  expect(await f.execute('SELECT count(*) AS n FROM membership_grants WHERE organization_id=?', org.id).first('n')).toBe(9)
  expect(await f.execute('SELECT name FROM programs WHERE organization_id=?', org.id).first('name')).toBe('Food support')
  expect(await f.execute('SELECT name FROM locations WHERE organization_id=?', org.id).first('name')).toBe('Town center')
  expect(await f.execute('SELECT status,assignment_review,eligibility_bypass,automatic_hour_approval FROM organization_policies WHERE organization_id=?', org.id).first()).toEqual({ status: 'proposed', assignment_review: 'staff_reviewed', eligibility_bypass: 0, automatic_hour_approval: 0 })
  expect(await f.execute("SELECT count(*) AS n FROM audit_events WHERE action='organization.create' AND organization_id=?", org.id).first('n')).toBe(1)
})
it('replays identical and concurrent retries once, rejects changed content even with the same supplied digest', async () => {
  const outcomes = await Promise.all([createOrganization(command(), input), createOrganization(command(), input)])
  expect(outcomes[1]).toEqual(outcomes[0])
  expect(await createOrganization(command(), { ...input, name: ' Community group ' })).toEqual(outcomes[0])
  await expect(createOrganization(command(), { ...input, name: 'Changed' })).rejects.toMatchObject({ code: 'conflict' })
  expect(await f.execute("SELECT count(*) AS n FROM organizations WHERE created_by_account_id='d'").first('n')).toBe(1)
  expect(await f.execute("SELECT count(*) AS n FROM command_receipts WHERE actor_account_id='d'").first('n')).toBe(1)
})
it('atomically enforces creator allowance across different keys and retains it after ownership transfer', async () => {
  const outcomes = await Promise.allSettled([createOrganization(command(), input), createOrganization(command(creator, 'organization-command-0002'), input)])
  expect(outcomes.filter(r => r.status === 'fulfilled')).toHaveLength(1)
  expect(outcomes.filter(r => r.status === 'rejected')).toHaveLength(1)
  const org = await f.execute("SELECT id FROM organizations WHERE created_by_account_id='d'").first<string>('id')
  await f.execute("INSERT INTO organization_memberships(id,organization_id,account_id,preset) VALUES('new-admin',?,'c','admin')", org).run()
  await f.execute("UPDATE organizations SET owner_account_id='c',version=version+1 WHERE id=?", org).run()
  await expect(createOrganization(command(creator, 'organization-command-0003'), input)).rejects.toMatchObject({ code: 'conflict' })
  await expect(f.execute("UPDATE organizations SET created_by_account_id='c' WHERE id=?", org).run()).rejects.toThrow()
})
it('denies primary-only, enrollment, disabled, revoked and forged assurance creation', async () => {
  const password = (await issueSession(f.ctx, { accountId: 'c', method: 'password' }, 'browser')).principal
  await expect(createOrganization(command({ ...password, assurance: 'passkey' }), input)).rejects.toMatchObject({ code: 'forbidden' })
  await f.execute("UPDATE accounts SET email_verified_at=NULL WHERE id='c'").run()
  const enrollment = (await issueSession(f.ctx, { accountId: 'c', method: 'password' }, 'browser')).principal
  await f.execute("UPDATE accounts SET email_verified_at=? WHERE id='c'", f.ctx.clock.now()).run()
  await expect(createOrganization(command(enrollment), input)).rejects.toMatchObject({ code: 'forbidden' })
  await f.execute("UPDATE sessions SET revoked_at=? WHERE id=?", f.ctx.clock.now(), creator.sessionId).run()
  await expect(createOrganization(command(), input)).rejects.toMatchObject({ code: 'unauthenticated' })
  creator = (await issueSession(f.ctx, { accountId: 'd', method: 'passkey' }, 'browser')).principal
  await f.execute("UPDATE accounts SET disabled_at=? WHERE id='d'", f.ctx.clock.now()).run()
  await expect(createOrganization(command(), input)).rejects.toMatchObject({ code: 'unauthenticated' })
})
it('does not let an organization-bound federated session create another organization after passkey step-up', async () => {
  await f.execute("INSERT INTO identity_connections(id,organization_id,protocol,provider,issuer,created_at) VALUES('saml-a','org-a','saml','enterprise_saml','urn:fixture:a',1)").run()
  await f.execute("INSERT INTO external_identities(id,account_id,connection_id,issuer,subject,created_at) VALUES('saml-d','d','saml-a','urn:fixture:a','subject-d',1)").run()
  const saml = (await issueSession(f.ctx,{accountId:'d',method:'saml',externalIdentityId:'saml-d',identityVersion:1,connectionVersion:1},'browser')).principal
  const secret=new Uint8Array(32).fill(17)
  const start=await beginPasskeyRegistration(f.ctx,saml,'127.0.0.1',secret)
  const key=await passkeyFixture()
  const {session}=await finishPasskeyRegistration(f.ctx,saml,start.flowToken,await key.registration(start.options.challenge),'Fixture key','127.0.0.1',secret)
  await expect(createOrganization(command(session.principal),input)).rejects.toMatchObject({code:'forbidden'})
})
it('accepts a verified browser passkey enrollment and invalidates creation authority with that credential', async () => {
  const primary=(await issueSession(f.ctx,{accountId:'d',method:'password'},'browser')).principal
  const secret=new Uint8Array(32).fill(17)
  const start=await beginPasskeyRegistration(f.ctx,primary,'127.0.0.1',secret)
  const key=await passkeyFixture()
  const {session,passkey}=await finishPasskeyRegistration(f.ctx,primary,start.flowToken,await key.registration(start.options.challenge),'Fixture key','127.0.0.1',secret)
  const ctx=command(session.principal)
  const org=await createOrganization(ctx,input)
  expect(org.name).toBe('Community group')
  await f.execute('UPDATE passkey_credentials SET disabled_at=?,version=version+1 WHERE id=?',f.ctx.clock.now(),passkey.id).run()
  await expect(createOrganization(ctx,input)).rejects.toMatchObject({code:'unauthenticated'})
})
it('rechecks the creator session inside the final atomic batch', async () => {
  const db=f.db
  const ctx=command()
  ctx.db=new Proxy(db,{get(target,key) {
    if(key==='batch') return async (statements: Parameters<typeof db.batch>[0]) => {
      await f.execute('UPDATE sessions SET revoked_at=? WHERE id=?',f.ctx.clock.now(),creator.sessionId).run()
      return target.batch(statements)
    }
    const value=Reflect.get(target,key,target)
    return typeof value==='function' ? value.bind(target) : value
  }})
  await expect(createOrganization(ctx,input)).rejects.toMatchObject({code:'conflict'})
  expect(await f.execute("SELECT count(*) AS n FROM organizations WHERE created_by_account_id='d'").first('n')).toBe(0)
})
it('rolls back every initial row if policy, first location, owner bootstrap or audit cannot commit', async () => {
  for (const table of ['organization_policies', 'locations', 'organization_memberships', 'audit_events']) {
    await f.execute(`CREATE TRIGGER fail_creation BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'fixture_failure'); END`).run()
    await expect(createOrganization(command(), input)).rejects.toThrow()
    expect(await f.execute("SELECT count(*) AS n FROM organizations WHERE created_by_account_id='d'").first('n')).toBe(0)
    expect(await f.execute("SELECT count(*) AS n FROM command_receipts WHERE actor_account_id='d'").first('n')).toBe(0)
    await f.execute('DROP TRIGGER fail_creation').run()
  }
  await createOrganization(command(), input)
})
it('does not commit an organization if its required owner membership is missing', async () => {
  await f.execute('DROP TRIGGER organization_owner_bootstrap').run()
  await expect(createOrganization(command(),input)).rejects.toThrow()
  expect(await f.execute("SELECT count(*) AS n FROM organizations WHERE created_by_account_id='d'").first('n')).toBe(0)
})
it('validates bounded names, email, IANA zone and idempotency keys without writing partial state', async () => {
  for (const invalid of [ {name:''}, {name:'x'.repeat(121)}, {name:'Bad\nname'}, {contactEmail:'a@b'}, {contactEmail:'a\r\n@example.test'}, {timeZone:'Made/Up'}, {timeZone:'+01:00'}, {firstProgram:''}, {firstLocation:''} ]) {
    await expect(createOrganization(command(), { ...input, ...invalid })).rejects.toMatchObject({ code:'invalid_input' })
  }
  await expect(createOrganization(command(creator, 'bad'), input)).rejects.toMatchObject({ code:'invalid_input' })
  expect(await f.execute("SELECT count(*) AS n FROM organizations WHERE created_by_account_id='d'").first('n')).toBe(0)
})
it('updates recorded settings with version/idempotency guards and denies stale or unauthorized retries', async () => {
  const org = await createOrganization(command(), input)
  const update = { organizationId: org.id, expectedVersion: 1, name: 'Updated', contactEmail:'new@example.test', timeZone:'Europe/London' }
  const ctx = command(creator, 'organization-update-0001')
  const result = await updateOrganization(ctx, update)
  expect(result).toMatchObject({ id:org.id, name:'Updated', version:2, timeZone:'Europe/London', contactEmail:'new@example.test' })
  expect(await updateOrganization(ctx, update)).toEqual(result)
  await expect(updateOrganization(command(creator, 'organization-update-0002'), update)).rejects.toMatchObject({ code:'conflict' })
  expect(await f.execute("SELECT count(*) AS n FROM audit_events WHERE action='organization.update'").first('n')).toBe(1)
  await f.execute("UPDATE sessions SET revoked_at=? WHERE id=?", f.ctx.clock.now(), creator.sessionId).run()
  await expect(updateOrganization(ctx, update)).rejects.toMatchObject({ code:'unauthenticated' })
})
it('keeps receipts isolated by actor and checks current membership before replaying old results', async () => {
  const org=await createOrganization(command(),input)
  const other=(await issueSession(f.ctx,{accountId:'c',method:'passkey'},'browser')).principal
  const otherOrg=await createOrganization(command(other),input)
  expect(otherOrg.id).not.toBe(org.id)
  await f.execute("INSERT INTO organization_memberships(id,organization_id,account_id,preset) VALUES('target-admin',?,'c','admin')",org.id).run()
  await f.execute("UPDATE organizations SET owner_account_id='c',version=version+1 WHERE id=?",org.id).run()
  await f.execute("UPDATE organization_memberships SET state='revoked',version=version+1 WHERE organization_id=? AND account_id='d'",org.id).run()
  await expect(createOrganization(command(),input)).rejects.toMatchObject({code:'not_found'})
})
