import type { CommandContext, Principal, RequestContext } from '../contracts'
import { Bindings, guardedBatch } from '../db'
import { Stage0Error } from '../errors'
import { exactObject } from '../domain/input'
import { secretDigest } from '../auth/secrets'
import { loadLiveSession } from '../auth/sessions'
import { volunteerWritePredicate, type VolunteerAction } from './policy'

function validId(value: unknown): value is string {
  return typeof value === 'string' && !!value.trim() && value.length <= 256 && !/\p{Cc}/u.test(value)
}
function key(ctx: CommandContext) {
  if (typeof ctx.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(ctx.idempotencyKey)) throw new Stage0Error('invalid_input')
}

/** Configure a role before publication; retries cannot create duplicate criteria. */
export async function createCriterion(ctx: CommandContext, value: unknown): Promise<{id:string}> {
  const input=exactObject(value,['organizationId','occurrenceId','roleId','programId','locationId','name'],true)
  if (!Object.values(input).every(validId) || (input.name as string).length>200) throw new Stage0Error('invalid_input')
  key(ctx); await loadLiveSession(ctx,ctx.principal)
  const {organizationId:org,occurrenceId:occurrence,roleId:role,programId:program,locationId:location}=input as Record<string,string>,name=(input.name as string).trim()
  const digest=await secretDigest(JSON.stringify(['criterion-v1',org,occurrence,role,program,location,name]))
  const replay=()=>receipt(ctx,org,program,location,'criterion','schedule.manage',digest)
  const old=await replay();if(old)return old
  const b=new Bindings(),allowed=volunteerWritePredicate(b,ctx.principal,org,{kind:'program_location',programId:program,locationId:location},'schedule.manage',ctx.clock.now())
  const scope=`EXISTS(SELECT 1 FROM volunteer_role_requirements r JOIN volunteer_occurrences o ON o.organization_id=r.organization_id AND o.id=r.occurrence_id WHERE r.organization_id=${b.add(org)} AND r.occurrence_id=${b.add(occurrence)} AND r.role_id=${b.add(role)} AND o.program_id=${b.add(program)} AND o.location_id=${b.add(location)} AND o.status='draft')`
  const id=ctx.ids.next()
  try {await guardedBatch(ctx,`(${allowed}) AND ${scope}`,b.values,[
    ctx.db.prepare('INSERT INTO volunteer_role_criteria VALUES(?,?,?,?,?,?,?,?,?)').bind(org,occurrence,role,id,name,ctx.principal.accountId,ctx.principal.sessionId,ctx.requestId,ctx.clock.now()),
    receiptInsert(ctx,org,'criterion',digest,id),
  ])} catch(error) {if(conflict(error)){const saved=await replay();if(saved)return saved;throw new Stage0Error('conflict')}throw error}
  return {id}
}

