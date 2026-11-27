import type { CommandContext } from '../contracts'
import { Bindings, guardedBatch } from '../db'
import { exactObject } from '../domain/input'
import { Stage0Error } from '../errors'
import { loadLiveSession } from '../auth/sessions'
import { volunteerWritePredicate } from './policy'
import { secretDigest } from '../auth/secrets'

/** Check-in preserves the original timestamp across repeated requests. */
export async function checkIn(ctx: CommandContext, value: unknown): Promise<{ checkedInAt: number }> {
  const input = exactObject(value, ['organizationId', 'assignmentId', 'programId', 'locationId'], true)
  for (const field of Object.values(input)) if (typeof field !== 'string' || !field.trim() || field.length > 256 || /\p{Cc}/u.test(field)) throw new Stage0Error('invalid_input')
  const { organizationId, assignmentId, programId, locationId } = input as Record<string, string>
  await loadLiveSession(ctx, ctx.principal)
  const lookup = async (): Promise<{ checkedInAt: number } | null> => {
    const b = new Bindings()
    const policy = volunteerWritePredicate(b, ctx.principal, organizationId, { kind: 'program_location', programId, locationId }, 'attendance.manage', ctx.clock.now())
    const row = await ctx.db.prepare(`SELECT t.checked_in_at FROM volunteer_attendance t JOIN volunteer_assignments a ON a.organization_id=t.organization_id AND a.id=t.assignment_id JOIN volunteer_occurrences o ON o.organization_id=a.organization_id AND o.id=a.occurrence_id WHERE t.organization_id=${b.add(organizationId)} AND t.assignment_id=${b.add(assignmentId)} AND o.program_id=${b.add(programId)} AND o.location_id=${b.add(locationId)} AND (${policy})`).bind(...b.values).first<{ checked_in_at: number }>()
    return row ? { checkedInAt: row.checked_in_at } : null
  }
  const existing = await lookup()
  if (existing) return existing
  const b = new Bindings()
  const policy = volunteerWritePredicate(b, ctx.principal, organizationId, { kind: 'program_location', programId, locationId }, 'attendance.manage', ctx.clock.now())
  const assignment = `EXISTS(SELECT 1 FROM volunteer_assignments a JOIN volunteer_occurrences o ON o.organization_id=a.organization_id AND o.id=a.occurrence_id JOIN volunteer_effective_readiness r ON r.organization_id=a.organization_id AND r.occurrence_id=a.occurrence_id AND r.role_id=a.role_id AND r.person_id=a.person_id WHERE a.organization_id=${b.add(organizationId)} AND a.id=${b.add(assignmentId)} AND a.status='confirmed' AND o.status='published' AND o.program_id=${b.add(programId)} AND o.location_id=${b.add(locationId)} AND r.state='ready' AND NOT EXISTS(SELECT 1 FROM volunteer_current_presence p WHERE p.organization_id=a.organization_id AND p.assignment_id=a.id AND p.state='no_show'))`
  const checkedInAt = ctx.clock.now()
  try {
    await guardedBatch(ctx, `(${policy}) AND ${assignment}`, b.values, [
      ctx.db.prepare('INSERT INTO volunteer_attendance(organization_id,assignment_id,checked_in_at) VALUES(?,?,?)').bind(organizationId, assignmentId, checkedInAt),
      ctx.db.prepare("INSERT INTO volunteer_audit_events(id,organization_id,assignment_id,actor_account_id,session_id,request_id,action,created_at) VALUES(?,?,?,?,?,?,'attendance.check_in',?)").bind(ctx.ids.next(), organizationId, assignmentId, ctx.principal.accountId, ctx.principal.sessionId, ctx.requestId, checkedInAt),
    ])
  } catch (error) {
    if ((error instanceof Stage0Error && error.code === 'conflict') || (error instanceof Error && error.message.includes('UNIQUE constraint failed'))) {
      const committed = await lookup()
      if (committed) return committed
      throw new Stage0Error('conflict')
    }
    throw error
  }
  return { checkedInAt }
}

