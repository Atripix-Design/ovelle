import { beforeEach, expect, it } from 'vitest'
import { databaseFixture } from './database'
import { issueSession, revokeSession, rotateSession } from '../../../src/cloudflare/stage0/auth/sessions'
import { authenticateRequest, browserSessionCookie, clearBrowserSessionCookie, browserCsrfToken } from '../../../src/cloudflare/stage0/auth/http'

let f: Awaited<ReturnType<typeof databaseFixture>>
beforeEach(async () => { f = await databaseFixture() })
const localName = 'ovelle_local_session'
function request(headers: HeadersInit, method = 'GET', url = 'http://localhost:4173/api/v1/me') {
  return new Request(url, { method, headers })
}

it('sets hosted host-only secure cookies and a distinct local fixture cookie', async () => {
  const session = await issueSession(f.ctx, { accountId: 'a', method: 'password' }, 'browser')
  expect(await browserSessionCookie(f.ctx, session)).toBe(`${localName}=${session.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200`)
  f.ctx.config = { ...f.ctx.config, environment: 'development', origin: 'https://dev.ovelle.org', rpId: 'dev.ovelle.org' }
  expect(await browserSessionCookie(f.ctx, session)).toBe(`__Host-ovelle_session=${session.token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`)
  expect(clearBrowserSessionCookie(f.ctx.config)).toBe('__Host-ovelle_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0')
})

it('keeps the original expiry on rotation and refuses retired or native cookie credentials', async () => {
  const session = await issueSession(f.ctx, { accountId: 'a', method: 'password' }, 'browser')
  f.advance(1234)
  const next = await rotateSession(f.ctx, session.principal)
  expect(await browserSessionCookie(f.ctx, next)).toContain('Max-Age=43198')
  await expect(browserSessionCookie(f.ctx, session)).rejects.toMatchObject({ code: 'unauthenticated' })
  const native = await issueSession(f.ctx, { accountId: 'a', method: 'password' }, 'desktop')
  await expect(browserSessionCookie(f.ctx, native)).rejects.toMatchObject({ code: 'invalid_input' })
})

it('resolves the browser cookie from current database state and ignores client roles', async () => {
  const session = await issueSession(f.ctx, { accountId: 'c', method: 'password' }, 'browser')
  const req = request({ Cookie: `other=value; ${localName}=${session.token}`, 'X-Ovelle-Role': 'owner' })
  expect(await authenticateRequest(f.ctx, req, 'browser')).toEqual(session.principal)
  await revokeSession(f.ctx, session.principal, session.principal.sessionId)
  await expect(authenticateRequest(f.ctx, req, 'browser')).rejects.toMatchObject({ code: 'unauthenticated' })
})

it.each(['', 'null', 'https://evil.example', 'http://localhost:4173.evil.example', 'http://localhost:4173/'])('rejects a browser mutation with untrusted Origin %s even with valid CSRF', async origin => {
  const session = await issueSession(f.ctx, { accountId: 'a', method: 'password' }, 'browser')
  const headers = new Headers({ Cookie: `${localName}=${session.token}`, 'X-CSRF-Token': session.csrfToken! })
  if (origin) headers.set('Origin', origin)
  await expect(authenticateRequest(f.ctx, request(headers, 'POST'), 'browser')).rejects.toMatchObject({ code: 'forbidden' })
})

it('accepts only the session-bound CSRF header on mutations', async () => {
  const a = await issueSession(f.ctx, { accountId: 'a', method: 'password' }, 'browser')
  const b = await issueSession(f.ctx, { accountId: 'a', method: 'password' }, 'browser')
  const headers = new Headers({ Cookie: `${localName}=${a.token}`, Origin: f.ctx.config.origin })
  for (const value of ['', 'bad', b.csrfToken!]) {
    headers.set('X-CSRF-Token', value)
    await expect(authenticateRequest(f.ctx, request(headers, 'PATCH'), 'browser')).rejects.toMatchObject({ code: 'forbidden' })
  }
  headers.set('X-CSRF-Token', a.csrfToken!)
  expect(await authenticateRequest(f.ctx, request(headers, 'PATCH'), 'browser')).toEqual(a.principal)
})

it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('requires CSRF on %s', async method => {
  const session = await issueSession(f.ctx, { accountId: 'a', method: 'password' }, 'browser')
  await expect(authenticateRequest(f.ctx, request({ Cookie: `${localName}=${session.token}`, Origin: f.ctx.config.origin }, method), 'browser')).rejects.toMatchObject({ code: 'forbidden' })
})

