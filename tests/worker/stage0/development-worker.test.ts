import { expect, it } from 'vitest'
import type { D1Database, SendEmail } from '@cloudflare/workers-types'
import worker from '../../../src/cloudflare/worker-development'
import { databaseFixture } from './database'
import { issueSession } from '../../../src/cloudflare/stage0/auth/sessions'

const origin = 'https://dev.ovelle.org'
const validKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(29))).replaceAll('=', '')
function request(path: string, options: { origin?: string; ip?: string; edge?: boolean; worker?: boolean; method?: string; authorization?: string; body?: unknown; key?: string } = {}) {
  const headers = new Headers()
  if (options.ip !== undefined) headers.set('CF-Connecting-IP', options.ip)
  if (options.worker) headers.set('CF-Worker', 'example.test')
  if (options.authorization) headers.set('Authorization', options.authorization)
  if (options.key) headers.set('Idempotency-Key', options.key)
  if (options.body !== undefined) headers.set('Content-Type', 'application/json')
  const value = new Request((options.origin ?? origin) + path, { method: options.method ?? 'GET', headers, ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }) })
  if (options.edge) Object.defineProperty(value, 'cf', { value: { colo: 'TST' } })
  return value as Parameters<typeof worker.fetch>[0]
}
function environment(db: D1Database) {
  return { APP_ENV: 'development', DB: db, AUTH_EMAIL: { send: async () => ({ messageId: 'fixture' }) } as unknown as SendEmail,
    AUTH_ORIGIN: origin, AUTH_RP_ID: 'dev.ovelle.org', AUTH_EMAIL_FROM: 'accounts@dev.mail.ovelle.org', TURNSTILE_SITE_KEY: 'fixture-site', TURNSTILE_SECRET_KEY: 'fixture-secret', AUTH_ADMISSION_KEY: validKey,
    ASSETS: { fetch: async () => new Response('asset') }, STORAGE: {}, R2_ACCOUNT_ID: 'fixture', R2_BUCKET_NAME: 'fixture', R2_ACCESS_KEY_ID: '', R2_SECRET_ACCESS_KEY: '' }
}
it('admits only reviewed development routes through direct Cloudflare edge metadata', async () => {
  const f = await databaseFixture(), env = environment(f.db)
  const allowed = await worker.fetch(request('/api/v1/auth/prelogin', { edge: true, ip: '192.0.2.9' }), env)
  expect(allowed.status).toBe(200); expect(await allowed.json()).toMatchObject({ siteKey: 'fixture-site' })
  expect(allowed.headers.get('Cache-Control')).toBe('no-store')
  for (const input of [{ edge: false, ip: '192.0.2.9' }, { edge: true }, { edge: true, ip: '192.0.2.9', worker: true }, { edge: true, ip: 'bad,192.0.2.9' }]) {
    const denied = await worker.fetch(request('/api/v1/auth/prelogin', input), env)
    expect(denied.status).toBe(503); expect(denied.headers.get('Cache-Control')).toBe('no-store')
  }
  expect((await worker.fetch(request('/api/v1/auth/saml/start', { edge: true, ip: '192.0.2.9' }), env)).status).toBe(404)
  expect((await worker.fetch(request('/api/v1/auth/recovery/consume', { edge: true, ip: '192.0.2.9' }), env)).status).toBe(404)
  expect((await worker.fetch(request('/api/v1/organizations', { edge: true, ip: '192.0.2.9' }), env)).status).toBe(404)
  expect((await worker.fetch(request('/api/v1/native/me', { edge: true, ip: '192.0.2.9' }), env)).status).toBe(401)
  expect((await worker.fetch(request('/api/v1/auth/prelogin', { edge: true, ip: '192.0.2.9', origin: 'https://ovelle.org' }), env)).status).toBe(404)
  expect((await worker.fetch(request('/api/v1/auth/prelogin', { edge: true, ip: '192.0.2.9' }), { ...env, APP_ENV: 'production' })).status).toBe(404)
  expect((await worker.fetch(request('/api/v1/auth/prelogin', { edge: true, ip: '192.0.2.9' }), { ...env, AUTH_EMAIL: undefined })).status).toBe(503)
})

it('routes an authenticated desktop organization and schedule through the real development composition', async () => {
  const f = await databaseFixture(), env = environment(f.db)
  f.ctx.clock.now = Date.now
  const session = await issueSession(f.ctx, { accountId: 'd', method: 'passkey' }, 'desktop')
  const common = { edge: true, ip: '192.0.2.9', authorization: `Bearer ${session.token}` }
  const created = await worker.fetch(request('/api/v1/native/organizations', { ...common, method: 'POST', key: 'fixture-org-key-0001', body: { name: 'Fixture new org', contactEmail: 'org@example.test', timeZone: 'America/New_York', firstProgram: 'Program', firstLocation: 'Site' } }), env)
  expect(created.status).toBe(201)
  const organization = await created.json() as { id: string }
  const programs = await (await worker.fetch(request(`/api/v1/native/organizations/${organization.id}/programs`, common), env)).json() as { programs: { id: string }[] }
  const locations = await (await worker.fetch(request(`/api/v1/native/organizations/${organization.id}/locations?programId=${programs.programs[0].id}`, common), env)).json() as { locations: { id: string }[] }
  const shift = await worker.fetch(request(`/api/v1/native/organizations/${organization.id}/volunteer-schedule`, { ...common, method: 'POST', key: 'fixture-shift-key-01', body: { programId: programs.programs[0].id, locationId: locations.locations[0].id, title: 'Fixture shift', startsAt: 1, endsAt: 60001, capacity: 1 } }), env)
  expect(shift.status).toBe(201)
  expect((await shift.json() as { id: string }).id).toBeTruthy()
  expect((await worker.fetch(request('/api/v1/native/organizations', { ...common, method: 'POST', key: 'fixture-org-key-0002', body: { name: 'Second', contactEmail: 'org@example.test', timeZone: 'UTC', firstProgram: 'Program', firstLocation: 'Site' } }), env)).status).toBe(409)
})
