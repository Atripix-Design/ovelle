import type { Action, AuthorizedContext, OrganizationSnapshot, Principal, RequestContext, Scope } from '../contracts'
import { parseAction } from '../contracts'
import { auditStatement, guardedBatch } from '../db'
import { Stage0Error } from '../errors'
import { loadLiveSession, principalFromRow } from '../auth/sessions'
import { accessPredicate, Bindings, validateScope } from './policy'

const organizationScope: Scope = { kind: 'organization' }
export interface ProgramSnapshot { id: string; name: string; version: number }
export async function getOrganization(ctx: RequestContext, principal: Principal, organizationId: string): Promise<OrganizationSnapshot> {
  await loadLiveSession(ctx, principal)
  const b = new Bindings()
  const policy = accessPredicate(b, principal, organizationId, 'organization.read', organizationScope, ctx.clock.now())
  const row = await ctx.db.prepare(`SELECT o.id,o.name,o.version,o.time_zone FROM organizations o WHERE o.id=${b.add(organizationId)} AND (${policy})`).bind(...b.values).first<{ id: string; name: string; version: number; time_zone: string }>()
  if (!row) throw new Stage0Error('not_found')
  return { id: row.id, name: row.name, version: row.version, timeZone: row.time_zone }
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
  const policy = accessPredicate(b, principal, organizationId, 'program.read', programScope('row', filter.locationId), ctx.clock.now(), true)
  const result = await ctx.db.prepare(`SELECT p.id,p.name,p.version FROM programs p WHERE p.organization_id=${b.add(organizationId)} AND p.archived_at IS NULL AND (${policy}) ORDER BY p.id LIMIT 100`).bind(...b.values).all<ProgramSnapshot>()
  return result.results
}
export async function getProgram(ctx: RequestContext, principal: Principal, organizationId: string, programId: string, filter: { locationId?: string } = {}): Promise<ProgramSnapshot> {
  await getOrganization(ctx, principal, organizationId)
  const b = new Bindings()
  const policy = accessPredicate(b, principal, organizationId, 'program.read', programScope(programId, filter.locationId), ctx.clock.now(), true)
  const row = await ctx.db.prepare(`SELECT p.id,p.name,p.version FROM programs p WHERE p.organization_id=${b.add(organizationId)} AND p.id=${b.add(programId)} AND p.archived_at IS NULL AND (${policy})`).bind(...b.values).first<ProgramSnapshot>()
  if (!row) throw new Stage0Error('not_found')
  return row
}
export async function renameProgram(ctx: RequestContext, principal: Principal, organizationId: string, programId: string, input: { name: string; expectedVersion: number; locationId?: string }): Promise<ProgramSnapshot> {
  if (typeof input.name !== 'string' || input.name.trim().length < 1 || input.name.trim().length > 120 || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) throw new Stage0Error('invalid_input')
  // A program definition is shared across locations. A request-supplied location
  // must never turn a location-scoped grant into authority over the whole row.
  const scope = programScope(programId)
  await authorizeOrganization(ctx, principal, organizationId, 'program.manage', scope)
  const b = new Bindings()
  const policy = accessPredicate(b, principal, organizationId, 'program.manage', scope, ctx.clock.now())
  const versionGuard = `EXISTS(SELECT 1 FROM programs WHERE id=${b.add(programId)} AND organization_id=${b.add(organizationId)} AND version=${b.add(input.expectedVersion)} AND archived_at IS NULL)`
  await guardedBatch(ctx, `${policy} AND ${versionGuard}`, b.values, [
    ctx.db.prepare('UPDATE programs SET name=?,version=version+1 WHERE id=? AND organization_id=? AND version=? AND archived_at IS NULL').bind(input.name.trim(), programId, organizationId, input.expectedVersion),
    auditStatement(ctx, 'program.update', programId, principal, organizationId),
  ])
  return { id: programId, name: input.name.trim(), version: input.expectedVersion + 1 }
}
