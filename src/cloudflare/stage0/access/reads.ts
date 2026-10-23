import type {OrganizationSnapshot,Principal,RequestContext,Scope} from '../contracts'
import {Stage0Error} from '../errors'
import {loadLiveSession} from '../auth/sessions'
import {Bindings,accessPredicate} from './policy'
import {authorizeOrganization,getOrganization} from './organizations'

export interface PageInput {limit?:number;cursor?:string}
export interface OrganizationPage {organizations:OrganizationSnapshot[];nextCursor:string|null}
export interface PolicySnapshot {organizationId:string;status:'proposed';assignmentReview:'staff_reviewed';eligibilityBypass:boolean;automaticHourApproval:boolean;version:number;createdAt:number}
const auditActions=['organization.create','organization.update','invitation.create','invitation.resend','invitation.revoke','invitation.accept','invitation.expire','membership.grants','membership.revoke','ownership.request','ownership.accept','ownership.revoke'] as const
export interface AccessAuditSnapshot {id:string;actorAccountId:string;action:typeof auditActions[number];resourceId:string;requestId:string;createdAt:number}
export interface AuditPage {events:AccessAuditSnapshot[];nextCursor:string|null}
const scope:Scope={kind:'organization'}
function invalid():never{throw new Stage0Error('invalid_input')}
function identifier(value:unknown):string{if(typeof value!=='string'||!value||value.length>256||/\p{Cc}/u.test(value))return invalid();return value}
function page(input:PageInput){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['limit','cursor'].includes(key)))return invalid()
 const limit=input.limit===undefined?50:input.limit
 if(!Number.isInteger(limit)||limit<1||limit>100||(input.cursor!==undefined&&(typeof input.cursor!=='string'||!input.cursor)))return invalid()
 return {limit,cursor:input.cursor}
}
/** Each returned organization is checked against the same live policy used by
 * protected commands. Selecting an organization cannot create authority there.
 */
export async function listAccessibleOrganizations(ctx:RequestContext,principal:Principal,input:PageInput={}):Promise<OrganizationPage>{
 const {limit,cursor}=page(input)
 if(cursor!==undefined)identifier(cursor)
 await loadLiveSession(ctx,principal)
 const b=new Bindings(),allowed=accessPredicate(b,principal,'row','organization.read',scope,ctx.clock.now(),'organization')
 const result=await ctx.db.prepare(`SELECT listed.id,listed.name,listed.version,listed.time_zone,listed.contact_email FROM organizations listed WHERE (${allowed})${cursor!==undefined?` AND listed.id>${b.add(cursor)}`:''} ORDER BY listed.id LIMIT ${b.add(limit+1)}`).bind(...b.values).all<{id:string;name:string;version:number;time_zone:string;contact_email:string|null}>()
 const rows=result.results.slice(0,limit)
 return {organizations:rows.map(row=>({id:row.id,name:row.name,version:row.version,timeZone:row.time_zone,contactEmail:row.contact_email})),nextCursor:result.results.length>limit?rows.at(-1)!.id:null}
}
export async function getOrganizationPolicies(ctx:RequestContext,principal:Principal,organizationId:string):Promise<PolicySnapshot>{
 const org=identifier(organizationId)
 await getOrganization(ctx,principal,org)
 const b=new Bindings(),allowed=accessPredicate(b,principal,org,'organization.read',scope,ctx.clock.now())
 const row=await ctx.db.prepare(`SELECT p.organization_id,p.status,p.assignment_review,p.eligibility_bypass,p.automatic_hour_approval,p.version,p.created_at FROM organization_policies p WHERE p.organization_id=${b.add(org)} AND (${allowed})`).bind(...b.values).first<{organization_id:string;status:'proposed';assignment_review:'staff_reviewed';eligibility_bypass:number;automatic_hour_approval:number;version:number;created_at:number}>()
 if(!row)throw new Stage0Error('not_found')
 return {organizationId:row.organization_id,status:row.status,assignmentReview:row.assignment_review,eligibilityBypass:Boolean(row.eligibility_bypass),automaticHourApproval:Boolean(row.automatic_hour_approval),version:row.version,createdAt:row.created_at}
}
function encodeCursor(org:string,time:number,id:string):string{return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify([1,org,time,id])))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')}
function decodeCursor(cursor:string,org:string):{time:number;id:string}{
 try{
  if(cursor.length>2048||!/^[A-Za-z0-9_-]+$/.test(cursor))return invalid()
  const value:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(Uint8Array.from(atob(cursor.replaceAll('-','+').replaceAll('_','/')),char=>char.charCodeAt(0))))
  if(!Array.isArray(value)||value.length!==4||value[0]!==1||value[1]!==org||!Number.isSafeInteger(value[2])||value[2]<0)return invalid()
  const id=identifier(value[3]),time=value[2] as number
  if(encodeCursor(org,time,id)!==cursor)return invalid()
  return {time,id}
 }catch{return invalid()}
}
/** Access-management history only. Cursors select a position, never permission;
 * every page rechecks organization-level audit authority inside the SELECT.
 */
export async function listAccessAudit(ctx:RequestContext,principal:Principal,organizationId:string,input:PageInput={}):Promise<AuditPage>{
 const org=identifier(organizationId),{limit,cursor}=page(input),position=cursor===undefined?undefined:decodeCursor(cursor,org)
 await authorizeOrganization(ctx,principal,org,'audit.read',scope)
 const b=new Bindings(),allowed=accessPredicate(b,principal,org,'audit.read',scope,ctx.clock.now())
 const actions=auditActions.map(action=>b.add(action)).join(',')
 const before=position?` AND (e.created_at<${b.add(position.time)} OR (e.created_at=${b.add(position.time)} AND e.id<${b.add(position.id)}))`:''
 const result=await ctx.db.prepare(`SELECT e.id,e.actor_account_id,e.action,e.resource_id,e.request_id,e.created_at FROM audit_events e WHERE e.organization_id=${b.add(org)} AND e.action IN (${actions}) AND (${allowed})${before} ORDER BY e.created_at DESC,e.id DESC LIMIT ${b.add(limit+1)}`).bind(...b.values).all<{id:string;actor_account_id:string;action:AccessAuditSnapshot['action'];resource_id:string;request_id:string;created_at:number}>()
 const rows=result.results.slice(0,limit),last=rows.at(-1)
 return {events:rows.map(row=>({id:row.id,actorAccountId:row.actor_account_id,action:row.action,resourceId:row.resource_id,requestId:row.request_id,createdAt:row.created_at})),nextCursor:result.results.length>limit?encodeCursor(org,last!.created_at,last!.id):null}
}
