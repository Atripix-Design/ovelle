import type { CommandContext, Principal, RequestContext } from '../contracts'
import { Bindings, guardedBatch } from '../db'
import { exactObject } from '../domain/input'
import { secretDigest } from '../auth/secrets'
import { volunteerWritePredicate } from './policy'
import { Stage0Error } from '../errors'
import { loadLiveSession } from '../auth/sessions'
import { accessPredicate } from '../access/policy'
import { decodeWorkflowCursor,encodeWorkflowCursor } from './pagination'

/** Resolve the occurrence, roles and requirements from one scoped snapshot. */
export async function getOccurrence(ctx: RequestContext, principal: Principal, organizationId: string, id: string, query: Record<string, string>) {
  const { programId, locationId } = query
  if (![programId, locationId].every(value => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/\p{Cc}/u.test(value))) throw new Stage0Error('invalid_input')
  await loadLiveSession(ctx, principal)
  const now = ctx.clock.now(), b = new Bindings()
  const policy = accessPredicate(b, principal, organizationId, 'program.read', { kind: 'program_location', programId, locationId }, now)
  const occurrenceQuery = ctx.db.prepare(`SELECT o.id,o.title,o.starts_at AS startsAt,o.ends_at AS endsAt,o.capacity,o.status,
    (SELECT count(*) FROM volunteer_assignments a WHERE a.organization_id=o.organization_id AND a.occurrence_id=o.id AND a.status='confirmed') AS assigned,
    (SELECT count(*) FROM volunteer_offers x WHERE x.organization_id=o.organization_id AND x.occurrence_id=o.id AND x.state='offered' AND x.expires_at>${b.add(now)}) AS held
    FROM volunteer_occurrences o WHERE o.organization_id=${b.add(organizationId)} AND o.id=${b.add(id)} AND o.program_id=${b.add(programId)} AND o.location_id=${b.add(locationId)} AND (${policy})`).bind(...b.values)
  const rb = new Bindings()
  const rolePolicy = accessPredicate(rb, principal, organizationId, 'program.read', { kind: 'program_location', programId, locationId }, now)
  const rolesQuery = ctx.db.prepare(`SELECT r.role_id AS id,r.name,r.capacity,
    (SELECT count(*) FROM volunteer_assignments a WHERE a.organization_id=r.organization_id AND a.occurrence_id=r.occurrence_id AND a.role_id=r.role_id AND a.status='confirmed') AS assigned,
    (SELECT count(*) FROM volunteer_offers x WHERE x.organization_id=r.organization_id AND x.occurrence_id=r.occurrence_id AND x.role_id=r.role_id AND x.state='offered' AND x.expires_at>${rb.add(now)}) AS held
    FROM volunteer_role_requirements r JOIN volunteer_occurrences o ON o.organization_id=r.organization_id AND o.id=r.occurrence_id
    WHERE o.organization_id=${rb.add(organizationId)} AND o.id=${rb.add(id)} AND o.program_id=${rb.add(programId)} AND o.location_id=${rb.add(locationId)} AND (${rolePolicy}) ORDER BY r.name,r.role_id LIMIT 101`).bind(...rb.values)
  const cb = new Bindings()
  const criterionPolicy = accessPredicate(cb, principal, organizationId, 'program.read', { kind: 'program_location', programId, locationId }, now)
  const criteriaQuery = ctx.db.prepare(`SELECT c.id,c.role_id AS roleId,c.name FROM volunteer_role_criteria c
    JOIN volunteer_occurrences o ON o.organization_id=c.organization_id AND o.id=c.occurrence_id
    WHERE o.organization_id=${cb.add(organizationId)} AND o.id=${cb.add(id)} AND o.program_id=${cb.add(programId)} AND o.location_id=${cb.add(locationId)} AND (${criterionPolicy})
    ORDER BY c.role_id,c.name,c.id LIMIT 101`).bind(...cb.values)
  const [occurrences,roles,criteria] = await ctx.db.batch([occurrenceQuery,rolesQuery,criteriaQuery])
  const occurrence = occurrences.results[0]
  if (!occurrence) throw new Stage0Error('not_found')
  return { occurrence, roles: roles.results.slice(0,100), truncated: roles.results.length > 100, criteria:criteria.results.slice(0,100), criteriaTruncated:criteria.results.length > 100 }
}

