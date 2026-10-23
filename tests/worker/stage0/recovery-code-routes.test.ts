import { beforeEach, expect, it } from 'vitest'
import { databaseFixture } from './database'
import { passkeyFixture } from './passkey-fixture'
import { issueSession } from '../../../src/cloudflare/stage0/auth/sessions'
import { beginPasskeyRegistration, finishPasskeyRegistration } from '../../../src/cloudflare/stage0/auth/passkeys/service'
import { handleRecoveryCodeRequest } from '../../../src/cloudflare/stage0/auth/recovery-routes'

const origin = 'http://localhost:4173', path = '/api/v1/auth/recovery/codes'
let f: Awaited<ReturnType<typeof databaseFixture>>
let session: Awaited<ReturnType<typeof issueSession>>
beforeEach(async () => {
  f = await databaseFixture()
  const initial = await issueSession(f.ctx, { accountId: 'c', method: 'password' }, 'browser')
  const key = new Uint8Array(32).fill(18), signed = await passkeyFixture()
  const started = await beginPasskeyRegistration(f.ctx, initial.principal, '127.0.0.1', key)
  session = (await finishPasskeyRegistration(f.ctx, initial.principal, started.flowToken, await signed.registration(started.options.challenge), 'Existing', '127.0.0.1', key)).session
})
function request(method = 'POST', value: unknown = { expectedVersion: 0, confirmation: true }, headers: Record<string, string> = {}, suffix = '') {
  return new Request(origin + path + suffix, { method, ...(method === 'POST' ? { body: JSON.stringify(value) } : {}), headers: {
    Origin: origin, 'Content-Type': 'application/json', Cookie: `ovelle_local_session=${session.token}`, 'X-CSRF-Token': session.csrfToken!, ...headers,
  } })
}
it('requires explicit POST confirmation and returns secrets only in its successful no-store response', async () => {
  const before = await handleRecoveryCodeRequest(f.ctx, request('GET'))
  expect(before.status).toBe(200); expect(await before.json()).toEqual({ version: 0, remaining: 0, rotatedAt: null })
  const issued = await handleRecoveryCodeRequest(f.ctx, request())
  expect(issued.status).toBe(200)
  const body = await issued.json() as { version: number; codes: string[] }
  expect(body.version).toBe(1); expect(body.codes).toHaveLength(8)
  expect(issued.headers.get('Cache-Control')).toBe('no-store')
  expect(issued.headers.get('Referrer-Policy')).toBe('no-referrer')
  expect(issued.headers.get('Access-Control-Allow-Origin')).toBeNull()
  expect(issued.headers.get('Set-Cookie')).toBeNull()
  expect(issued.headers.get('X-Request-ID')).toBe(f.ctx.requestId)
  const status = await handleRecoveryCodeRequest(f.ctx, request('GET'))
  expect(await status.json()).toEqual({ version: 1, remaining: 8, rotatedAt: f.ctx.clock.now() })
  const replay = await handleRecoveryCodeRequest(f.ctx, request())
  expect(replay.status).toBe(409); expect(await replay.json()).toEqual({ error: 'conflict' })
})
it('rejects missing confirmation, permissive body fields, version coercion and query-selected authority', async () => {
  for (const body of [{ expectedVersion: 0 }, { expectedVersion: 0, confirmation: false }, { expectedVersion: '0', confirmation: true }, { expectedVersion: 0, confirmation: true, accountId: 'd' }, null, []]) {
    expect((await handleRecoveryCodeRequest(f.ctx, request('POST', body))).status).toBe(400)
  }
  expect((await handleRecoveryCodeRequest(f.ctx, request('POST', undefined, {}, '?accountId=d'))).status).toBe(400)
  expect((await handleRecoveryCodeRequest(f.ctx, request('GET', undefined, {}, '?version=0'))).status).toBe(400)
  expect(await f.execute('SELECT count(*) AS n FROM recovery_codes').first('n')).toBe(0)
})
it('denies origin/CSRF failures and native bearer mixing before storing codes', async () => {
  for (const headers of [{ Origin: 'null' }, { Origin: 'https://foreign.example' }, { 'X-CSRF-Token': '' }, { Authorization: `Bearer ${session.token}` }, { 'Sec-Fetch-Site': 'cross-site' }, { Cookie: '' }] as Record<string, string>[] ) {
    const response = await handleRecoveryCodeRequest(f.ctx, request('POST', undefined, headers))
    expect([401, 403]).toContain(response.status)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
  }
  expect(await f.execute('SELECT count(*) AS n FROM recovery_codes').first('n')).toBe(0)
})
it('fails closed for stale proof, wrong methods, oversized JSON and unavailable storage', async () => {
  expect((await handleRecoveryCodeRequest(f.ctx, request('DELETE'))).status).toBe(405)
  expect((await handleRecoveryCodeRequest(f.ctx, request('POST', { expectedVersion: 0, confirmation: true, padding: 'x'.repeat(5000) }))).status).toBe(400)
  await f.execute("CREATE TRIGGER fail_recovery_route_audit BEFORE INSERT ON audit_events WHEN NEW.action='recovery.rotate' BEGIN SELECT RAISE(ABORT,'fixture-private-error'); END").run()
  const failed = await handleRecoveryCodeRequest(f.ctx, request())
  expect(failed.status).toBe(503); expect(await failed.json()).toEqual({ error: 'unavailable' })
  expect(await f.execute('SELECT count(*) AS n FROM recovery_codes').first('n')).toBe(0)
  f.advance(300_000)
  expect((await handleRecoveryCodeRequest(f.ctx, request())).status).toBe(403)
})
it('does not offer code consumption or reset and never mutates on GET', async () => {
  for (const suffix of ['/consume', '/reset', '/replace', '/']) expect((await handleRecoveryCodeRequest(f.ctx, request('POST', undefined, {}, suffix))).status).toBe(404)
  expect((await handleRecoveryCodeRequest(f.ctx, request('GET'))).status).toBe(200)
  expect(await f.execute('SELECT count(*) AS n FROM recovery_codes').first('n')).toBe(0)
})
