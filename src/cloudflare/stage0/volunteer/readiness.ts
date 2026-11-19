import type { CommandContext, Principal, RequestContext } from '../contracts'
import { Bindings, guardedBatch } from '../db'
import { Stage0Error } from '../errors'
import { secretDigest } from '../auth/secrets'
import { loadLiveSession } from '../auth/sessions'
import { volunteerWritePredicate } from './policy'
import { decodeWorkflowCursor,encodeWorkflowCursor } from './pagination'

/** Review queue contains decisions, not confidential document contents. */
export async function listReadiness(ctx: RequestContext, principal: Principal, organizationId: string, programId: string, locationId: string,cursor?:string) {
  if (![organizationId,programId,locationId].every(value => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/\p{Cc}/u.test(value))) throw new Stage0Error('invalid_input')
  await loadLiveSession(ctx,principal)
  const scope=['readiness',organizationId,programId,locationId],position=cursor===undefined?undefined:decodeWorkflowCursor(cursor,scope,3)
  const b = new Bindings()
  const policy = volunteerWritePredicate(b,principal,organizationId,{kind:'program_location',programId,locationId},'readiness.review',ctx.clock.now())
  const after=position?`AND (o.starts_at>${b.add(position.time)} OR (o.starts_at=${b.add(position.time)} AND (v.occurrence_id>${b.add(position.ids[0])} OR (v.occurrence_id=${b.add(position.ids[0])} AND (v.role_id>${b.add(position.ids[1])} OR (v.role_id=${b.add(position.ids[1])} AND v.person_id>${b.add(position.ids[2])}))))))`:''
  const rows = await ctx.db.prepare(`SELECT v.occurrence_id AS occurrenceId,v.role_id AS roleId,v.person_id AS personId,
    p.display_name AS name,r.name AS role,o.title,o.starts_at AS startsAt,effective.state,v.reviewed_at AS reviewedAt,
    (SELECT d.id FROM volunteer_readiness_decisions d WHERE d.organization_id=v.organization_id AND d.occurrence_id=v.occurrence_id AND d.role_id=v.role_id AND d.person_id=v.person_id ORDER BY d.rowid DESC LIMIT 1) AS latestDecisionId
    FROM volunteer_readiness v JOIN volunteer_people p ON p.organization_id=v.organization_id AND p.id=v.person_id
    JOIN volunteer_role_requirements r ON r.organization_id=v.organization_id AND r.occurrence_id=v.occurrence_id AND r.role_id=v.role_id
    JOIN volunteer_occurrences o ON o.organization_id=v.organization_id AND o.id=v.occurrence_id
    JOIN volunteer_effective_readiness effective ON effective.organization_id=v.organization_id AND effective.occurrence_id=v.occurrence_id AND effective.role_id=v.role_id AND effective.person_id=v.person_id
    WHERE v.organization_id=${b.add(organizationId)} AND o.program_id=${b.add(programId)} AND o.location_id=${b.add(locationId)} AND (${policy}) ${after}
    ORDER BY o.starts_at,v.occurrence_id,v.role_id,v.person_id LIMIT 101`).bind(...b.values).all<{occurrenceId:string;roleId:string;personId:string;startsAt:number}>()
  const cases=rows.results.slice(0,100),last=cases.at(-1)
  return {cases,truncated:rows.results.length>100,nextCursor:rows.results.length>100 && last?encodeWorkflowCursor(scope,{time:last.startsAt,ids:[last.occurrenceId,last.roleId,last.personId]}):null}
}

