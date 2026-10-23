import { expect, it } from 'vitest'
import { verifyTurnstile } from '../../../src/cloudflare/stage0/auth/turnstile'
import { oidcContext as ctx } from './oidc-protocol-fixture'

const result = () => ({ success: true, hostname: 'localhost', action: 'oidc_login', challenge_ts: new Date(ctx.clock.now()).toISOString() })
it('posts a bounded token and trusted IP to the fixed non-redirecting Siteverify endpoint', async () => {
  let calls = 0
  await verifyTurnstile(ctx, 'fixture-secret', 'fixture-token', '127.0.0.1', 'oidc_login', async (url, options) => {
    calls++
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')
    expect(options!.method).toBe('POST')
    expect(options!.redirect).toBe('manual')
    expect(options!.signal).toBeInstanceOf(AbortSignal)
    const body = new URLSearchParams(String(options!.body))
    expect(Object.fromEntries(body)).toEqual({ secret: 'fixture-secret', response: 'fixture-token', remoteip: '127.0.0.1' })
    return Response.json(result())
  })
  expect(calls).toBe(1)
})
it.each(['failure', 'hostname', 'action', 'expired', 'future', 'redirect', 'oversized', 'invalid_json', 'transport'])('fails closed on %s', async failure => {
  const data = result()
  if (failure === 'failure') data.success = false
  if (failure === 'hostname') data.hostname = 'foreign.example'
  if (failure === 'action') data.action = 'oidc_link'
  if (failure === 'expired') data.challenge_ts = new Date(ctx.clock.now() - 300_000).toISOString()
  if (failure === 'future') data.challenge_ts = new Date(ctx.clock.now() + 1).toISOString()
  await expect(verifyTurnstile(ctx, 'fixture-secret', 'fixture-token', '127.0.0.1', 'oidc_login', async () => {
    if (failure === 'redirect') return new Response(null, { status: 302, headers: { Location: 'https://foreign.example' } })
    if (failure === 'oversized') return Response.json({ ...data, extra: 'x'.repeat(20_000) })
    if (failure === 'invalid_json') return new Response('{', { headers: { 'content-type': 'application/json' } })
    if (failure === 'transport') throw new Error('private-provider-detail')
    return Response.json(data)
  })).rejects.toMatchObject({ code: 'forbidden', message: 'forbidden' })
})
it('rejects oversized or absent input before contacting the service', async () => {
  for (const token of ['', 'x'.repeat(2049)]) await expect(verifyTurnstile(ctx, 'fixture-secret', token, '127.0.0.1', 'oidc_login', async () => { throw new Error('Should not fetch') })).rejects.toMatchObject({ code: 'invalid_input' })
})
