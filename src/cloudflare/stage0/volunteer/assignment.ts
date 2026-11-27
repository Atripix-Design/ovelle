import type { CommandContext } from '../contracts'
import { Bindings, guardedBatch } from '../db'
import { exactObject } from '../domain/input'
import { Stage0Error } from '../errors'
import { volunteerWritePredicate } from './policy'
import { secretDigest } from '../auth/secrets'
import { loadLiveSession } from '../auth/sessions'

/** Creates an assignment only when authority and occurrence scope are current at commit. */
export async function createAssignment(ctx: CommandContext, value: unknown): Promise<{ id: string }> {
  const input = exactObject(value, ['organizationId', 'occurrenceId', 'personId', 'roleId', 'programId', 'locationId'], true)
  for (const field of Object.values(input)) {
    if (typeof field !== 'string' || !field.trim() || field.length > 256 || /\p{Cc}/u.test(field)) throw new Stage0Error('invalid_input')
  }
  const { organizationId, occurrenceId, personId, roleId, programId, locationId } = input as Record<string, string>
  if (typeof ctx.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(ctx.idempotencyKey)) throw new Stage0Error('invalid_input')
  await loadLiveSession(ctx, ctx.principal)
  const digest = await secretDigest(JSON.stringify(['volunteer-assignment-v1', organizationId, occurrenceId, personId, roleId, programId, locationId]))
  const replay = async (): Promise<{ id: string } | null> => {
    const receipt = await ctx.db.prepare('SELECT request_digest,assignment_id FROM volunteer_assignment_receipts WHERE actor_account_id=? AND organization_id=? AND idempotency_key=?').bind(ctx.principal.accountId, organizationId, ctx.idempotencyKey).first<{ request_digest: string; assignment_id: string }>()
    if (!receipt) return null
    const bindings = new Bindings()
    const allowed = volunteerWritePredicate(bindings, ctx.principal, organizationId, { kind: 'program_location', programId, locationId }, 'assignment.manage', ctx.clock.now())
    if (!await ctx.db.prepare(`SELECT 1 WHERE ${allowed}`).bind(...bindings.values).first()) throw new Stage0Error('not_found')
    if (receipt.request_digest !== digest) throw new Stage0Error('conflict')
    return { id: receipt.assignment_id }
  }
  const existing = await replay()
  if (existing) return existing
  const b = new Bindings()
  const policy = volunteerWritePredicate(b, ctx.principal, organizationId, { kind: 'program_location', programId, locationId }, 'assignment.manage', ctx.clock.now())
  const scope = `EXISTS(SELECT 1 FROM volunteer_occurrences WHERE organization_id=${b.add(organizationId)} AND id=${b.add(occurrenceId)} AND program_id=${b.add(programId)} AND location_id=${b.add(locationId)})`
  const id = ctx.ids.next()
  try {
    await guardedBatch(ctx, `(${policy}) AND ${scope}`, b.values, [
      ctx.db.prepare("UPDATE volunteer_offers SET state='expired' WHERE organization_id=? AND occurrence_id=? AND state='offered' AND expires_at<=?").bind(organizationId,occurrenceId,ctx.clock.now()),
      ctx.db.prepare("INSERT INTO volunteer_assignments(id,organization_id,occurrence_id,person_id,role_id,status,created_at) VALUES(?,?,?,?,?,'confirmed',?)").bind(id, organizationId, occurrenceId, personId, roleId, ctx.clock.now()),
      ctx.db.prepare("INSERT INTO volunteer_assignment_receipts(actor_account_id,organization_id,idempotency_key,request_digest,assignment_id) VALUES(?,?,?,?,?)").bind(ctx.principal.accountId, organizationId, ctx.idempotencyKey, digest, id),
      ctx.db.prepare("INSERT INTO volunteer_audit_events(id,organization_id,assignment_id,actor_account_id,session_id,request_id,action,created_at) VALUES(?,?,?,?,?,?,'assignment.create',?)").bind(ctx.ids.next(), organizationId, id, ctx.principal.accountId, ctx.principal.sessionId, ctx.requestId, ctx.clock.now()),
    ])
  } catch (error) {
    if ((error instanceof Stage0Error && error.code === 'conflict') || (error instanceof Error && (error.message.includes('volunteer_assignment_unavailable') || error.message.includes('UNIQUE constraint failed')))) {
      const committed = await replay()
      if (committed) return committed
      throw new Stage0Error('conflict')
    }
    throw error
  }
  return { id }
}

