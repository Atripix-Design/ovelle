import { expect, it } from 'vitest'
import { databaseFixture } from './database'
import { issueSession } from '../../../src/cloudflare/stage0/auth/sessions'
import { Bindings } from '../../../src/cloudflare/stage0/db'
import { volunteerWritePredicate } from '../../../src/cloudflare/stage0/volunteer/policy'

it('requires live, scoped volunteer authority and revokes it immediately', async () => {
  const f = await databaseFixture()
  const principal = (await issueSession(f.ctx, { accountId: 'd', method: 'password' }, 'browser')).principal
  const allowed = async (programId = 'a1', locationId = 'ax') => {
    const b = new Bindings()
    const sql = volunteerWritePredicate(b, principal, 'org-a', { kind: 'program_location', programId, locationId }, 'assignment.manage', f.ctx.clock.now())
    return !!await f.db.prepare(`SELECT 1 WHERE ${sql}`).bind(...b.values).first()
  }
  await f.execute("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind) VALUES('read','md-a','org-a','program.read','organization')").run()
  expect(await allowed()).toBe(false)
  await f.execute("INSERT INTO volunteer_grants VALUES('md-a','org-a','assignment.manage','a1','ax')").run()
  expect(await allowed()).toBe(true)
  expect(await allowed('a2','ax')).toBe(false)
  expect(await allowed('a1','ay')).toBe(false)
  await f.execute("UPDATE organization_memberships SET state='revoked',version=version+1 WHERE id='md-a'").run()
  expect(await allowed()).toBe(false)
  await f.execute("UPDATE organization_memberships SET state='active',version=version+1 WHERE id='md-a'").run()
  expect(await allowed()).toBe(false)
  expect(await f.execute("SELECT count(*) AS n FROM volunteer_grants WHERE membership_id='md-a'").first('n')).toBe(0)
})