/** Explicit no-show or reversal; a late arrival first clears the prior decision. */
export async function recordPresence(ctx:CommandContext,value:unknown):Promise<{id:string}> {
  const input=exactObject(value,['organizationId','assignmentId','programId','locationId','state','expectedEventId','reason','confirmation'],true)
  const {organizationId,assignmentId,programId,locationId,state,expectedEventId,reason,confirmation}=input
  if(![organizationId,assignmentId,programId,locationId].every(v=>typeof v==='string' && !!v.trim() && v.length<=256 && !/\p{Cc}/u.test(v)) || (state!=='no_show' && state!=='expected') || (expectedEventId!==null && (typeof expectedEventId!=='string' || !expectedEventId.trim() || expectedEventId.length>256 || /\p{Cc}/u.test(expectedEventId))) || (state==='expected' && expectedEventId===null) || typeof reason!=='string' || !reason.trim() || reason.length>2000 || confirmation!==true)throw new Stage0Error('invalid_input')
  if(typeof ctx.idempotencyKey!=='string' || !/^[A-Za-z0-9_-]{16,128}$/.test(ctx.idempotencyKey))throw new Stage0Error('invalid_input')
  await loadLiveSession(ctx,ctx.principal)
  const org=organizationId as string,id=assignmentId as string,program=programId as string,location=locationId as string,note=reason.trim(),now=ctx.clock.now()
  const digest=await secretDigest(JSON.stringify(['presence-v1',org,id,program,location,state,expectedEventId,note]))
  const replay=async():Promise<{id:string}|null>=>{
    const saved=await ctx.db.prepare('SELECT request_digest,event_id FROM volunteer_presence_receipts WHERE actor_account_id=? AND organization_id=? AND idempotency_key=?').bind(ctx.principal.accountId,org,ctx.idempotencyKey).first<{request_digest:string;event_id:string}>()
    if(!saved)return null
    const b=new Bindings(),policy=volunteerWritePredicate(b,ctx.principal,org,{kind:'program_location',programId:program,locationId:location},'attendance.manage',ctx.clock.now())
    if(!await ctx.db.prepare(`SELECT 1 WHERE ${policy}`).bind(...b.values).first())throw new Stage0Error('not_found')
    if(saved.request_digest!==digest)throw new Stage0Error('conflict')
    return {id:saved.event_id}
  }
  const prior=await replay();if(prior)return prior
  const b=new Bindings(),policy=volunteerWritePredicate(b,ctx.principal,org,{kind:'program_location',programId:program,locationId:location},'attendance.manage',now)
  const previous=expectedEventId===null ? "NOT EXISTS(SELECT 1 FROM volunteer_current_presence p WHERE p.organization_id=a.organization_id AND p.assignment_id=a.id)" : `EXISTS(SELECT 1 FROM volunteer_current_presence p WHERE p.organization_id=a.organization_id AND p.assignment_id=a.id AND p.id=${b.add(expectedEventId as string)} AND p.state=${b.add(state==='no_show'?'expected':'no_show')})`
  const eligible=`EXISTS(SELECT 1 FROM volunteer_assignments a JOIN volunteer_occurrences o ON o.organization_id=a.organization_id AND o.id=a.occurrence_id WHERE a.organization_id=${b.add(org)} AND a.id=${b.add(id)} AND a.status='confirmed' AND o.status='published' AND o.program_id=${b.add(program)} AND o.location_id=${b.add(location)} ${state==='no_show'?`AND o.starts_at<=${b.add(now)}`:''} AND NOT EXISTS(SELECT 1 FROM volunteer_attendance t WHERE t.organization_id=a.organization_id AND t.assignment_id=a.id) AND (${previous}))`
  const eventId=ctx.ids.next()
  try {await guardedBatch(ctx,`(${policy}) AND ${eligible}`,b.values,[
    ctx.db.prepare('INSERT INTO volunteer_presence_events VALUES(?,?,?,?,?,?,?,?,?)').bind(eventId,org,id,state,note,ctx.principal.accountId,ctx.principal.sessionId,ctx.requestId,now),
    ctx.db.prepare('INSERT INTO volunteer_presence_receipts VALUES(?,?,?,?,?)').bind(ctx.principal.accountId,org,ctx.idempotencyKey,digest,eventId),
  ])}catch(error){if((error instanceof Stage0Error && error.code==='conflict') || (error instanceof Error && error.message.includes('UNIQUE constraint failed'))){const saved=await replay();if(saved)return saved;throw new Stage0Error('conflict')}throw error}
  return {id:eventId}
}

