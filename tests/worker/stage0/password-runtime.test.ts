import type { D1Database } from '@cloudflare/workers-types'
import { expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { fixtureContext } from './helpers'
import { validateCandidateParameters, deriveCandidate } from '../../../scripts/stage0-password-candidates'

it('refuses weakened or unbounded KDF parameters without fallback', async () => {
  expect(() => validateCandidateParameters({ algorithm: 'pbkdf2-sha256', iterations: 100_000, saltBytes: 16, outputBytes: 32 })).toThrow()
  expect(() => validateCandidateParameters({ algorithm: 'argon2id', memoryKiB: 1024, passes: 2, parallelism: 1, saltBytes: 16, outputBytes: 32 })).toThrow()
  expect(() => validateCandidateParameters({ algorithm: 'bcrypt', saltBytes: 16, outputBytes: 32 } as never)).toThrow()
  await expect(deriveCandidate('pbkdf2-webcrypto', new Uint8Array(4), new Uint8Array(8))).rejects.toThrow()
})

it('provides an isolated D1 database and deterministic application fixtures', async () => {
  const db = (env as unknown as { DB: D1Database }).DB
  await db.prepare('CREATE TABLE runtime_fixture (id TEXT PRIMARY KEY)').run()
  const ctx = fixtureContext(db)
  await db.prepare('INSERT INTO runtime_fixture VALUES (?)').bind(ctx.ids.next()).run()
  expect(await db.prepare('SELECT count(*) AS count FROM runtime_fixture').first('count')).toBe(1)
  expect(ctx.clock.now()).toBe(1_792_627_200_000)
  expect((await ctx.mailer.send({ to: 'fixture@example.test', kind: 'verification', url: 'https://example.test/confirm' })).status).toBe('accepted')
})

it('matches the independent Argon2id fixture and rejects the wrong password', async () => {
  const { probeCandidate } = await import('../../../scripts/stage0-password-probe')
  expect(await probeCandidate('argon2id-noble')).toBe(true)
  expect(await probeCandidate('argon2id-noble', true)).toBe(false)
})

it('runs the full PBKDF2 work factor against the independent fixture', async () => {
  const { probeCandidate } = await import('../../../scripts/stage0-password-probe')
  expect(await probeCandidate('pbkdf2-webcrypto')).toBe(true)
  expect(await probeCandidate('pbkdf2-webcrypto', true)).toBe(false)
})
