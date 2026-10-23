import { beforeEach, expect, it } from 'vitest'
import { databaseFixture } from './database'
import { issueSession } from '../../../src/cloudflare/stage0/auth/sessions'
import type { CommandContext, Principal } from '../../../src/cloudflare/stage0/contracts'
import { saveProgram, saveLocation } from '../../../src/cloudflare/stage0/access/commands'
import { getLocation, listLocations, getProgram } from '../../../src/cloudflare/stage0/access/organizations'

let f: Awaited<ReturnType<typeof databaseFixture>>
let owner: Principal, scoped: Principal
function command(principal = owner, key = 'structure-command-0001'): CommandContext {
  return { ...f.ctx, principal, idempotencyKey:key, requestDigest:'0'.repeat(64) }
}
beforeEach(async () => {
  f = await databaseFixture()
  owner = (await issueSession(f.ctx, {accountId:'a',method:'passkey'}, 'browser')).principal
  scoped = (await issueSession(f.ctx, {accountId:'d',method:'password'}, 'browser')).principal
  await f.db.batch([
    f.execute("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind,program_id) VALUES('program-manager','md-a','org-a','program.manage','program_location','a1')"),
    f.execute("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind,location_id) VALUES('location-manager','md-a','org-a','location.manage','program_location','ax')"),
    f.execute("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind,program_id,location_id) VALUES('location-reader','md-a','org-a','location.read','program_location','a1','ax')"),
    f.execute("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind,program_id,location_id) VALUES('other-reader','md-a','org-a','location.read','program_location','a2','ay')"),
  ])
})
it('creates and updates scoped structure with stable receipts, version checks and tenant-qualified reads', async () => {
  const p = await saveProgram(command(), {organizationId:'org-a', name:'New program'})
  const l = await saveLocation(command(), {organizationId:'org-a', name:'New location'})
  expect(p).toMatchObject({name:'New program',version:1,archivedAt:null})
  expect(l).toMatchObject({name:'New location',version:1,archivedAt:null})
  expect(await saveProgram(command(), {organizationId:'org-a', name:'New program'})).toEqual(p)
  const changed = await saveLocation(command(owner,'structure-command-0002'), {organizationId:'org-a',id:l.id,name:'Renamed',expectedVersion:1})
  expect(changed).toMatchObject({id:l.id,name:'Renamed',version:2})
  expect((await getLocation(f.ctx,owner,'org-a',l.id)).name).toBe('Renamed')
  await expect(getLocation(f.ctx,owner,'org-a','bx')).rejects.toMatchObject({code:'not_found'})
  await expect(saveLocation(command(), {organizationId:'org-b',id:'bx',name:'Foreign',expectedVersion:1})).rejects.toMatchObject({code:'not_found'})
})
it('permits only complete grant scopes and prevents intersection grants changing shared definitions', async () => {
  await saveProgram(command(scoped), {organizationId:'org-a',id:'a1',name:'Scoped program',expectedVersion:1})
  await saveLocation(command(scoped), {organizationId:'org-a',id:'ax',name:'Scoped location',expectedVersion:1})
  await expect(saveProgram(command(scoped,'structure-command-0002'), {organizationId:'org-a',id:'a2',name:'Forbidden',expectedVersion:1})).rejects.toMatchObject({code:'forbidden'})
  await expect(saveLocation(command(scoped,'structure-command-0002'), {organizationId:'org-a',name:'New location'})).rejects.toMatchObject({code:'forbidden'})
  await f.execute("UPDATE membership_grants SET program_id='a1' WHERE id='location-manager'").run()
  await expect(saveLocation(command(scoped,'structure-command-0003'), {organizationId:'org-a',id:'ax',name:'Cross program definition',expectedVersion:2})).rejects.toMatchObject({code:'forbidden'})
  expect((await listLocations(f.ctx,scoped,'org-a',{programId:'a1'})).map(r=>r.id)).toEqual(['ax'])
  expect((await listLocations(f.ctx,scoped,'org-a',{programId:'a2'})).map(r=>r.id)).toEqual(['ay'])
  expect(await listLocations(f.ctx,scoped,'org-a')).toEqual([])
  await expect(getLocation(f.ctx,scoped,'org-a','ay',{programId:'a1'})).rejects.toMatchObject({code:'not_found'})
})
it('archives without deleting referenced rows, permits same-command replay and rejects later writes', async () => {
  const ctx=command(scoped)
  const input={organizationId:'org-a',id:'a1',name:'Archived',expectedVersion:1,archived:true}
  const result=await saveProgram(ctx,input)
  expect(result.archivedAt).toBe(f.ctx.clock.now())
  expect(await saveProgram(ctx,input)).toEqual(result)
  expect(await f.execute("SELECT program_id FROM membership_grants WHERE id='program-manager'").first('program_id')).toBe('a1')
  await expect(getProgram(f.ctx,owner,'org-a','a1')).rejects.toMatchObject({code:'not_found'})
  await expect(saveProgram(command(scoped,'structure-command-0002'),{...input,expectedVersion:2,archived:false})).rejects.toMatchObject({code:'not_found'})
  await f.execute("UPDATE organization_memberships SET state='revoked',version=version+1 WHERE id='md-a'").run()
  await expect(saveProgram(ctx,input)).rejects.toMatchObject({code:'not_found'})
})
it('rejects stale and racing versions without a successful audit or receipt for a lost write', async () => {
  const outcomes=await Promise.allSettled([
    saveLocation(command(owner,'structure-command-0001'),{organizationId:'org-a',id:'ax',name:'First',expectedVersion:1}),
    saveLocation(command(owner,'structure-command-0002'),{organizationId:'org-a',id:'ax',name:'Second',expectedVersion:1}),
  ])
  expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1)
  expect(await f.execute("SELECT version FROM locations WHERE id='ax'").first('version')).toBe(2)
  expect(await f.execute("SELECT count(*) AS n FROM audit_events WHERE action='location.update'").first('n')).toBe(1)
  expect(await f.execute("SELECT count(*) AS n FROM command_receipts WHERE command='location.save'").first('n')).toBe(1)
})
it('rolls back structure and receipt when audit fails, then allows a corrected retry', async () => {
  await f.execute("CREATE TRIGGER fail_structure_audit BEFORE INSERT ON audit_events WHEN NEW.action='program.update' BEGIN SELECT RAISE(ABORT,'fixture_failure'); END").run()
  const input={organizationId:'org-a',id:'a1',name:'Rollback',expectedVersion:1}
  await expect(saveProgram(command(),input)).rejects.toThrow()
  expect(await f.execute("SELECT name,version FROM programs WHERE id='a1'").first()).toEqual({name:'A1',version:1})
  expect(await f.execute("SELECT count(*) AS n FROM command_receipts").first('n')).toBe(0)
  await f.execute('DROP TRIGGER fail_structure_audit').run()
  expect(await saveProgram(command(),input)).toMatchObject({name:'Rollback',version:2})
})
it('denies revoked grants on cached principals and validates create/update shapes', async () => {
  const input={organizationId:'org-a',id:'a1',name:'Changed',expectedVersion:1}
  await f.execute("DELETE FROM membership_grants WHERE id='program-manager'").run()
  await expect(saveProgram(command(scoped),input)).rejects.toMatchObject({code:'forbidden'})
  for(const invalid of [{id:'a1'}, {expectedVersion:1}, {id:'a1',expectedVersion:0}, {name:''}, {name:'x'.repeat(121)}, {archived:true}, {id:'a1',expectedVersion:1,archived:'yes'}]) {
    await expect(saveProgram(command(),{organizationId:'org-a',name:'Name',...invalid} as never)).rejects.toMatchObject({code:'invalid_input'})
  }
})
it.each(['grant','membership','session','account'])('rechecks live %s authority after authorization and before commit', async change => {
  const db=f.db
  const ctx=command(scoped)
  ctx.db=new Proxy(db,{get(target,key) {
    if(key==='batch') return async (statements: Parameters<typeof db.batch>[0]) => {
      if(change==='grant') await f.execute("DELETE FROM membership_grants WHERE id='program-manager'").run()
      if(change==='membership') await f.execute("UPDATE organization_memberships SET state='revoked',version=version+1 WHERE id='md-a'").run()
      if(change==='session') await f.execute('UPDATE sessions SET revoked_at=? WHERE id=?',f.ctx.clock.now(),scoped.sessionId).run()
      if(change==='account') await f.execute("UPDATE accounts SET disabled_at=? WHERE id='d'",f.ctx.clock.now()).run()
      return target.batch(statements)
    }
    const value=Reflect.get(target,key,target)
    return typeof value==='function' ? value.bind(target) : value
  }})
  await expect(saveProgram(ctx,{organizationId:'org-a',id:'a1',name:'Must not commit',expectedVersion:1})).rejects.toMatchObject({code:'conflict'})
  expect(await f.execute("SELECT name,version FROM programs WHERE id='a1'").first()).toEqual({name:'A1',version:1})
  expect(await f.execute('SELECT count(*) AS n FROM command_receipts').first('n')).toBe(0)
})
