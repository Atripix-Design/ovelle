import { expect, it } from 'vitest'
import { deriveAuthBudgets } from '../../../src/cloudflare/stage0/auth/budgets'

const key = new Uint8Array(32).fill(7)
const selectors = { email: 'person@example.test', ip: '192.0.2.10' }

it('retains deployed counter identities and windows against independent HMAC-SHA256 vectors', async () => {
  // Python stdlib hmac over compact JSON, not expectations derived by this module.
  expect(await deriveAuthBudgets(selectors, key, 'challenge')).toEqual([
    { kind: 'challenge_pair', id: 'ce125a1a874e6395a2b2822ff14e6b196e9ff04daa36db443617573bd4b7c6bf', lifetime: 900_000 },
    { kind: 'challenge_ip', id: 'e4be764bc470d5671cd647e4c1c40a773dce933ea849b4b30cfe43ee4ca09fea', lifetime: 900_000 },
  ])
  expect(await deriveAuthBudgets(selectors, key, 'email')).toEqual([
    { kind: 'email_address', id: 'bef09093925d2ba55995a4c13934fd2d0a4039bcde2fe689c10d9909a2939f1e', lifetime: 3_600_000 },
    { kind: 'email_ip', id: '1303275d1d1651615cfc6937a8b8a3b9ca5a404dbe62da61f8a7e770b46743d7', lifetime: 3_600_000 },
  ])
})

it('preserves opaque flow selectors, case normalization and domain separation', async () => {
  const canonical = await deriveAuthBudgets(selectors, key, 'challenge')
  expect(await deriveAuthBudgets({ ...selectors, email: '  PERSON@EXAMPLE.TEST  ' }, key, 'challenge')).toEqual(canonical)
  const flow = await deriveAuthBudgets({ ...selectors, email: 'oidc-start:google' }, key, 'challenge')
  expect(flow[0].id).not.toBe(canonical[0].id)
  expect(flow[1]).toEqual(canonical[1])
  const alternate = await deriveAuthBudgets(selectors, new Uint8Array(32).fill(8), 'challenge')
  expect(alternate[0].id).not.toBe(canonical[0].id)
  expect(alternate[1].id).not.toBe(canonical[1].id)
  expect(await deriveAuthBudgets({ ...selectors, ip: 'ABCD::1' }, key, 'challenge'))
    .toEqual(await deriveAuthBudgets({ ...selectors, ip: 'abcd::1' }, key, 'challenge'))
})

it('rejects weak keys and malformed selectors without returning counter identities', async () => {
  for (const size of [0, 16, 31, 33]) {
    await expect(deriveAuthBudgets(selectors, new Uint8Array(size), 'email')).rejects.toMatchObject({ code: 'configuration' })
  }
  for (const input of [
    { ...selectors, email: '' }, { ...selectors, email: 'a'.repeat(255) },
    { ...selectors, email: 'a\u0000b' }, { ...selectors, ip: '' },
    { ...selectors, ip: '192.0.2.1, 192.0.2.2' }, { ...selectors, ip: 'a'.repeat(65) },
  ]) await expect(deriveAuthBudgets(input, key, 'challenge')).rejects.toMatchObject({ code: 'invalid_input' })
})
