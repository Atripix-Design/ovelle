import { beforeEach, expect, it } from 'vitest'
import { databaseFixture } from './database'
import { passkeyFixture } from './passkey-fixture'
import { issueSession, resolveSession } from '../../../src/cloudflare/stage0/auth/sessions'
import { beginPrelogin } from '../../../src/cloudflare/stage0/auth/prelogin'
import { handlePasskeyRequest } from '../../../src/cloudflare/stage0/auth/passkeys/routes'

const origin = 'http://localhost:4173'; const key = new Uint8Array(32).fill(12)
const deps = { trustedIp: '127.0.0.1', budgetKey: key, turnstileSecret: 'fixture', turnstileFetch: async () => Response.json({ success: true, hostname: 'localhost', action: 'passkey_login', challenge_ts: new Date(1_792_627_200_000).toISOString() }) }
let f: Awaited<ReturnType<typeof databaseFixture>>
let cookies: Map<string, string>
beforeEach(async () => { f = await databaseFixture(); cookies = new Map() })
function request(path: string, value: unknown = {}, csrf = '', extra: Record<string, string> = {}, method = 'POST') {
  return new Request(origin + path, { method, ...(method === 'POST' ? { body: JSON.stringify(value) } : {}), headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; '), 'X-CSRF-Token': csrf, ...extra } })
}
function remember(response: Response) {
  for (const line of response.headers.getSetCookie()) { const item = line.split(';')[0]; const [name, value] = item.split('='); if (line.includes('Max-Age=0')) cookies.delete(name); else cookies.set(name, value) }
}
async function primary() {
  const issued = await issueSession(f.ctx, { accountId: 'c', method: 'password' }, 'browser')
  cookies.set('ovelle_local_session', issued.token)
  return issued
}
async function register() {
  const initial = await primary()
  const begin = await handlePasskeyRequest(f.ctx, request('/api/v1/auth/passkeys/register/start', {}, initial.csrfToken!), deps)
  expect(begin.status).toBe(200); remember(begin)
  const { options } = await begin.json() as { options: { challenge: string; user: { id: string } } }
  const fixture = await passkeyFixture()
  const finish = await handlePasskeyRequest(f.ctx, request('/api/v1/auth/passkeys/register/finish', { response: await fixture.registration(options.challenge), name: 'My passkey' }, initial.csrfToken!), deps)
  expect(finish.status).toBe(200); remember(finish)
  expect(await finish.json()).toEqual({ passkey: { id: fixture.id, name: 'My passkey' } })
  return { options, fixture, initial }
}
it('registers through account CSRF and delivers the upgraded bearer only in its cookie', async () => {
  const enrolled = await register()
  const bearer = cookies.get('ovelle_local_session')!
  expect(bearer).not.toBe(enrolled.initial.token)
  expect((await resolveSession(f.ctx, bearer, 'browser')).assurance).toBe('passkey')
  expect(cookies.has('ovelle_local_passkey')).toBe(false)
})
it('signs in from pre-login CSRF and Turnstile, then confirms using a separate flow CSRF', async () => {
  const enrolled = await register(); cookies.clear()
  const prelogin = await beginPrelogin(f.ctx, new Request(origin + '/api/v1/auth/prelogin'), key)
  const item = prelogin.cookie.split(';')[0]; const i = item.indexOf('='); cookies.set(item.slice(0, i), item.slice(i + 1))
  const start = await handlePasskeyRequest(f.ctx, request('/api/v1/auth/passkeys/login/start', { turnstileToken: 'fixture' }, prelogin.csrfToken), deps)
  expect(start.status).toBe(200); remember(start)
  const { options, csrfToken } = await start.json() as { options: { challenge: string }; csrfToken: string }
  expect(cookies.has('ovelle_local_prelogin')).toBe(false)
  enrolled.fixture.state.counter = 1
  const response = await enrolled.fixture.authentication(options.challenge, enrolled.options.user.id)
  const finish = await handlePasskeyRequest(f.ctx, request('/api/v1/auth/passkeys/login/finish', { response }, csrfToken), deps)
  expect(finish.status).toBe(204); expect(await finish.text()).toBe(''); remember(finish)
  expect((await resolveSession(f.ctx, cookies.get('ovelle_local_session')!, 'browser')).accountId).toBe('c')
})
it('denies bearer mixing, foreign origins, missing account CSRF and GET mutation attempts', async () => {
  const issued = await primary()
  for (const extra of [{ Origin: 'null' }, { Origin: 'https://foreign.example' }, { Authorization: 'Bearer anything' }, { 'X-CSRF-Token': '' }] as Record<string, string>[]) {
    const response = await handlePasskeyRequest(f.ctx, request('/api/v1/auth/passkeys/register/start', {}, issued.csrfToken!, extra), deps)
    expect(response.status).toBe(403)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('X-Request-ID')).toBe(f.ctx.requestId)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
  }
  expect((await handlePasskeyRequest(f.ctx, request('/api/v1/auth/passkeys/register/start', {}, '', {}, 'GET'), deps)).status).toBe(405)
  expect(await f.execute('SELECT count(*) AS n FROM passkey_challenges').first('n')).toBe(0)
})
it('denies a forged login flow CSRF without creating a session or consuming the pending challenge', async () => {
  const enrolled = await register(); cookies.clear()
  const prelogin = await beginPrelogin(f.ctx, new Request(origin), key)
  const [name, value] = prelogin.cookie.split(';')[0].split('='); cookies.set(name, value)
  const start = await handlePasskeyRequest(f.ctx, request('/api/v1/auth/passkeys/login/start', { turnstileToken: 'fixture' }, prelogin.csrfToken), deps); remember(start)
  const { options } = await start.json() as { options: { challenge: string } }
  enrolled.fixture.state.counter = 1
  const result = await handlePasskeyRequest(f.ctx, request('/api/v1/auth/passkeys/login/finish', { response: await enrolled.fixture.authentication(options.challenge, enrolled.options.user.id) }, 'x'.repeat(43)), deps)
  expect(result.status).toBe(403)
  expect(await f.execute("SELECT consumed_at FROM passkey_challenges WHERE purpose='login'").first('consumed_at')).toBeNull()
})
