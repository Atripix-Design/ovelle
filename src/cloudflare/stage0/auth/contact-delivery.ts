import type { RequestContext } from '../contracts'

/** Delivery failure is a persisted outcome, not evidence of contact verification. */
export async function sendContactVerification(ctx: RequestContext, email: string, secret: string, flow?: 'saml'): Promise<'accepted' | 'failed'> {
  try {
    const sent = await ctx.mailer.send({ to: email, kind: 'verification', url: `${ctx.config.origin}/account/verify-contact#token=${secret}${flow === 'saml' ? '&flow=saml' : ''}` })
    return sent.status === 'accepted' ? 'accepted' : 'failed'
  } catch { return 'failed' }
}
