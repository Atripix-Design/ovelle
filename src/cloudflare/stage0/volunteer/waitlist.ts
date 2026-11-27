import type {CommandContext,Principal,RequestContext} from '../contracts'
import {Bindings,guardedBatch} from '../db'
import {exactObject} from '../domain/input'
import {Stage0Error} from '../errors'
import {secretDigest} from '../auth/secrets'
import {loadLiveSession} from '../auth/sessions'
import {volunteerWritePredicate} from './policy'
import {decodeWorkflowCursor,encodeWorkflowCursor} from './pagination'

const valid=(v:unknown):v is string=>typeof v==='string' && !!v.trim() && v.length<=256 && !/\p{Cc}/u.test(v)
function check(ctx:CommandContext){if(typeof ctx.idempotencyKey!=='string' || !/^[A-Za-z0-9_-]{16,128}$/.test(ctx.idempotencyKey))throw new Stage0Error('invalid_input')}
function isConflict(error:unknown){return (error instanceof Stage0Error && error.code==='conflict') || (error instanceof Error && /UNIQUE constraint failed|volunteer_offer_unavailable|volunteer_assignment_unavailable/.test(error.message))}
type Kind='queue'|'offer'|'accept'|'withdraw'|'leave'
async function receipt(ctx:CommandContext,org:string,program:string,location:string,kind:Kind,digest:string):Promise<{id:string}|null>{
 const row=await ctx.db.prepare('SELECT request_digest,result_id FROM volunteer_waitlist_receipts WHERE actor_account_id=? AND organization_id=? AND kind=? AND idempotency_key=?').bind(ctx.principal.accountId,org,kind,ctx.idempotencyKey).first<{request_digest:string;result_id:string}>()
 if(!row)return null
 const b=new Bindings(),allowed=volunteerWritePredicate(b,ctx.principal,org,{kind:'program_location',programId:program,locationId:location},'assignment.manage',ctx.clock.now())
 if(!await ctx.db.prepare(`SELECT 1 WHERE ${allowed}`).bind(...b.values).first())throw new Stage0Error('not_found')
 if(row.request_digest!==digest)throw new Stage0Error('conflict')
 return {id:row.result_id}
}
function receiptInsert(ctx:CommandContext,org:string,kind:Kind,digest:string,id:string){return ctx.db.prepare('INSERT INTO volunteer_waitlist_receipts VALUES(?,?,?,?,?,?)').bind(ctx.principal.accountId,org,kind,ctx.idempotencyKey,digest,id)}
function event(ctx:CommandContext,org:string,entry:string,offer:string|null,kind:Kind,note:string|null){return ctx.db.prepare('INSERT INTO volunteer_waitlist_events VALUES(?,?,?,?,?,?,?,?,?,?)').bind(ctx.ids.next(),org,entry,offer,kind,note,ctx.principal.accountId,ctx.principal.sessionId,ctx.requestId,ctx.clock.now())}

