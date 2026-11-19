import type {CommandContext,Principal,RequestContext} from '../contracts'
import {Bindings,guardedBatch} from '../db'
import {exactObject} from '../domain/input'
import {Stage0Error} from '../errors'
import {secretDigest} from '../auth/secrets'
import {loadLiveSession} from '../auth/sessions'
import {volunteerWritePredicate} from './policy'
import {decodeWorkflowCursor,encodeWorkflowCursor} from './pagination'

const valid=(v:unknown):v is string=>typeof v==='string' && !!v.trim() && v.length<=256 && !/\p{Cc}/u.test(v)

/** Staff record a response they received; this does not assert message delivery. */
export async function recordClarification(ctx:CommandContext,value:unknown):Promise<{id:string}>{
 const input=exactObject(value,['organizationId','submissionId','programId','locationId','expectedDecisionId','response'],true)
 const {organizationId,submissionId,programId,locationId,expectedDecisionId,response}=input
 if(![organizationId,submissionId,programId,locationId,expectedDecisionId].every(valid) || typeof response!=='string' || !response.trim() || response.length>2000 || typeof ctx.idempotencyKey!=='string' || !/^[A-Za-z0-9_-]{16,128}$/.test(ctx.idempotencyKey))throw new Stage0Error('invalid_input')
 await loadLiveSession(ctx,ctx.principal)
 const org=organizationId as string,submission=submissionId as string,program=programId as string,location=locationId as string,decision=expectedDecisionId as string,text=response.trim()
 const digest=await secretDigest(JSON.stringify(['hours-clarification-v1',org,submission,program,location,decision,text]))
 const replay=async():Promise<{id:string}|null>=>{
  const row=await ctx.db.prepare('SELECT request_digest,response_id FROM volunteer_clarification_receipts WHERE actor_account_id=? AND organization_id=? AND idempotency_key=?').bind(ctx.principal.accountId,org,ctx.idempotencyKey).first<{request_digest:string;response_id:string}>()
  if(!row)return null
  const b=new Bindings(),policy=volunteerWritePredicate(b,ctx.principal,org,{kind:'program_location',programId:program,locationId:location},'hours.review',ctx.clock.now())
  if(!await ctx.db.prepare(`SELECT 1 WHERE ${policy}`).bind(...b.values).first())throw new Stage0Error('not_found')
  if(row.request_digest!==digest)throw new Stage0Error('conflict')
  return {id:row.response_id}
 }
 const old=await replay();if(old)return old
 const b=new Bindings(),policy=volunteerWritePredicate(b,ctx.principal,org,{kind:'program_location',programId:program,locationId:location},'hours.review',ctx.clock.now())
 const eligible=`EXISTS(SELECT 1 FROM volunteer_hours_submissions h JOIN volunteer_assignments a ON a.organization_id=h.organization_id AND a.id=h.assignment_id JOIN volunteer_occurrences o ON o.organization_id=a.organization_id AND o.id=a.occurrence_id JOIN volunteer_hours_decisions d ON d.organization_id=h.organization_id AND d.submission_id=h.id WHERE h.organization_id=${b.add(org)} AND h.id=${b.add(submission)} AND h.state='clarification' AND o.program_id=${b.add(program)} AND o.location_id=${b.add(location)} AND d.id=${b.add(decision)} AND d.decision='clarify' AND d.rowid=(SELECT latest.rowid FROM volunteer_hours_decisions latest WHERE latest.organization_id=h.organization_id AND latest.submission_id=h.id ORDER BY latest.rowid DESC LIMIT 1) AND NOT EXISTS(SELECT 1 FROM volunteer_hours_clarification_responses r WHERE r.organization_id=d.organization_id AND r.decision_id=d.id))`
 const id=ctx.ids.next()
 try {await guardedBatch(ctx,`(${policy}) AND ${eligible}`,b.values,[
  ctx.db.prepare("INSERT INTO volunteer_hours_clarification_responses VALUES(?,?,?,?,?,'staff_recorded',?,?,?,?)").bind(id,org,submission,decision,text,ctx.principal.accountId,ctx.principal.sessionId,ctx.requestId,ctx.clock.now()),
  ctx.db.prepare("UPDATE volunteer_hours_submissions SET state='pending' WHERE organization_id=? AND id=? AND state='clarification'").bind(org,submission),
  ctx.db.prepare('INSERT INTO volunteer_clarification_receipts VALUES(?,?,?,?,?)').bind(ctx.principal.accountId,org,ctx.idempotencyKey,digest,id),
 ])}catch(error){if((error instanceof Stage0Error && error.code==='conflict') || (error instanceof Error && error.message.includes('UNIQUE constraint failed'))){const saved=await replay();if(saved)return saved;throw new Stage0Error('conflict')}throw error}
 return {id}
}

