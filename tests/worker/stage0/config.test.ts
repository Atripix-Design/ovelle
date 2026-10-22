import { describe, expect, it } from 'vitest'
import { loadStage0Config } from '../../../src/cloudflare/stage0/config'
import { parseAction } from '../../../src/cloudflare/stage0/contracts'
import { Stage0Error } from '../../../src/cloudflare/stage0/errors'

const hosted = {
  APP_ENV: 'production', AUTH_ORIGIN: 'https://ovelle.org', AUTH_RP_ID: 'ovelle.org',
  AUTH_EMAIL_FROM: 'accounts@mail.ovelle.org', TURNSTILE_SITE_KEY: 'fixture-site',
  TURNSTILE_SECRET_KEY: 'fixture-secret',
}

describe('authentication configuration boundary', () => {
  it('refuses hosted authentication when required configuration is missing', () => {
    for (const key of ['AUTH_ORIGIN', 'AUTH_RP_ID', 'AUTH_EMAIL_FROM', 'TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY']) {
      const env: Record<string, string> = { ...hosted }
      delete env[key]
      expect(() => loadStage0Config(env)).toThrow(Stage0Error)
    }
  })
  it('separates development from production origins and RP identities', () => {
    expect(loadStage0Config(hosted).origin).toBe('https://ovelle.org')
    expect(() => loadStage0Config({ ...hosted, APP_ENV: 'development' })).toThrow()
    expect(loadStage0Config({ ...hosted, APP_ENV: 'development', AUTH_ORIGIN: 'https://dev.ovelle.org', AUTH_RP_ID: 'dev.ovelle.org' }).origin).toBe('https://dev.ovelle.org')
    for (const origin of ['http://ovelle.org', 'https://ovelle.org.evil.example', 'https://ovelle.org/path', 'https://user@ovelle.org', 'https://ovelle.org?next=evil']) {
      expect(() => loadStage0Config({ ...hosted, AUTH_ORIGIN: origin })).toThrow()
    }
    expect(() => loadStage0Config({ ...hosted, AUTH_RP_ID: 'dev.ovelle.org' })).toThrow()
  })
  it('keeps local fixtures explicit and refuses hosted bypass flags', () => {
    expect(loadStage0Config({ APP_ENV: 'local', AUTH_ORIGIN: 'http://localhost:4173', AUTH_RP_ID: 'localhost', AUTH_LOCAL_FIXTURES: 'true' }).environment).toBe('local')
    expect(() => loadStage0Config({ APP_ENV: 'local', AUTH_ORIGIN: 'http://localhost:4173', AUTH_RP_ID: 'localhost' })).toThrow()
    expect(() => loadStage0Config({ ...hosted, AUTH_LOCAL_FIXTURES: 'true' })).toThrow()
    expect(() => loadStage0Config({ ...hosted, APP_ENV: 'unknown' })).toThrow()
  })
  it('does not turn pending KDF evidence into enabled live authentication', () => {
    expect(loadStage0Config(hosted).passwordDecision).toBe('pending')
    expect(loadStage0Config(hosted).enabled).toBe(false)
    expect(() => loadStage0Config({ ...hosted, STAGE0_AUTH_ENABLED: 'true' })).toThrow()
    expect(() => loadStage0Config({ ...hosted, STAGE0_AUTH_ENABLED: 'yes' })).toThrow()
    expect(() => loadStage0Config({ ...hosted, AUTH_EMAIL_FROM: 'x@example.com\r\nBcc: other@example.com' })).toThrow()
  })
  it('rejects unknown actions and error codes instead of broadening authority', () => {
    expect(parseAction('organization.read')).toBe('organization.read')
    for (const action of ['*', 'finance.read', '__proto__', null]) expect(() => parseAction(action)).toThrow()
    expect(() => new Stage0Error('unexpected' as never)).toThrow(TypeError)
    expect(new Stage0Error('forbidden').status).toBe(403)
  })
})
