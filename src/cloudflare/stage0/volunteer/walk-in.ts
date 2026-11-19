import type { CommandContext } from '../contracts'
import { Bindings, guardedBatch } from '../db'
import { exactObject } from '../domain/input'
import { Stage0Error } from '../errors'
import { loadLiveSession } from '../auth/sessions'
import { secretDigest } from '../auth/secrets'
import { volunteerWritePredicate } from './policy'

/** Assign and check in a known, ready volunteer in one transaction. */
export async function registerWalkIn(ctx:CommandContext,value:unknown):Promise<{id:string;checkedInAt:number}> {
 const input=exactObject(value,['organizationId','occurrenceId','personId','roleId','programId','locationId'],true)
 for(const field of Object.values(input))if(typeof field!=='string'||!field.trim()||field.length>256||/\p{Cc}/u.test(field))throw new Stage0Error('invalid_input')
 if(typeof ctx.idempotencyKey!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(ctx.idempotencyKey))throw new Stage0Error('invalid_input')
 const {organizationId,occurrenceId,personId,roleId,programId,locationId}=input as Record<string,string>
 await loadLiveSession(ctx,ctx.principal)
 const digest=await secretDigest(JSON.stringify(['volunteer-walk-in-v1',organizationId,occurrenceId,personId,roleId,programId,locationId]))
 const replay=async():Promise<{id:string;checkedInAt:number}|null>=>{
  const row=await ctx.db.prepare('SELECT r.request_digest,r.assignment_id,t.checked_in_at FROM volunteer_assignment_receipts r LEFT JOIN volunteer_attendance t ON t.organization_id=r.organization_id AND t.assignment_id=r.assignment_id WHERE r.actor_account_id=? AND r.organization_id=? AND r.idempotency_key=?').bind(ctx.principal.accountId,organizationId,ctx.idempotencyKey).first<{request_digest:string;assignment_id:string;checked_in_at:number|null}>()
  if(!row)return null
  const b=new Bindings(),scope={kind:'program_location' as const,programId,locationId},now=ctx.clock.now()
  const assign=volunteerWritePredicate(b,ctx.principal,organizationId,scope,'assignment.manage',now),attend=volunteerWritePredicate(b,ctx.principal,organizationId,scope,'attendance.manage',now)
  if(!await ctx.db.prepare(`SELECT 1 WHERE (${assign}) AND (${attend})`).bind(...b.values).first())throw new Stage0Error('not_found')
  if(row.request_digest!==digest||row.checked_in_at===null)throw new Stage0Error('conflict')
  return {id:row.assignment_id,checkedInAt:row.checked_in_at}
 }
 const previous=await replay();if(previous)return previous
 const b=new Bindings(),scope={kind:'program_location' as const,programId,locationId},now=ctx.clock.now()
 const assign=volunteerWritePredicate(b,ctx.principal,organizationId,scope,'assignment.manage',now),attend=volunteerWritePredicate(b,ctx.principal,organizationId,scope,'attendance.manage',now)
 const occurrence=`EXISTS(SELECT 1 FROM volunteer_occurrences WHERE organization_id=${b.add(organizationId)} AND id=${b.add(occurrenceId)} AND program_id=${b.add(programId)} AND location_id=${b.add(locationId)})`
 const id=ctx.ids.next()
 try {
  await guardedBatch(ctx,`(${assign}) AND (${attend}) AND ${occurrence}`,b.values,[
   ctx.db.prepare("UPDATE volunteer_offers SET state='expired' WHERE organization_id=? AND occurrence_id=? AND state='offered' AND expires_at<=?").bind(organizationId,occurrenceId,now),
   ctx.db.prepare("INSERT INTO volunteer_assignments(id,organization_id,occurrence_id,person_id,role_id,status,created_at) VALUES(?,?,?,?,?,'confirmed',?)").bind(id,organizationId,occurrenceId,personId,roleId,now),
   ctx.db.prepare('INSERT INTO volunteer_attendance(organization_id,assignment_id,checked_in_at) VALUES(?,?,?)').bind(organizationId,id,now),
   ctx.db.prepare('INSERT INTO volunteer_assignment_receipts(actor_account_id,organization_id,idempotency_key,request_digest,assignment_id) VALUES(?,?,?,?,?)').bind(ctx.principal.accountId,organizationId,ctx.idempotencyKey,digest,id),
   ...(['assignment.create','attendance.check_in'] as const).map(action=>ctx.db.prepare('INSERT INTO volunteer_audit_events(id,organization_id,assignment_id,actor_account_id,session_id,request_id,action,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(ctx.ids.next(),organizationId,id,ctx.principal.accountId,ctx.principal.sessionId,ctx.requestId,action,now)),
  ])
 }catch(error){
  if((error instanceof Stage0Error&&error.code==='conflict')||(error instanceof Error&&(error.message.includes('volunteer_assignment_unavailable')||error.message.includes('UNIQUE constraint failed')))){
   const saved=await replay();if(saved)return saved;throw new Stage0Error('conflict')
  }
  throw error
 }
 return {id,checkedInAt:now}
}