/** Review history includes original attendance and its current corrected view. */
export async function getHoursHistory(ctx:RequestContext,principal:Principal,org:string,submission:string,query:Record<string,string>){
 const {programId,locationId,cursor}=query
 if(![org,submission,programId,locationId].every(valid))throw new Stage0Error('invalid_input')
 const scope=['hours-history',org,submission,programId,locationId],position=cursor===undefined?undefined:decodeWorkflowCursor(cursor,scope,1)
 if(position && position.time!==0)throw new Stage0Error('invalid_input')
 await loadLiveSession(ctx,principal)
 const b=new Bindings(),allowed=volunteerWritePredicate(b,principal,org,{kind:'program_location',programId,locationId},'hours.review',ctx.clock.now())
 const detailQuery=ctx.db.prepare(`SELECT h.id,h.state,h.start_at AS startAt,h.end_at AS endAt,h.break_minutes AS breakMinutes,p.display_name AS name,o.title,
 original.checked_in_at AS originalCheckIn,original.checked_out_at AS originalCheckOut,current.checked_in_at AS currentCheckIn,current.checked_out_at AS currentCheckOut
 FROM volunteer_hours_submissions h JOIN volunteer_assignments a ON a.organization_id=h.organization_id AND a.id=h.assignment_id
 JOIN volunteer_occurrences o ON o.organization_id=a.organization_id AND o.id=a.occurrence_id JOIN volunteer_people p ON p.organization_id=a.organization_id AND p.id=a.person_id
 LEFT JOIN volunteer_attendance original ON original.organization_id=a.organization_id AND original.assignment_id=a.id
 LEFT JOIN volunteer_effective_attendance current ON current.organization_id=a.organization_id AND current.assignment_id=a.id
 WHERE h.organization_id=${b.add(org)} AND h.id=${b.add(submission)} AND o.program_id=${b.add(programId)} AND o.location_id=${b.add(locationId)} AND (${allowed})`).bind(...b.values)
 const q=new Bindings(),policy=volunteerWritePredicate(q,principal,org,{kind:'program_location',programId,locationId},'hours.review',ctx.clock.now())
 const after=position?`AND d.rowid>(SELECT previous.rowid FROM volunteer_hours_decisions previous WHERE previous.organization_id=${q.add(org)} AND previous.submission_id=${q.add(submission)} AND previous.id=${q.add(position.ids[0])})`:''
 const historyQuery=ctx.db.prepare(`SELECT d.id,d.decision,d.approved_minutes AS approvedMinutes,d.reason,d.reviewer_account_id AS reviewerAccountId,d.created_at AS createdAt,
 r.id AS responseId,r.response,r.source AS responseSource,r.actor_account_id AS responseRecordedBy,r.created_at AS responseRecordedAt
 FROM volunteer_hours_decisions d JOIN volunteer_hours_submissions h ON h.organization_id=d.organization_id AND h.id=d.submission_id
 JOIN volunteer_assignments a ON a.organization_id=h.organization_id AND a.id=h.assignment_id JOIN volunteer_occurrences o ON o.organization_id=a.organization_id AND o.id=a.occurrence_id
 LEFT JOIN volunteer_hours_clarification_responses r ON r.organization_id=d.organization_id AND r.decision_id=d.id
 WHERE d.organization_id=${q.add(org)} AND d.submission_id=${q.add(submission)} AND o.program_id=${q.add(programId)} AND o.location_id=${q.add(locationId)} AND (${policy}) ${after}
 ORDER BY d.rowid LIMIT 101`).bind(...q.values)
 const [detail,history]=await ctx.db.batch([detailQuery,historyQuery])
 if(!detail.results[0])throw new Stage0Error('not_found')
 const decisions=(history.results as {id:string;createdAt:number}[]).slice(0,100),last=decisions.at(-1)
 return {submission:detail.results[0],decisions,nextCursor:history.results.length>100 && last?encodeWorkflowCursor(scope,{time:0,ids:[last.id]}):null}
}
