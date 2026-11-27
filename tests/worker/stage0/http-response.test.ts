import { expect, it } from 'vitest'
import { applyPrivateResponseHeaders, authResponse } from '../../../src/cloudflare/stage0/http/response'
import { boundedJsonBody } from '../../../src/cloudflare/stage0/http/body'

it('applies one private policy without folding flow cookies or dropping adapter headers', () => {
  const headers = new Headers({ Location: '/account', Allow: 'POST', 'Cache-Control': 'public', 'X-Request-ID': 'untrusted' })
  headers.append('Set-Cookie', 'session=first; Path=/; HttpOnly')
  headers.append('Set-Cookie', 'flow=second; Path=/; HttpOnly')
  const before = headers.getSetCookie()
  applyPrivateResponseHeaders(headers, 'request-123')
  applyPrivateResponseHeaders(headers, 'request-123')
  expect(headers.getSetCookie()).toEqual(before)
  expect(headers.getSetCookie()).toHaveLength(2)
  expect(headers.get('Location')).toBe('/account')
  expect(headers.get('Allow')).toBe('POST')
  expect(headers.get('Cache-Control')).toBe('no-store')
  expect(headers.get('Referrer-Policy')).toBe('no-referrer')
  expect(headers.get('X-Content-Type-Options')).toBe('nosniff')
  expect(headers.get('Content-Security-Policy')).toBe("default-src 'none'; frame-ancestors 'none'")
  expect(headers.get('X-Request-ID')).toBe('request-123')
})

it('preserves JSON, empty logout bodies and redirect locations', async () => {
  const json = authResponse({ requestId: 'r' }, { error: 'forbidden' }, 403)
  expect(json.status).toBe(403)
  expect(await json.json()).toEqual({ error: 'forbidden' })
  for (const status of [204, 303]) {
    const response = authResponse({ requestId: 'r' }, { omitted: true }, status, { Location: '/account' })
    expect(response.status).toBe(status)
    expect(await response.text()).toBe('')
    expect(response.headers.get('Location')).toBe('/account')
    expect(response.headers.get('Content-Type')).toBeNull()
  }
})

it('bounds UTF-8 bytes across chunks and cancels oversized streams', async () => {
  const bytes = new TextEncoder().encode('{"name":"é"}')
  const make = () => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(bytes.slice(0, 10))
    controller.enqueue(bytes.slice(10))
    controller.close()
  } }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  expect(await boundedJsonBody(make(), bytes.length)).toEqual({ name: 'é' })
  await expect(boundedJsonBody(make(), bytes.length - 1)).rejects.toMatchObject({ code: 'invalid_input' })
  let cancelled = false
  const oversized = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(4)) }, cancel() { cancelled = true } }), { headers: { 'Content-Type': 'application/json' } })
  await expect(boundedJsonBody(oversized, 3)).rejects.toMatchObject({ code: 'invalid_input' })
  expect(cancelled).toBe(true)
  const invalid = new Response(new Uint8Array([0xff]), { headers: { 'Content-Type': 'application/json' } })
  await expect(boundedJsonBody(invalid, 10)).rejects.toMatchObject({ code: 'invalid_input' })
})