/** Read a bounded window using the live program/location grant intersection. */
export async function listSchedule(ctx: RequestContext, principal: Principal, organizationId: string, query: Record<string, string>) {
  const { programId, locationId, from, until, cursor } = query
  if (![programId, locationId].every(value => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/\p{Cc}/u.test(value)) || !/^\d{1,15}$/.test(from ?? '') || !/^\d{1,15}$/.test(until ?? '')) throw new Stage0Error('invalid_input')
  const start = Number(from), end = Number(until)
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= end || end - start > 366 * 86400000) throw new Stage0Error('invalid_input')
  const scope=['schedule',organizationId,programId,locationId,from,until],position=cursor===undefined?undefined:decodeWorkflowCursor(cursor,scope,1)
  await loadLiveSession(ctx, principal)
  const b = new Bindings()
  const policy = accessPredicate(b, principal, organizationId, 'program.read', { kind: 'program_location', programId, locationId }, ctx.clock.now())
  const after=position?`AND (o.starts_at>${b.add(position.time)} OR (o.starts_at=${b.add(position.time)} AND o.id>${b.add(position.ids[0])}))`:''
  const rows = await ctx.db.prepare(`SELECT o.id,o.title,o.starts_at AS startsAt,o.ends_at AS endsAt,o.capacity,o.status,
    (SELECT count(*) FROM volunteer_assignments a WHERE a.organization_id=o.organization_id AND a.occurrence_id=o.id AND a.status='confirmed') AS assigned,
    (SELECT count(*) FROM volunteer_offers x WHERE x.organization_id=o.organization_id AND x.occurrence_id=o.id AND x.state='offered' AND x.expires_at>${b.add(ctx.clock.now())}) AS held
    FROM volunteer_occurrences o WHERE o.organization_id=${b.add(organizationId)} AND o.program_id=${b.add(programId)} AND o.location_id=${b.add(locationId)}
      AND o.starts_at<${b.add(end)} AND o.ends_at>${b.add(start)} AND (${policy}) ${after} ORDER BY o.starts_at,o.id LIMIT 101`).bind(...b.values).all<{id:string; title:string; startsAt:number; endsAt:number; capacity:number; status:string; assigned:number; held:number}>()
  const occurrences=rows.results.slice(0,100),last=occurrences.at(-1)
  return { occurrences, truncated: rows.results.length > 100, nextCursor:rows.results.length>100 && last?encodeWorkflowCursor(scope,{time:last.startsAt,ids:[last.id]}):null }
}

