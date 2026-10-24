import type { RequestContext } from '../contracts'
import { Stage0Error } from '../errors'
import { boundedJsonBody } from './web'

type Fetch = (url: string, init: RequestInit) => Promise<Response>
/** No fixture bypass. Tests replace only this network dependency. The caller
 * consumes durable admission capacity before making this external request.
 */
export async function verifyTurnstile(ctx: Pick<RequestContext, 'config' | 'clock'>, secret: string, token: string, trustedIp: string, action: 'oidc_login' | 'oidc_link' | 'oidc_recovery' | 'passkey_login' | 'saml_login' | 'saml_link', fetcher: Fetch = fetch): Promise<void> {
  if (typeof token !== 'string' || !token || token.length > 2048 || typeof trustedIp !== 'string' || !/^[a-f0-9:.]{1,64}$/i.test(trustedIp)) throw new Stage0Error('invalid_input')
  if (typeof secret !== 'string' || !secret.trim() || !['oidc_login', 'oidc_link', 'oidc_recovery', 'passkey_login', 'saml_login', 'saml_link'].includes(action)) throw new Stage0Error('configuration')
  try {
    const response = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body: new URLSearchParams({ secret, response: token, remoteip: trustedIp }), redirect: 'manual', signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Stage0Error('forbidden')
    const data = await boundedJsonBody(response, 16_384) as Record<string, unknown>
    const time = typeof data.challenge_ts === 'string' ? Date.parse(data.challenge_ts) : NaN
    if (data.success !== true || data.hostname !== new URL(ctx.config.origin).hostname || data.action !== action || !Number.isFinite(time) || time > ctx.clock.now() || ctx.clock.now() >= time + 300_000) throw new Stage0Error('forbidden')
  } catch { throw new Stage0Error('forbidden') }
}
