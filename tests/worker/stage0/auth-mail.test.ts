import { describe, expect, it } from 'vitest'
import type { EmailMessage, EmailMessageBuilder, SendEmail } from '@cloudflare/workers-types'
import type { AuthEmail } from '../../../src/cloudflare/stage0/contracts'
import type { Stage0Config } from '../../../src/cloudflare/stage0/config'
import { createAuthMailer } from '../../../src/cloudflare/stage0/auth/mail'
import { sendContactVerification } from '../../../src/cloudflare/stage0/auth/contact'
import { randomSecret } from '../../../src/cloudflare/stage0/auth/secrets'
import { databaseFixture } from './database'
import { issueSession } from '../../../src/cloudflare/stage0/auth/sessions'
import { createStaffInvitation, getStaffInvitation } from '../../../src/cloudflare/stage0/staff/invitations'

const config = (): Stage0Config => ({ environment: 'development', origin: 'https://dev.ovelle.org', rpId: 'dev.ovelle.org', emailFrom: 'accounts@auth.example.test', enabled: false, passwordDecision: 'pending' })
const token = randomSecret()
const verification = `https://dev.ovelle.org/account/verify-contact#token=${token}`
const invitation = `https://dev.ovelle.org/account/staff-invitation#token=${token}`
const input = (): AuthEmail => ({ to: ' Person@Example.test ', kind: 'verification', url: verification })
const failed = { status: 'failed', retryable: false }
// Only the external binding is replaced. Tests inspect the adapter's emitted
// payloads and real service/D1 effects; no network or provider account is used.
function transport(result: unknown = { messageId: 'fixture-message-id' }) {
  const messages: EmailMessageBuilder[] = []
  const binding: Pick<SendEmail, 'send'> = {
    async send(message: EmailMessage | EmailMessageBuilder) {
      if (!('subject' in message)) throw new Error('Unexpected raw email')
      messages.push(message)
      if (result instanceof Error) throw result
      return result as { messageId: string }
    },
  }
  return { binding, messages }
}

