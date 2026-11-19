import type { CommandContext, Principal, RequestContext } from '../contracts'
import { Bindings, guardedBatch } from '../db'
import { exactObject } from '../domain/input'
import { Stage0Error } from '../errors'
import { secretDigest } from '../auth/secrets'
import { loadLiveSession } from '../auth/sessions'
import { volunteerWritePredicate } from './policy'
import { decodeWorkflowCursor,encodeWorkflowCursor } from './pagination'

/** Records a decision only for a currently pending submission in the given scope. */
export async function reviewHours(ctx: CommandContext, value: unknown): Promise<{ id: string }> {
  const input = exactObject(value, ['organizationId','submissionId','programId','locationId','decision','approvedMinutes','reason','expectedDecisionId'])
  const { organizationId, submissionId, programId, locationId, decision, approvedMinutes, reason } = input
  const expected=input.expectedDecisionId ?? null
  if (![organizationId, submissionId, programId, locationId].every(v => typeof v === 'string' && v.length > 0 && v.length <= 256 && !/\p{Cc}/u.test(v))) throw new Stage0Error('invalid_input')
  if (decision !== 'approve' && decision !== 'adjust' && decision !== 'clarify' && decision !== 'reject') throw new Stage0Error('invalid_input')
  if(expected!==null && (typeof expected!=='string' || !expected || expected.length>256 || /\p{Cc}/u.test(expected)))throw new Stage0Error('invalid_input')
  if (decision === 'approve' || decision === 'adjust') {
    if (!Number.isSafeInteger(approvedMinutes) || (approvedMinutes as number) < 1) throw new Stage0Error('invalid_input')
  } else if (approvedMinutes !== null) throw new Stage0Error('invalid_input')
  if (reason !== null && (typeof reason !== 'string' || !reason.trim() || reason.length > 2000)) throw new Stage0Error('invalid_input')
  if (decision !== 'approve' && reason === null) throw new Stage0Error('invalid_input')
  if (typeof ctx.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(ctx.idempotencyKey)) throw new Stage0Error('invalid_input')
  await loadLiveSession(ctx, ctx.principal)
  const org = organizationId as string, submission = submissionId as string, program = programId as string, location = locationId as string
  const digest = await secretDigest(JSON.stringify(['hours-review-v2',org,submission,program,location,decision,approvedMinutes,reason,expected]))
  const replay = async (): Promise<{id:string}|null> => {
    const receipt = await ctx.db.prepare('SELECT request_digest,decision_id FROM volunteer_hours_receipts WHERE actor_account_id=? AND organization_id=? AND idempotency_key=?').bind(ctx.principal.accountId,org,ctx.idempotencyKey).first<{request_digest:string;decision_id:string}>()
    if (!receipt) return null
    const bindings = new Bindings()
    const policy = volunteerWritePredicate(bindings,ctx.principal,org,{kind:'program_location',programId:program,locationId:location},'hours.review',ctx.clock.now())
    if (!await ctx.db.prepare(`SELECT 1 WHERE ${policy}`).bind(...bindings.values).first()) throw new Stage0Error('not_found')
    if (receipt.request_digest !== digest) throw new Stage0Error('conflict')
    return {id:receipt.decision_id}
  }
  const existing = await replay()
  if (existing) return existing
  const b = new Bindings()
  const allowed = volunteerWritePredicate(b, ctx.principal, org, {kind:'program_location',programId:program,locationId:location}, 'hours.review', ctx.clock.now())
  const previous=expected===null ? "NOT EXISTS(SELECT 1 FROM volunteer_hours_decisions d WHERE d.organization_id=h.organization_id AND d.submission_id=h.id)" : `EXISTS(SELECT 1 FROM volunteer_hours_decisions d JOIN volunteer_hours_clarification_responses r ON r.organization_id=d.organization_id AND r.decision_id=d.id WHERE d.organization_id=h.organization_id AND d.submission_id=h.id AND d.id=${b.add(expected as string)} AND d.decision='clarify' AND d.rowid=(SELECT latest.rowid FROM volunteer_hours_decisions latest WHERE latest.organization_id=h.organization_id AND latest.submission_id=h.id ORDER BY latest.rowid DESC LIMIT 1))`
  const pending = `EXISTS(SELECT 1 FROM volunteer_hours_submissions h JOIN volunteer_assignments a ON a.organization_id=h.organization_id AND a.id=h.assignment_id JOIN volunteer_occurrences o ON o.organization_id=a.organization_id AND o.id=a.occurrence_id WHERE h.organization_id=${b.add(org)} AND h.id=${b.add(submission)} AND h.state='pending' AND (${previous}) ${decision === 'approve' ? `AND (h.end_at-h.start_at) % 60000=0 AND (h.end_at-h.start_at)/60000-h.break_minutes=${b.add(approvedMinutes as number)}` : ''} AND o.program_id=${b.add(program)} AND o.location_id=${b.add(location)})`
  const id = ctx.ids.next()
  const state = decision === 'clarify' ? 'clarification' : decision === 'reject' ? 'rejected' : 'approved'
  try {
    await guardedBatch(ctx, `(${allowed}) AND ${pending}`, b.values, [
    ctx.db.prepare('INSERT INTO volunteer_hours_decisions(id,organization_id,submission_id,reviewer_account_id,decision,approved_minutes,reason,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,org,submission,ctx.principal.accountId,decision,approvedMinutes as number|null,reason as string|null,ctx.clock.now()),
    ctx.db.prepare('INSERT INTO volunteer_hours_receipts(actor_account_id,organization_id,idempotency_key,request_digest,decision_id) VALUES(?,?,?,?,?)').bind(ctx.principal.accountId,org,ctx.idempotencyKey,digest,id),
    ctx.db.prepare('UPDATE volunteer_hours_submissions SET state=? WHERE organization_id=? AND id=? AND state=\'pending\'').bind(state,org,submission),
    ])
  } catch (error) {
    if ((error instanceof Stage0Error && error.code === 'conflict') || (error instanceof Error && error.message.includes('UNIQUE constraint failed'))) {
      const committed = await replay()
      if (committed) return committed
      throw new Stage0Error('conflict')
    }
    throw error
  }
  return { id }
}

/** A single queue includes attendance evidence without converting it to hours. */
export async function listHours(ctx: RequestContext, principal: Principal, organizationId: string, programId: string, locationId: string,cursor?:string) {
  if (![organizationId,programId,locationId].every(v => typeof v === 'string' && v.length > 0 && v.length <= 256 && !/\p{Cc}/u.test(v))) throw new Stage0Error('invalid_input')
  await loadLiveSession(ctx,principal)
  const scope=['hours',organizationId,programId,locationId],position=cursor===undefined?undefined:decodeWorkflowCursor(cursor,scope,1)
  const b = new Bindings()
  const allowed = volunteerWritePredicate(b,principal,organizationId,{kind:'program_location',programId,locationId},'hours.review',ctx.clock.now())
  const after=position?`AND (o.starts_at<${b.add(position.time)} OR (o.starts_at=${b.add(position.time)} AND h.id>${b.add(position.ids[0])}))`:''
  const rows = await ctx.db.prepare(`SELECT h.id,h.state,h.start_at AS startAt,h.end_at AS endAt,h.break_minutes AS breakMinutes,
    p.display_name AS name,o.title,o.starts_at AS occurrenceStart,t.checked_in_at AS checkedInAt,t.checked_out_at AS checkedOutAt
    FROM volunteer_hours_submissions h JOIN volunteer_assignments a ON a.organization_id=h.organization_id AND a.id=h.assignment_id
    JOIN volunteer_people p ON p.organization_id=a.organization_id AND p.id=a.person_id
    JOIN volunteer_occurrences o ON o.organization_id=a.organization_id AND o.id=a.occurrence_id
    LEFT JOIN volunteer_effective_attendance t ON t.organization_id=a.organization_id AND t.assignment_id=a.id
    WHERE h.organization_id=${b.add(organizationId)} AND o.program_id=${b.add(programId)} AND o.location_id=${b.add(locationId)} AND (${allowed}) ${after}
    ORDER BY o.starts_at DESC,h.id LIMIT 101`).bind(...b.values).all<{id:string;occurrenceStart:number}>()
  const submissions=rows.results.slice(0,100),last=submissions.at(-1)
  return { submissions, truncated:rows.results.length>100, nextCursor:rows.results.length>100 && last?encodeWorkflowCursor(scope,{time:last.occurrenceStart,ids:[last.id]}):null }
}

/** Service records come from the latest explicit approval, never scheduled or attendance time. */
export async function listServiceHistory(ctx: RequestContext, principal: Principal, organizationId: string, query: Record<string,string>) {
  const {programId,locationId,personId,cursor} = query
  if (![organizationId,programId,locationId].every(v=>typeof v==='string' && v.length>0 && v.length<=256 && !/\p{Cc}/u.test(v)) || [personId,cursor].some(v=>v!==undefined && (!v || v.length>256 || /\p{Cc}/u.test(v)))) throw new Stage0Error('invalid_input')
  await loadLiveSession(ctx,principal)
  const b=new Bindings()
  const allowed=volunteerWritePredicate(b,principal,organizationId,{kind:'program_location',programId,locationId},'hours.review',ctx.clock.now())
  const person=personId===undefined?'':`AND a.person_id=${b.add(personId)}`
  const after=cursor===undefined?'':`AND h.id>${b.add(cursor)}`
  const rows=await ctx.db.prepare(`SELECT h.id AS submissionId,a.id AS assignmentId,a.person_id AS personId,p.display_name AS name,
    o.id AS occurrenceId,o.title,o.starts_at AS occurrenceStart,r.name AS role,
    d.id AS decisionId,d.approved_minutes AS approvedMinutes,d.created_at AS approvedAt,
    EXISTS(SELECT 1 FROM volunteer_correction_requests c WHERE c.organization_id=a.organization_id AND c.assignment_id=a.id AND NOT EXISTS(SELECT 1 FROM volunteer_correction_resolutions resolved WHERE resolved.organization_id=c.organization_id AND resolved.correction_id=c.id)) AS correctionPending
    FROM volunteer_hours_submissions h JOIN volunteer_assignments a ON a.organization_id=h.organization_id AND a.id=h.assignment_id
    JOIN volunteer_people p ON p.organization_id=a.organization_id AND p.id=a.person_id
    JOIN volunteer_occurrences o ON o.organization_id=a.organization_id AND o.id=a.occurrence_id
    JOIN volunteer_role_requirements r ON r.organization_id=a.organization_id AND r.occurrence_id=a.occurrence_id AND r.role_id=a.role_id
    JOIN volunteer_hours_decisions d ON d.organization_id=h.organization_id AND d.submission_id=h.id
      AND d.rowid=(SELECT latest.rowid FROM volunteer_hours_decisions latest WHERE latest.organization_id=h.organization_id AND latest.submission_id=h.id ORDER BY latest.rowid DESC LIMIT 1)
    WHERE h.organization_id=${b.add(organizationId)} AND o.program_id=${b.add(programId)} AND o.location_id=${b.add(locationId)}
      AND h.state='approved' AND d.decision IN ('approve','adjust') ${person} ${after} AND (${allowed})
    ORDER BY h.id LIMIT 101`).bind(...b.values).all<{submissionId:string;correctionPending:number}>()
  const records=rows.results.slice(0,100).map(row=>({...row,correctionPending:row.correctionPending===1}))
  return {records,nextCursor:rows.results.length>100?records[records.length-1].submissionId:null}
}

/** Staff-assisted entry requires recorded attendance and remains pending review. */
export async function submitHours(ctx: CommandContext, value: unknown): Promise<{id:string}> {
  const input = exactObject(value,['organizationId','assignmentId','programId','locationId','startAt','endAt','breakMinutes'],true)
  const {organizationId,assignmentId,programId,locationId,startAt,endAt,breakMinutes} = input
  if (![organizationId,assignmentId,programId,locationId].every(v=>typeof v==='string' && v.length>0 && v.length<=256 && !/\p{Cc}/u.test(v))) throw new Stage0Error('invalid_input')
  if (![startAt,endAt,breakMinutes].every(Number.isSafeInteger) || (startAt as number)<0 || (endAt as number)<=(startAt as number) || (breakMinutes as number)<0 || ((endAt as number)-(startAt as number))%60000!==0 || (breakMinutes as number)*60000 >= (endAt as number)-(startAt as number)) throw new Stage0Error('invalid_input')
  await loadLiveSession(ctx,ctx.principal)
  const org=organizationId as string, assignment=assignmentId as string, program=programId as string, location=locationId as string
  const lookup=async():Promise<{id:string}|null>=>{
    const b=new Bindings()
    const policy=volunteerWritePredicate(b,ctx.principal,org,{kind:'program_location',programId:program,locationId:location},'attendance.manage',ctx.clock.now())
    const row=await ctx.db.prepare(`SELECT h.id,h.start_at,h.end_at,h.break_minutes FROM volunteer_hours_submissions h JOIN volunteer_assignments a ON a.organization_id=h.organization_id AND a.id=h.assignment_id JOIN volunteer_occurrences o ON o.organization_id=a.organization_id AND o.id=a.occurrence_id WHERE h.organization_id=${b.add(org)} AND h.assignment_id=${b.add(assignment)} AND o.program_id=${b.add(program)} AND o.location_id=${b.add(location)} AND (${policy})`).bind(...b.values).first<{id:string;start_at:number;end_at:number;break_minutes:number}>()
    if (!row) return null
    if (row.start_at!==startAt || row.end_at!==endAt || row.break_minutes!==breakMinutes) throw new Stage0Error('conflict')
    return {id:row.id}
  }
  const existing=await lookup();if(existing)return existing
  const b=new Bindings()
  const policy=volunteerWritePredicate(b,ctx.principal,org,{kind:'program_location',programId:program,locationId:location},'attendance.manage',ctx.clock.now())
  const scope=`EXISTS(SELECT 1 FROM volunteer_assignments a JOIN volunteer_occurrences o ON o.organization_id=a.organization_id AND o.id=a.occurrence_id JOIN volunteer_effective_attendance t ON t.organization_id=a.organization_id AND t.assignment_id=a.id WHERE a.organization_id=${b.add(org)} AND a.id=${b.add(assignment)} AND o.program_id=${b.add(program)} AND o.location_id=${b.add(location)} AND t.checked_out_at IS NOT NULL)`
  const id=ctx.ids.next()
  try {
    await guardedBatch(ctx,`(${policy}) AND ${scope}`,b.values,[
      ctx.db.prepare("INSERT INTO volunteer_hours_submissions VALUES(?,?,?,?,?,?,'pending')").bind(id,org,assignment,startAt as number,endAt as number,breakMinutes as number),
      ctx.db.prepare("INSERT INTO volunteer_audit_events(id,organization_id,assignment_id,actor_account_id,session_id,request_id,action,created_at) VALUES(?,?,?,?,?,?,'hours.submit',?)").bind(ctx.ids.next(),org,assignment,ctx.principal.accountId,ctx.principal.sessionId,ctx.requestId,ctx.clock.now()),
    ])
  } catch(error) {
    if ((error instanceof Stage0Error && error.code==='conflict') || (error instanceof Error && error.message.includes('UNIQUE constraint failed'))) {
      const saved=await lookup();if(saved)return saved
      throw new Stage0Error('conflict')
    }
    throw error
  }
  return {id}
}