/** Queue an existing person for a role without implying that they are ready. */
export async function joinWaitlist(ctx:CommandContext,value:unknown):Promise<{id:string}>{
 const input=exactObject(value,['organizationId','occurrenceId','roleId','personId','programId','locationId'],true)
 if(!Object.values(input).every(valid))throw new Stage0Error('invalid_input')
 check(ctx);await loadLiveSession(ctx,ctx.principal)
 const {organizationId:org,occurrenceId:occurrence,roleId:role,personId:person,programId:program,locationId:location}=input as Record<string,string>
 const digest=await secretDigest(JSON.stringify(['waitlist-v1',org,occurrence,role,person,program,location])),replay=()=>receipt(ctx,org,program,location,'queue',digest)
 const old=await replay();if(old)return old
 const b=new Bindings(),allowed=volunteerWritePredicate(b,ctx.principal,org,{kind:'program_location',programId:program,locationId:location},'assignment.manage',ctx.clock.now())
 const scope=`EXISTS(SELECT 1 FROM volunteer_occurrences o JOIN volunteer_role_requirements r ON r.organization_id=o.organization_id AND r.occurrence_id=o.id JOIN volunteer_people_scopes p ON p.organization_id=o.organization_id AND p.program_id=o.program_id AND p.location_id=o.location_id WHERE o.organization_id=${b.add(org)} AND o.id=${b.add(occurrence)} AND r.role_id=${b.add(role)} AND p.person_id=${b.add(person)} AND o.program_id=${b.add(program)} AND o.location_id=${b.add(location)} AND o.status='published')`
 const id=ctx.ids.next()
 try{await guardedBatch(ctx,`(${allowed}) AND ${scope}`,b.values,[ctx.db.prepare("INSERT INTO volunteer_waitlist VALUES(?,?,?,?,?,?,?,?,?,'waiting')").bind(id,org,occurrence,role,person,ctx.principal.accountId,ctx.principal.sessionId,ctx.requestId,ctx.clock.now()),receiptInsert(ctx,org,'queue',digest,id),event(ctx,org,id,null,'queue',null)])}catch(error){if(isConflict(error)){const saved=await replay();if(saved)return saved;throw new Stage0Error('conflict')}throw error}
 return {id}
}

/** Offer a seat with a real hold. Delivery is deliberately outside this operation. */
export async function offerWaitlist(ctx:CommandContext,value:unknown):Promise<{id:string}>{
 const input=exactObject(value,['organizationId','waitlistId','programId','locationId','expiresAt'],true)
 const {organizationId,waitlistId,programId,locationId,expiresAt}=input,now=ctx.clock.now()
 if(![organizationId,waitlistId,programId,locationId].every(valid) || !Number.isSafeInteger(expiresAt))throw new Stage0Error('invalid_input')
 check(ctx);await loadLiveSession(ctx,ctx.principal)
 const org=organizationId as string,entry=waitlistId as string,program=programId as string,location=locationId as string
 const digest=await secretDigest(JSON.stringify(['waitlist-offer-v1',org,entry,program,location,expiresAt])),replay=()=>receipt(ctx,org,program,location,'offer',digest)
 const old=await replay();if(old)return old
 if((expiresAt as number)<=now || (expiresAt as number)>now+7*86400000)throw new Stage0Error('invalid_input')
 const b=new Bindings(),allowed=volunteerWritePredicate(b,ctx.principal,org,{kind:'program_location',programId:program,locationId:location},'assignment.manage',now)
 const scope=`EXISTS(SELECT 1 FROM volunteer_waitlist w JOIN volunteer_occurrences o ON o.organization_id=w.organization_id AND o.id=w.occurrence_id WHERE w.organization_id=${b.add(org)} AND w.id=${b.add(entry)} AND w.state='waiting' AND o.program_id=${b.add(program)} AND o.location_id=${b.add(location)} AND o.status='published' AND o.ends_at>=${b.add(expiresAt as number)})`
 const id=ctx.ids.next()
 try{await guardedBatch(ctx,`(${allowed}) AND ${scope}`,b.values,[
  ctx.db.prepare("UPDATE volunteer_offers SET state='expired' WHERE organization_id=? AND occurrence_id=(SELECT occurrence_id FROM volunteer_waitlist WHERE organization_id=? AND id=?) AND state='offered' AND expires_at<=?").bind(org,org,entry,now),
  ctx.db.prepare("INSERT INTO volunteer_offers SELECT ?,organization_id,id,occurrence_id,role_id,person_id,'offered',?,?, ?,?,? FROM volunteer_waitlist WHERE organization_id=? AND id=?").bind(id,expiresAt as number,now,ctx.principal.accountId,ctx.principal.sessionId,ctx.requestId,org,entry),
  receiptInsert(ctx,org,'offer',digest,id),event(ctx,org,entry,id,'offer',null),
 ])}catch(error){if(isConflict(error)){const saved=await replay();if(saved)return saved;throw new Stage0Error('conflict')}throw error}
 return {id}
}

