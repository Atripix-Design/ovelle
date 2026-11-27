import type {CommandContext,Principal,RequestContext} from '../contracts'
import {Bindings,guardedBatch} from '../db'
import {exactObject} from '../domain/input'
import {Stage0Error} from '../errors'
import {secretDigest} from '../auth/secrets'
import {loadLiveSession} from '../auth/sessions'
import {volunteerWritePredicate,type VolunteerAction} from './policy'
import {decodeWorkflowCursor,encodeWorkflowCursor} from './pagination'

const validId=(v:unknown):v is string=>typeof v==='string' && !!v.trim() && v.length<=256 && !/\p{Cc}/u.test(v)
function validateKey(ctx:CommandContext){if(typeof ctx.idempotencyKey!=='string' || !/^[A-Za-z0-9_-]{16,128}$/.test(ctx.idempotencyKey))throw new Stage0Error('invalid_input')}
function conflict(error:unknown){return (error instanceof Stage0Error && error.code==='conflict') || (error instanceof Error && error.message.includes('UNIQUE constraint failed'))}
async function receipt(ctx:CommandContext,org:string,program:string,location:string,kind:'request'|'resolve',action:VolunteerAction,digest:string):Promise<{id:string}|null>{
 const row=await ctx.db.prepare('SELECT request_digest,result_id FROM volunteer_correction_receipts WHERE actor_account_id=? AND organization_id=? AND kind=? AND idempotency_key=?').bind(ctx.principal.accountId,org,kind,ctx.idempotencyKey).first<{request_digest:string;result_id:string}>()
 if(!row)return null
 const b=new Bindings(),policy=volunteerWritePredicate(b,ctx.principal,org,{kind:'program_location',programId:program,locationId:location},action,ctx.clock.now())
 if(!await ctx.db.prepare(`SELECT 1 WHERE ${policy}`).bind(...b.values).first())throw new Stage0Error('not_found')
 if(row.request_digest!==digest)throw new Stage0Error('conflict')
 return {id:row.result_id}
}
function saveReceipt(ctx:CommandContext,org:string,kind:'request'|'resolve',digest:string,id:string){return ctx.db.prepare('INSERT INTO volunteer_correction_receipts VALUES(?,?,?,?,?,?)').bind(ctx.principal.accountId,org,kind,ctx.idempotencyKey,digest,id)}

/** Staff can request a review of recorded attendance without changing it. */
export async function requestCorrection(ctx:CommandContext,value:unknown):Promise<{id:string}>{
 const input=exactObject(value,['organizationId','assignmentId','programId','locationId','reason'],true)
 const {organizationId,assignmentId,programId,locationId,reason}=input
 if(![organizationId,assignmentId,programId,locationId].every(validId) || typeof reason!=='string' || !reason.trim() || reason.length>2000)throw new Stage0Error('invalid_input')
 validateKey(ctx);await loadLiveSession(ctx,ctx.principal)
 const org=organizationId as string,id=assignmentId as string,program=programId as string,location=locationId as string,note=reason.trim()
 const digest=await secretDigest(JSON.stringify(['correction-request-v1',org,id,program,location,note]))
 const replay=()=>receipt(ctx,org,program,location,'request','attendance.manage',digest)
 const old=await replay();if(old)return old
 const b=new Bindings(),allowed=volunteerWritePredicate(b,ctx.principal,org,{kind:'program_location',programId:program,locationId:location},'attendance.manage',ctx.clock.now())
 const eligible=`EXISTS(SELECT 1 FROM volunteer_assignments a JOIN volunteer_occurrences o ON o.organization_id=a.organization_id AND o.id=a.occurrence_id JOIN volunteer_attendance t ON t.organization_id=a.organization_id AND t.assignment_id=a.id WHERE a.organization_id=${b.add(org)} AND a.id=${b.add(id)} AND o.program_id=${b.add(program)} AND o.location_id=${b.add(location)} AND NOT EXISTS(SELECT 1 FROM volunteer_correction_requests c WHERE c.organization_id=a.organization_id AND c.assignment_id=a.id AND NOT EXISTS(SELECT 1 FROM volunteer_correction_resolutions r WHERE r.organization_id=c.organization_id AND r.correction_id=c.id)))`
 const result=ctx.ids.next()
 try {await guardedBatch(ctx,`(${allowed}) AND ${eligible}`,b.values,[
  ctx.db.prepare('INSERT INTO volunteer_correction_requests VALUES(?,?,?,?,?,?,?,?)').bind(result,org,id,note,ctx.principal.accountId,ctx.principal.sessionId,ctx.requestId,ctx.clock.now()),saveReceipt(ctx,org,'request',digest,result),
 ])} catch(error){if(conflict(error)){const saved=await replay();if(saved)return saved;throw new Stage0Error('conflict')}throw error}
 return {id:result}
}

