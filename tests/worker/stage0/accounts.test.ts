import { beforeEach, expect, it } from 'vitest'
import { databaseFixture } from './database'
import { createAccount, getOwnAccount } from '../../../src/cloudflare/stage0/auth/accounts'
import { issueSession } from '../../../src/cloudflare/stage0/auth/sessions'

let f: Awaited<ReturnType<typeof databaseFixture>>
beforeEach(async () => { f = await databaseFixture() })
it('creates an unverified account without credentials or membership and preserves plus addressing', async () => {
  const account = await createAccount(f.ctx,{email:' Person+tag@Example.test ',displayName:' Person '})
  expect(account).toMatchObject({email:'person+tag@example.test',displayName:'Person',verifiedAt:null})
  expect(await f.execute('SELECT count(*) AS n FROM organization_memberships WHERE account_id=?',account.id).first('n')).toBe(0)
  const session = await issueSession(f.ctx,{accountId:account.id,method:'password'},'browser')
  expect(await getOwnAccount(f.ctx,session.principal)).toEqual(account)
})
it('does not overwrite an existing account and rejects invalid addresses', async () => {
  await expect(createAccount(f.ctx,{email:' A@example.test ',displayName:'Attacker'})).rejects.toMatchObject({code:'conflict'})
  expect(await f.execute("SELECT display_name FROM accounts WHERE id='a'").first('display_name')).toBe('A')
  for (const email of ['invalid','user@example.test\r\nBcc:x@y.test','', 'a'.repeat(260)+'@example.test']) await expect(createAccount(f.ctx,{email,displayName:'Person'})).rejects.toMatchObject({code:'invalid_input'})
})
it('reads only the session account and rejects fabricated account/session combinations', async () => {
  const a = await issueSession(f.ctx,{accountId:'a',method:'password'},'browser')
  expect((await getOwnAccount(f.ctx,a.principal)).email).toBe('a@example.test')
  await expect(getOwnAccount(f.ctx,{...a.principal,accountId:'b'})).rejects.toMatchObject({code:'unauthenticated'})
})