/** Release a place while preserving the original assignment and cancellation reason. */
export async function cancelAssignment(ctx: CommandContext, value: unknown): Promise<{id:string;status:'canceled'}> {
  const input = exactObject(value, ['organizationId','assignmentId','programId','locationId','reason'], true)
  const {organizationId,assignmentId,programId,locationId,reason} = input
  if (![organizationId,assignmentId,programId,locationId].every(v=>typeof v==='string' && !!v.trim() && v.length<=256 && !/\p{Cc}/u.test(v)) || typeof reason!=='string' || !reason.trim() || reason.length>2000 || /\p{Cc}/u.test(reason)) throw new Stage0Error('invalid_input')
  if (typeof ctx.idempotencyKey!=='string' || !/^[A-Za-z0-9_-]{16,128}$/.test(ctx.idempotencyKey)) throw new Stage0Error('invalid_input')
  const org=organizationId as string,id=assignmentId as string,program=programId as string,location=locationId as string, note=reason.trim()
  await loadLiveSession(ctx,ctx.principal)
  const digest=await secretDigest(JSON.stringify(['assignment-cancel-v1',org,id,program,location,note]))
  const replay=async():Promise<{id:string;status:'canceled'}|null>=>{
    const receipt=await ctx.db.prepare('SELECT request_digest,assignment_id FROM volunteer_cancellation_receipts WHERE actor_account_id=? AND organization_id=? AND idempotency_key=?').bind(ctx.principal.accountId,org,ctx.idempotencyKey).first<{request_digest:string;assignment_id:string}>()
    if(!receipt)return null
    const b=new Bindings(),policy=volunteerWritePredicate(b,ctx.principal,org,{kind:'program_location',programId:program,locationId:location},'assignment.manage',ctx.clock.now())
    if(!await ctx.db.prepare(`SELECT 1 WHERE ${policy}`).bind(...b.values).first())throw new Stage0Error('not_found')
    if(receipt.request_digest!==digest)throw new Stage0Error('conflict')
    return {id:receipt.assignment_id,status:'canceled'}
  }
  const existing=await replay();if(existing)return existing
  const b=new Bindings(),policy=volunteerWritePredicate(b,ctx.principal,org,{kind:'program_location',programId:program,locationId:location},'assignment.manage',ctx.clock.now())
  const eligible=`EXISTS(SELECT 1 FROM volunteer_assignments a JOIN volunteer_occurrences o ON o.organization_id=a.organization_id AND o.id=a.occurrence_id WHERE a.organization_id=${b.add(org)} AND a.id=${b.add(id)} AND a.status='confirmed' AND o.program_id=${b.add(program)} AND o.location_id=${b.add(location)} AND NOT EXISTS(SELECT 1 FROM volunteer_attendance t WHERE t.organization_id=a.organization_id AND t.assignment_id=a.id))`
  try {
    await guardedBatch(ctx,`(${policy}) AND ${eligible}`,b.values,[
      ctx.db.prepare("UPDATE volunteer_assignments SET status='canceled' WHERE organization_id=? AND id=? AND status='confirmed'").bind(org,id),
      ctx.db.prepare('INSERT INTO volunteer_assignment_cancellations VALUES(?,?,?,?,?,?,?)').bind(org,id,ctx.principal.accountId,ctx.principal.sessionId,ctx.requestId,note,ctx.clock.now()),
      ctx.db.prepare('INSERT INTO volunteer_cancellation_receipts VALUES(?,?,?,?,?)').bind(ctx.principal.accountId,org,ctx.idempotencyKey,digest,id),
      ctx.db.prepare("INSERT INTO volunteer_audit_events(id,organization_id,assignment_id,actor_account_id,session_id,request_id,action,created_at) VALUES(?,?,?,?,?,?,'assignment.cancel',?)").bind(ctx.ids.next(),org,id,ctx.principal.accountId,ctx.principal.sessionId,ctx.requestId,ctx.clock.now()),
    ])
  } catch(error) {
    if ((error instanceof Stage0Error && error.code==='conflict') || (error instanceof Error && (error.message.includes('UNIQUE constraint failed') || error.message.includes('volunteer_assignment_has_attendance')))) {const saved=await replay();if(saved)return saved;throw new Stage0Error('conflict')}
    throw error
  }
  return {id,status:'canceled'}
}