it('rejects cross-origin and cross-site browser reads without requiring Origin on same-site navigation', async () => {
  const session = await issueSession(f.ctx, { accountId: 'a', method: 'password' }, 'browser')
  const headers = new Headers({ Cookie: `${localName}=${session.token}`, Origin: 'https://evil.example' })
  await expect(authenticateRequest(f.ctx, request(headers), 'browser')).rejects.toMatchObject({ code: 'forbidden' })
  headers.delete('Origin')
  headers.set('Sec-Fetch-Site', 'cross-site')
  await expect(authenticateRequest(f.ctx, request(headers), 'browser')).rejects.toMatchObject({ code: 'forbidden' })
  headers.set('Sec-Fetch-Site', 'same-origin')
  expect(await authenticateRequest(f.ctx, request(headers), 'browser')).toEqual(session.principal)
})

it('rejects foreign request hosts and does not trust forwarded host headers', async () => {
  const session = await issueSession(f.ctx, { accountId: 'a', method: 'password' }, 'browser')
  await expect(authenticateRequest(f.ctx, request({ Cookie: `${localName}=${session.token}`, 'X-Forwarded-Host': 'localhost:4173' }, 'GET', 'https://evil.example/api/v1/me'), 'browser')).rejects.toMatchObject({ code: 'forbidden' })
})

it('rejects ambiguous duplicate cookies and never decodes malformed credentials', async () => {
  const session = await issueSession(f.ctx, { accountId: 'a', method: 'password' }, 'browser')
  for (const cookie of [`${localName}=${session.token}; ${localName}=${session.token}`, `${localName}=%41${session.token.slice(1)}`, `${localName}="${session.token}"`, `__Host-ovelle_session=${session.token}`]) {
    await expect(authenticateRequest(f.ctx, request({ Cookie: cookie }), 'browser')).rejects.toMatchObject({ code: 'unauthenticated' })
  }
})

it('keeps native bearer credentials separate from browser cookies and browser requests', async () => {
  const browser = await issueSession(f.ctx, { accountId: 'a', method: 'password' }, 'browser')
  const native = await issueSession(f.ctx, { accountId: 'a', method: 'password' }, 'desktop')
  expect(await authenticateRequest(f.ctx, request({ Authorization: `Bearer ${native.token}` }, 'POST'), 'desktop')).toEqual(native.principal)
  const rejectedHeaders: HeadersInit[] = [
    { Authorization: `Bearer ${browser.token}` },
    { Cookie: `${localName}=${browser.token}` },
    { Authorization: `Bearer ${native.token}`, Origin: f.ctx.config.origin },
    { Authorization: `Bearer ${native.token}`, 'Sec-Fetch-Site': 'same-origin' },
    { Authorization: `Bearer ${native.token}`, Cookie: `${localName}=${browser.token}` },
    { Authorization: `Bearer ${native.token}, Bearer ${native.token}` },
  ]
  for (const headers of rejectedHeaders) await expect(authenticateRequest(f.ctx, request(headers, 'POST'), 'desktop')).rejects.toMatchObject({ code: 'unauthenticated' })
  await expect(authenticateRequest(f.ctx, request({ Cookie: `${localName}=${browser.token}`, Authorization: `Bearer ${native.token}` }), 'browser')).rejects.toMatchObject({ code: 'unauthenticated' })
})

it('recovers the same session-bound CSRF token after reload without rotation or readable bearer cookies', async () => {
  const a = await issueSession(f.ctx, { accountId: 'a', method: 'password' }, 'browser')
  const b = await issueSession(f.ctx, { accountId: 'a', method: 'password' }, 'browser')
  const req = request({ Cookie: `${localName}=${a.token}` })
  expect(await browserCsrfToken(f.ctx, req)).toBe(a.csrfToken)
  expect(await browserCsrfToken(f.ctx, req)).not.toBe(b.csrfToken)
  expect(await f.execute('SELECT count(*) AS n FROM sessions').first('n')).toBe(2)
  await expect(browserCsrfToken(f.ctx, request({ Cookie: `${localName}=${a.token}`, Origin: 'https://evil.example' }))).rejects.toMatchObject({ code: 'forbidden' })
  await revokeSession(f.ctx, a.principal, a.principal.sessionId)
  await expect(browserCsrfToken(f.ctx, req)).rejects.toMatchObject({ code: 'unauthenticated' })
})
