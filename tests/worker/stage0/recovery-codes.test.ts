import { beforeEach, expect, it } from 'vitest'
import { databaseFixture } from './database'
import { passkeyFixture } from './passkey-fixture'
import { issueSession, resolveSession } from '../../../src/cloudflare/stage0/auth/sessions'
import { beginPasskeyRegistration, finishPasskeyRegistration } from '../../../src/cloudflare/stage0/auth/passkeys/service'
import { getRecoveryCodeStatus, rotateRecoveryCodes } from '../../../src/cloudflare/stage0/auth/recovery'

let f: Awaited<ReturnType<typeof databaseFixture>>
beforeEach(async () => { f = await databaseFixture() })
async function enroll(accountId = 'c') {
  const primary = await issueSession(f.ctx, { accountId, method: 'password' }, 'browser')
  const key = new Uint8Array(32).fill(17)
  const start = await beginPasskeyRegistration(f.ctx, primary.principal, '127.0.0.1', key)
  const signed = await passkeyFixture()
  return finishPasskeyRegistration(f.ctx, primary.principal, start.flowToken, await signed.registration(start.options.challenge), 'Existing key', '127.0.0.1', key)
}
it('returns eight independent random codes once, persists only digests and exposes safe own-account status', async () => {
  const { session } = await enroll()
  expect(await getRecoveryCodeStatus(f.ctx, session.principal)).toEqual({ version: 0, remaining: 0, rotatedAt: null })
  const result = await rotateRecoveryCodes(f.ctx, session.principal, 0)
  expect(result.version).toBe(1); expect(result.codes).toHaveLength(8)
  expect(new Set(result.codes).size).toBe(8)
  for (const code of result.codes) {
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(atob(code.replaceAll('-', '+').replaceAll('_', '/') + '=').length).toBe(32)
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(['ovelle:recovery-code:v1', 'c', code])))), byte => byte.toString(16).padStart(2, '0')).join('')
    expect(await f.execute('SELECT account_id FROM recovery_codes WHERE code_digest=?', digest).first('account_id')).toBe('c')
    await expect(resolveSession(f.ctx, code, 'browser')).rejects.toMatchObject({ code: 'unauthenticated' })
  }
  const persisted = JSON.stringify((await f.execute('SELECT * FROM recovery_codes').all()).results)
  const audit = JSON.stringify((await f.execute("SELECT * FROM audit_events WHERE action='recovery.rotate'").all()).results)
  for (const code of result.codes) { expect(persisted).not.toContain(code); expect(audit).not.toContain(code) }
  const status = await getRecoveryCodeStatus(f.ctx, session.principal)
  expect(status).toEqual({ version: 1, remaining: 8, rotatedAt: f.ctx.clock.now() })
  expect(JSON.stringify(status)).not.toContain('digest')
  expect(await f.execute('SELECT count(*) AS n FROM recovery_codes WHERE length(code_digest)=64').first('n')).toBe(8)
  const other = await issueSession(f.ctx, { accountId: 'd', method: 'password' }, 'browser')
  expect(await getRecoveryCodeStatus(f.ctx, other.principal)).toEqual({ version: 0, remaining: 0, rotatedAt: null })
})
it('replaces the entire old set and denies a stale version instead of returning superseded secrets', async () => {
  const { session } = await enroll()
  await rotateRecoveryCodes(f.ctx, session.principal, 0)
  const old = (await f.execute('SELECT code_digest FROM recovery_codes').all<{ code_digest: string }>()).results
  const next = await rotateRecoveryCodes(f.ctx, session.principal, 1)
  expect(next.version).toBe(2)
  for (const row of old) expect(await f.execute('SELECT count(*) AS n FROM recovery_codes WHERE code_digest=?', row.code_digest).first('n')).toBe(0)
  await expect(rotateRecoveryCodes(f.ctx, session.principal, 1)).rejects.toMatchObject({ code: 'conflict' })
  expect(await f.execute('SELECT count(*) AS n FROM recovery_codes').first('n')).toBe(8)
  expect(await f.execute("SELECT count(*) AS n FROM audit_events WHERE action='recovery.rotate'").first('n')).toBe(2)
})
it('commits only one racing first issuance and only one racing rotation', async () => {
  const { session } = await enroll()
  for (const version of [0, 1]) {
    const outcomes = await Promise.allSettled([rotateRecoveryCodes(f.ctx, session.principal, version), rotateRecoveryCodes(f.ctx, session.principal, version)])
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter(result => result.status === 'rejected')).toMatchObject([{ reason: { code: 'conflict' } }])
  }
  expect(await getRecoveryCodeStatus(f.ctx, session.principal)).toMatchObject({ version: 2, remaining: 8 })
})
it('uses database proof rather than forged principal assurance and denies primary/enrollment/unbound-key sessions', async () => {
  await enroll()
  const primary = await issueSession(f.ctx, { accountId: 'c', method: 'password' }, 'browser')
  await expect(rotateRecoveryCodes(f.ctx, { ...primary.principal, assurance: 'passkey', passkeyVerifiedAt: f.ctx.clock.now() }, 0)).rejects.toMatchObject({ code: 'forbidden' })
  const unbound = await issueSession(f.ctx, { accountId: 'c', method: 'passkey' }, 'browser')
  await expect(rotateRecoveryCodes(f.ctx, unbound.principal, 0)).rejects.toMatchObject({ code: 'forbidden' })
  await f.execute("UPDATE accounts SET email_verified_at=NULL WHERE id='d'").run()
  const enrollment = await issueSession(f.ctx, { accountId: 'd', method: 'password' }, 'browser')
  await expect(rotateRecoveryCodes(f.ctx, enrollment.principal, 0)).rejects.toMatchObject({ code: 'forbidden' })
  await expect(getRecoveryCodeStatus(f.ctx, enrollment.principal)).rejects.toMatchObject({ code: 'forbidden' })
})
it('requires existing-key verification strictly within five minutes and never accepts future evidence', async () => {
  const { session } = await enroll()
  f.advance(-1)
  await expect(rotateRecoveryCodes(f.ctx, session.principal, 0)).rejects.toMatchObject({ code: 'unauthenticated' })
  f.advance(300_001)
  await expect(rotateRecoveryCodes(f.ctx, session.principal, 0)).rejects.toMatchObject({ code: 'forbidden' })
})
it('rolls back old-set removal, replacement and version when the audit cannot commit', async () => {
  const { session } = await enroll()
  await rotateRecoveryCodes(f.ctx, session.principal, 0)
  const before = (await f.execute('SELECT * FROM recovery_codes ORDER BY position').all()).results
  await f.execute("CREATE TRIGGER fail_recovery_audit BEFORE INSERT ON audit_events WHEN NEW.action='recovery.rotate' BEGIN SELECT RAISE(ABORT,'fixture_audit_failure'); END").run()
  await expect(rotateRecoveryCodes(f.ctx, session.principal, 1)).rejects.toThrow()
  expect((await f.execute('SELECT * FROM recovery_codes ORDER BY position').all()).results).toEqual(before)
  expect(await getRecoveryCodeStatus(f.ctx, session.principal)).toMatchObject({ version: 1, remaining: 8 })
})
it('rejects revoked sessions, credentials and account security epochs', async () => {
  const { session, passkey } = await enroll()
  await f.execute('UPDATE passkey_credentials SET disabled_at=?,version=version+1 WHERE id=?', f.ctx.clock.now(), passkey.id).run()
  await expect(rotateRecoveryCodes(f.ctx, session.principal, 0)).rejects.toMatchObject({ code: 'unauthenticated' })
  await expect(getRecoveryCodeStatus(f.ctx, session.principal)).rejects.toMatchObject({ code: 'unauthenticated' })
})
it('validates the expected version before any write', async () => {
  const { session } = await enroll()
  for (const value of [-1, 1.5, NaN, Number.MAX_SAFE_INTEGER, '0', null, undefined]) {
    await expect(rotateRecoveryCodes(f.ctx, session.principal, value as number)).rejects.toMatchObject({ code: 'invalid_input' })
  }
  expect(await getRecoveryCodeStatus(f.ctx, session.principal)).toMatchObject({ version: 0, remaining: 0 })
})
it.each(['session', 'account', 'credential', 'epoch'] as const)('rechecks %s revocation inside the rotation transaction after preflight', async kind => {
  const { session, passkey } = await enroll()
  await rotateRecoveryCodes(f.ctx, session.principal, 0)
  const original = (await f.execute('SELECT * FROM recovery_codes ORDER BY position').all()).results
  const db = f.db, ctx = { ...f.ctx }
  ctx.db = new Proxy(db, { get(target, property) {
    if (property === 'batch') return async (statements: Parameters<typeof db.batch>[0]) => {
      if (kind === 'session') await f.execute('UPDATE sessions SET revoked_at=? WHERE id=?', f.ctx.clock.now(), session.principal.sessionId).run()
      if (kind === 'account') await f.execute("UPDATE accounts SET disabled_at=? WHERE id='c'", f.ctx.clock.now()).run()
      if (kind === 'credential') await f.execute('UPDATE passkey_credentials SET disabled_at=?,version=version+1 WHERE id=?', f.ctx.clock.now(), passkey.id).run()
      if (kind === 'epoch') await f.execute("UPDATE accounts SET security_version=security_version+1 WHERE id='c'").run()
      return target.batch(statements)
    }
    const value = Reflect.get(target, property, target)
    return typeof value === 'function' ? value.bind(target) : value
  } })
  await expect(rotateRecoveryCodes(ctx, session.principal, 1)).rejects.toMatchObject({ code: 'conflict' })
  expect((await f.execute('SELECT * FROM recovery_codes ORDER BY position').all()).results).toEqual(original)
  expect(await f.execute("SELECT version FROM recovery_code_sets WHERE account_id='c'").first('version')).toBe(1)
})
it('does not return status after account authority changes between preflight and final SELECT', async () => {
  const { session } = await enroll()
  const db = f.db, ctx = { ...f.ctx }
  ctx.db = new Proxy(db, { get(target, property) {
    if (property === 'prepare') return (sql: string) => {
      if (sql.startsWith('SELECT coalesce')) return { bind: (...values: Parameters<ReturnType<typeof db.prepare>['bind']>) => ({ first: async () => {
        await f.execute("UPDATE accounts SET security_version=security_version+1 WHERE id='c'").run()
        return target.prepare(sql).bind(...values).first()
      } }) }
      return target.prepare(sql)
    }
    const value = Reflect.get(target, property, target)
    return typeof value === 'function' ? value.bind(target) : value
  } })
  await expect(getRecoveryCodeStatus(ctx, session.principal)).rejects.toMatchObject({ code: 'unauthenticated' })
})
it('preserves required SAML provenance through issuance and refuses rotation once the provider is disabled', async () => {
  await f.execute("INSERT INTO identity_connections(id,organization_id,protocol,provider,issuer,created_at) VALUES('recovery-saml','org-a','saml','enterprise_saml','urn:recovery:saml',?)", f.ctx.clock.now()).run()
  await f.execute("INSERT INTO external_identities(id,account_id,connection_id,issuer,subject,created_at) VALUES('recovery-identity','a','recovery-saml','urn:recovery:saml','subject-a',?)", f.ctx.clock.now()).run()
  await f.execute("UPDATE organizations SET required_connection_id='recovery-saml',version=version+1 WHERE id='org-a'").run()
  const primary = await issueSession(f.ctx, { accountId: 'a', method: 'saml', externalIdentityId: 'recovery-identity', identityVersion: 1, connectionVersion: 1 }, 'browser')
  const key = new Uint8Array(32).fill(19), signed = await passkeyFixture()
  const start = await beginPasskeyRegistration(f.ctx, primary.principal, '127.0.0.1', key)
  const enrolled = await finishPasskeyRegistration(f.ctx, primary.principal, start.flowToken, await signed.registration(start.options.challenge), 'SAML key', '127.0.0.1', key)
  const before = await resolveSession(f.ctx, enrolled.session.token, 'browser')
  await rotateRecoveryCodes(f.ctx, enrolled.session.principal, 0)
  expect(await resolveSession(f.ctx, enrolled.session.token, 'browser')).toEqual(before)
  expect(before).toMatchObject({ method: 'saml', connectionId: 'recovery-saml', assurance: 'passkey' })
  await f.execute("UPDATE identity_connections SET enabled=0,version=version+1 WHERE id='recovery-saml'").run()
  await expect(rotateRecoveryCodes(f.ctx, enrolled.session.principal, 1)).rejects.toMatchObject({ code: 'unauthenticated' })
  expect(await f.execute("SELECT version FROM recovery_code_sets WHERE account_id='a'").first('version')).toBe(1)
})