describe('authentication mail binding', () => {
  it.each([
    ['verification', verification],
    ['verification', `${verification}&flow=saml`],
    ['staff_invitation', invitation],
  ] as const)('composes a single safe %s message with its exact fragment link', async (kind, url) => {
    const t = transport()
    const result = await createAuthMailer(config(), t.binding).send({ ...input(), kind, url })
    expect(result).toEqual({ status: 'accepted', providerId: 'fixture-message-id' })
    expect(t.messages).toHaveLength(1)
    const message = t.messages[0]
    expect(message.from).toEqual({ email: 'accounts@auth.example.test', name: 'Ovelle' })
    expect(message.to).toEqual({ email: 'person@example.test', name: '' })
    expect(message.subject).toMatch(kind === 'verification' ? /verify/i : /invitation/i)
    expect(message.text).toContain(url)
    const links = [...message.html!.matchAll(/href="([^"]+)"/g)].map(match => match[1].replaceAll('&amp;', '&'))
    expect(links).toEqual([url])
    expect(message.html).not.toContain('&flow=')
    expect(message).not.toHaveProperty('cc')
    expect(message).not.toHaveProperty('bcc')
    expect(message).not.toHaveProperty('headers')
    expect(message).not.toHaveProperty('attachments')
  })

  it('supports production with its own exact origin and sender', async () => {
    const t = transport(), c = config()
    c.environment = 'production'; c.origin = 'https://ovelle.org'; c.rpId = 'ovelle.org'
    c.emailFrom = 'accounts@production.example.test'
    expect(await createAuthMailer(c, t.binding).send({ ...input(), url: verification.replace('dev.ovelle.org', 'ovelle.org') })).toMatchObject({ status: 'accepted' })
    expect(t.messages[0].from).toEqual({ email: c.emailFrom, name: 'Ovelle' })
  })

  it.each([
    { environment: 'local', origin: 'http://localhost:4173', rpId: 'localhost' },
    { environment: 'unknown' }, { origin: 'https://ovelle.org' },
    { origin: 'https://dev.ovelle.org/' }, { rpId: 'ovelle.org' },
    { emailFrom: 'x@example.test\r\nBcc:other@example.test' },
    { emailFrom: 'one,two@example.test' }, { emailFrom: 'Name <one@example.test>' },
    { emailFrom: '' }, { emailFrom: `${'a'.repeat(250)}@example.test` },
  ])('refuses unsafe transport configuration %j', patch => {
    expect(() => createAuthMailer({ ...config(), ...patch } as Stage0Config, transport().binding)).toThrow('configuration')
  })
  it('refuses a missing binding before any delivery', () => {
    for (const binding of [undefined, null, {}, { send: false }]) {
      expect(() => createAuthMailer(config(), binding as never)).toThrow('configuration')
    }
  })

  it.each([
    'other@example.test,second@example.test', 'one@example.test;two@example.test',
    'one@example.test\r\nBcc:two@example.test', 'one@example.test\u0085',
    'Name <one@example.test>', 'x@example.test:25', '"one"@example.test',
    '', 'missing-at.example.test', `${'a'.repeat(250)}@example.test`,
  ])('rejects unsafe recipients without invoking transport: %j', async to => {
    const t = transport()
    expect(await createAuthMailer(config(), t.binding).send({ ...input(), to })).toEqual(failed)
    expect(t.messages).toHaveLength(0)
  })

  it.each([
    'https://evil.example/account/verify-contact',
    'https://dev.ovelle.org.evil.example/account/verify-contact',
    'https://user@dev.ovelle.org/account/verify-contact',
    'http://dev.ovelle.org/account/verify-contact',
    'https://dev.ovelle.org:444/account/verify-contact',
    'https://dev.ovelle.org/account/../account/verify-contact',
    'https://DEV.ovelle.org/account/verify-contact',
    'https://dev.ovelle.org/account/%76erify-contact',
    'https://dev.ovelle.org/account/verify-contact/',
    'https://dev.ovelle.org/account/staff-invitation',
    'https://dev.ovelle.org/account/verify-contact?next=evil',
  ])('rejects noncanonical, foreign or wrong-purpose destinations: %s', async base => {
    const t = transport()
    expect(await createAuthMailer(config(), t.binding).send({ ...input(), url: `${base}#token=${token}` })).toEqual(failed)
    expect(t.messages).toHaveLength(0)
  })
  it.each([
    '', '#token=', `?token=${token}`, `#token=${token}&token=${token}`,
    `#token=${token}&next=https://evil.example`, `#token=${token}&flow=oidc`,
    `#flow=saml&token=${token}`, `#token=${token}&flow=saml&flow=saml`,
    `#token=${token.slice(1)}`, `#token=${token}=`, `#token=%41${token.slice(1)}`,
    `#token=${token}\n`, `#token=${token}<script>`,
  ])('rejects malformed or ambiguous credential fragments: %s', async suffix => {
    const t = transport()
    expect(await createAuthMailer(config(), t.binding).send({ ...input(), url: `https://dev.ovelle.org/account/verify-contact${suffix}` })).toEqual(failed)
    expect(t.messages).toHaveLength(0)
  })
  it('rejects unsupported purposes and SAML flow on invitations', async () => {
    const t = transport(), mailer = createAuthMailer(config(), t.binding)
    for (const mail of [
      { ...input(), kind: 'password_reset' }, { ...input(), kind: 'unknown' },
      { ...input(), kind: 'staff_invitation', url: `${invitation}&flow=saml` },
      null, { ...input(), url: undefined },
    ]) expect(await mailer.send(mail as AuthEmail)).toEqual(failed)
    expect(t.messages).toHaveLength(0)
  })

  it.each(['fixture-message-id', '<development-ack@dev.mail.ovelle.org>'])('accepts a bounded provider message ID verbatim: %s', async messageId => {
    const t = transport({ messageId })
    expect(await createAuthMailer(config(), t.binding).send(input())).toEqual({ status: 'accepted', providerId: messageId })
    expect(t.messages).toHaveLength(1)
  })

  it.each([undefined, null, {}, { messageId: '' }, { messageId: 'bad\r\nid' }, { messageId: 'trailing\n' }, { messageId: 'trailing\r' }, { messageId: '<trailing@example.test>\n' }, { messageId: '<bad\r\nid@example.test>' }, { messageId: '<missing-close@example.test' }, { messageId: 'missing-open@example.test>' }, { messageId: '<>' }, { messageId: '<<nested@example.test>>' }, { messageId: '<not-a-message-id>' }, { messageId: '<one@example.test> <two@example.test>' }, { messageId: 'x'.repeat(257) }, { messageId: 7 }, new Error(`provider detail ${verification}`)])('does not turn an uncertain provider result into success or automatic retries: %j', async acknowledgement => {
    const t = transport(acknowledgement === undefined ? {} : acknowledgement)
    expect(await createAuthMailer(config(), t.binding).send(input())).toEqual(failed)
    expect(t.messages).toHaveLength(1)
  })

  it('snapshots destination authority at construction and message data before awaiting delivery', async () => {
    const c = config(), t = transport(), mailer = createAuthMailer(c, t.binding)
    c.origin = 'https://evil.example'; c.emailFrom = 'attacker@example.test'
    t.binding.send = async () => { throw new Error('replaced transport') }
    const mail = input(), pending = mailer.send(mail)
    mail.to = 'attacker@example.test'; mail.url = 'https://evil.example'
    expect(await pending).toMatchObject({ status: 'accepted' })
    expect(t.messages[0].to).toEqual({ email: 'person@example.test', name: '' })
    expect(t.messages[0].text).toContain(verification)
    expect(t.messages[0].from).toEqual({ email: 'accounts@auth.example.test', name: 'Ovelle' })
  })

  it('composes both existing contact verification flows through the actual helper', async () => {
    const f = await databaseFixture(), t = transport()
    f.ctx.config = config(); f.ctx.mailer = createAuthMailer(f.ctx.config, t.binding)
    expect(await sendContactVerification(f.ctx, 'person@example.test', token)).toBe('accepted')
    expect(await sendContactVerification(f.ctx, 'person@example.test', token, 'saml')).toBe('accepted')
    expect(t.messages[0].text).toContain(verification)
    expect(t.messages[1].text).toContain(`${verification}&flow=saml`)
  })

  it.each([false, true])('preserves pending invitation authority and records transport failure=%s after persistence', async fail => {
    const f = await databaseFixture(), t = transport(fail ? new Error('private provider detail') : { messageId: 'fixture-message-id' })
    f.ctx.config = config()
    const send = t.binding.send.bind(t.binding)
    t.binding.send = async (message: EmailMessage | EmailMessageBuilder) => {
      expect(await f.execute("SELECT state FROM staff_invitations WHERE email='new@example.test'").first('state')).toBe('pending')
      return 'subject' in message ? send(message) : send(message)
    }
    f.ctx.mailer = createAuthMailer(f.ctx.config, t.binding)
    const owner = (await issueSession(f.ctx, { accountId: 'a', method: 'passkey' }, 'browser')).principal
    const invite = await createStaffInvitation({ ...f.ctx, principal: owner, idempotencyKey: 'mail-integration-0001', requestDigest: '0'.repeat(64) }, {
      organizationId: 'org-a', email: 'new@example.test', preset: 'coordinator', grants: [{ action: 'program.read', scope: { kind: 'program_location', programId: 'a1' } }],
    }, { ip: '127.0.0.1', budgetKey: new Uint8Array(32).fill(19) })
    expect(await getStaffInvitation(f.ctx, owner, 'org-a', invite.id)).toMatchObject({ state: 'pending', delivery: fail ? 'failed' : 'accepted' })
    expect(await f.execute("SELECT count(*) AS n FROM organization_memberships m JOIN accounts a ON a.id=m.account_id WHERE a.email='new@example.test'").first('n')).toBe(0)
    expect(t.messages).toHaveLength(1)
    expect(t.messages[0].text).toContain('https://dev.ovelle.org/account/staff-invitation#token=')
    const emittedToken = t.messages[0].text!.match(/#token=([A-Za-z0-9_-]{43})/)![1]
    expect(JSON.stringify((await f.execute('SELECT * FROM staff_invitations').all()).results)).not.toContain(emittedToken)
  })
})
