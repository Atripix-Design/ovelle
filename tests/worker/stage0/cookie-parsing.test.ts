import { expect, it } from 'vitest'
import { loadStage0Config } from '../../../src/cloudflare/stage0/config'
import { readUniqueCookie } from '../../../src/cloudflare/stage0/http/cookies'
import { readFlowCookie, strictFlowCookie } from '../../../src/cloudflare/stage0/auth/web'
import { oidcBindingCookie, readOidcBindingCookie } from '../../../src/cloudflare/stage0/auth/oidc/cookies'

const config = loadStage0Config({ APP_ENV: 'local', AUTH_ORIGIN: 'http://localhost:4173', AUTH_RP_ID: 'localhost', AUTH_LOCAL_FIXTURES: 'true' })
const request = (cookie?: string) => new Request(config.origin, { headers: cookie === undefined ? {} : { Cookie: cookie } })

it('selects exactly one named cookie without decoding, unquoting or losing embedded equals', () => {
  expect(readUniqueCookie(request('other=ignored; token = a=b=c ; tail=x'), 'token')).toBe('a=b=c')
  expect(readUniqueCookie(request('token=%41'), 'token')).toBe('%41')
  expect(readUniqueCookie(request('token="secret"'), 'token')).toBe('"secret"')
  expect(readUniqueCookie(request('token='), 'token')).toBe('')
  for (const cookie of [undefined, 'other=x', 'token', 'token=a; token=b', 'token=a; token = a']) {
    expect(() => readUniqueCookie(request(cookie), 'token')).toThrow('unauthenticated')
  }
})

it('retains distinct local and hosted strict flow names, attributes and nonnegative expiry', () => {
  expect(strictFlowCookie(config, 'passkey', 'value', -1)).toBe('ovelle_local_passkey=value; Path=/; HttpOnly; SameSite=Strict; Max-Age=0')
  expect(strictFlowCookie({ ...config, environment: 'development' }, 'enrollment', 'value', 90))
    .toBe('__Host-ovelle_enrollment=value; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=90')
  expect(readFlowCookie(config, request('ovelle_local_passkey = value'), 'passkey')).toBe('value')
  expect(() => readFlowCookie(config, request('__Host-ovelle_passkey=value'), 'passkey')).toThrow('unauthenticated')
})

it('preserves OIDC Lax lifetime and stricter whitespace parsing rather than adopting flow parsing', () => {
  const token = 'A'.repeat(43)
  expect(oidcBindingCookie(config, token)).toBe(`ovelle_local_oidc=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=300`)
  expect(oidcBindingCookie({ ...config, environment: 'production' }, null)).toBe('__Host-ovelle_oidc=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0')
  expect(readOidcBindingCookie(config, request(`other=x; ovelle_local_oidc=${token}`))).toBe(token)
  for (const value of [`ovelle_local_oidc =${token}`, `ovelle_local_oidc= ${token}`, `ovelle_local_oidc=%41${token.slice(1)}`, `ovelle_local_oidc="${token}"`, `ovelle_local_oidc=${token}; ovelle_local_oidc=${token}`]) {
    expect(() => readOidcBindingCookie(config, request(value))).toThrow('unauthenticated')
  }
})
