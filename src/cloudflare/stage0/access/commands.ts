import type { Action, CommandContext, OrganizationSnapshot, Scope } from '../contracts'
import { auditStatement } from '../db'
import { Stage0Error } from '../errors'
import { loadLiveSession } from '../auth/sessions'
import { withReceipt, commit } from '../commands'
import { accessPredicate, Bindings } from './policy'
import { authorizeOrganization, getOrganization } from './organizations'

export interface CreateOrganizationInput { name: string; contactEmail: string; timeZone: string; firstProgram: string; firstLocation: string }
export interface UpdateOrganizationInput { organizationId: string; expectedVersion: number; name: string; contactEmail: string; timeZone: string }
export interface SaveProgramInput { organizationId: string; id?: string; expectedVersion?: number; name: string; archived?: boolean }
export type SaveLocationInput = SaveProgramInput
export interface StructureSnapshot { id: string; name: string; version: number; archivedAt: number | null }
const orgScope: Scope = { kind: 'organization' }
const ordinaryActions: Action[] = ['organization.read','organization.update','program.read','program.manage','location.read','location.manage','staff.read','staff.manage_coordinators','audit.read']

// Canonicalization happens at this service boundary. HTTP request digests are
// correlation data, never authority for deciding whether content is identical.
function text(value: unknown, max = 120): string {
  if (typeof value !== 'string' || /\p{Cc}/u.test(value) || value.trim().length < 1 || value.trim().length > max) throw new Stage0Error('invalid_input')
  return value.trim()
}
function identifier(value: unknown): string { return text(value, 256) }
function version(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) >= Number.MAX_SAFE_INTEGER) throw new Stage0Error('invalid_input')
  return value as number
}
function settings(input: { name: string; contactEmail: string; timeZone: string }) {
  if (!input || typeof input !== 'object') throw new Stage0Error('invalid_input')
  const name = text(input.name)
  const contactEmail = text(input.contactEmail, 254).toLowerCase()
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(contactEmail)) throw new Stage0Error('invalid_input')
  const zone = text(input.timeZone)
  if (!/^[A-Za-z][A-Za-z0-9_+/-]*$/.test(zone)) throw new Stage0Error('invalid_input')
  let timeZone: string
  try { timeZone = new Intl.DateTimeFormat('en', { timeZone: zone }).resolvedOptions().timeZone } catch { throw new Stage0Error('invalid_input') }
  return { name, contactEmail, timeZone }
}
function policy(ctx: CommandContext, organizationId: string, action: Action, scope: Scope, b: Bindings, archived = false): string {
  return accessPredicate(b, ctx.principal, organizationId, action, scope, ctx.clock.now(), undefined, archived)
}
function creationPolicy(ctx: CommandContext, b: Bindings): string {
  return `EXISTS(SELECT 1 FROM stage0_live_sessions s LEFT JOIN identity_connections c ON c.id=s.connection_id
    WHERE s.id=${b.add(ctx.principal.sessionId)} AND s.account_id=${b.add(ctx.principal.accountId)} AND s.transport=${b.add(ctx.principal.transport)}
    AND s.created_at<=${b.add(ctx.clock.now())} AND s.expires_at>${b.add(ctx.clock.now())} AND s.assurance='passkey'
    AND (s.connection_id IS NULL OR c.organization_id IS NULL))`
}
export async function createOrganization(ctx: CommandContext, input: CreateOrganizationInput): Promise<OrganizationSnapshot> {
  const normalized = { ...settings(input), firstProgram: text(input.firstProgram), firstLocation: text(input.firstLocation) }
  const live = await loadLiveSession(ctx, ctx.principal)
  if (live.assurance !== 'passkey') throw new Stage0Error('forbidden')
  const b = new Bindings()
  const allowed = creationPolicy(ctx, b)
  if (!await ctx.db.prepare(`SELECT 1 WHERE ${allowed}`).bind(...b.values).first()) throw new Stage0Error('forbidden')
  return withReceipt(ctx, 'organization.create', '', normalized, (bindings, org) => `${creationPolicy(ctx, bindings)} AND ${policy(ctx, org, 'organization.read', orgScope, bindings)}`, async digest => {
    const id = ctx.ids.next()
    const result = { id, name: normalized.name, contactEmail: normalized.contactEmail, timeZone: normalized.timeZone, version: 1 }
    const bindings = new Bindings()
    const guard = `${creationPolicy(ctx, bindings)} AND NOT EXISTS(SELECT 1 FROM organizations WHERE created_by_account_id=${bindings.add(ctx.principal.accountId)})`
    return commit(ctx, 'organization.create', id, '', digest, bindings, guard, [
      ctx.db.prepare('INSERT INTO organizations(id,name,contact_email,time_zone,owner_account_id,created_by_account_id,created_at) VALUES(?,?,?,?,?,?,?)').bind(id, result.name, result.contactEmail, result.timeZone, ctx.principal.accountId, ctx.principal.accountId, ctx.clock.now()),
      ...ordinaryActions.map(action => ctx.db.prepare("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind) VALUES(?,?,?,?,'organization')").bind(ctx.ids.next(), `owner:${id}`, id, action)),
      ctx.db.prepare("INSERT INTO organization_policies(organization_id,status,assignment_review,eligibility_bypass,automatic_hour_approval,created_at) VALUES(?,'proposed','staff_reviewed',0,0,?)").bind(id, ctx.clock.now()),
      ctx.db.prepare('INSERT INTO programs(id,organization_id,name) VALUES(?,?,?)').bind(ctx.ids.next(), id, normalized.firstProgram),
      ctx.db.prepare('INSERT INTO locations(id,organization_id,name) VALUES(?,?,?)').bind(ctx.ids.next(), id, normalized.firstLocation),
      auditStatement(ctx, 'organization.create', id, ctx.principal, id),
    ], result)
  })
}
export async function updateOrganization(ctx: CommandContext, input: UpdateOrganizationInput): Promise<OrganizationSnapshot> {
  const normalized = { ...settings(input), organizationId: identifier(input.organizationId), expectedVersion: version(input.expectedVersion) }
  const org = normalized.organizationId
  await getOrganization(ctx, ctx.principal, org)
  return withReceipt(ctx, 'organization.update', org, normalized, b => policy(ctx, org, 'organization.update', orgScope, b), async digest => {
    await authorizeOrganization(ctx, ctx.principal, org, 'organization.update', orgScope)
    const b = new Bindings()
    const guard = `${policy(ctx, org, 'organization.update', orgScope, b)} AND EXISTS(SELECT 1 FROM organizations WHERE id=${b.add(org)} AND version=${b.add(normalized.expectedVersion)})`
    const result = { id: org, name: normalized.name, contactEmail: normalized.contactEmail, timeZone: normalized.timeZone, version: normalized.expectedVersion + 1 }
    return commit(ctx, 'organization.update', org, org, digest, b, guard, [
      ctx.db.prepare('UPDATE organizations SET name=?,contact_email=?,time_zone=?,version=version+1 WHERE id=? AND version=?').bind(result.name, result.contactEmail, result.timeZone, org, normalized.expectedVersion),
      auditStatement(ctx, 'organization.update', org, ctx.principal, org),
    ], result)
  })
}
async function saveStructure(ctx: CommandContext, input: SaveProgramInput, kind: 'program' | 'location'): Promise<StructureSnapshot> {
  if (!input || typeof input !== 'object') throw new Stage0Error('invalid_input')
  const org = identifier(input.organizationId)
  const name = text(input.name)
  const id = input.id === undefined ? undefined : identifier(input.id)
  const expectedVersion = input.expectedVersion === undefined ? undefined : version(input.expectedVersion)
  if ((id === undefined) !== (expectedVersion === undefined) || (input.archived !== undefined && typeof input.archived !== 'boolean') || (id === undefined && input.archived)) throw new Stage0Error('invalid_input')
  const normalized = { organizationId: org, id: id ?? null, name, expectedVersion: expectedVersion ?? null, archived: input.archived ?? false }
  const table = kind === 'program' ? 'programs' : 'locations'
  const action = kind === 'program' ? 'program.manage' : 'location.manage'
  const scope: Scope = id === undefined ? orgScope : kind === 'program' ? {kind:'program_location',programId:id} : {kind:'program_location',locationId:id}
  await getOrganization(ctx, ctx.principal, org)
  return withReceipt(ctx, `${kind}.save`, org, normalized, b => policy(ctx, org, action, scope, b, true), async digest => {
    await authorizeOrganization(ctx, ctx.principal, org, action, scope)
    const resourceId = id ?? ctx.ids.next()
    const result = { id: resourceId, name, version: id === undefined ? 1 : expectedVersion! + 1, archivedAt: normalized.archived ? ctx.clock.now() : null }
    const b = new Bindings()
    const guard = `${policy(ctx, org, action, scope, b)} AND ${id === undefined ? '1' : `EXISTS(SELECT 1 FROM ${table} WHERE id=${b.add(id)} AND organization_id=${b.add(org)} AND version=${b.add(expectedVersion!)} AND archived_at IS NULL)`}`
    const statement = id === undefined
      ? ctx.db.prepare(`INSERT INTO ${table}(id,organization_id,name) VALUES(?,?,?)`).bind(resourceId, org, name)
      : ctx.db.prepare(`UPDATE ${table} SET name=?,archived_at=?,version=version+1 WHERE id=? AND organization_id=? AND version=? AND archived_at IS NULL`).bind(name, result.archivedAt, id, org, expectedVersion!)
    const event = kind === 'program' ? (id === undefined ? 'program.create' : normalized.archived ? 'program.archive' : 'program.update') : (id === undefined ? 'location.create' : normalized.archived ? 'location.archive' : 'location.update')
    return commit(ctx, `${kind}.save`, org, org, digest, b, guard, [statement, auditStatement(ctx, event, resourceId, ctx.principal, org)], result)
  })
}
export const saveProgram = (ctx: CommandContext, input: SaveProgramInput): Promise<StructureSnapshot> => saveStructure(ctx, input, 'program')
export const saveLocation = (ctx: CommandContext, input: SaveLocationInput): Promise<StructureSnapshot> => saveStructure(ctx, input, 'location')
