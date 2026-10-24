import { beforeEach, expect, it } from 'vitest'
import * as client from 'openid-client'
import { databaseFixture } from './database'
import { oidcProviderFixture, settings } from './oidc-protocol-fixture'
import { passkeyFixture } from './passkey-fixture'
import { issueSession, resolveSession, revokeAllSessions, revokeSession } from '../../../src/cloudflare/stage0/auth/sessions'
import { beginPasskeyRegistration, finishPasskeyRegistration, beginPasskeyAuthentication, finishPasskeyAuthentication } from '../../../src/cloudflare/stage0/auth/passkeys/service'
import { consumeRecoveryCode, rotateRecoveryCodes } from '../../../src/cloudflare/stage0/auth/recovery'
import { startOidcTransaction, completeOidcTransaction } from '../../../src/cloudflare/stage0/auth/oidc/transactions'
import { handleRecoveryRequest } from '../../../src/cloudflare/stage0/auth/recovery-routes'
import { authorizeOrganization, getOrganization } from '../../../src/cloudflare/stage0/access/organizations'
import { approveDesktopRequest, createDesktopRequest, exchangeDesktopCode } from '../../../src/cloudflare/stage0/auth/desktop'

const key = new Uint8Array(32).fill(23), ip = '127.0.0.1', origin = 'http://localhost:4173'
let f: Awaited<ReturnType<typeof databaseFixture>>
let old: Awaited<ReturnType<typeof issueSession>>
let codes: string[]
let lostKey: Awaited<ReturnType<typeof passkeyFixture>>
let userHandle: string
beforeEach(async () => {
  f = await databaseFixture()
  for (const provider of ['google', 'microsoft']) {
    await f.execute('INSERT INTO identity_connections(id,protocol,provider,issuer,client_id,created_at) VALUES(?,?,?,?,?,?)', provider, 'oidc', provider,
      provider === 'google' ? 'https://accounts.google.com' : 'https://login.microsoftonline.com/{tenantid}/v2.0', 'fixture-client', f.ctx.clock.now()).run()
    await f.execute('INSERT INTO external_identities(id,account_id,connection_id,issuer,subject,tenant_id,created_at) VALUES(?,?,?,?,?,?,?)', provider+'-identity', 'c', provider,
      provider === 'google' ? 'https://accounts.google.com' : 'https://login.microsoftonline.com/11111111-1111-4111-8111-111111111111/v2.0',
      'exact-subject', provider === 'google' ? null : '11111111-1111-4111-8111-111111111111', f.ctx.clock.now()).run()
  }
  const primary = await issueSession(f.ctx, { accountId: 'c', method: 'password' }, 'browser')
  const start = await beginPasskeyRegistration(f.ctx, primary.principal, ip, key)
  const signed = await passkeyFixture()
  lostKey = signed; userHandle = start.options.user.id
  old = (await finishPasskeyRegistration(f.ctx, primary.principal, start.flowToken, await signed.registration(start.options.challenge), 'Lost key', ip, key)).session
  codes = (await rotateRecoveryCodes(f.ctx, old.principal, 0)).codes
})

async function providerFlow(provider: 'google' | 'microsoft' = 'google', purpose: 'login' | 'recovery' = 'recovery') {
  const fixture = await oidcProviderFixture(provider, { now: f.ctx.clock.now })
  const started = await startOidcTransaction(f.ctx, settings(provider), { purpose, ip }, key, fixture.fetcher)
  const auth = new URL(started.authorizationUrl)
  fixture.state.claims.nonce = auth.searchParams.get('nonce')!
  fixture.state.claims.auth_time = Math.floor(f.ctx.clock.now()/1000)
  const fetcher: typeof fixture.fetcher = async (url, init) => {
    if (url.endsWith('/token')) {
      const form = new URLSearchParams(String(init.body))
      if (await client.calculatePKCECodeChallenge(form.get('code_verifier')!) !== auth.searchParams.get('code_challenge')) throw new Error('Wrong PKCE')
      form.set('code_verifier', 'v'.repeat(43))
      return fixture.fetcher(url, { ...init, body: form })
    }
    return fixture.fetcher(url, init)
  }
  const callback = new URL(`${origin}/api/v1/auth/oidc/${provider}/callback?code=one-time-code&state=${auth.searchParams.get('state')}`)
  return { fixture, auth, finish: () => completeOidcTransaction(f.ctx, settings(provider), callback, started.browserBinding, fetcher) }
}
async function providerSession(provider: 'google' | 'microsoft' = 'google') {
  const flow = await providerFlow(provider)
  const completed = await flow.finish()
  expect(completed.kind).toBe('recovery')
  if (completed.kind !== 'recovery') throw new Error('Missing recovery flow')
  return completed.session
}
function consume(session: Awaited<ReturnType<typeof issueSession>>, code: string, headers: Record<string,string> = {}, body: Record<string,unknown> = {}) {
  return handleRecoveryRequest(f.ctx, new Request(origin+'/api/v1/auth/recovery/consume', { method: 'POST', headers: {
    Origin: origin, 'Content-Type': 'application/json', Cookie: `ovelle_local_session=${session.token}`, 'X-CSRF-Token': session.csrfToken!, ...headers,
  }, body: JSON.stringify({ code, confirmation: true, ...body }) }), { trustedIp: ip, budgetKey: key })
}
async function recovered() {
  const proof = await providerSession()
  const response = await consume(proof, codes[0])
  expect(response.status).toBe(204)
  const token = /ovelle_local_session=([^;]+)/.exec(response.headers.get('Set-Cookie')!)![1]
  const principal = await resolveSession(f.ctx, token, 'browser')
  return { token, principal, proof }
}