/** Record a volunteer's acceptance supplied by staff and consume the hold once. */
export async function confirmOffer(ctx:CommandContext,value:unknown):Promise<{id:string}>{
 const input=exactObject(value,['organizationId','offerId','programId','locationId','confirmationNote'],true)
 const {organizationId,offerId,programId,locationId,confirmationNote}=input
 if(![organizationId,offerId,programId,locationId].every(valid) || typeof confirmationNote!=='string' || !confirmationNote.trim() || confirmationNote.length>2000)throw new Stage0Error('invalid_input')
 check(ctx);await loadLiveSession(ctx,ctx.principal)
 const org=organizationId as string,offer=offerId as string,program=programId as string,location=locationId as string,note=confirmationNote.trim(),now=ctx.clock.now()
 const digest=await secretDigest(JSON.stringify(['waitlist-accept-v1',org,offer,program,location,note])),replay=()=>receipt(ctx,org,program,location,'accept',digest)
 const old=await replay();if(old)return old
 const b=new Bindings(),allowed=volunteerWritePredicate(b,ctx.principal,org,{kind:'program_location',programId:program,locationId:location},'assignment.manage',now)
 const scope=`EXISTS(SELECT 1 FROM volunteer_offers x JOIN volunteer_waitlist w ON w.organization_id=x.organization_id AND w.id=x.waitlist_id AND w.state='waiting' JOIN volunteer_occurrences o ON o.organization_id=x.organization_id AND o.id=x.occurrence_id WHERE x.organization_id=${b.add(org)} AND x.id=${b.add(offer)} AND x.state='offered' AND x.expires_at>${b.add(now)} AND o.program_id=${b.add(program)} AND o.location_id=${b.add(location)} AND o.status='published')`
 const id=ctx.ids.next()
 try{await guardedBatch(ctx,`(${allowed}) AND ${scope}`,b.values,[
  ctx.db.prepare("UPDATE volunteer_offers SET state='expired' WHERE organization_id=? AND occurrence_id=(SELECT occurrence_id FROM volunteer_offers WHERE organization_id=? AND id=?) AND state='offered' AND expires_at<=?").bind(org,org,offer,now),
  ctx.db.prepare("UPDATE volunteer_offers SET state='accepted' WHERE organization_id=? AND id=? AND state='offered'").bind(org,offer),
  ctx.db.prepare("INSERT INTO volunteer_assignments SELECT ?,organization_id,occurrence_id,person_id,role_id,'confirmed',? FROM volunteer_offers WHERE organization_id=? AND id=? AND state='accepted'").bind(id,now,org,offer),
  ctx.db.prepare("INSERT INTO volunteer_audit_events(id,organization_id,assignment_id,actor_account_id,session_id,request_id,action,created_at) VALUES(?,?,?,?,?,?,'assignment.create',?)").bind(ctx.ids.next(),org,id,ctx.principal.accountId,ctx.principal.sessionId,ctx.requestId,now),
  ctx.db.prepare("INSERT INTO volunteer_waitlist_events SELECT ?,organization_id,waitlist_id,id,'accept',?,?,?,?,? FROM volunteer_offers WHERE organization_id=? AND id=?").bind(ctx.ids.next(),note,ctx.principal.accountId,ctx.principal.sessionId,ctx.requestId,now,org,offer),receiptInsert(ctx,org,'accept',digest,id),
 ])}catch(error){if(isConflict(error)){const saved=await replay();if(saved)return saved;throw new Stage0Error('conflict')}throw error}
 return {id}
}