/** Correct attendance; when hours were approved, compare and append a new decision. */
export async function resolveCorrection(ctx:CommandContext,value:unknown):Promise<{id:string}>{
 const input=exactObject(value,['organizationId','correctionId','programId','locationId','expectedDecisionId','checkedInAt','checkedOutAt','approvedMinutes','reason'],true)
 const {organizationId,correctionId,programId,locationId,expectedDecisionId,checkedInAt,checkedOutAt,approvedMinutes,reason}=input
 if(![organizationId,correctionId,programId,locationId].every(validId) || ![checkedInAt,checkedOutAt].every(Number.isSafeInteger) || (checkedInAt as number)<0 || (checkedOutAt as number)<(checkedInAt as number) || (approvedMinutes===null ? expectedDecisionId!==null : (!Number.isSafeInteger(approvedMinutes) || (approvedMinutes as number)<1 || !validId(expectedDecisionId))) || typeof reason!=='string' || !reason.trim() || reason.length>2000)throw new Stage0Error('invalid_input')
 validateKey(ctx);await loadLiveSession(ctx,ctx.principal)
 const org=organizationId as string,id=correctionId as string,program=programId as string,location=locationId as string,prior=expectedDecisionId as string|null,note=reason.trim()
 const digest=await secretDigest(JSON.stringify(['correction-resolve-v1',org,id,program,location,prior,checkedInAt,checkedOutAt,approvedMinutes,note]))
 const replay=()=>receipt(ctx,org,program,location,'resolve','hours.review',digest)
 const old=await replay();if(old)return old
 const b=new Bindings(),allowed=volunteerWritePredicate(b,ctx.principal,org,{kind:'program_location',programId:program,locationId:location},'hours.review',ctx.clock.now())
 const hoursGuard=prior===null ? "(h.id IS NULL OR h.state IN ('pending','clarification'))" : `h.state='approved' AND EXISTS(SELECT 1 FROM volunteer_hours_decisions d WHERE d.organization_id=h.organization_id AND d.submission_id=h.id AND d.id=${b.add(prior)} AND d.decision IN ('approve','adjust') AND d.rowid=(SELECT latest.rowid FROM volunteer_hours_decisions latest WHERE latest.organization_id=h.organization_id AND latest.submission_id=h.id ORDER BY latest.rowid DESC LIMIT 1))`
 const eligible=`EXISTS(SELECT 1 FROM volunteer_correction_requests c JOIN volunteer_assignments a ON a.organization_id=c.organization_id AND a.id=c.assignment_id JOIN volunteer_occurrences o ON o.organization_id=a.organization_id AND o.id=a.occurrence_id LEFT JOIN volunteer_hours_submissions h ON h.organization_id=a.organization_id AND h.assignment_id=a.id WHERE c.organization_id=${b.add(org)} AND c.id=${b.add(id)} AND o.program_id=${b.add(program)} AND o.location_id=${b.add(location)} AND (${hoursGuard}) AND NOT EXISTS(SELECT 1 FROM volunteer_correction_resolutions r WHERE r.organization_id=c.organization_id AND r.correction_id=c.id))`
 const result=ctx.ids.next(),decision=ctx.ids.next(),now=ctx.clock.now()
 try {await guardedBatch(ctx,`(${allowed}) AND ${eligible}`,b.values,[
  ...(prior===null?[]:[ctx.db.prepare("INSERT INTO volunteer_hours_decisions(id,organization_id,submission_id,reviewer_account_id,decision,approved_minutes,reason,created_at) SELECT ?,h.organization_id,h.id,?,'adjust',?,?,? FROM volunteer_correction_requests c JOIN volunteer_hours_submissions h ON h.organization_id=c.organization_id AND h.assignment_id=c.assignment_id WHERE c.organization_id=? AND c.id=?").bind(decision,ctx.principal.accountId,approvedMinutes as number,note,now,org,id)]),
  ctx.db.prepare('INSERT INTO volunteer_correction_resolutions VALUES(?,?,?,?,?,?,?,?,?,?)').bind(result,org,id,prior===null?null:decision,checkedInAt as number,checkedOutAt as number,ctx.principal.accountId,ctx.principal.sessionId,ctx.requestId,now),
  saveReceipt(ctx,org,'resolve',digest,result),
 ])} catch(error){if(conflict(error)){const saved=await replay();if(saved)return saved;throw new Stage0Error('conflict')}throw error}
 return {id:result}
}