it.each(['google', 'microsoft'] as const)('requires signed %s freshness and a code before replacement, revoking old credentials only at replacement', async provider => {
  const proof = await providerSession(provider)
  expect((await resolveSession(f.ctx, proof.token, 'browser')).assurance).toBe('enrollment')
  await expect(beginPasskeyRegistration(f.ctx, proof.principal, ip, key)).rejects.toMatchObject({ code: 'forbidden' })
  await expect(authorizeOrganization(f.ctx, proof.principal, 'org-a', 'organization.read', { kind: 'organization' })).rejects.toThrow()
  expect((await resolveSession(f.ctx, old.token, 'browser')).assurance).toBe('passkey')
  const response = await consume(proof, codes[0]); expect(response.status).toBe(204)
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  const token = /ovelle_local_session=([^;]+)/.exec(response.headers.get('Set-Cookie')!)![1]
  const enrollment = await resolveSession(f.ctx, token, 'browser')
  expect(enrollment).toMatchObject({ accountId: 'c', method: 'oidc', connectionId: provider, assurance: 'enrollment' })
  await expect(resolveSession(f.ctx, old.token, 'browser')).rejects.toThrow()
  await expect(resolveSession(f.ctx, proof.token, 'browser')).rejects.toThrow()
  await expect(beginPasskeyAuthentication(f.ctx, enrollment, ip, key)).rejects.toMatchObject({ code: 'forbidden' })
  expect(await f.execute("SELECT count(*) AS n FROM recovery_codes WHERE account_id='c'").first('n')).toBe(7)
  expect(await f.execute("SELECT count(*) AS n FROM passkey_credentials WHERE account_id='c' AND disabled_at IS NULL").first('n')).toBe(1)
  const start = await beginPasskeyRegistration(f.ctx, enrollment, ip, key), replacement = await passkeyFixture()
  const completed = await finishPasskeyRegistration(f.ctx, enrollment, start.flowToken, await replacement.registration(start.options.challenge), 'Replacement', ip, key)
  expect((await resolveSession(f.ctx, completed.session.token, 'browser'))).toMatchObject({ assurance: 'passkey', method: 'oidc', connectionId: provider })
  expect(await f.execute("SELECT count(*) AS n FROM passkey_credentials WHERE account_id='c' AND disabled_at IS NULL").first('n')).toBe(1)
  expect(await f.execute('SELECT disabled_at FROM passkey_credentials WHERE id!=?', replacement.id).first('disabled_at')).toBe(f.ctx.clock.now())
  await expect(resolveSession(f.ctx, token, 'browser')).rejects.toThrow()
  expect(await f.execute("SELECT count(*) AS n FROM audit_events WHERE action='recovery.consume'").first('n')).toBe(1)
  expect(await f.execute("SELECT count(*) AS n FROM audit_events WHERE action='recovery.complete'").first('n')).toBe(1)
})
it.each([undefined, -300, -1, 1] as const)('rejects missing stale pre-transaction or future signed authentication time (%s)', async delta => {
  const flow = await providerFlow()
  flow.fixture.state.claims.auth_time = delta === undefined ? undefined : Math.floor(f.ctx.clock.now()/1000)+delta
  await expect(flow.finish()).rejects.toMatchObject({ code: 'unauthenticated' })
  expect(await f.execute('SELECT count(*) AS n FROM recovery_provider_proofs').first('n')).toBe(0)
})
it('does not recover a new subject or use a normal login as recovery proof', async () => {
  const flow = await providerFlow(); flow.fixture.state.claims.sub = 'new-subject'
  await expect(flow.finish()).rejects.toMatchObject({ code: 'unauthenticated' })
  const login = await providerFlow('google','login'); const done = await login.finish()
  if (done.kind !== 'signed_in') throw new Error('Expected ordinary login')
  expect((await consume(done.session, codes[0])).status).toBe(403)
  expect(await f.execute("SELECT count(*) AS n FROM recovery_codes WHERE account_id='c'").first('n')).toBe(8)
})
it('rejects wrong-account codes, unknown input, CSRF and origin failures without revoking sessions', async () => {
  const proof = await providerSession()
  for (const headers of [{ Origin: 'null' }, { 'X-CSRF-Token': '' }, { Authorization: `Bearer ${proof.token}` }] as Record<string,string>[]) expect([401,403]).toContain((await consume(proof, codes[0], headers)).status)
  expect((await consume(proof, codes[0], {}, { accountId: 'd' })).status).toBe(400)
  expect((await consume(proof, codes[0], {}, { confirmation: false })).status).toBe(400)
  expect((await consume(proof, 'x'.repeat(43))).status).toBe(401)
  expect((await resolveSession(f.ctx, old.token, 'browser')).assurance).toBe('passkey')
})
it.each([false,true])('allows only one racing code consumption and no replay (distinct codes %s)', async distinct => {
  const one = await providerSession(), two = await providerSession()
  const responses = await Promise.all([consume(one,codes[0]), consume(two,codes[distinct?1:0])])
  expect(responses.filter(r=>r.status===204)).toHaveLength(1)
  expect(await f.execute("SELECT count(*) AS n FROM recovery_codes WHERE account_id='c'").first('n')).toBe(7)
  expect((await consume(one,codes[0])).status).not.toBe(204)
  expect((await consume(two,codes[0])).status).not.toBe(204)
})
it('bounds code attempts durably and never consumes a code on a failed attempt', async () => {
  const proof = await providerSession()
  for (let n=0;n<5;n++) expect((await consume(proof,'x'.repeat(43))).status).toBe(401)
  expect((await consume(proof,codes[0])).status).toBe(429)
  expect(await f.execute("SELECT count(*) AS n FROM recovery_codes WHERE account_id='c'").first('n')).toBe(8)
})
it('expires provider proof and replacement grants without permitting primary-only enrollment', async () => {
  const proof = await providerSession(); f.advance(300_000)
  expect((await consume(proof,codes[0])).status).not.toBe(204)
  const next = await recovered(); f.advance(300_000)
  await expect(beginPasskeyRegistration(f.ctx,next.principal,ip,key)).rejects.toThrow()
})
it('rolls back code consumption security epoch and revocation when audit fails', async () => {
  const proof = await providerSession()
  await f.execute("CREATE TRIGGER fail_recovery_consume BEFORE INSERT ON audit_events WHEN NEW.action='recovery.consume' BEGIN SELECT RAISE(ABORT,'private_failure'); END").run()
  const result = await consume(proof,codes[0]); expect(result.status).toBe(503); expect(await result.text()).not.toContain('private_failure')
  expect(await f.execute("SELECT security_version FROM accounts WHERE id='c'").first('security_version')).toBe(1)
  expect(await f.execute("SELECT count(*) AS n FROM recovery_codes WHERE account_id='c'").first('n')).toBe(8)
  expect((await resolveSession(f.ctx,old.token,'browser')).assurance).toBe('passkey')
})
it('does not let provider-only proof revoke other sessions or all account sessions before a code', async () => {
  const proof = await providerSession()
  await expect(revokeAllSessions(f.ctx,proof.principal)).rejects.toMatchObject({code:'forbidden'})
  await expect(revokeSession(f.ctx,proof.principal,old.principal.sessionId)).rejects.toMatchObject({code:'forbidden'})
  expect((await resolveSession(f.ctx,old.token,'browser')).assurance).toBe('passkey')
  await revokeSession(f.ctx,proof.principal,proof.principal.sessionId)
  await expect(resolveSession(f.ctx,proof.token,'browser')).rejects.toThrow()
})
it('binds a code to its own account without leaking which account holds it', async () => {
  const proof=await providerSession(), foreign='f'.repeat(43)
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(['ovelle:recovery-code:v1','d',foreign])))),b=>b.toString(16).padStart(2,'0')).join('')
  await f.execute("INSERT INTO recovery_code_sets(account_id,version,rotated_at) VALUES('d',1,?)",f.ctx.clock.now()).run()
  await f.execute("INSERT INTO recovery_codes(account_id,position,code_digest) VALUES('d',1,?)",digest).run()
  const response=await consume(proof,foreign)
  expect(response.status).toBe(401);expect(await response.json()).toEqual({error:'unauthenticated'})
  expect(await f.execute("SELECT count(*) AS n FROM recovery_codes WHERE account_id='d'").first('n')).toBe(1)
})
it.each(['session','account','epoch','identity','provider'] as const)('rechecks %s authority inside the code consumption transaction', async kind=>{
  const proof=await providerSession(), db=f.db
  let batches=0
  const ctx={...f.ctx,db:new Proxy(db,{get(target,prop){
    if(prop==='batch')return async(statements:Parameters<typeof db.batch>[0])=>{
      if(++batches===2){
        if(kind==='session')await f.execute('UPDATE sessions SET revoked_at=? WHERE id=?',f.ctx.clock.now(),proof.principal.sessionId).run()
        if(kind==='account')await f.execute("UPDATE accounts SET disabled_at=? WHERE id='c'",f.ctx.clock.now()).run()
        if(kind==='epoch')await f.execute("UPDATE accounts SET security_version=security_version+1 WHERE id='c'").run()
        if(kind==='identity')await f.execute("UPDATE external_identities SET disabled_at=?,version=version+1 WHERE id='google-identity'",f.ctx.clock.now()).run()
        if(kind==='provider')await f.execute("UPDATE identity_connections SET enabled=0,version=version+1 WHERE id='google'").run()
      }
      return target.batch(statements)
    }
    const v=Reflect.get(target,prop,target);return typeof v==='function'?v.bind(target):v
  }})}
  await expect(consumeRecoveryCode(ctx,proof.principal,codes[0],ip,key)).rejects.toMatchObject({code:'conflict'})
  expect(await f.execute("SELECT count(*) AS n FROM recovery_codes WHERE account_id='c'").first('n')).toBe(8)
  expect(await f.execute('SELECT count(*) AS n FROM recovery_enrollments').first('n')).toBe(0)
})
it('rolls back replacement revocation and its grant when the completion audit fails', async()=>{
  const next=await recovered(), start=await beginPasskeyRegistration(f.ctx,next.principal,ip,key), signed=await passkeyFixture()
  await f.execute("CREATE TRIGGER fail_recovery_complete BEFORE INSERT ON audit_events WHEN NEW.action='recovery.complete' BEGIN SELECT RAISE(ABORT,'private_failure'); END").run()
  await expect(finishPasskeyRegistration(f.ctx,next.principal,start.flowToken,await signed.registration(start.options.challenge),'New',ip,key)).rejects.toThrow()
  expect(await f.execute("SELECT count(*) AS n FROM passkey_credentials WHERE account_id='c' AND disabled_at IS NULL").first('n')).toBe(1)
  expect(await f.execute('SELECT completed_at FROM recovery_enrollments').first('completed_at')).toBeNull()
  expect((await resolveSession(f.ctx,next.token,'browser')).assurance).toBe('enrollment')
  expect(await f.execute("SELECT security_version FROM accounts WHERE id='c'").first('security_version')).toBe(2)
})
it('invalidates native sessions and approved desktop codes while preserving other accounts', async()=>{
  const verifier='v'.repeat(43), state='s'.repeat(43), callbackUri='http://127.0.0.1:49231/ovelle-auth/callback'
  const challenge=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')
  async function approved(){
    const pending=await createDesktopRequest(f.ctx,{state,challenge,callbackUri},ip,key)
    const url=new URL((await approveDesktopRequest(f.ctx,old.principal,{requestId:pending.requestId,state,confirmation:true})).callbackUrl)
    return{requestId:pending.requestId,state,callbackUri,verifier,code:url.searchParams.get('code')!}
  }
  const native=await exchangeDesktopCode(f.ctx,await approved(),ip,key), pending=await approved()
  const other=await issueSession(f.ctx,{accountId:'d',method:'password'},'browser')
  await recovered()
  await expect(resolveSession(f.ctx,native.token,'desktop')).rejects.toMatchObject({code:'unauthenticated'})
  await expect(exchangeDesktopCode(f.ctx,pending,ip,key)).rejects.toMatchObject({code:'unauthenticated'})
  expect((await resolveSession(f.ctx,other.token,'browser')).accountId).toBe('d')
})
it('preserves required enterprise SSO after recovery and never changes memberships or ownership', async()=>{
  await f.execute("INSERT INTO identity_connections(id,organization_id,protocol,provider,issuer,created_at) VALUES('required-saml','org-a','saml','enterprise_saml','urn:required',1)").run()
  await f.execute("UPDATE organizations SET required_connection_id='required-saml',version=version+1 WHERE id='org-a'").run()
  const memberships=(await f.execute("SELECT * FROM organization_memberships WHERE account_id='c' ORDER BY id").all()).results
  const next=await recovered(), start=await beginPasskeyRegistration(f.ctx,next.principal,ip,key), signed=await passkeyFixture()
  const result=await finishPasskeyRegistration(f.ctx,next.principal,start.flowToken,await signed.registration(start.options.challenge),'New',ip,key)
  await expect(getOrganization(f.ctx,result.session.principal,'org-a')).rejects.toMatchObject({code:'not_found'})
  expect((await getOrganization(f.ctx,result.session.principal,'org-b')).id).toBe('org-b')
  expect((await f.execute("SELECT * FROM organization_memberships WHERE account_id='c' ORDER BY id").all()).results).toEqual(memberships)
  expect(await f.execute("SELECT owner_account_id FROM organizations WHERE id='org-a'").first('owner_account_id')).toBe('a')
})
it('revokes an intervening old-key login and commits only one competing replacement', async()=>{
  const next=await recovered()
  const login=await beginPasskeyAuthentication(f.ctx,null,ip,key)
  lostKey.state.counter=1
  const intervening=await finishPasskeyAuthentication(f.ctx,null,login.flowToken,await lostKey.authentication(login.options.challenge,userHandle),ip,key)
  const start=await beginPasskeyRegistration(f.ctx,next.principal,ip,key), replacement=await passkeyFixture()
  const signed=await replacement.registration(start.options.challenge)
  const outcomes=await Promise.allSettled([1,2].map(()=>finishPasskeyRegistration(f.ctx,next.principal,start.flowToken,signed,'Replacement',ip,key)))
  expect(outcomes.filter(o=>o.status==='fulfilled')).toHaveLength(1)
  await expect(resolveSession(f.ctx,intervening.token,'browser')).rejects.toMatchObject({code:'unauthenticated'})
  expect(await f.execute("SELECT count(*) AS n FROM passkey_credentials WHERE account_id='c' AND disabled_at IS NULL").first('n')).toBe(1)
  expect(await f.execute("SELECT count(*) AS n FROM audit_events WHERE action='recovery.complete'").first('n')).toBe(1)
})
it.each(['session','provider','epoch'] as const)('rechecks %s revocation at replacement commit after signature verification',async kind=>{
  const next=await recovered(), start=await beginPasskeyRegistration(f.ctx,next.principal,ip,key), replacement=await passkeyFixture(), db=f.db
  let batches=0
  const ctx={...f.ctx,db:new Proxy(db,{get(target,prop){
    if(prop==='batch')return async(statements:Parameters<typeof db.batch>[0])=>{
      if(++batches===2){
        if(kind==='session')await f.execute('UPDATE sessions SET revoked_at=? WHERE id=?',f.ctx.clock.now(),next.principal.sessionId).run()
        if(kind==='provider')await f.execute("UPDATE identity_connections SET enabled=0,version=version+1 WHERE id='google'").run()
        if(kind==='epoch')await f.execute("UPDATE accounts SET security_version=security_version+1 WHERE id='c'").run()
      }
      return target.batch(statements)
    }
    const v=Reflect.get(target,prop,target);return typeof v==='function'?v.bind(target):v
  }})}
  await expect(finishPasskeyRegistration(ctx,next.principal,start.flowToken,await replacement.registration(start.options.challenge),'Replacement',ip,key)).rejects.toMatchObject({code:'conflict'})
  expect(await f.execute("SELECT count(*) AS n FROM passkey_credentials WHERE account_id='c' AND disabled_at IS NULL").first('n')).toBe(1)
  expect(await f.execute('SELECT completed_at FROM recovery_enrollments').first('completed_at')).toBeNull()
})
