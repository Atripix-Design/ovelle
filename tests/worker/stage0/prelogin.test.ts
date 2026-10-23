import { beforeEach, expect, it } from 'vitest'
import { databaseFixture } from './database'
import { beginPrelogin, verifyPrelogin } from '../../../src/cloudflare/stage0/auth/prelogin'
const key = new Uint8Array(32).fill(13)
let f: Awaited<ReturnType<typeof databaseFixture>>
beforeEach(async () => { f = await databaseFixture() })
it('creates a signed host cookie and separate csrf proof, reusable only within its original fifteen minutes', async () => {
  const bootstrap = await beginPrelogin(f.ctx, new Request(f.ctx.config.origin), key)
  expect(bootstrap.cookie).toContain('Path=/; HttpOnly; SameSite=Strict; Max-Age=900')
  const cookie = bootstrap.cookie.split(';')[0]
  expect(cookie).not.toContain(bootstrap.csrfToken)
  const request = () => new Request(f.ctx.config.origin, { method: 'POST', headers: { Cookie: cookie, Origin: f.ctx.config.origin, 'X-CSRF-Token': bootstrap.csrfToken } })
  await expect(verifyPrelogin(f.ctx, request(), key)).resolves.toBeUndefined()
  f.advance(60_000)
  expect((await beginPrelogin(f.ctx, request(), key)).cookie).toContain('Max-Age=840')
  f.advance(840_000)
  await expect(verifyPrelogin(f.ctx, request(), key)).rejects.toMatchObject({ code: 'forbidden' })
})
it('denies cross-site, unsigned, duplicate, wrong-environment and wrong-csrf requests', async () => {
  const a = await beginPrelogin(f.ctx, new Request(f.ctx.config.origin), key)
  const cookie = a.cookie.split(';')[0]
  const headers = { Cookie: cookie, Origin: f.ctx.config.origin, 'X-CSRF-Token': a.csrfToken }
  for (const changes of [{ Origin: 'null' }, { Origin: 'https://foreign.example' }, { 'Sec-Fetch-Site': 'cross-site' }, { 'X-CSRF-Token': 'x'.repeat(43) }, { Cookie: `${cookie}; ${cookie}` }, { Cookie: `${cookie.slice(0, -1)}!` }, { Authorization: 'Bearer fixture' }] as Record<string, string>[]) {
    await expect(verifyPrelogin(f.ctx, new Request(f.ctx.config.origin, { method: 'POST', headers: { ...headers, ...changes } }), key)).rejects.toMatchObject({ code: 'forbidden' })
  }
  const foreign = { ...f.ctx, config: { ...f.ctx.config, environment: 'development' as const, origin: 'https://dev.ovelle.org', rpId: 'dev.ovelle.org' } }
  await expect(verifyPrelogin(foreign, new Request(foreign.config.origin, { method: 'POST', headers: { ...headers, Origin: foreign.config.origin, Cookie: cookie.replace('ovelle_local_prelogin', '__Host-ovelle_prelogin') } }), key)).rejects.toMatchObject({ code: 'forbidden' })
})
