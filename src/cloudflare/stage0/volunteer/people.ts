import type {CommandContext,Principal,RequestContext} from '../contracts'
import {Bindings,guardedBatch} from '../db'
import {exactObject} from '../domain/input'
import {Stage0Error} from '../errors'
import {loadLiveSession} from '../auth/sessions'
import {secretDigest} from '../auth/secrets'
import {volunteerWritePredicate} from './policy'
import {decodeWorkflowCursor,encodeWorkflowCursor} from './pagination'

/** Creates a minimal record. A name alone does not establish unique identity. */
export async function createVolunteer(ctx:CommandContext,value:unknown):Promise<{id:string}> {
  const input=exactObject(value,['organizationId','programId','locationId','displayName'],true)
  if (!Object.values(input).every(v=>typeof v==='string' && !!v.trim() && v.length<=200 && !/\p{Cc}/u.test(v))) throw new Stage0Error('invalid_input')
  if (typeof ctx.idempotencyKey!=='string' || !/^[A-Za-z0-9_-]{16,128}$/.test(ctx.idempotencyKey)) throw new Stage0Error('invalid_input')
  const {organizationId:org,programId:program,locationId:location,displayName}=input as Record<string,string>
  const name=displayName.trim()
  await loadLiveSession(ctx,ctx.principal)
  const digest=await secretDigest(JSON.stringify(['volunteer-person-v1',org,program,location,name]))
  const replay=async():Promise<{id:string}|null>=>{
    const row=await ctx.db.prepare('SELECT request_digest,person_id FROM volunteer_people_receipts WHERE actor_account_id=? AND organization_id=? AND idempotency_key=?').bind(ctx.principal.accountId,org,ctx.idempotencyKey).first<{request_digest:string;person_id:string}>()
    if(!row)return null
    const b=new Bindings(),policy=volunteerWritePredicate(b,ctx.principal,org,{kind:'program_location',programId:program,locationId:location},'people.create',ctx.clock.now())
    if(!await ctx.db.prepare(`SELECT 1 WHERE ${policy}`).bind(...b.values).first())throw new Stage0Error('not_found')
    if(row.request_digest!==digest)throw new Stage0Error('conflict')
    return {id:row.person_id}
  }
  const existing=await replay();if(existing)return existing
  const b=new Bindings(),policy=volunteerWritePredicate(b,ctx.principal,org,{kind:'program_location',programId:program,locationId:location},'people.create',ctx.clock.now())
  const id=ctx.ids.next()
  try {await guardedBatch(ctx,policy,b.values,[
    ctx.db.prepare('INSERT INTO volunteer_people VALUES(?,?,?,?)').bind(id,org,name,ctx.clock.now()),
    ctx.db.prepare('INSERT INTO volunteer_people_scopes VALUES(?,?,?,?)').bind(org,id,program,location),
    ctx.db.prepare('INSERT INTO volunteer_people_receipts VALUES(?,?,?,?,?)').bind(ctx.principal.accountId,org,ctx.idempotencyKey,digest,id),
    ctx.db.prepare('INSERT INTO volunteer_people_events VALUES(?,?,?,?,?,?,?)').bind(ctx.ids.next(),org,id,ctx.principal.accountId,ctx.principal.sessionId,ctx.requestId,ctx.clock.now()),
  ])} catch(error) {
    if ((error instanceof Stage0Error && error.code==='conflict') || (error instanceof Error && error.message.includes('UNIQUE constraint failed'))) {const saved=await replay();if(saved)return saved;throw new Stage0Error('conflict')}
    throw error
  }
  return {id}
}

/** Staff directory returns only people explicitly registered in this scope. */
export async function listVolunteers(ctx:RequestContext,principal:Principal,organizationId:string,programId:string,locationId:string,cursor?:string,search?:string) {
  if (![organizationId,programId,locationId].every(v=>typeof v==='string' && !!v.trim() && v.length<=200 && !/\p{Cc}/u.test(v))) throw new Stage0Error('invalid_input')
  if(search!==undefined && (typeof search!=='string' || search.trim().length<2 || search.trim().length>100 || /\p{Cc}/u.test(search)))throw new Stage0Error('invalid_input')
  await loadLiveSession(ctx,principal)
  const term=search?.trim(),scope=['people',organizationId,programId,locationId,...(term===undefined?[]:[await secretDigest(term)])],position=cursor===undefined?undefined:decodeWorkflowCursor(cursor,scope,1)
  if(position && position.time!==0)throw new Stage0Error('invalid_input')
  const b=new Bindings(),policy=volunteerWritePredicate(b,principal,organizationId,{kind:'program_location',programId,locationId},'people.read',ctx.clock.now())
  const filter=term===undefined?'':`AND instr(lower(p.display_name),lower(${b.add(term)}))>0`
  const after=position?`AND EXISTS(SELECT 1 FROM volunteer_people previous JOIN volunteer_people_scopes ps ON ps.organization_id=previous.organization_id AND ps.person_id=previous.id WHERE previous.organization_id=${b.add(organizationId)} AND previous.id=${b.add(position.ids[0])} AND ps.program_id=${b.add(programId)} AND ps.location_id=${b.add(locationId)} AND (p.display_name>previous.display_name OR (p.display_name=previous.display_name AND p.id>previous.id)))`:''
  const rows=await ctx.db.prepare(`SELECT p.id,p.display_name AS displayName FROM volunteer_people p JOIN volunteer_people_scopes s ON s.organization_id=p.organization_id AND s.person_id=p.id WHERE s.organization_id=${b.add(organizationId)} AND s.program_id=${b.add(programId)} AND s.location_id=${b.add(locationId)} AND (${policy}) ${filter} ${after} ORDER BY p.display_name,p.id LIMIT 101`).bind(...b.values).all<{id:string}>()
  const volunteers=rows.results.slice(0,100),last=volunteers.at(-1)
  return {volunteers,truncated:rows.results.length>100,nextCursor:rows.results.length>100 && last?encodeWorkflowCursor(scope,{time:0,ids:[last.id]}):null}
}
