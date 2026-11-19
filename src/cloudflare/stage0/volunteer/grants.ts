import type {CommandContext,Principal,RequestContext} from '../contracts'
import {Bindings,guardedBatch} from '../db'
import {exactObject} from '../domain/input'
import {Stage0Error} from '../errors'
import {secretDigest} from '../auth/secrets'
import {loadLiveSession} from '../auth/sessions'
import {accessPredicate} from '../access/policy'
import {volunteerActions} from './policy'

const actions=new Set<string>(volunteerActions)
const valid=(v:unknown):v is string=>typeof v==='string' && !!v.trim() && v.length<=256 && !/\p{Cc}/u.test(v)
type Grant={action:string;programId:string;locationId:string}
function normalize(value:unknown):Grant[]{
 if(!Array.isArray(value) || value.length>100)throw new Stage0Error('invalid_input')
 const result=value.map(item=>{const row=exactObject(item,['action','programId','locationId'],true);if(typeof row.action!=='string' || !actions.has(row.action) || !valid(row.programId) || !valid(row.locationId))throw new Stage0Error('invalid_input');return row as Grant})
 result.sort((a,b)=>a.action.localeCompare(b.action)||a.programId.localeCompare(b.programId)||a.locationId.localeCompare(b.locationId))
 if(new Set(result.map(g=>JSON.stringify([g.action,g.programId,g.locationId]))).size!==result.length)throw new Stage0Error('invalid_input')
 return result
}
function owner(ctx:RequestContext,principal:Principal,b:Bindings,org:string){return accessPredicate(b,principal,org,'staff.manage_admins',{kind:'organization'},ctx.clock.now())}

/** Owner-only, recent-passkey grant replacement. Membership version changes
 * invalidate old workflow grants before new ones are inserted in the batch. */
export async function replaceVolunteerGrants(ctx:CommandContext,value:unknown):Promise<{membershipId:string;version:number}>{
 const input=exactObject(value,['organizationId','membershipId','expectedVersion','grants'],true)
 const {organizationId,membershipId,expectedVersion}=input
 if(!valid(organizationId) || !valid(membershipId) || !Number.isSafeInteger(expectedVersion) || (expectedVersion as number)<1 || typeof ctx.idempotencyKey!=='string' || !/^[A-Za-z0-9_-]{16,128}$/.test(ctx.idempotencyKey))throw new Stage0Error('invalid_input')
 const grants=normalize(input.grants),org=organizationId,id=membershipId,version=expectedVersion as number
 await loadLiveSession(ctx,ctx.principal)
 const digest=await secretDigest(JSON.stringify(['volunteer-grants-v1',org,id,version,grants]))
 const replay=async():Promise<{membershipId:string;version:number}|null>=>{
  const row=await ctx.db.prepare('SELECT request_digest,membership_id,result_version FROM volunteer_grant_receipts WHERE actor_account_id=? AND organization_id=? AND idempotency_key=?').bind(ctx.principal.accountId,org,ctx.idempotencyKey).first<{request_digest:string;membership_id:string;result_version:number}>()
  if(!row)return null
  const b=new Bindings(),allowed=owner(ctx,ctx.principal,b,org)
  if(!await ctx.db.prepare(`SELECT 1 WHERE (${allowed}) AND EXISTS(SELECT 1 FROM organization_memberships m WHERE m.id=${b.add(row.membership_id)} AND m.organization_id=${b.add(org)} AND m.state='active')`).bind(...b.values).first())throw new Stage0Error('not_found')
  if(row.request_digest!==digest)throw new Stage0Error('conflict')
  return {membershipId:row.membership_id,version:row.result_version}
 }
 const existing=await replay();if(existing)return existing
 const b=new Bindings(),allowed=owner(ctx,ctx.principal,b,org)
 const target=`EXISTS(SELECT 1 FROM organization_memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.id=${b.add(id)} AND m.organization_id=${b.add(org)} AND m.state='active' AND m.version=${b.add(version)} AND m.account_id!=o.owner_account_id)`
 const coverage=grants.map(grant=>`EXISTS(SELECT 1 FROM organization_memberships m JOIN membership_grants g ON g.membership_id=m.id AND g.organization_id=m.organization_id JOIN programs p ON p.organization_id=m.organization_id AND p.id=${b.add(grant.programId)} AND p.archived_at IS NULL JOIN locations l ON l.organization_id=m.organization_id AND l.id=${b.add(grant.locationId)} AND l.archived_at IS NULL WHERE m.id=${b.add(id)} AND m.organization_id=${b.add(org)} AND g.action='program.read' AND (g.scope_kind='organization' OR ((g.program_id IS NULL OR g.program_id=p.id) AND (g.location_id IS NULL OR g.location_id=l.id))))`)
 try {await guardedBatch(ctx,`(${allowed}) AND ${target}${coverage.map(c=>` AND ${c}`).join('')}`,b.values,[
  ctx.db.prepare('UPDATE organization_memberships SET version=version+1 WHERE organization_id=? AND id=? AND version=?').bind(org,id,version),
  ...grants.map(g=>ctx.db.prepare('INSERT INTO volunteer_grants VALUES(?,?,?,?,?)').bind(id,org,g.action,g.programId,g.locationId)),
  ctx.db.prepare('INSERT INTO volunteer_grant_events VALUES(?,?,?,?,?,?,?,?,?)').bind(ctx.ids.next(),org,id,version+1,JSON.stringify(grants),ctx.principal.accountId,ctx.principal.sessionId,ctx.requestId,ctx.clock.now()),
  ctx.db.prepare('INSERT INTO volunteer_grant_receipts VALUES(?,?,?,?,?,?)').bind(ctx.principal.accountId,org,ctx.idempotencyKey,digest,id,version+1),
 ])}catch(error){if((error instanceof Stage0Error && error.code==='conflict') || (error instanceof Error && error.message.includes('UNIQUE constraint failed'))){const saved=await replay();if(saved)return saved;throw new Stage0Error('conflict')}throw error}
 return {membershipId:id,version:version+1}
}

/** Owners can inspect a member; an active member can inspect only their own grants. */
export async function getVolunteerGrants(ctx:RequestContext,principal:Principal,org:string,id:string){
 if(!valid(org)||!valid(id))throw new Stage0Error('invalid_input')
 await loadLiveSession(ctx,principal)
 const b=new Bindings(),own=accessPredicate(b,principal,org,'organization.read',{kind:'organization'},ctx.clock.now()),manage=owner(ctx,principal,b,org)
 const where=`m.organization_id=${b.add(org)} AND m.id=${b.add(id)} AND m.state='active' AND (((${own}) AND m.account_id=${b.add(principal.accountId)}) OR (${manage}))`
 const member=await ctx.db.prepare(`SELECT m.version FROM organization_memberships m WHERE ${where}`).bind(...b.values).first<{version:number}>()
 if(!member)throw new Stage0Error('not_found')
 const rows=await ctx.db.prepare(`SELECT g.action,g.program_id AS programId,g.location_id AS locationId FROM volunteer_grants g JOIN organization_memberships m ON m.id=g.membership_id AND m.organization_id=g.organization_id WHERE ${where} ORDER BY g.action,g.program_id,g.location_id LIMIT 101`).bind(...b.values).all()
 return {membershipId:id,version:member.version,grants:rows.results.slice(0,100),truncated:rows.results.length>100}
}