/** Compare the current decision identity at commit so stale reviews cannot overwrite a newer decision. */
export async function decideReadiness(ctx: CommandContext, input: {organizationId:string;occurrenceId:string;roleId:string;personId:string;programId:string;locationId:string;state:'ready'|'blocked';evidenceNote:string;expectedDecisionId?:string|null}) {
  if (!input || ![input.organizationId,input.occurrenceId,input.roleId,input.personId,input.programId,input.locationId].every(v=>typeof v==='string' && v.length>0 && v.length<=256 && !/\p{Cc}/u.test(v)) || (input.state!=='ready' && input.state!=='blocked') || typeof input.evidenceNote!=='string' || !input.evidenceNote.trim() || input.evidenceNote.length>2000) throw new Stage0Error('invalid_input')
  if (input.expectedDecisionId != null && (typeof input.expectedDecisionId!=='string' || !input.expectedDecisionId.trim() || input.expectedDecisionId.length>256 || /\p{Cc}/u.test(input.expectedDecisionId))) throw new Stage0Error('invalid_input')
  if (typeof ctx.idempotencyKey!=='string' || !/^[A-Za-z0-9_-]{16,128}$/.test(ctx.idempotencyKey)) throw new Stage0Error('invalid_input')
  await loadLiveSession(ctx,ctx.principal)
  const expected=input.expectedDecisionId ?? null
  const digest=await secretDigest(JSON.stringify(['readiness-v2',input.organizationId,input.occurrenceId,input.roleId,input.personId,input.programId,input.locationId,input.state,input.evidenceNote.trim(),expected]))
  const replay=async():Promise<{id:string}|null>=>{
    const row=await ctx.db.prepare('SELECT request_digest,decision_id FROM volunteer_readiness_receipts WHERE actor_account_id=? AND organization_id=? AND idempotency_key=?').bind(ctx.principal.accountId,input.organizationId,ctx.idempotencyKey).first<{request_digest:string;decision_id:string}>()
    if(!row)return null
    const bindings=new Bindings()
    const allowed=volunteerWritePredicate(bindings,ctx.principal,input.organizationId,{kind:'program_location',programId:input.programId,locationId:input.locationId},'readiness.review',ctx.clock.now())
    if(!await ctx.db.prepare(`SELECT 1 WHERE ${allowed}`).bind(...bindings.values).first())throw new Stage0Error('not_found')
    if(row.request_digest!==digest)throw new Stage0Error('conflict')
    return {id:row.decision_id}
  }
  const existing=await replay();if(existing)return existing
  const b = new Bindings()
  const policy=volunteerWritePredicate(b,ctx.principal,input.organizationId,{kind:'program_location',programId:input.programId,locationId:input.locationId},'readiness.review',ctx.clock.now())
  const prior=expected===null ? "v.state='pending' AND NOT EXISTS(SELECT 1 FROM volunteer_readiness_decisions d WHERE d.organization_id=v.organization_id AND d.occurrence_id=v.occurrence_id AND d.role_id=v.role_id AND d.person_id=v.person_id)" : `v.state!='pending' AND (SELECT d.id FROM volunteer_readiness_decisions d WHERE d.organization_id=v.organization_id AND d.occurrence_id=v.occurrence_id AND d.role_id=v.role_id AND d.person_id=v.person_id ORDER BY d.rowid DESC LIMIT 1)=${b.add(expected)}`
  const pending=`EXISTS(SELECT 1 FROM volunteer_readiness v JOIN volunteer_occurrences o ON o.organization_id=v.organization_id AND o.id=v.occurrence_id WHERE v.organization_id=${b.add(input.organizationId)} AND v.occurrence_id=${b.add(input.occurrenceId)} AND v.role_id=${b.add(input.roleId)} AND v.person_id=${b.add(input.personId)} AND ${prior} AND o.program_id=${b.add(input.programId)} AND o.location_id=${b.add(input.locationId)})`
  const id=ctx.ids.next(), now=ctx.clock.now()
  try { await guardedBatch(ctx,`(${policy}) AND ${pending}`,b.values,[
    ctx.db.prepare('INSERT INTO volunteer_readiness_decisions VALUES(?,?,?,?,?,?,?,?,?)').bind(id,input.organizationId,input.occurrenceId,input.roleId,input.personId,input.state,input.evidenceNote.trim(),ctx.principal.accountId,now),
    ctx.db.prepare('INSERT INTO volunteer_readiness_receipts VALUES(?,?,?,?,?)').bind(ctx.principal.accountId,input.organizationId,ctx.idempotencyKey,digest,id),
    ctx.db.prepare("UPDATE volunteer_readiness SET state=?,reviewed_by=?,reviewed_at=? WHERE organization_id=? AND occurrence_id=? AND role_id=? AND person_id=?").bind(input.state,ctx.principal.accountId,now,input.organizationId,input.occurrenceId,input.roleId,input.personId),
  ]) } catch(error) {
    if ((error instanceof Stage0Error && error.code==='conflict') || (error instanceof Error && error.message.includes('UNIQUE constraint failed'))) {
      const saved=await replay();if(saved)return saved
      throw new Stage0Error('conflict')
    }
    throw error
  }
  return {id}
}

