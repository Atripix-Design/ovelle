import { beforeEach, expect, it } from 'vitest'
import { databaseFixture } from './database'
import { issueSession } from '../../../src/cloudflare/stage0/auth/sessions'
import { authorizeOrganization, getOrganization, listPrograms, getProgram } from '../../../src/cloudflare/stage0/access/organizations'
import { saveProgram } from '../../../src/cloudflare/stage0/access/commands'
import type { Principal, RequestContext } from '../../../src/cloudflare/stage0/contracts'
import { beginPasskeyRegistration, finishPasskeyRegistration } from '../../../src/cloudflare/stage0/auth/passkeys/service'
import { passkeyFixture } from './passkey-fixture'

let f: Awaited<ReturnType<typeof databaseFixture>>
let a: Principal, c: Principal, d: Principal
function renameProgram(ctx: RequestContext, principal: Principal, organizationId: string, programId: string, input: { name: string; expectedVersion: number; locationId?: string }) {
  return saveProgram({ ...ctx, principal, idempotencyKey:`authorization-command-${ctx.ids.next()}`, requestDigest:'0'.repeat(64) },
    { organizationId, id:programId, name:input.name, expectedVersion:input.expectedVersion })
}
beforeEach(async () => {
  f = await databaseFixture()
  a = (await issueSession(f.ctx, { accountId:'a', method:'passkey' }, 'browser')).principal
  c = (await issueSession(f.ctx, { accountId:'c', method:'passkey' }, 'browser')).principal
  d = (await issueSession(f.ctx, { accountId:'d', method:'password' }, 'browser')).principal
})
async function grant(membership: string, org: string, action: string, program: string | null = null, location: string | null = null) {
  await f.execute('INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind,program_id,location_id) VALUES(?,?,?,?,?,?,?)', f.ctx.ids.next(), membership, org, action, program || location ? 'program_location' : 'organization', program, location).run()
}
it('uses the selected organization membership instead of a global account role', async () => {
  await grant('mc-a','org-a','program.manage')
  await grant('mc-b','org-b','program.read','b1')
  await renameProgram(f.ctx,c,'org-a','a1',{name:'Allowed',expectedVersion:1})
  expect((await getProgram(f.ctx,c,'org-b','b1')).name).toBe('B1')
  await expect(renameProgram(f.ctx,c,'org-b','b1',{name:'Forbidden',expectedVersion:1})).rejects.toMatchObject({code:'forbidden'})
  expect((await getOrganization(f.ctx,c,'org-a')).name).toBe('A')
})
it('filters list rows by complete program/location grant intersections', async () => {
  await grant('md-a','org-a','program.read','a1','ax')
  await grant('md-a','org-a','program.read','a2','ay')
  expect((await listPrograms(f.ctx,d,'org-a',{locationId:'ax'})).map(row=>row.id)).toEqual(['a1'])
  expect((await listPrograms(f.ctx,d,'org-a',{locationId:'ay'})).map(row=>row.id)).toEqual(['a2'])
  expect(await listPrograms(f.ctx,d,'org-a')).toEqual([])
  await expect(getProgram(f.ctx,d,'org-a','a2',{locationId:'ax'})).rejects.toMatchObject({code:'not_found'})
  await expect(getProgram(f.ctx,a,'org-a','b1')).rejects.toMatchObject({code:'not_found'})
  await expect(getOrganization(f.ctx,d,'org-b')).rejects.toMatchObject({code:'not_found'})
  await expect(getOrganization(f.ctx,d,'nonexistent')).rejects.toMatchObject({code:'not_found'})
})
it('does not trust principal assurance, cached permissions, or an enrolled account alone', async () => {
  const password = (await issueSession(f.ctx,{accountId:'c',method:'password'},'browser')).principal
  await grant('mc-a','org-a','program.manage')
  await expect(renameProgram(f.ctx,{...password,assurance:'passkey'},'org-a','a1',{name:'Escalated',expectedVersion:1})).rejects.toMatchObject({code:'forbidden'})
  await authorizeOrganization(f.ctx,c,'org-a','program.manage',{kind:'program_location',programId:'a1'})
  await f.execute("DELETE FROM membership_grants WHERE membership_id='mc-a'").run()
  await expect(renameProgram(f.ctx,c,'org-a','a1',{name:'Stale',expectedVersion:1})).rejects.toMatchObject({code:'forbidden'})
  await f.execute("UPDATE accounts SET email_verified_at=NULL WHERE id='d'").run()
  const enrolled = (await issueSession(f.ctx,{accountId:'d',method:'password'},'browser')).principal
  await f.execute("UPDATE accounts SET email_verified_at=? WHERE id='d'",f.ctx.clock.now()).run()
  await expect(getOrganization(f.ctx,enrolled,'org-a')).rejects.toMatchObject({code:'not_found'})
})
it('revocation affects existing sessions immediately and does not affect other organizations', async () => {
  await f.execute("UPDATE organization_memberships SET state='revoked',version=version+1 WHERE id='mc-a'").run()
  await expect(getOrganization(f.ctx,c,'org-a')).rejects.toMatchObject({code:'not_found'})
  expect((await getOrganization(f.ctx,c,'org-b')).name).toBe('B')
})
it('reserves administrator changes and ownership for the recent-passkey owner', async () => {
  await grant('mc-a','org-a','staff.manage_admins')
  await expect(authorizeOrganization(f.ctx,c,'org-a','staff.manage_admins',{kind:'organization'})).rejects.toMatchObject({code:'forbidden'})
  await authorizeOrganization(f.ctx,a,'org-a','staff.manage_admins',{kind:'organization'})
  f.advance(300_001)
  await expect(authorizeOrganization(f.ctx,a,'org-a','ownership.transfer',{kind:'organization'})).rejects.toMatchObject({code:'forbidden'})
  await expect(authorizeOrganization(f.ctx,a,'org-a','finance.read' as never,{kind:'organization'})).rejects.toMatchObject({code:'forbidden'})
})
it('keeps coordinator access closed even if an administrative grant is inserted', async () => {
  await grant('md-a','org-a','staff.read')
  await grant('md-a','org-a','organization.update')
  await expect(authorizeOrganization(f.ctx,d,'org-a','staff.read',{kind:'organization'})).rejects.toMatchObject({code:'forbidden'})
  await expect(authorizeOrganization(f.ctx,d,'org-a','organization.update',{kind:'organization'})).rejects.toMatchObject({code:'forbidden'})
})
it('commits the permitted write and audit together, rejects stale versions and rolls back failed audit', async () => {
  await renameProgram(f.ctx,a,'org-a','a1',{name:'Changed',expectedVersion:1})
  expect(await f.execute("SELECT name,version FROM programs WHERE id='a1'").first()).toEqual({name:'Changed',version:2})
  expect(await f.execute("SELECT count(*) AS n FROM audit_events WHERE action='program.update'").first('n')).toBe(1)
  await expect(renameProgram(f.ctx,a,'org-a','a1',{name:'Stale',expectedVersion:1})).rejects.toMatchObject({code:'conflict'})
  f.ctx.ids.next = () => 'duplicate'
  await f.execute("INSERT INTO audit_events(id,actor_account_id,action,resource_id,request_id,created_at) VALUES('duplicate','a','program.update','fixture','fixture',1)").run()
  await expect(renameProgram(f.ctx,a,'org-a','a1',{name:'Rollback',expectedVersion:2})).rejects.toThrow()
  expect(await f.execute("SELECT name,version FROM programs WHERE id='a1'").first()).toEqual({name:'Changed',version:2})
})
it('racing a revoke against a write yields a valid commit order and blocks every later write', async () => {
  await grant('mc-a','org-a','program.manage')
  const results = await Promise.allSettled([
    renameProgram(f.ctx,c,'org-a','a1',{name:'Raced',expectedVersion:1}),
    f.execute("UPDATE organization_memberships SET state='revoked',version=version+1 WHERE id='mc-a'").run(),
  ])
  expect(results[1].status).toBe('fulfilled')
  if (results[0].status === 'rejected') expect(['not_found','forbidden','conflict']).toContain(results[0].reason.code)
  const version = await f.execute("SELECT version FROM programs WHERE id='a1'").first('version')
  expect(version).toBe(results[0].status === 'fulfilled' ? 2 : 1)
  expect(await f.execute("SELECT count(*) AS n FROM audit_events WHERE action='program.update'").first('n')).toBe(results[0].status === 'fulfilled' ? 1 : 0)
  await expect(renameProgram(f.ctx,c,'org-a','a1',{name:'After revoke',expectedVersion:version as number})).rejects.toMatchObject({code:'not_found'})
})
it('requires the configured SAML connection and binds its session to its organization', async () => {
  await f.execute("INSERT INTO identity_connections(id,organization_id,protocol,provider,issuer,created_at) VALUES('saml-a','org-a','saml','enterprise_saml','urn:fixture:a',1)").run()
  await f.execute("INSERT INTO external_identities(id,account_id,connection_id,issuer,subject,created_at) VALUES('saml-c','c','saml-a','urn:fixture:a','subject-c',1)").run()
  const saml = (await issueSession(f.ctx,{accountId:'c',method:'saml',externalIdentityId: 'saml-c', identityVersion: 1, connectionVersion: 1},'browser')).principal
  expect((await getOrganization(f.ctx,saml,'org-a')).name).toBe('A')
  await expect(getOrganization(f.ctx,saml,'org-b')).rejects.toMatchObject({code:'not_found'})
  await f.execute("UPDATE organizations SET required_connection_id='saml-a',version=version+1 WHERE id='org-a'").run()
  await expect(getOrganization(f.ctx,c,'org-a')).rejects.toMatchObject({code:'not_found'})
  expect((await getOrganization(f.ctx,saml,'org-a')).name).toBe('A')
  await grant('mc-a','org-a','program.manage')
  await expect(renameProgram(f.ctx,saml,'org-a','a1',{name:'No local UV',expectedVersion:1})).rejects.toMatchObject({code:'forbidden'})
  const key = new Uint8Array(32).fill(17)
  const start = await beginPasskeyRegistration(f.ctx, saml, '127.0.0.1', key)
  const authenticator = await passkeyFixture()
  const { session } = await finishPasskeyRegistration(f.ctx, saml, start.flowToken, await authenticator.registration(start.options.challenge), 'Staff passkey', '127.0.0.1', key)
  const stepped = session.principal
  expect(stepped).toMatchObject({ method: 'saml', connectionId: 'saml-a', assurance: 'passkey' })
  await renameProgram(f.ctx,stepped,'org-a','a1',{name:'SAML plus local UV',expectedVersion:1})
  await f.execute("UPDATE identity_connections SET enabled=0,version=version+1 WHERE id='saml-a'").run()
  await expect(getOrganization(f.ctx,stepped,'org-a')).rejects.toMatchObject({code:'unauthenticated'})
})
it('rejects malformed/foreign scopes, archived rows and SQL-looking identifiers', async () => {
  await expect(authorizeOrganization(f.ctx,a,'org-a','program.read',{kind:'program_location'} as never)).rejects.toMatchObject({code:'invalid_input'})
  await expect(authorizeOrganization(f.ctx,a,'org-a','program.read',{kind:'program_location',programId:'b1'})).rejects.toMatchObject({code:'not_found'})
  await expect(getProgram(f.ctx,a,'org-a',"a1' OR 1=1 --")).rejects.toMatchObject({code:'not_found'})
  await f.execute("UPDATE programs SET archived_at=1 WHERE id='a1'").run()
  await expect(getProgram(f.ctx,a,'org-a','a1')).rejects.toMatchObject({code:'not_found'})
  expect((await listPrograms(f.ctx,a,'org-a')).map(row=>row.id)).toEqual(['a2'])
})

it('does not let a location-restricted manager edit a program-wide definition', async () => {
  await grant('md-a','org-a','program.manage','a1','ax')
  await expect(renameProgram(f.ctx,d,'org-a','a1',{name:'Whole program',expectedVersion:1})).rejects.toMatchObject({code:'forbidden'})
  await expect(renameProgram(f.ctx,d,'org-a','a1',{name:'Whole program',expectedVersion:1,locationId:'ax'})).rejects.toMatchObject({code:'forbidden'})
  expect(await f.execute("SELECT name FROM programs WHERE id='a1'").first('name')).toBe('A1')
})
it('returns recorded organization settings rather than synthesized defaults', async () => {
  await f.execute("UPDATE organizations SET time_zone='America/New_York' WHERE id='org-a'").run()
  expect((await getOrganization(f.ctx,a,'org-a')).timeZone).toBe('America/New_York')
})
