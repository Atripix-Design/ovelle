import { expect, it } from 'vitest'
import type { EmailMessage, EmailMessageBuilder, SendEmail } from '@cloudflare/workers-types'
import type { Grant, OrganizationSnapshot } from '../../../src/cloudflare/stage0/contracts'
import { loadStage0Config } from '../../../src/cloudflare/stage0/config'
import { createStage0Backend } from '../../../src/cloudflare/stage0/backend'
import { issueSession, type IssuedSession } from '../../../src/cloudflare/stage0/auth/sessions'
import { beginPasskeyRegistration, finishPasskeyRegistration } from '../../../src/cloudflare/stage0/auth/passkeys/service'
import { databaseFixture } from './database'
import { passkeyFixture } from './passkey-fixture'

interface Structure { id: string; name: string; version: number }
interface Invitation { id: string; version: number; state: string; delivery: string }
interface Membership { id: string; version: number; organizationId: string; accountId: string; preset: string; state: string }
interface Audit { action: string; actorAccountId: string; resourceId: string }
const admission = { trustedIp: '192.0.2.25', budgetKey: new Uint8Array(32).fill(29) }
const orgPath = (id: string) => `/api/v1/organizations/${encodeURIComponent(id)}`

it('connects fresh organization creation, mail rotation, scoped access, same-session revocation and invited-admin ownership with reconciled audit', async () => {
  const f = await databaseFixture()
  const bindings = { APP_ENV: 'development', AUTH_ORIGIN: 'https://dev.ovelle.org', AUTH_RP_ID: 'dev.ovelle.org', AUTH_EMAIL_FROM: 'accounts@auth.example.test', TURNSTILE_SITE_KEY: 'fixture-site', TURNSTILE_SECRET_KEY: 'fixture-secret',
    AUTH_ADMISSION_KEY: btoa(String.fromCharCode(...admission.budgetKey)).replaceAll('=', '') }
  f.ctx.config = loadStage0Config(bindings)
  // Only primary identity/account establishment and the external mail binding are
  // fixtures. No organization, membership, grant or passkey is seeded for these
  // actors. Software authenticators use the existing production verifier.
  const actors = ['journey-owner-a', 'journey-owner-b', 'journey-coordinator', 'journey-successor']
  await f.db.batch(actors.map(id => f.execute('INSERT INTO accounts(id,email,display_name,email_verified_at,created_at) VALUES(?,?,?,?,?)', id, `${id}@example.test`, id, f.ctx.clock.now(), f.ctx.clock.now())))
  expect(await f.execute('SELECT count(*) AS n FROM organization_memberships WHERE account_id LIKE ?', 'journey-%').first('n')).toBe(0)
  const messages: EmailMessageBuilder[] = []
  let failNext = true
  const binding: Pick<SendEmail, 'send'> = {
    async send(message: EmailMessage | EmailMessageBuilder) {
      if (!('subject' in message)) throw new Error('Unexpected raw email')
      messages.push(message)
      if (failNext) { failNext = false; throw new Error('Uncertain fixture transport outcome') }
      return { messageId: `fixture-mail-${messages.length}` }
    },
  }
  const app = createStage0Backend(bindings, { db: f.db, email: binding, clock: f.ctx.clock, ids: f.ctx.ids })
  let sequence = 0
  // The same composed server root routes every family; tests no longer select
  // an organization/invitation/staff adapter directly.
  const composed = (request: Request, transport: 'browser' | 'desktop') => {
    if (transport === 'browser') return app.fetch(request, admission.trustedIp)
    const url = new URL(request.url)
    url.pathname = '/api/v1/native'+url.pathname.slice('/api/v1'.length)
    return app.fetch(new Request(url, request), admission.trustedIp)
  }
  function request(path: string, session: IssuedSession, method = 'GET', body?: unknown): Request {
    const headers: Record<string, string> = session.principal.transport === 'browser'
      ? { Cookie: `__Host-ovelle_session=${session.token}`, Origin: f.ctx.config.origin, 'X-CSRF-Token': session.csrfToken! }
      : { Authorization: `Bearer ${session.token}` }
    if (body !== undefined) { headers['Content-Type'] = 'application/json'; headers['Idempotency-Key'] = `acceptance-command-${++sequence}` }
    return new Request(f.ctx.config.origin + path, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  }
  async function response<T>(req: Request, status = 200, transport: 'browser' | 'desktop' = 'browser'): Promise<T> {
    const res = await composed(req, transport)
    expect(res.status, await res.clone().text()).toBe(status)
    return await res.json() as T
  }
  async function enroll(id: string) {
    const primary = await issueSession(f.ctx, { accountId: id, method: 'password' }, 'browser')
    const start = await beginPasskeyRegistration(f.ctx, primary.principal, admission.trustedIp, admission.budgetKey)
    const key = await passkeyFixture()
    key.state.origin = f.ctx.config.origin; key.state.rp = f.ctx.config.rpId
    const enrolled = await finishPasskeyRegistration(f.ctx, primary.principal, start.flowToken, await key.registration(start.options.challenge), 'Journey passkey', admission.trustedIp, admission.budgetKey)
    return enrolled.session
  }
  const ownerA = await enroll(actors[0]), ownerB = await enroll(actors[1]), successor = await enroll(actors[3])
  // These exact two credentials survive acceptance and organization revocation;
  // the test never refreshes/reissues them after role changes.
  const coordinator = await issueSession(f.ctx, { accountId: actors[2], method: 'password' }, 'browser')
  const native = await issueSession(f.ctx, { accountId: actors[2], method: 'password' }, 'desktop')
  const settings = (name: string) => ({ name, contactEmail: 'staff@example.test', timeZone: 'America/New_York', firstProgram: `${name} program`, firstLocation: `${name} center` })
  const createA = request('/api/v1/organizations', ownerA, 'POST', settings('Journey A')), replayCreateA = createA.clone()
  const a = await response<OrganizationSnapshot>(createA, 201)
  expect(await response(replayCreateA, 201)).toEqual(a)
  const b = await response<OrganizationSnapshot>(request('/api/v1/organizations', ownerB, 'POST', settings('Journey B')), 201)
  expect(a.id).not.toBe(b.id)
  const programsA = await response<{ programs: Structure[] }>(request(`${orgPath(a.id)}/programs`, ownerA))
  const programsB = await response<{ programs: Structure[] }>(request(`${orgPath(b.id)}/programs`, ownerB))
  expect(programsA.programs).toHaveLength(1); expect(programsB.programs).toHaveLength(1)
  const programA = programsA.programs[0], programB = programsB.programs[0]
  const extra = await response<Structure>(request(`${orgPath(a.id)}/programs`, ownerA, 'POST', { name: 'Outside coordinator scope' }), 201)
  const grantsFor = (programId: string): Grant[] => ['program.read', 'program.manage'].map(action => ({ action: action as Grant['action'], scope: { kind: 'program_location', programId } }))
  const mailToken = (index: number) => {
    const link = messages[index].text!.match(/https:\/\/dev\.ovelle\.org\/account\/staff-invitation#token=([A-Za-z0-9_-]{43})/)
    expect(link).not.toBeNull()
    return link![1]
  }
  const inviteA = await response<Invitation>(request(`${orgPath(a.id)}/invitations`, ownerA, 'POST', { email: `${actors[2]}@example.test`, preset: 'coordinator', grants: grantsFor(programA.id) }), 201)
  expect(await response(request(`${orgPath(a.id)}/invitations/${inviteA.id}`, ownerA))).toMatchObject({ state: 'pending', delivery: 'failed' })
  await response(request(orgPath(a.id), coordinator), 404)
  const oldToken = mailToken(0)
  const resend = request(`${orgPath(a.id)}/invitations/${inviteA.id}/resend`, ownerA, 'POST', { expectedVersion: 1 }), replayResend = resend.clone()
  const resent = await response<Invitation>(resend)
  expect(resent.version).toBe(2)
  await response(replayResend)
  expect(messages).toHaveLength(2)
  const tokenA = mailToken(1)
  expect(tokenA).not.toBe(oldToken)
  await response(request('/api/v1/invitations/accept', coordinator, 'POST', { token: oldToken }), 401)
  const acceptA = request('/api/v1/invitations/accept', coordinator, 'POST', { token: tokenA }), replayAcceptA = acceptA.clone()
  const memberA = await response<Membership>(acceptA)
  expect(await response(replayAcceptA)).toEqual(memberA)
  expect(memberA).toMatchObject({ organizationId: a.id, accountId: actors[2], preset: 'coordinator', state: 'active' })
  const inviteB = await response<Invitation>(request(`${orgPath(b.id)}/invitations`, ownerB, 'POST', { email: `${actors[2]}@example.test`, preset: 'coordinator', grants: grantsFor(programB.id) }), 201)
  const memberB = await response<Membership>(request('/api/v1/invitations/accept', coordinator, 'POST', { token: mailToken(2) }))
  expect(memberB.organizationId).toBe(b.id)

  for (const session of [coordinator, native]) {
    const transport = session.principal.transport
    const visible = await response<{ programs: Structure[] }>(request(`${orgPath(a.id)}/programs`, session), 200, transport)
    expect(visible.programs).toEqual([programA])
    await response(request(`${orgPath(a.id)}/programs/${extra.id}`, session), 404, transport)
    await response(request(`${orgPath(a.id)}/programs/${programB.id}`, session), 404, transport)
  }
  await response(request(orgPath(b.id), ownerA), 404)
  await response(request(`${orgPath(a.id)}/memberships/${memberA.id}/grants`, coordinator, 'PATCH', { expectedVersion: 1, grants: [{ action: 'program.manage', scope: { kind: 'organization' } }] }), 403)
  // Exercise the native namespace's actual mutation body and idempotency header,
  // then replay that same command after its live membership is revoked.
  const rename = request(`${orgPath(a.id)}/programs/${programA.id}`, native, 'PATCH', { name: 'Coordinator reviewed program', expectedVersion: 1 }), replayRenameAfterRevoke = rename.clone()
  expect(await response(rename, 200, 'desktop')).toMatchObject({ id: programA.id, version: 2 })
  const revoke = request(`${orgPath(a.id)}/memberships/${memberA.id}/revoke`, ownerA, 'POST', { expectedVersion: 1 }), replayRevoke = revoke.clone()
  await response(revoke)
  await response(replayRevoke)
  await response(replayRenameAfterRevoke, 404, 'desktop')
  for (const session of [coordinator, native]) {
    const transport = session.principal.transport
    await response(request(`${orgPath(a.id)}/programs`, session), 404, transport)
    const directory = await response<{ organizations: OrganizationSnapshot[] }>(request('/api/v1/me/organizations', session), 200, transport)
    expect(directory.organizations.map(org => org.id)).toEqual([b.id])
    expect(await response(request(`${orgPath(b.id)}/programs/${programB.id}`, session), 200, transport)).toEqual(programB)
  }

  const inviteAdmin = await response<Invitation>(request(`${orgPath(a.id)}/invitations`, ownerA, 'POST', { email: `${actors[3]}@example.test`, preset: 'admin', grants: [{ action: 'audit.read', scope: { kind: 'organization' } }] }), 201)
  const target = await response<Membership>(request('/api/v1/invitations/accept', successor, 'POST', { token: mailToken(3) }))
  await response(request(orgPath(a.id), successor, 'PATCH', { name: 'Not owner yet', contactEmail: 'staff@example.test', timeZone: 'America/New_York', expectedVersion: 1 }), 403)
  const transfer = await response<{ id: string }>(request(`${orgPath(a.id)}/ownership-transfer`, ownerA, 'POST', { targetMembershipId: target.id, expectedOwnerVersion: 1, expectedTargetVersion: 1 }), 201)
  const acceptOwner = request(`${orgPath(a.id)}/ownership-transfer/${transfer.id}/accept`, successor, 'POST', { expectedVersion: 1 }), replayOwner = acceptOwner.clone()
  expect(await response(acceptOwner)).toMatchObject({ id: a.id, version: 2 })
  await response(replayOwner)
  const previous = await response<Membership>(request(`${orgPath(a.id)}/memberships/${encodeURIComponent(`owner:${a.id}`)}`, successor))
  expect(previous).toMatchObject({ accountId: actors[0], preset: 'admin', state: 'active' })
  // New owner authority follows the transition even though the accepted offer
  // only carried audit.read. The former owner keeps ordinary admin access.
  await response(request(orgPath(a.id), successor, 'PATCH', { name: 'Transferred A', contactEmail: 'staff@example.test', timeZone: 'America/New_York', expectedVersion: 2 }))
  await response(request(orgPath(a.id), ownerA))
  await response(request(`${orgPath(a.id)}/invitations`, ownerA, 'POST', { email: 'another-admin@example.test', preset: 'admin', grants: [] }), 403)
  expect(messages).toHaveLength(4)

  const auditA = await response<{ events: Audit[] }>(request(`${orgPath(a.id)}/audit`, successor))
  const expectedA: Audit[] = [
    { action: 'organization.create', actorAccountId: actors[0], resourceId: a.id },
    { action: 'program.create', actorAccountId: actors[0], resourceId: extra.id },
    { action: 'invitation.create', actorAccountId: actors[0], resourceId: inviteA.id },
    { action: 'invitation.resend', actorAccountId: actors[0], resourceId: inviteA.id },
    { action: 'invitation.accept', actorAccountId: actors[2], resourceId: inviteA.id },
    { action: 'program.update', actorAccountId: actors[2], resourceId: programA.id },
    { action: 'membership.revoke', actorAccountId: actors[0], resourceId: memberA.id },
    { action: 'invitation.create', actorAccountId: actors[0], resourceId: inviteAdmin.id },
    { action: 'invitation.accept', actorAccountId: actors[3], resourceId: inviteAdmin.id },
    { action: 'ownership.request', actorAccountId: actors[0], resourceId: transfer.id },
    { action: 'ownership.accept', actorAccountId: actors[3], resourceId: transfer.id },
    { action: 'organization.update', actorAccountId: actors[3], resourceId: a.id },
  ]
  const triples = (rows: Audit[]) => rows.map(({ action, actorAccountId, resourceId }) => JSON.stringify([action, actorAccountId, resourceId])).sort()
  // The access-history endpoint intentionally excludes program edits; reconcile
  // those against the authoritative org-qualified audit rows as well.
  expect(triples(auditA.events)).toEqual(triples(expectedA.filter(event => !event.action.startsWith('program.'))))
  const storedA = await f.execute('SELECT action,actor_account_id AS actorAccountId,resource_id AS resourceId FROM audit_events WHERE organization_id=?', a.id).all<Audit>()
  expect(triples(storedA.results)).toEqual(triples(expectedA))
  expect(await f.execute('SELECT owner_account_id AS owner,version FROM organizations WHERE id=?', a.id).first()).toEqual({ owner: actors[3], version: 3 })
  expect(await f.execute('SELECT state,version FROM organization_memberships WHERE id=?', memberA.id).first()).toEqual({ state: 'revoked', version: 2 })
  expect(await f.execute('SELECT name,version FROM programs WHERE id=?', programA.id).first()).toEqual({ name: 'Coordinator reviewed program', version: 2 })
  const auditB = await response<{ events: Audit[] }>(request(`${orgPath(b.id)}/audit`, ownerB))
  expect(triples(auditB.events)).toEqual(triples([
    { action: 'organization.create', actorAccountId: actors[1], resourceId: b.id },
    { action: 'invitation.create', actorAccountId: actors[1], resourceId: inviteB.id },
    { action: 'invitation.accept', actorAccountId: actors[2], resourceId: inviteB.id },
  ]))
  const state = JSON.stringify((await f.execute('SELECT * FROM audit_events').all()).results)
  const receipts = JSON.stringify((await f.execute('SELECT * FROM command_receipts').all()).results)
  for (const secret of [oldToken, tokenA, mailToken(2), mailToken(3), coordinator.token, native.token]) {
    expect(state).not.toContain(secret); expect(receipts).not.toContain(secret)
  }
  f.advance(43_200_000)
  for (const session of [coordinator, native]) await response(request(orgPath(b.id), session), 401, session.principal.transport)
})