/** Start review for an existing person and role without asserting eligibility. */
export async function openReadiness(ctx: CommandContext, input: {organizationId:string;occurrenceId:string;roleId:string;personId:string;programId:string;locationId:string}) {
  if (!input || ![input.organizationId,input.occurrenceId,input.roleId,input.personId,input.programId,input.locationId].every(v=>typeof v==='string' && !!v.trim() && v.length<=256 && !/\p{Cc}/u.test(v))) throw new Stage0Error('invalid_input')
  await loadLiveSession(ctx,ctx.principal)
  const lookup=async()=>{
    const b=new Bindings(),policy=volunteerWritePredicate(b,ctx.principal,input.organizationId,{kind:'program_location',programId:input.programId,locationId:input.locationId},'readiness.review',ctx.clock.now())
    return !!await ctx.db.prepare(`SELECT 1 FROM volunteer_readiness v JOIN volunteer_occurrences o ON o.organization_id=v.organization_id AND o.id=v.occurrence_id WHERE v.organization_id=${b.add(input.organizationId)} AND v.occurrence_id=${b.add(input.occurrenceId)} AND v.role_id=${b.add(input.roleId)} AND v.person_id=${b.add(input.personId)} AND o.program_id=${b.add(input.programId)} AND o.location_id=${b.add(input.locationId)} AND (${policy})`).bind(...b.values).first()
  }
  if(await lookup())return {status:'existing' as const}
  const b=new Bindings(),policy=volunteerWritePredicate(b,ctx.principal,input.organizationId,{kind:'program_location',programId:input.programId,locationId:input.locationId},'readiness.review',ctx.clock.now())
  const scope=`EXISTS(SELECT 1 FROM volunteer_occurrences o JOIN volunteer_people_scopes p ON p.organization_id=o.organization_id AND p.program_id=o.program_id AND p.location_id=o.location_id WHERE o.organization_id=${b.add(input.organizationId)} AND o.id=${b.add(input.occurrenceId)} AND o.program_id=${b.add(input.programId)} AND o.location_id=${b.add(input.locationId)} AND p.person_id=${b.add(input.personId)} AND o.status='published')`
  try {await guardedBatch(ctx,`(${policy}) AND ${scope}`,b.values,[
    ctx.db.prepare("INSERT INTO volunteer_readiness VALUES(?,?,?,?,'pending',NULL,NULL)").bind(input.organizationId,input.occurrenceId,input.roleId,input.personId),
    ctx.db.prepare('INSERT INTO volunteer_readiness_open_events VALUES(?,?,?,?,?,?,?,?,?)').bind(ctx.ids.next(),input.organizationId,input.occurrenceId,input.roleId,input.personId,ctx.principal.accountId,ctx.principal.sessionId,ctx.requestId,ctx.clock.now()),
  ])} catch(error) {
    if ((error instanceof Stage0Error && error.code==='conflict') || (error instanceof Error && error.message.includes('UNIQUE constraint failed'))) {if(await lookup())return {status:'existing' as const};throw new Stage0Error('conflict')}
    throw error
  }
  return {status:'pending' as const}
}
