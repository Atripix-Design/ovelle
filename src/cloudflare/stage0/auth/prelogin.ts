import type { RequestContext } from '../contracts'
import { Stage0Error } from '../errors'
import { equalSecret, randomSecret, secretMac, secretPattern } from './secrets'
import { readFlowCookie, requireBrowserOrigin, strictFlowCookie } from './web'

const lifetimeMs = 900_000
const cookieSignature = (origin: string, createdAt: number, secret: string, key: Uint8Array) =>
  secretMac(key, ['ovelle:prelogin-cookie:v1', origin, createdAt, secret])

async function parse(ctx: RequestContext, cookie: string, key: Uint8Array) {
  const pieces = cookie.split('.')
  if (pieces.length !== 3 || !/^\d{13}$/.test(pieces[0]) || !secretPattern.test(pieces[1]) || !secretPattern.test(pieces[2])) throw new Stage0Error('forbidden')
  const createdAt = Number(pieces[0])
  const now = ctx.clock.now()
  if (createdAt > now || now >= createdAt + lifetimeMs || !equalSecret(pieces[2], await cookieSignature(ctx.config.origin, createdAt, pieces[1], key))) throw new Stage0Error('forbidden')
  return { createdAt, secret: pieces[1] }
}
const csrf = (secret: string) => secretMac(secret, ['ovelle:prelogin-csrf:v1'])
export async function beginPrelogin(ctx: RequestContext, request: Request, key: Uint8Array): Promise<{ cookie: string; csrfToken: string }> {
  requireBrowserOrigin(ctx, request, false)
  let value: string
  let parsed: { createdAt: number; secret: string }
  try { value = readFlowCookie(ctx.config, request, 'prelogin'); parsed = await parse(ctx, value, key) }
  catch { parsed = { createdAt: ctx.clock.now(), secret: randomSecret() }; value = `${parsed.createdAt}.${parsed.secret}.${await cookieSignature(ctx.config.origin, parsed.createdAt, parsed.secret, key)}` }
  return { cookie: strictFlowCookie(ctx.config, 'prelogin', value, Math.floor((parsed.createdAt + lifetimeMs - ctx.clock.now()) / 1000)), csrfToken: await csrf(parsed.secret) }
}
export async function verifyPrelogin(ctx: RequestContext, request: Request, key: Uint8Array): Promise<void> {
  requireBrowserOrigin(ctx, request, true)
  try {
    const parsed = await parse(ctx, readFlowCookie(ctx.config, request, 'prelogin'), key)
    if (!equalSecret(request.headers.get('X-CSRF-Token') ?? '', await csrf(parsed.secret))) throw new Stage0Error('forbidden')
  } catch { throw new Stage0Error('forbidden') }
}