/** Withdraw an open offer and release its hold; no delivery is implied. */
export async function withdrawOffer(ctx:CommandContext,value:unknown):Promise<{id:string}>{
 const input=exactObject(value,['organizationId','offerId','programId','locationId','reason'],true),{organizationId,offerId,programId,locationId,reason}=input
 if(![organizationId,offerId,programId,locationId].every(valid) || typeof reason!=='string' || !reason.trim() || reason.length>2000)throw new Stage0Error('invalid_input')
 check(ctx);await loadLiveSession(ctx,ctx.principal)
 const org=organizationId as string,offer=offerId as string,program=programId as string,location=locationId as string,note=reason.trim(),now=ctx.clock.now()
 const digest=await secretDigest(JSON.stringify(['waitlist-withdraw-v1',org,offer,program,location,note])),replay=()=>receipt(ctx,org,program,location,'withdraw',digest)
 const old=await replay();if(old)return old
 const b=new Bindings(),allowed=volunteerWritePredicate(b,ctx.principal,org,{kind:'program_location',programId:program,locationId:location},'assignment.manage',now)
 const scope=`EXISTS(SELECT 1 FROM volunteer_offers x JOIN volunteer_occurrences o ON o.organization_id=x.organization_id AND o.id=x.occurrence_id WHERE x.organization_id=${b.add(org)} AND x.id=${b.add(offer)} AND x.state='offered' AND x.expires_at>${b.add(now)} AND o.program_id=${b.add(program)} AND o.location_id=${b.add(location)})`
 try{await guardedBatch(ctx,`(${allowed}) AND ${scope}`,b.values,[
  ctx.db.prepare("UPDATE volunteer_offers SET state='withdrawn' WHERE organization_id=? AND id=? AND state='offered'").bind(org,offer),
  ctx.db.prepare("INSERT INTO volunteer_waitlist_events SELECT ?,organization_id,waitlist_id,id,'withdraw',?,?,?,?,? FROM volunteer_offers WHERE organization_id=? AND id=?").bind(ctx.ids.next(),note,ctx.principal.accountId,ctx.principal.sessionId,ctx.requestId,now,org,offer),receiptInsert(ctx,org,'withdraw',digest,offer),
 ])}catch(error){if(isConflict(error)){const saved=await replay();if(saved)return saved;throw new Stage0Error('conflict')}throw error}
 return {id:offer}
}

/** Withdraw a queue entry and any outstanding hold in the same transaction. */
export async function leaveWaitlist(ctx:CommandContext,value:unknown):Promise<{id:string}>{
 const input=exactObject(value,['organizationId','waitlistId','programId','locationId','reason'],true),{organizationId,waitlistId,programId,locationId,reason}=input
 if(![organizationId,waitlistId,programId,locationId].every(valid) || typeof reason!=='string' || !reason.trim() || reason.length>2000)throw new Stage0Error('invalid_input')
 check(ctx);await loadLiveSession(ctx,ctx.principal)
 const org=organizationId as string,entry=waitlistId as string,program=programId as string,location=locationId as string,note=reason.trim(),now=ctx.clock.now()
 const digest=await secretDigest(JSON.stringify(['waitlist-leave-v1',org,entry,program,location,note])),replay=()=>receipt(ctx,org,program,location,'leave',digest)
 const old=await replay();if(old)return old
 const b=new Bindings(),allowed=volunteerWritePredicate(b,ctx.principal,org,{kind:'program_location',programId:program,locationId:location},'assignment.manage',now)
 const scope=`EXISTS(SELECT 1 FROM volunteer_waitlist w JOIN volunteer_occurrences o ON o.organization_id=w.organization_id AND o.id=w.occurrence_id WHERE w.organization_id=${b.add(org)} AND w.id=${b.add(entry)} AND w.state='waiting' AND o.program_id=${b.add(program)} AND o.location_id=${b.add(location)} AND NOT EXISTS(SELECT 1 FROM volunteer_assignments a WHERE a.organization_id=w.organization_id AND a.occurrence_id=w.occurrence_id AND a.person_id=w.person_id AND a.status='confirmed'))`
 try{await guardedBatch(ctx,`(${allowed}) AND ${scope}`,b.values,[
  ctx.db.prepare("UPDATE volunteer_offers SET state=CASE WHEN expires_at<=? THEN 'expired' ELSE 'withdrawn' END WHERE organization_id=? AND waitlist_id=? AND state='offered'").bind(now,org,entry),
  ctx.db.prepare("UPDATE volunteer_waitlist SET state='withdrawn' WHERE organization_id=? AND id=? AND state='waiting'").bind(org,entry),
  event(ctx,org,entry,null,'leave',note),receiptInsert(ctx,org,'leave',digest,entry),
 ])}catch(error){if(isConflict(error)){const saved=await replay();if(saved)return saved;throw new Stage0Error('conflict')}throw error}
 return {id:entry}
}