/** Create one draft occurrence. Publication and requirements are separate decisions. */
export async function createOccurrence(ctx: CommandContext, value: unknown): Promise<{id:string}> {
  const input=exactObject(value,['organizationId','programId','locationId','title','startsAt','endsAt','capacity'],true)
  const {organizationId,programId,locationId,title,startsAt,endsAt,capacity}=input
  if (![organizationId,programId,locationId,title].every(v=>typeof v==='string' && !!v.trim() && v.length<=200 && !/\p{Cc}/u.test(v)) || ![startsAt,endsAt,capacity].every(Number.isSafeInteger) || (startsAt as number)<0 || (endsAt as number)<=(startsAt as number) || (capacity as number)<0 || (capacity as number)>100000) throw new Stage0Error('invalid_input')
  if(typeof ctx.idempotencyKey!=='string' || !/^[A-Za-z0-9_-]{16,128}$/.test(ctx.idempotencyKey))throw new Stage0Error('invalid_input')
  const org=organizationId as string,program=programId as string,location=locationId as string,name=(title as string).trim()
  await loadLiveSession(ctx,ctx.principal)
  const digest=await secretDigest(JSON.stringify(['occurrence-v1',org,program,location,name,startsAt,endsAt,capacity]))
  const replay=async():Promise<{id:string}|null>=>{
    const receipt=await ctx.db.prepare('SELECT request_digest,occurrence_id FROM volunteer_occurrence_receipts WHERE actor_account_id=? AND organization_id=? AND idempotency_key=?').bind(ctx.principal.accountId,org,ctx.idempotencyKey).first<{request_digest:string;occurrence_id:string}>()
    if(!receipt)return null
    const b=new Bindings(), allowed=volunteerWritePredicate(b,ctx.principal,org,{kind:'program_location',programId:program,locationId:location},'schedule.manage',ctx.clock.now())
    if(!await ctx.db.prepare(`SELECT 1 WHERE ${allowed}`).bind(...b.values).first())throw new Stage0Error('not_found')
    if(receipt.request_digest!==digest)throw new Stage0Error('conflict')
    return {id:receipt.occurrence_id}
  }
  const existing=await replay();if(existing)return existing
  const b=new Bindings(),policy=volunteerWritePredicate(b,ctx.principal,org,{kind:'program_location',programId:program,locationId:location},'schedule.manage',ctx.clock.now())
  const id=ctx.ids.next()
  try { await guardedBatch(ctx,policy,b.values,[
    ctx.db.prepare("INSERT INTO volunteer_occurrences VALUES(?,?,?,?,?,?,?,?,'draft')").bind(id,org,program,location,name,startsAt as number,endsAt as number,capacity as number),
    ctx.db.prepare('INSERT INTO volunteer_occurrence_receipts VALUES(?,?,?,?,?)').bind(ctx.principal.accountId,org,ctx.idempotencyKey,digest,id),
    ctx.db.prepare("INSERT INTO volunteer_occurrence_events VALUES(?,?,?,?,?,?,'occurrence.create',?)").bind(ctx.ids.next(),org,id,ctx.principal.accountId,ctx.principal.sessionId,ctx.requestId,ctx.clock.now()),
  ]) } catch(error) {
    if ((error instanceof Stage0Error && error.code==='conflict') || (error instanceof Error && error.message.includes('UNIQUE constraint failed'))) { const saved=await replay();if(saved)return saved;throw new Stage0Error('conflict') }
    throw error
  }
  return {id}
}

/** Add a role only while its occurrence is a draft. */
export async function createRole(ctx: CommandContext, value: unknown): Promise<{id:string}> {
  const input=exactObject(value,['organizationId','occurrenceId','programId','locationId','name','capacity'],true)
  const {organizationId,occurrenceId,programId,locationId,name,capacity}=input
  if (![organizationId,occurrenceId,programId,locationId,name].every(v=>typeof v==='string' && !!v.trim() && v.length<=200 && !/\p{Cc}/u.test(v)) || !Number.isSafeInteger(capacity) || (capacity as number)<1 || (capacity as number)>100000) throw new Stage0Error('invalid_input')
  if(typeof ctx.idempotencyKey!=='string' || !/^[A-Za-z0-9_-]{16,128}$/.test(ctx.idempotencyKey))throw new Stage0Error('invalid_input')
  const org=organizationId as string,occurrence=occurrenceId as string,program=programId as string,location=locationId as string,roleName=(name as string).trim()
  await loadLiveSession(ctx,ctx.principal)
  const digest=await secretDigest(JSON.stringify(['role-v1',org,occurrence,program,location,roleName,capacity]))
  const replay=async():Promise<{id:string}|null>=>{
    const row=await ctx.db.prepare('SELECT request_digest,role_id FROM volunteer_role_receipts WHERE actor_account_id=? AND organization_id=? AND idempotency_key=?').bind(ctx.principal.accountId,org,ctx.idempotencyKey).first<{request_digest:string;role_id:string}>()
    if(!row)return null
    const b=new Bindings(),policy=volunteerWritePredicate(b,ctx.principal,org,{kind:'program_location',programId:program,locationId:location},'schedule.manage',ctx.clock.now())
    if(!await ctx.db.prepare(`SELECT 1 WHERE ${policy}`).bind(...b.values).first())throw new Stage0Error('not_found')
    if(row.request_digest!==digest)throw new Stage0Error('conflict')
    return {id:row.role_id}
  }
  const existing=await replay();if(existing)return existing
  const b=new Bindings(),policy=volunteerWritePredicate(b,ctx.principal,org,{kind:'program_location',programId:program,locationId:location},'schedule.manage',ctx.clock.now())
  const draft=`EXISTS(SELECT 1 FROM volunteer_occurrences WHERE organization_id=${b.add(org)} AND id=${b.add(occurrence)} AND program_id=${b.add(program)} AND location_id=${b.add(location)} AND status='draft' AND capacity>=${b.add(capacity as number)})`
  const id=ctx.ids.next()
  try { await guardedBatch(ctx,`(${policy}) AND ${draft}`,b.values,[
    ctx.db.prepare('INSERT INTO volunteer_role_requirements VALUES(?,?,?,?,?)').bind(org,occurrence,id,roleName,capacity as number),
    ctx.db.prepare('INSERT INTO volunteer_role_receipts VALUES(?,?,?,?,?,?)').bind(ctx.principal.accountId,org,ctx.idempotencyKey,digest,occurrence,id),
    ctx.db.prepare("INSERT INTO volunteer_occurrence_events VALUES(?,?,?,?,?,?,'role.create',?)").bind(ctx.ids.next(),org,occurrence,ctx.principal.accountId,ctx.principal.sessionId,ctx.requestId,ctx.clock.now()),
  ]) } catch(error) {
    if ((error instanceof Stage0Error && error.code==='conflict') || (error instanceof Error && error.message.includes('UNIQUE constraint failed'))) {const saved=await replay();if(saved)return saved;throw new Stage0Error('conflict')}
    throw error
  }
  return {id}
}

