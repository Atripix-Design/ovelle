import { beforeEach, expect, it } from 'vitest'
import { databaseFixture } from './database'
import { reserveAuthAttempt, finishAuthAttempt, consumeAuthEmailBudget } from '../../../src/cloudflare/stage0/auth/limits'

let f: Awaited<ReturnType<typeof databaseFixture>>
beforeEach(async () => { f = await databaseFixture() })
const key = new Uint8Array(32).fill(7)
const input = { email: 'person@example.test', ip: '192.0.2.10' }

it('permits five failed account/IP attempts and blocks the sixth across request contexts', async () => {
  for (let index = 0; index < 5; index++) {
    const lease = await reserveAuthAttempt(f.ctx, input, key)
    await finishAuthAttempt(f.ctx, lease, false)
  }
  await expect(reserveAuthAttempt({ ...f.ctx, requestId: 'another-request' }, input, key)).rejects.toMatchObject({ code: 'rate_limited' })
  expect(await f.execute('SELECT count(*) AS n FROM auth_attempts').first('n')).toBe(0)
})

it('counts in-flight attempts atomically and releases a success exactly once', async () => {
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => reserveAuthAttempt(f.ctx, input, key)))
  const successes = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
  expect(successes).toHaveLength(5)
  expect(results.filter(result => result.status === 'rejected')).toHaveLength(3)
  await Promise.all([finishAuthAttempt(f.ctx, successes[0], true), finishAuthAttempt(f.ctx, successes[0], true)])
  const next = await reserveAuthAttempt(f.ctx, input, key)
  expect(next).toBeTruthy()
  await expect(reserveAuthAttempt(f.ctx, input, key)).rejects.toMatchObject({ code: 'rate_limited' })
})

it('applies an IP-wide ceiling across different accounts and rolls back the other quota on denial', async () => {
  for (let index = 0; index < 30; index++) {
    const lease = await reserveAuthAttempt(f.ctx, { ...input, email: `person${index}@example.test` }, key)
    await finishAuthAttempt(f.ctx, lease, false)
  }
  const count = await f.execute('SELECT count(*) AS n FROM auth_limits').first('n')
  await expect(reserveAuthAttempt(f.ctx, { ...input, email: 'new@example.test' }, key)).rejects.toMatchObject({ code: 'rate_limited' })
  expect(await f.execute('SELECT count(*) AS n FROM auth_limits').first('n')).toBe(count)
  expect(await reserveAuthAttempt(f.ctx, { ...input, ip: '192.0.2.11' }, key)).toBeTruthy()
})

it('normalizes account lookup keys without provider-specific email merging', async () => {
  for (let index = 0; index < 5; index++) await reserveAuthAttempt(f.ctx, input, key)
  await expect(reserveAuthAttempt(f.ctx, { ...input, email: ' PERSON@EXAMPLE.TEST ' }, key)).rejects.toMatchObject({ code: 'rate_limited' })
  expect(await reserveAuthAttempt(f.ctx, { ...input, email: 'person+other@example.test' }, key)).toBeTruthy()
})

it('expires attempts at fifteen minutes and does not refund a new window with an old lease', async () => {
  const old = await reserveAuthAttempt(f.ctx, input, key)
  for (let index = 1; index < 5; index++) await reserveAuthAttempt(f.ctx, input, key)
  f.advance(899_999)
  await expect(reserveAuthAttempt(f.ctx, input, key)).rejects.toMatchObject({ code: 'rate_limited' })
  f.advance(1)
  for (let index = 0; index < 5; index++) await reserveAuthAttempt(f.ctx, input, key)
  await finishAuthAttempt(f.ctx, old, true)
  await expect(reserveAuthAttempt(f.ctx, input, key)).rejects.toMatchObject({ code: 'rate_limited' })
})

it('separately limits five auth emails per address and per IP each hour', async () => {
  for (let index = 0; index < 5; index++) await consumeAuthEmailBudget(f.ctx, { ...input, ip: `192.0.2.${index}` }, key)
  await expect(consumeAuthEmailBudget(f.ctx, { ...input, ip: '192.0.2.99' }, key)).rejects.toMatchObject({ code: 'rate_limited' })
  for (let index = 0; index < 5; index++) await consumeAuthEmailBudget(f.ctx, { ...input, email: `another${index}@example.test`, ip: '192.0.2.100' }, key)
  await expect(consumeAuthEmailBudget(f.ctx, { ...input, email: 'new@example.test', ip: '192.0.2.100' }, key)).rejects.toMatchObject({ code: 'rate_limited' })
  f.advance(3_600_000)
  await expect(consumeAuthEmailBudget(f.ctx, input, key)).resolves.toBeUndefined()
})

it('stores keyed pseudonymous limits without raw emails, IPs or key material', async () => {
  await reserveAuthAttempt(f.ctx, input, key)
  await consumeAuthEmailBudget(f.ctx, input, key)
  const rows = await f.execute('SELECT * FROM auth_limits').all<{ id: string }>()
  expect(rows.results).toHaveLength(4)
  for (const row of rows.results) expect(row.id).toMatch(/^[0-9a-f]{64}$/)
  const stored = JSON.stringify({ quotas: rows, attempts: await f.execute('SELECT * FROM auth_attempts').all() })
  expect(stored).not.toContain(input.email)
  expect(stored).not.toContain(input.ip)
})

it('rejects missing or weak server key material and invalid trusted selectors before writing data', async () => {
  await expect(reserveAuthAttempt(f.ctx, input, new Uint8Array(16))).rejects.toMatchObject({ code: 'configuration' })
  await expect(reserveAuthAttempt(f.ctx, { ...input, ip: '' }, key)).rejects.toMatchObject({ code: 'invalid_input' })
  expect(await f.execute('SELECT count(*) AS n FROM auth_limits').first('n')).toBe(0)
})