/** A reviewer sees source evidence and the latest hours decision together. */
export async function listCorrections(ctx:RequestContext,principal:Principal,org:string,program:string,location:string,cursor?:string){
 if(![org,program,location].every(validId))throw new Stage0Error('invalid_input')
 await loadLiveSession(ctx,principal)
 const scope=['corrections',org,program,location],position=cursor===undefined?undefined:decodeWorkflowCursor(cursor,scope,1)
 const b=new Bindings(),allowed=volunteerWritePredicate(b,principal,org,{kind:'program_location',programId:program,locationId:location},'hours.review',ctx.clock.now())
 const after=position?`AND (c.created_at>${b.add(position.time)} OR (c.created_at=${b.add(position.time)} AND c.id>${b.add(position.ids[0])}))`:''
 const rows=await ctx.db.prepare(`SELECT c.id,c.reason,c.created_at AS requestedAt,a.id AS assignmentId,p.display_name AS name,o.title,
 t.checked_in_at AS originalCheckIn,t.checked_out_at AS originalCheckOut,current.checked_in_at AS currentCheckIn,current.checked_out_at AS currentCheckOut,
 h.id AS submissionId,h.state AS hoursState,d.id AS latestDecisionId,d.approved_minutes AS approvedMinutes
 FROM volunteer_correction_requests c JOIN volunteer_assignments a ON a.organization_id=c.organization_id AND a.id=c.assignment_id
 JOIN volunteer_occurrences o ON o.organization_id=a.organization_id AND o.id=a.occurrence_id JOIN volunteer_people p ON p.organization_id=a.organization_id AND p.id=a.person_id
 JOIN volunteer_attendance t ON t.organization_id=a.organization_id AND t.assignment_id=a.id
 JOIN volunteer_effective_attendance current ON current.organization_id=a.organization_id AND current.assignment_id=a.id
 LEFT JOIN volunteer_hours_submissions h ON h.organization_id=a.organization_id AND h.assignment_id=a.id
 LEFT JOIN volunteer_hours_decisions d ON d.organization_id=h.organization_id AND d.rowid=(SELECT latest.rowid FROM volunteer_hours_decisions latest WHERE latest.organization_id=h.organization_id AND latest.submission_id=h.id ORDER BY latest.rowid DESC LIMIT 1)
 WHERE c.organization_id=${b.add(org)} AND o.program_id=${b.add(program)} AND o.location_id=${b.add(location)} AND NOT EXISTS(SELECT 1 FROM volunteer_correction_resolutions r WHERE r.organization_id=c.organization_id AND r.correction_id=c.id) AND (${allowed}) ${after} ORDER BY c.created_at,c.id LIMIT 101`).bind(...b.values).all<{id:string;requestedAt:number}>()
 const corrections=rows.results.slice(0,100),last=corrections.at(-1)
 return {corrections,truncated:rows.results.length>100,nextCursor:rows.results.length>100 && last?encodeWorkflowCursor(scope,{time:last.requestedAt,ids:[last.id]}):null}
}