/** Publish a complete draft once, returning success for authorized repeats. */
export async function publishOccurrence(ctx: CommandContext, value: unknown): Promise<{id:string;status:'published'}> {
  const input=exactObject(value,['organizationId','occurrenceId','programId','locationId'],true)
  if (!Object.values(input).every(v=>typeof v==='string' && !!v.trim() && v.length<=200 && !/\p{Cc}/u.test(v))) throw new Stage0Error('invalid_input')
  const {organizationId:org,occurrenceId:id,programId:program,locationId:location}=input as Record<string,string>
  await loadLiveSession(ctx,ctx.principal)
  const alreadyPublished=async()=>{
    const b=new Bindings(),policy=volunteerWritePredicate(b,ctx.principal,org,{kind:'program_location',programId:program,locationId:location},'schedule.manage',ctx.clock.now())
    return !!await ctx.db.prepare(`SELECT 1 FROM volunteer_occurrences WHERE organization_id=${b.add(org)} AND id=${b.add(id)} AND program_id=${b.add(program)} AND location_id=${b.add(location)} AND status='published' AND (${policy})`).bind(...b.values).first()
  }
  if(await alreadyPublished())return {id,status:'published'}
  const b=new Bindings(),policy=volunteerWritePredicate(b,ctx.principal,org,{kind:'program_location',programId:program,locationId:location},'schedule.manage',ctx.clock.now())
  const draft=`EXISTS(SELECT 1 FROM volunteer_occurrences o WHERE o.organization_id=${b.add(org)} AND o.id=${b.add(id)} AND o.program_id=${b.add(program)} AND o.location_id=${b.add(location)} AND o.status='draft' AND o.capacity>0 AND EXISTS(SELECT 1 FROM volunteer_role_requirements r WHERE r.organization_id=o.organization_id AND r.occurrence_id=o.id AND r.capacity>0))`
  try {await guardedBatch(ctx,`(${policy}) AND ${draft}`,b.values,[
    ctx.db.prepare("UPDATE volunteer_occurrences SET status='published' WHERE organization_id=? AND id=? AND status='draft'").bind(org,id),
    ctx.db.prepare("INSERT INTO volunteer_occurrence_events VALUES(?,?,?,?,?,?,'occurrence.publish',?)").bind(ctx.ids.next(),org,id,ctx.principal.accountId,ctx.principal.sessionId,ctx.requestId,ctx.clock.now()),
  ])} catch(error) {
    if(error instanceof Stage0Error && error.code==='conflict' && await alreadyPublished())return {id,status:'published'}
    throw error
  }
  return {id,status:'published'}
}
