import type { Action, AuthorizedContext, OrganizationSnapshot, Principal, RequestContext, Scope } from '../contracts'
import { parseAction } from '../contracts'
import { Stage0Error } from '../errors'
import { loadLiveSession, principalFromRow } from '../auth/sessions'
import { accessPredicate, Bindings, validateScope } from './policy'

const organizationScope: Scope = { kind: 'organization' }
export interface ProgramSnapshot { id: string; name: string; version: number }
export async function getOrganization(ctx: RequestContext, principal: Principal, organizationId: string): Promise<OrganizationSnapshot> {
  await loadLiveSession(ctx, principal)
  const b = new Bindings()
  const policy = accessPredicate(b, principal, organizationId, 'organization.read', organizationScope, ctx.clock.now())
  const row = await ctx.db.prepare(`SELECT o.id,o.name,o.version,o.time_zone,o.contact_email FROM organizations o WHERE o.id=${b.add(organizationId)} AND (${policy})`).bind(...b.values).first<{ id: string; name: string; version: number; time_zone: string; contact_email: string | null }>()
  if (!row) throw new Stage0Error('not_found')
  return { id: row.id, name: row.name, version: row.version, timeZone: row.time_zone, contactEmail: row.contact_email }
}
export async function authorizeOrganization(ctx: RequestContext, principal: Principal, organizationId: string, action: Action, scope: Scope): Promise<AuthorizedContext> {
  parseAction(action)
  validateScope(scope)
  const session = await loadLiveSession(ctx, principal)
  await getOrganization(ctx, principal, organizationId)
  if (scope.kind === 'program_location') {
    for (const [table, id] of [['programs', scope.programId], ['locations', scope.locationId]] as const) {
      if (id !== undefined && !await ctx.db.prepare(`SELECT 1 FROM ${table} WHERE id=? AND organization_id=? AND archived_at IS NULL`).bind(id, organizationId).first()) throw new Stage0Error('not_found')
    }
  }
  const b = new Bindings()
  const policy = accessPredicate(b, principal, organizationId, action, scope, ctx.clock.now())
  const row = await ctx.db.prepare(`SELECT m.id,m.version FROM organization_memberships m WHERE m.organization_id=${b.add(organizationId)} AND m.account_id=${b.add(principal.accountId)} AND (${policy})`).bind(...b.values).first<{ id: string; version: number }>()
  if (!row) throw new Stage0Error('forbidden')
  return { ...ctx, principal: principalFromRow(session), organizationId, membershipId: row.id, membershipVersion: row.version, action, scope }
}
function programScope(programId: string, locationId?: string): Scope {
  const scope: Scope = { kind: 'program_location', programId, ...(locationId !== undefined ? { locationId } : {}) }
  validateScope(scope)
  return scope
}
export async function listPrograms(ctx: RequestContext, principal: Principal, organizationId: string, filter: { locationId?: string } = {}): Promise<ProgramSnapshot[]> {
  await getOrganization(ctx, principal, organizationId)
  const b = new Bindings()
  const policy = accessPredicate(b, principal, organizationId, 'program.read', programScope('row', filter.locationId), ctx.clock.now(), 'program')
  const result = await ctx.db.prepare(`SELECT p.id,p.name,p.version FROM programs p WHERE p.organization_id=${b.add(organizationId)} AND p.archived_at IS NULL AND (${policy}) ORDER BY p.id LIMIT 100`).bind(...b.values).all<ProgramSnapshot>()
  return result.results
}
export async function getProgram(ctx: RequestContext, principal: Principal, organizationId: string, programId: string, filter: { locationId?: string } = {}): Promise<ProgramSnapshot> {
  await getOrganization(ctx, principal, organizationId)
  const b = new Bindings()
  const policy = accessPredicate(b, principal, organizationId, 'program.read', programScope(programId, filter.locationId), ctx.clock.now(), 'program')
  const row = await ctx.db.prepare(`SELECT p.id,p.name,p.version FROM programs p WHERE p.organization_id=${b.add(organizationId)} AND p.id=${b.add(programId)} AND p.archived_at IS NULL AND (${policy})`).bind(...b.values).first<ProgramSnapshot>()
  if (!row) throw new Stage0Error('not_found')
  return row
}
export interface LocationSnapshot { id: string; name: string; version: number }
function locationScope(locationId: string, programId?: string): Scope {
  const scope: Scope = { kind: 'program_location', locationId, ...(programId !== undefined ? { programId } : {}) }
  validateScope(scope)
  return scope
}
export async function listLocations(ctx: RequestContext, principal: Principal, organizationId: string, filter: { programId?: string } = {}): Promise<LocationSnapshot[]> {
  await getOrganization(ctx, principal, organizationId)
  const b = new Bindings()
  const policy = accessPredicate(b, principal, organizationId, 'location.read', locationScope('row', filter.programId), ctx.clock.now(), 'location')
  const result = await ctx.db.prepare(`SELECT l.id,l.name,l.version FROM locations l WHERE l.organization_id=${b.add(organizationId)} AND l.archived_at IS NULL AND (${policy}) ORDER BY l.id LIMIT 100`).bind(...b.values).all<LocationSnapshot>()
  return result.results
}
export async function getLocation(ctx: RequestContext, principal: Principal, organizationId: string, locationId: string, filter: { programId?: string } = {}): Promise<LocationSnapshot> {
  await getOrganization(ctx, principal, organizationId)
  const b = new Bindings()
  const policy = accessPredicate(b, principal, organizationId, 'location.read', locationScope(locationId, filter.programId), ctx.clock.now(), 'location')
  const row = await ctx.db.prepare(`SELECT l.id,l.name,l.version FROM locations l WHERE l.organization_id=${b.add(organizationId)} AND l.id=${b.add(locationId)} AND l.archived_at IS NULL AND (${policy})`).bind(...b.values).first<LocationSnapshot>()
  if (!row) throw new Stage0Error('not_found')
  return row
}
