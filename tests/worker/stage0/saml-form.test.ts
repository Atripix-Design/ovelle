import { expect, it } from 'vitest'
import { readSamlCallbackForm } from '../../../src/cloudflare/stage0/auth/saml/form'

const request = (body: string | Uint8Array, type = 'application/x-www-form-urlencoded') => new Request('https://dev.ovelle.org/api/v1/auth/saml/callback', {
  method: 'POST', headers: { 'Content-Type': type }, body,
})

it('decodes exactly the two fields with form plus/percent semantics', async () => {
  expect(await readSamlCallbackForm(request('SAMLResponse=ab%2Bcd%3D&RelayState=some+state')))
    .toEqual({ response: 'ab+cd=', relayState: 'some state' })
  expect(await readSamlCallbackForm(request('RelayState=r&SAMLResponse=s', 'APPLICATION/X-WWW-FORM-URLENCODED; charset=UTF-8')))
    .toEqual({ relayState: 'r', response: 's' })
})

it.each(['', 'SAMLResponse=x', 'RelayState=r&SAMLResponse=s&extra=x', 'RelayState=r&SAMLResponse=s&SAMLResponse=s', 'RelayState=r&SAMLResponse=s&%52elayState=r', '=x&SAMLResponse=s', 'RelayState=r&SAMLResponse=%', 'RelayState=r&SAMLResponse=%C3', 'RelayState=r&SAMLResponse=s&'])('rejects malformed or ambiguous form %s', async body => {
  await expect(readSamlCallbackForm(request(body))).rejects.toThrow()
})

it('rejects invalid UTF-8 and unsupported content types', async () => {
  await expect(readSamlCallbackForm(request(new Uint8Array([255])))).rejects.toThrow()
  for (const type of ['application/json', 'text/plain', 'application/x-www-form-urlencoded; charset=iso-8859-1']) {
    await expect(readSamlCallbackForm(request('RelayState=r&SAMLResponse=s', type))).rejects.toMatchObject({ code: 'invalid_input' })
  }
})

it('cancels a stream exceeding the byte limit before returning decoded fields', async () => {
  let cancelled = false
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(270_001)) }, cancel() { cancelled = true } })
  await expect(readSamlCallbackForm(new Request('https://dev.ovelle.org', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })))
    .rejects.toMatchObject({ code: 'invalid_input' })
  expect(cancelled).toBe(true)
})