/** One scoped queue combines waiting, open offers and the current assignment. */
export async function listWaitlist(ctx:RequestContext,principal:Principal,org:string,occurrence:string,program:string,location:string,cursor?:string){
 if(![org,occurrence,program,location].every(valid))throw new Stage0Error('invalid_input')
 await loadLiveSession(ctx,principal)
 const scope=['waitlist',org,occurrence,program,location],position=cursor===undefined?undefined:decodeWorkflowCursor(cursor,scope,1)
 const b=new Bindings(),now=ctx.clock.now(),allowed=volunteerWritePredicate(b,principal,org,{kind:'program_location',programId:program,locationId:location},'assignment.manage',now)
 const after=position?`AND (w.created_at>${b.add(position.time)} OR (w.created_at=${b.add(position.time)} AND w.id>${b.add(position.ids[0])}))`:''
 const rows=await ctx.db.prepare(`SELECT w.id,w.created_at AS queuedAt,w.person_id AS personId,p.display_name AS name,w.role_id AS roleId,r.name AS role,v.state AS readiness,
  CASE WHEN w.state='withdrawn' THEN 'withdrawn' WHEN EXISTS(SELECT 1 FROM volunteer_assignments a WHERE a.organization_id=w.organization_id AND a.occurrence_id=w.occurrence_id AND a.person_id=w.person_id AND a.status='confirmed') THEN 'assigned'
  WHEN x.id IS NOT NULL AND x.expires_at>${b.add(now)} THEN 'offered' ELSE 'waiting' END AS state,
  CASE WHEN x.expires_at>${b.add(now)} THEN x.id ELSE NULL END AS offerId,CASE WHEN x.expires_at>${b.add(now)} THEN x.expires_at ELSE NULL END AS offerExpiresAt
  FROM volunteer_waitlist w JOIN volunteer_occurrences o ON o.organization_id=w.organization_id AND o.id=w.occurrence_id
  JOIN volunteer_people p ON p.organization_id=w.organization_id AND p.id=w.person_id JOIN volunteer_role_requirements r ON r.organization_id=w.organization_id AND r.occurrence_id=w.occurrence_id AND r.role_id=w.role_id
  LEFT JOIN volunteer_effective_readiness v ON v.organization_id=w.organization_id AND v.occurrence_id=w.occurrence_id AND v.role_id=w.role_id AND v.person_id=w.person_id
  LEFT JOIN volunteer_offers x ON x.organization_id=w.organization_id AND x.waitlist_id=w.id AND x.state='offered'
  WHERE w.organization_id=${b.add(org)} AND w.occurrence_id=${b.add(occurrence)} AND o.program_id=${b.add(program)} AND o.location_id=${b.add(location)} AND (${allowed}) ${after} ORDER BY w.created_at,w.id LIMIT 101`).bind(...b.values).all<{id:string;queuedAt:number}>()
 const entries=rows.results.slice(0,100),last=entries.at(-1)
 return {entries,truncated:rows.results.length>100,nextCursor:rows.results.length>100 && last?encodeWorkflowCursor(scope,{time:last.queuedAt,ids:[last.id]}):null}
}