/** Check-out is a separate event and does not submit or approve hours. */
export async function checkOut(ctx: CommandContext, value: unknown): Promise<{ checkedOutAt: number }> {
  const input = exactObject(value, ['organizationId', 'assignmentId', 'programId', 'locationId'], true)
  for (const field of Object.values(input)) if (typeof field !== 'string' || !field.trim() || field.length > 256 || /\p{Cc}/u.test(field)) throw new Stage0Error('invalid_input')
  const { organizationId, assignmentId, programId, locationId } = input as Record<string, string>
  await loadLiveSession(ctx, ctx.principal)
  const lookup = async (): Promise<{ checkedOutAt: number } | null> => {
    const b = new Bindings()
    const policy = volunteerWritePredicate(b, ctx.principal, organizationId, { kind: 'program_location', programId, locationId }, 'attendance.manage', ctx.clock.now())
    const row = await ctx.db.prepare(`SELECT t.checked_out_at FROM volunteer_effective_attendance t JOIN volunteer_assignments a ON a.organization_id=t.organization_id AND a.id=t.assignment_id JOIN volunteer_occurrences o ON o.organization_id=a.organization_id AND o.id=a.occurrence_id WHERE t.organization_id=${b.add(organizationId)} AND t.assignment_id=${b.add(assignmentId)} AND o.program_id=${b.add(programId)} AND o.location_id=${b.add(locationId)} AND t.checked_out_at IS NOT NULL AND (${policy})`).bind(...b.values).first<{ checked_out_at: number }>()
    return row ? { checkedOutAt: row.checked_out_at } : null
  }
  const existing = await lookup()
  if (existing) return existing
  const b = new Bindings()
  const policy = volunteerWritePredicate(b, ctx.principal, organizationId, { kind: 'program_location', programId, locationId }, 'attendance.manage', ctx.clock.now())
  const checkedOutAt = ctx.clock.now()
  const present = `EXISTS(SELECT 1 FROM volunteer_attendance t JOIN volunteer_effective_attendance effective ON effective.organization_id=t.organization_id AND effective.assignment_id=t.assignment_id JOIN volunteer_assignments a ON a.organization_id=t.organization_id AND a.id=t.assignment_id JOIN volunteer_occurrences o ON o.organization_id=a.organization_id AND o.id=a.occurrence_id WHERE t.organization_id=${b.add(organizationId)} AND t.assignment_id=${b.add(assignmentId)} AND o.program_id=${b.add(programId)} AND o.location_id=${b.add(locationId)} AND t.checked_out_at IS NULL AND effective.checked_out_at IS NULL AND t.checked_in_at<=${b.add(checkedOutAt)})`
  try {
    await guardedBatch(ctx, `(${policy}) AND ${present}`, b.values, [
      ctx.db.prepare('UPDATE volunteer_attendance SET checked_out_at=? WHERE organization_id=? AND assignment_id=? AND checked_out_at IS NULL').bind(checkedOutAt, organizationId, assignmentId),
      ctx.db.prepare("INSERT INTO volunteer_audit_events(id,organization_id,assignment_id,actor_account_id,session_id,request_id,action,created_at) VALUES(?,?,?,?,?,?,'attendance.check_out',?)").bind(ctx.ids.next(), organizationId, assignmentId, ctx.principal.accountId, ctx.principal.sessionId, ctx.requestId, checkedOutAt),
    ])
  } catch (error) {
    if (error instanceof Stage0Error && error.code === 'conflict') {
      const committed = await lookup()
      if (committed) return committed
    }
    throw error
  }
  return { checkedOutAt }
}
