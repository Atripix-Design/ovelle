import { expect, it } from 'vitest'
import { fixtureContext } from './helpers'
import { passkeyFixture } from './passkey-fixture'
import { registrationOptions, authenticationOptions, verifyRegistration, verifyAuthentication } from '../../../src/cloudflare/stage0/auth/passkeys/protocol'
import { secretDigest } from '../../../src/cloudflare/stage0/auth/secrets'
const config = fixtureContext({} as never).config
const challenge = 'c'.repeat(43)
const handle = 'g'.repeat(43)
it('requires discoverable UV credentials and verifies signed registration/assertions in Workers', async () => {
  const fixture = await passkeyFixture()
  const options = await registrationOptions(config, { challenge, userHandle: handle, email: 'person@example.test', displayName: 'Person', credentials: [] })
  expect(options.authenticatorSelection).toMatchObject({ residentKey: 'required', userVerification: 'required' })
  expect(options.pubKeyCredParams.map(item => item.alg)).toEqual([-7, -257])
  expect((await authenticationOptions(config, challenge)).userVerification).toBe('required')
  const registered = await verifyRegistration(config, await secretDigest(options.challenge), await fixture.registration(options.challenge))
  expect(registered.credential.id).toBe(fixture.id)
  expect(registered.userVerified).toBe(true)
  fixture.state.counter = 1
  const auth = await verifyAuthentication(config, await secretDigest(challenge), registered.credential, handle, await fixture.authentication(challenge, handle))
  expect(auth.newCounter).toBe(1)
})
it.each(['origin', 'rp', 'uv', 'up', 'crossOrigin', 'challenge'] as const)('rejects registration with wrong %s', async field => {
  const fixture = await passkeyFixture()
  if (field === 'origin') fixture.state.origin = 'https://foreign.example'
  else if (field === 'rp') fixture.state.rp = 'foreign.example'
  else if (field === 'uv' || field === 'up') fixture.state[field] = false
  else if (field === 'crossOrigin') fixture.state.crossOrigin = true
  await expect(verifyRegistration(config, await secretDigest(challenge), await fixture.registration(field === 'challenge' ? 'x'.repeat(43) : challenge))).rejects.toMatchObject({ code: 'unauthenticated' })
})
it.each(['origin', 'rp', 'uv', 'up', 'crossOrigin', 'challenge', 'signature', 'userHandle', 'counter', 'id'] as const)('rejects assertion with wrong %s', async field => {
  const fixture = await passkeyFixture()
  const registered = await verifyRegistration(config, await secretDigest(challenge), await fixture.registration(challenge))
  fixture.state.counter = 1
  if (field === 'origin') fixture.state.origin = 'https://foreign.example'
  else if (field === 'rp') fixture.state.rp = 'foreign.example'
  else if (field === 'uv' || field === 'up') fixture.state[field] = false
  else if (field === 'crossOrigin') fixture.state.crossOrigin = true
  else if (field === 'signature') fixture.state.badSignature = true
  const response = await fixture.authentication(field === 'challenge' ? 'x'.repeat(43) : challenge, field === 'userHandle' ? 'x'.repeat(43) : handle)
  if (field === 'id') response.id = response.rawId = 'x'.repeat(43)
  if (field === 'counter') registered.credential.counter = 1
  await expect(verifyAuthentication(config, await secretDigest(challenge), registered.credential, handle, response)).rejects.toMatchObject({ code: 'unauthenticated' })
})
it('accepts zero-counter synced passkeys without weakening signature or UV validation', async () => {
  const fixture = await passkeyFixture(); fixture.state.backedUp = true
  const registered = await verifyRegistration(config, await secretDigest(challenge), await fixture.registration(challenge))
  expect(registered.credentialDeviceType).toBe('multiDevice')
  expect((await verifyAuthentication(config, await secretDigest(challenge), registered.credential, handle, await fixture.authentication(challenge, handle))).newCounter).toBe(0)
})
it('verifies the advertised RSA credential algorithm in Workers too', async () => {
  const fixture = await passkeyFixture('RS256')
  const registered = await verifyRegistration(config, await secretDigest(challenge), await fixture.registration(challenge))
  fixture.state.counter = 1
  expect((await verifyAuthentication(config, await secretDigest(challenge), registered.credential, handle, await fixture.authentication(challenge, handle))).newCounter).toBe(1)
})
