import type { D1Database, SendEmail } from '@cloudflare/workers-types'
import { expect, it, vi } from 'vitest'
import { applyD1Migrations, env, type D1Migration } from 'cloudflare:test'
import { sendDownloadEmail } from '../../../src/cloudflare/download-email'

async function freshDatabase() {
  const { DB, TEST_MIGRATIONS } = env as unknown as { DB: D1Database; TEST_MIGRATIONS: D1Migration[] }
  await applyD1Migrations(DB, TEST_MIGRATIONS.slice(0, 1))
  await DB.prepare('DELETE FROM download_email_limits').run()
  return DB
}

const recipient = 'outlook-test@example.com'
const environments = [
  ['development', 'https://dev.ovelle.org', 'downloads@dev.mail.ovelle.org'],
  ['production', 'https://ovelle.org', 'downloads@mail.ovelle.org'],
] as const

function post(origin: string, headerOrigin = origin) {
  return new Request(`${origin}/api/download-email`, {
    method: 'POST',
    headers: { Origin: headerOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: recipient }),
  })
}

it.each(environments)('%s sends the branded email for its own origin and enforces its quota', async (APP_ENV, origin, sender) => {
  const DB = await freshDatabase()
  const send = vi.fn(async (_message: unknown) => ({ messageId: 'provider-id' }))
  const bindings = { DB, APP_ENV, DOWNLOAD_EMAIL_FROM: sender, EMAIL: { send } as SendEmail }
  for (let n = 0; n < 3; n++) {
    const response = await sendDownloadEmail(post(origin), bindings)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ sent: true })
  }
  expect(send).toHaveBeenCalledWith(expect.objectContaining({
    from: { email: sender, name: 'Ovelle' },
    to: recipient,
    subject: 'Your Ovelle download link',
    text: expect.stringContaining(`${origin}/#download`),
    html: expect.stringContaining(`href="${origin}/#download"`),
  }))
  expect(send.mock.calls[0][0]).toEqual(expect.objectContaining({
    html: expect.stringContaining(`${origin}/email/ovelle-volunteer-cleanup.jpg`),
  }))
  const throttled = await sendDownloadEmail(post(origin), bindings)
  expect(throttled.status).toBe(429)
  expect(throttled.headers.get('Retry-After')).toBe('600')
  expect(send).toHaveBeenCalledTimes(3)
})

it('fails closed for unknown environments, missing or swapped bindings, cross-origin requests and missing acknowledgements', async () => {
  const [, origin, sender] = environments[1]
  const DB = await freshDatabase()
  const send = vi.fn(async (_message: unknown) => ({ messageId: '' }))
  const bindings = { DB, APP_ENV: 'production', DOWNLOAD_EMAIL_FROM: sender, EMAIL: { send } as SendEmail }
  for (const overrides of [{ APP_ENV: 'preview' }, { EMAIL: undefined }, { DOWNLOAD_EMAIL_FROM: environments[0][2] }]) {
    expect((await sendDownloadEmail(post(origin), { ...bindings, ...overrides })).status).toBe(503)
  }
  expect((await sendDownloadEmail(post(origin, environments[0][1]), bindings)).status).toBe(403)
  expect(send).not.toHaveBeenCalled()
  expect((await sendDownloadEmail(post(origin), bindings)).status).toBe(503)
  expect(send).toHaveBeenCalledTimes(1)
})
