import { beforeEach, expect, it } from 'vitest'
import { databaseFixture } from './database'
import { issueSession, resolveSession } from '../../../src/cloudflare/stage0/auth/sessions'
import { handleSessionRequest } from '../../../src/cloudflare/stage0/auth/routes'

let f: Awaited<ReturnType<typeof databaseFixture>>
beforeEach(async () => { f = await databaseFixture() })
async function fixture(transport: 'browser' | 'desktop' = 'browser') {
  const session = await issueSession(f.ctx, { accountId: 'a', method: 'password' }, transport)
  const headers: HeadersInit = transport === 'browser'
    ? { Cookie: `ovelle_local_session=${session.token}`, Origin: f.ctx.config.origin, 'X-CSRF-Token': session.csrfToken! }
    : { Authorization: `Bearer ${session.token}` }
  const send = (path: string, method = 'GET', override?: HeadersInit) => handleSessionRequest(f.ctx, new Request(`${f.ctx.config.origin}${path}`, { method, headers: override ?? headers }), transport)
  return { session, send, headers }
}
function expectPrivate(response: Response) {
  expect(response.headers.get('X-Request-ID')).toBe('fixture-request')
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
  expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
}

it('bootstraps only own account and CSRF without exposing a bearer or database security fields', async () => {
  const { session, send } = await fixture()
  const response = await send('/api/v1/me')
  expect(response.status).toBe(200)
  expectPrivate(response)
  const body = await response.text()
  expect(body).not.toContain(session.token)
  expect(body).not.toMatch(/token_digest|csrf_digest|security_version/)
  expect(JSON.parse(body)).toEqual({ account: { id: 'a', email: 'a@example.test', displayName: 'A', verifiedAt: f.ctx.clock.now() }, session: { assurance: 'authenticated', method: 'password', authenticatedAt: f.ctx.clock.now(), passkeyVerifiedAt: null }, csrfToken: session.csrfToken })
  expect(response.headers.get('Set-Cookie')).toBeNull()
})

it('returns native account state without bearer or CSRF', async () => {
  const { session, send } = await fixture('desktop')
  const response = await send('/api/v1/me')
  expectPrivate(response)
  const body = await response.text()
  expect(body).not.toContain(session.token)
  expect(JSON.parse(body).csrfToken).toBeNull()
  expect((await send('/api/v1/auth/session/rotate', 'POST')).status).toBe(404)
})

it('rotates a browser credential only in Set-Cookie and returns the new CSRF', async () => {
  const { session, send } = await fixture()
  const response = await send('/api/v1/auth/session/rotate', 'POST')
  expect(response.status).toBe(200)
  expectPrivate(response)
  const cookie = response.headers.get('Set-Cookie')!
  expect(cookie).toMatch(/^ovelle_local_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=43200$/)
  const token = cookie.split(';')[0].split('=')[1]
  const body = await response.text()
  expect(body).not.toContain(token)
  expect(body).not.toContain(session.token)
  expect(JSON.parse(body).csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(JSON.parse(body).csrfToken).not.toBe(session.csrfToken)
  await expect(resolveSession(f.ctx, session.token, 'browser')).rejects.toMatchObject({ code: 'unauthenticated' })
  expect((await resolveSession(f.ctx, token, 'browser')).accountId).toBe('a')
})

it('does not consume or rotate sessions through GET, HEAD, OPTIONS or unknown routes', async () => {
  const { session, send } = await fixture()
  for (const path of ['/api/v1/auth/logout', '/api/v1/auth/logout-all', '/api/v1/auth/session/rotate']) {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      const response = await send(path, method)
      expect(response.status).toBe(405)
      expect(response.headers.get('Allow')).toBe('POST')
      expectPrivate(response)
    }
  }
  const unknown = await send('/api/v1/auth/password/login', 'POST')
  expect(unknown.status).toBe(404)
  expectPrivate(unknown)
  expect((await send('/api/v1/me', 'POST')).status).toBe(405)
  expect((await resolveSession(f.ctx, session.token, 'browser')).accountId).toBe('a')
})

it('denies forged mutations without side effects and logs out only on a valid POST', async () => {
  const { session, send } = await fixture()
  const denied = await send('/api/v1/auth/logout', 'POST', { Cookie: `ovelle_local_session=${session.token}`, Origin: f.ctx.config.origin })
  expect(denied.status).toBe(403)
  expectPrivate(denied)
  expect((await resolveSession(f.ctx, session.token, 'browser')).accountId).toBe('a')
  const response = await send('/api/v1/auth/logout', 'POST')
  expect(response.status).toBe(204)
  expectPrivate(response)
  expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0')
  expect(await response.text()).toBe('')
  expect((await send('/api/v1/me')).status).toBe(401)
})

it('logs out all own transports without changing other accounts', async () => {
  const { send } = await fixture()
  const native = await issueSession(f.ctx, { accountId: 'a', method: 'password' }, 'desktop')
  const other = await issueSession(f.ctx, { accountId: 'b', method: 'password' }, 'browser')
  expect((await send('/api/v1/auth/logout-all', 'POST')).status).toBe(204)
  await expect(resolveSession(f.ctx, native.token, 'desktop')).rejects.toMatchObject({ code: 'unauthenticated' })
  expect((await resolveSession(f.ctx, other.token, 'browser')).accountId).toBe('b')
})

it('returns closed error codes without SQL, request secrets or cookie changes on failure', async () => {
  const { session, send } = await fixture()
  f.ctx.ids.next = () => 'duplicate-audit'
  await f.execute("INSERT INTO audit_events(id,actor_account_id,action,resource_id,request_id,created_at) VALUES('duplicate-audit','a','session.issue','fixture','fixture',1)").run()
  const response = await send('/api/v1/auth/logout', 'POST')
  expect(response.status).toBe(503)
  expectPrivate(response)
  expect(await response.json()).toEqual({ error: 'unavailable' })
  expect(response.headers.get('Set-Cookie')).toBeNull()
  expect((await resolveSession(f.ctx, session.token, 'browser')).accountId).toBe('a')
})
