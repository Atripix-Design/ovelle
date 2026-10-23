import type { EmailMessageBuilder, SendEmail } from '@cloudflare/workers-types'
import type { Stage0Config } from '../config'
import type { AuthEmail, AuthMailer, DeliveryResult } from '../contracts'
import { Stage0Error } from '../errors'
import { normalizedEmail } from './contact'
import { secretPattern } from './secrets'

/** Transport accepts one plain mailbox, never a header/address-list expression.
 * Keep nominated-contact normalization shared; structured addresses plus this
 * transport restriction avoid interpreting its permissive local part as headers.
 */
function mailbox(value: unknown): string {
  const address = normalizedEmail(value)
  if (/[\p{Cc},;:"\\()[\]]/u.test(address)) throw new Stage0Error('invalid_input')
  return address
}
const failed = (): DeliveryResult => ({ status: 'failed', retryable: false })
const escapeHtml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#39;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

function compose(origin: string, sender: string, input: AuthEmail): EmailMessageBuilder {
  if (!input || typeof input !== 'object') throw new Stage0Error('invalid_input')
  const { to, kind, url } = input
  const recipient = mailbox(to)
  // Only existing service destinations are supported. A future reset flow must
  // establish its credential authority and URL contract before adding a template.
  const path = kind === 'verification' ? '/account/verify-contact' : kind === 'staff_invitation' ? '/account/staff-invitation' : null
  if (!path || typeof url !== 'string') throw new Stage0Error('invalid_input')
  const prefix = `${origin}${path}#token=`
  if (!url.startsWith(prefix)) throw new Stage0Error('invalid_input')
  const suffix = url.slice(prefix.length)
  const token = kind === 'verification' && suffix.endsWith('&flow=saml') ? suffix.slice(0, -10) : suffix
  if (!secretPattern.test(token)) throw new Stage0Error('invalid_input')
  const verification = kind === 'verification'
  const subject = verification ? 'Verify your Ovelle contact email' : 'Your Ovelle staff invitation'
  const action = verification ? 'Review and confirm your contact email' : 'Review your staff invitation'
  const explanation = verification
    ? 'This link expires within 15 minutes and may expire sooner when your sign-in attempt ends. Opening it does not confirm your email; confirmation requires an explicit action in Ovelle.'
    : 'This invitation expires after 72 hours. Opening it does not grant access; acceptance requires the intended verified account in Ovelle.'
  return {
    from: { email: sender, name: 'Ovelle' },
    to: { email: recipient, name: '' },
    subject,
    text: `${action}:\n${url}\n\n${explanation}\nIf you did not request this, you can ignore this email.`,
    html: `<p>${action}:</p><p><a href="${escapeHtml(url)}">${action}</a></p><p>${explanation}</p><p>If you did not request this, you can ignore this email.</p>`,
  }
}

/** Internal composition only: this does not install a binding, verify a sender,
 * enable public auth, consume tokens or prove inbox delivery. Token persistence,
 * expiry, quotas and explicit confirmation remain owned by the calling services.
 */
export function createAuthMailer(config: Stage0Config, binding: Pick<SendEmail, 'send'>): AuthMailer {
  let origin: string, sender: string, send: SendEmail['send']
  try {
    const { environment, origin: configuredOrigin, rpId, emailFrom } = config
    const expected = environment === 'production' ? 'https://ovelle.org' : environment === 'development' ? 'https://dev.ovelle.org' : null
    if (!expected || configuredOrigin !== expected || rpId !== new URL(expected).hostname || typeof binding?.send !== 'function') throw new Stage0Error('configuration')
    origin = configuredOrigin
    sender = mailbox(emailFrom)
    // Capture authority once: later mutation of the caller's config or binding
    // cannot redirect this mailer or replace its transport.
    send = binding.send.bind(binding)
  } catch { throw new Stage0Error('configuration') }
  return {
    async send(input): Promise<DeliveryResult> {
      try {
        const message = compose(origin, sender, input)
        const result = await send(message)
        const id = result?.messageId
        if (typeof id !== 'string' || id.length > 256 || !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(id)) return failed()
        return { status: 'accepted', providerId: id }
      } catch {
        // A thrown request or malformed acknowledgement can follow acceptance.
        // Never expose provider diagnostics or retry an uncertain send here;
        // explicit service resend rotates the credential and owns its budget.
        return failed()
      }
    },
  }
}
