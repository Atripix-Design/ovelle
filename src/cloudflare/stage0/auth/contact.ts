import type { RequestContext } from '../contracts'
import { Stage0Error } from '../errors'

/** Shared contact rules; email is a nominated delivery address, never identity
 * linking authority. Reject controls before trimming hidden mail separators. */
export function normalizedEmail(input: unknown): string {
  // eslint-disable-next-line no-control-regex
  if (typeof input !== 'string' || /[\u0000-\u001f\u007f]/.test(input)) throw new Stage0Error('invalid_input')
  const email = input.trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw new Stage0Error('invalid_input')
  return email
}
export function normalizedContactName(input: unknown): string {
  if (typeof input !== 'string' || input.trim().length < 1 || input.trim().length > 120) throw new Stage0Error('invalid_input')
  return input.trim()
}
export async function sendContactVerification(ctx: RequestContext, email: string, secret: string, flow?: 'saml'): Promise<'accepted' | 'failed'> {
  try {
    const sent = await ctx.mailer.send({ to: email, kind: 'verification', url: `${ctx.config.origin}/account/verify-contact#token=${secret}${flow === 'saml' ? '&flow=saml' : ''}` })
    return sent.status === 'accepted' ? 'accepted' : 'failed'
  } catch { return 'failed' }
}