/** Append an evidence revision and compare its predecessor inside the transaction. */
export async function recordCriterionEvidence(ctx: CommandContext, value: unknown): Promise<{id:string}> {
  const input=exactObject(value,['organizationId','occurrenceId','roleId','criterionId','personId','programId','locationId','state','validFrom','validUntil','note','expectedEvidenceId'],true)
  const {organizationId,occurrenceId,roleId,criterionId,personId,programId,locationId,state,validFrom,validUntil,note,expectedEvidenceId}=input
  if (![organizationId,occurrenceId,roleId,criterionId,personId,programId,locationId].every(validId) || (state!=='verified' && state!=='revoked') || typeof note!=='string' || !note.trim() || note.length>2000 || (expectedEvidenceId!==null && !validId(expectedEvidenceId))) throw new Stage0Error('invalid_input')
  if (state==='verified' ? (!Number.isSafeInteger(validFrom) || (validFrom as number)<0 || (validUntil!==null && (!Number.isSafeInteger(validUntil) || (validUntil as number)<=(validFrom as number)))) : (validFrom!==null || validUntil!==null)) throw new Stage0Error('invalid_input')
  key(ctx);await loadLiveSession(ctx,ctx.principal)
  const org=organizationId as string,occurrence=occurrenceId as string,role=roleId as string,criterion=criterionId as string,person=personId as string,program=programId as string,location=locationId as string
  const digest=await secretDigest(JSON.stringify(['criterion-evidence-v1',org,occurrence,role,criterion,person,program,location,state,validFrom,validUntil,note.trim(),expectedEvidenceId]))
  const replay=()=>receipt(ctx,org,program,location,'evidence','readiness.review',digest)
  const old=await replay();if(old)return old
  const b=new Bindings(),allowed=volunteerWritePredicate(b,ctx.principal,org,{kind:'program_location',programId:program,locationId:location},'readiness.review',ctx.clock.now())
  const expected=expectedEvidenceId===null ? 'IS NULL' : `=${b.add(expectedEvidenceId as string)}`
  const scope=`EXISTS(SELECT 1 FROM volunteer_readiness v JOIN volunteer_occurrences o ON o.organization_id=v.organization_id AND o.id=v.occurrence_id JOIN volunteer_role_criteria c ON c.organization_id=v.organization_id AND c.occurrence_id=v.occurrence_id AND c.role_id=v.role_id WHERE v.organization_id=${b.add(org)} AND v.occurrence_id=${b.add(occurrence)} AND v.role_id=${b.add(role)} AND v.person_id=${b.add(person)} AND c.id=${b.add(criterion)} AND o.program_id=${b.add(program)} AND o.location_id=${b.add(location)} AND o.status='published' AND (SELECT e.id FROM volunteer_criterion_evidence e WHERE e.organization_id=v.organization_id AND e.occurrence_id=v.occurrence_id AND e.role_id=v.role_id AND e.person_id=v.person_id AND e.criterion_id=c.id ORDER BY e.rowid DESC LIMIT 1) ${expected})`
  const id=ctx.ids.next()
  try {await guardedBatch(ctx,`(${allowed}) AND ${scope}`,b.values,[
    ctx.db.prepare('INSERT INTO volunteer_criterion_evidence VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,org,occurrence,role,criterion,person,state,validFrom as number|null,validUntil as number|null,note.trim(),ctx.principal.accountId,ctx.principal.sessionId,ctx.requestId,ctx.clock.now()),
    receiptInsert(ctx,org,'evidence',digest,id),
  ])} catch(error) {if(conflict(error)){const saved=await replay();if(saved)return saved;throw new Stage0Error('conflict')}throw error}
  return {id}
}

async function receipt(ctx:CommandContext,org:string,program:string,location:string,kind:'criterion'|'evidence',action:VolunteerAction,digest:string):Promise<{id:string}|null> {
  const row=await ctx.db.prepare('SELECT request_digest,result_id FROM volunteer_criteria_receipts WHERE actor_account_id=? AND organization_id=? AND kind=? AND idempotency_key=?').bind(ctx.principal.accountId,org,kind,ctx.idempotencyKey).first<{request_digest:string;result_id:string}>()
  if(!row)return null
  const b=new Bindings(),allowed=volunteerWritePredicate(b,ctx.principal,org,{kind:'program_location',programId:program,locationId:location},action,ctx.clock.now())
  if(!await ctx.db.prepare(`SELECT 1 WHERE ${allowed}`).bind(...b.values).first())throw new Stage0Error('not_found')
  if(row.request_digest!==digest)throw new Stage0Error('conflict')
  return {id:row.result_id}
}
function receiptInsert(ctx:CommandContext,org:string,kind:'criterion'|'evidence',digest:string,id:string) {
  return ctx.db.prepare('INSERT INTO volunteer_criteria_receipts VALUES(?,?,?,?,?,?)').bind(ctx.principal.accountId,org,kind,ctx.idempotencyKey,digest,id)
}
function conflict(error:unknown) {return (error instanceof Stage0Error && error.code==='conflict') || (error instanceof Error && (error.message.includes('UNIQUE constraint failed') || error.message.includes('volunteer_criteria_frozen')))}

/** Reviewers see requirement status and evidence notes; general roster readers do not. */
export async function listCriterionEvidence(ctx:RequestContext,principal:Principal,organizationId:string,query:Record<string,string>) {
  const {occurrenceId,roleId,personId,programId,locationId}=query
  if (![organizationId,occurrenceId,roleId,personId,programId,locationId].every(validId))throw new Stage0Error('invalid_input')
  await loadLiveSession(ctx,principal)
  const b=new Bindings(),allowed=volunteerWritePredicate(b,principal,organizationId,{kind:'program_location',programId,locationId},'readiness.review',ctx.clock.now())
  const rows=await ctx.db.prepare(`SELECT c.id,c.name,e.id AS evidenceId,e.state,e.valid_from AS validFrom,e.valid_until AS validUntil,e.note
    FROM volunteer_role_criteria c JOIN volunteer_occurrences o ON o.organization_id=c.organization_id AND o.id=c.occurrence_id
    JOIN volunteer_readiness v ON v.organization_id=c.organization_id AND v.occurrence_id=c.occurrence_id AND v.role_id=c.role_id AND v.person_id=${b.add(personId)}
    LEFT JOIN volunteer_criterion_evidence e ON e.organization_id=c.organization_id AND e.id=(SELECT latest.id FROM volunteer_criterion_evidence latest WHERE latest.organization_id=c.organization_id AND latest.occurrence_id=c.occurrence_id AND latest.role_id=c.role_id AND latest.criterion_id=c.id AND latest.person_id=v.person_id ORDER BY latest.rowid DESC LIMIT 1)
    WHERE c.organization_id=${b.add(organizationId)} AND c.occurrence_id=${b.add(occurrenceId)} AND c.role_id=${b.add(roleId)} AND o.program_id=${b.add(programId)} AND o.location_id=${b.add(locationId)} AND (${allowed}) ORDER BY c.name,c.id LIMIT 101`).bind(...b.values).all()
  return {criteria:rows.results.slice(0,100),truncated:rows.results.length>100}
}
