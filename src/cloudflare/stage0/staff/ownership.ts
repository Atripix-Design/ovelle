import type {CommandContext,OrganizationSnapshot,Principal,RequestContext,Scope} from '../contracts'
import {Stage0Error} from '../errors'
import {auditStatement} from '../db'
import {withReceipt,commit} from '../commands'
import {Bindings,accessPredicate} from '../access/policy'
import {getOrganization} from '../access/organizations'
import {identifier,version} from './validation'

export interface TransferInput {organizationId:string;targetMembershipId:string;expectedOwnerVersion:number;expectedTargetVersion:number}
export interface AcceptTransferInput {organizationId:string;transferId:string;expectedVersion:number}
export interface TransferSnapshot {id:string;organizationId:string;initiatorAccountId:string;targetAccountId:string;targetMembershipId:string;state:'pending'|'accepted'|'revoked'|'expired';version:number;expiresAt:number}
interface TransferRow {id:string;organization_id:string;initiator_account_id:string;source_session_id:string;source_transport:Principal['transport'];target_account_id:string;target_membership_id:string;target_membership_version:number;organization_version:number;state:'pending'|'accepted'|'revoked';version:number;expires_at:number}
const scope:Scope={kind:'organization'}
function snapshot(row:TransferRow,now:number):TransferSnapshot{return {id:row.id,organizationId:row.organization_id,initiatorAccountId:row.initiator_account_id,targetAccountId:row.target_account_id,targetMembershipId:row.target_membership_id,state:row.state==='pending'&&row.expires_at<=now?'expired':row.state,version:row.version,expiresAt:row.expires_at}}
function recent(ctx:CommandContext,b:Bindings):string{return `EXISTS(SELECT 1 FROM stage0_live_sessions WHERE id=${b.add(ctx.principal.sessionId)} AND account_id=${b.add(ctx.principal.accountId)} AND transport=${b.add(ctx.principal.transport)} AND assurance='passkey' AND passkey_verified_at>${b.add(ctx.clock.now()-300000)} AND passkey_verified_at<=${b.add(ctx.clock.now())})`}
function owner(ctx:CommandContext,b:Bindings,org:string):string{return `(${accessPredicate(b,ctx.principal,org,'ownership.transfer',scope,ctx.clock.now())}) AND ${recent(ctx,b)}`}
function ready(b:Bindings,org:string,id:string,targetVersion:number,account?:string):string{return `EXISTS(SELECT 1 FROM organization_memberships m JOIN accounts a ON a.id=m.account_id JOIN organizations o ON o.id=m.organization_id WHERE m.id=${b.add(id)} AND m.organization_id=${b.add(org)} AND m.version=${b.add(targetVersion)} AND m.state='active' AND m.preset='admin' AND m.account_id!=o.owner_account_id AND a.disabled_at IS NULL AND a.email_verified_at IS NOT NULL ${account?`AND m.account_id=${b.add(account)}`:''} AND EXISTS(SELECT 1 FROM passkey_credentials p WHERE p.account_id=m.account_id AND p.disabled_at IS NULL))`}
async function allowed(ctx:RequestContext,b:Bindings,predicate:string):Promise<boolean>{return Boolean(await ctx.db.prepare(`SELECT 1 WHERE ${predicate}`).bind(...b.values).first())}
function transition(input:AcceptTransferInput){if(!input||typeof input!=='object')throw new Stage0Error('invalid_input');return {organizationId:identifier(input.organizationId),transferId:identifier(input.transferId),expectedVersion:version(input.expectedVersion)}}
async function row(ctx:RequestContext,org:string,id:string):Promise<TransferRow>{const found=await ctx.db.prepare('SELECT * FROM ownership_transfer_requests WHERE organization_id=? AND id=?').bind(org,id).first<TransferRow>();if(!found)throw new Stage0Error('not_found');return found}
export async function requestOwnershipTransfer(ctx:CommandContext,input:TransferInput):Promise<TransferSnapshot>{
 if(!input||typeof input!=='object')throw new Stage0Error('invalid_input')
 const normalized={organizationId:identifier(input.organizationId),targetMembershipId:identifier(input.targetMembershipId),expectedOwnerVersion:version(input.expectedOwnerVersion),expectedTargetVersion:version(input.expectedTargetVersion)},org=normalized.organizationId
 await getOrganization(ctx,ctx.principal,org)
 return withReceipt(ctx,'ownership.request',org,normalized,b=>owner(ctx,b,org),async digest=>{
  const b=new Bindings(),authority=owner(ctx,b,org),target=ready(b,org,normalized.targetMembershipId,normalized.expectedTargetVersion)
  if(!await allowed(ctx,b,`(${authority}) AND ${target}`))throw new Stage0Error('forbidden')
  const account=await ctx.db.prepare('SELECT account_id FROM organization_memberships WHERE organization_id=? AND id=?').bind(org,normalized.targetMembershipId).first<string>('account_id')
  const now=ctx.clock.now(),id=ctx.ids.next()
  const result:TransferSnapshot={id,organizationId:org,initiatorAccountId:ctx.principal.accountId,targetAccountId:account!,targetMembershipId:normalized.targetMembershipId,state:'pending',version:1,expiresAt:now+900000}
  const guard=`(${authority}) AND ${target} AND ${ready(b,org,normalized.targetMembershipId,normalized.expectedTargetVersion,account!)} AND EXISTS(SELECT 1 FROM organizations WHERE id=${b.add(org)} AND version=${b.add(normalized.expectedOwnerVersion)})`
  return commit(ctx,'ownership.request',org,org,digest,b,guard,[ctx.db.prepare('INSERT INTO ownership_transfer_requests(id,organization_id,initiator_account_id,source_session_id,source_transport,target_membership_id,target_account_id,target_membership_version,organization_version,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,org,ctx.principal.accountId,ctx.principal.sessionId,ctx.principal.transport,normalized.targetMembershipId,account!,normalized.expectedTargetVersion,normalized.expectedOwnerVersion,now,now+900000),auditStatement(ctx,'ownership.request',id,ctx.principal,org)],result)
 })
}
/** The initiating session must stay live, but its recent confirmation is evaluated
 * at request time. Requiring five-minute recency again would erase the promised
 * fifteen-minute acceptance window. Target confirmation is always current.
 */
function acceptance(ctx:CommandContext,b:Bindings,transfer:TransferRow):string{
 const source={...ctx.principal,accountId:transfer.initiator_account_id,sessionId:transfer.source_session_id,transport:transfer.source_transport}
 return `(${accessPredicate(b,ctx.principal,transfer.organization_id,'organization.read',scope,ctx.clock.now())}) AND ${recent(ctx,b)}
 AND ${b.add(ctx.principal.accountId)}=${b.add(transfer.target_account_id)} AND ${ready(b,transfer.organization_id,transfer.target_membership_id,transfer.target_membership_version,transfer.target_account_id)}
 AND (${accessPredicate(b,source,transfer.organization_id,'organization.read',scope,ctx.clock.now())})
 AND EXISTS(SELECT 1 FROM stage0_live_sessions WHERE id=${b.add(transfer.source_session_id)} AND assurance='passkey')
 AND EXISTS(SELECT 1 FROM organizations WHERE id=${b.add(transfer.organization_id)} AND version=${b.add(transfer.organization_version)} AND owner_account_id=${b.add(transfer.initiator_account_id)})`
}
export async function acceptOwnershipTransfer(ctx:CommandContext,input:AcceptTransferInput):Promise<OrganizationSnapshot>{
 const normalized=transition(input),org=normalized.organizationId
 await getOrganization(ctx,ctx.principal,org)
 const transfer=await row(ctx,org,normalized.transferId)
 return withReceipt(ctx,'ownership.accept',org,normalized,b=>accessPredicate(b,ctx.principal,org,'organization.read',scope,ctx.clock.now()),async digest=>{
  const check=new Bindings()
  // Wrong recipient/assurance is an authentication denial; later authority/version
  // invalidation is a transactional conflict, not an invitation to retry blindly.
  if(ctx.principal.accountId!==transfer.target_account_id||!await allowed(ctx,check,recent(ctx,check)))throw new Stage0Error('forbidden')
  const organization=await getOrganization(ctx,ctx.principal,org),b=new Bindings(),now=ctx.clock.now()
  const guard=`${acceptance(ctx,b,transfer)} AND EXISTS(SELECT 1 FROM ownership_transfer_requests WHERE id=${b.add(transfer.id)} AND organization_id=${b.add(org)} AND state='pending' AND version=${b.add(normalized.expectedVersion)} AND expires_at>${b.add(now)})`
  const result={...organization,version:transfer.organization_version+1}
  return commit(ctx,'ownership.accept',org,org,digest,b,guard,[ctx.db.prepare("UPDATE ownership_transfer_requests SET state='accepted',version=version+1,finished_at=? WHERE id=?").bind(now,transfer.id),ctx.db.prepare('UPDATE organizations SET owner_account_id=?,version=version+1 WHERE id=?').bind(transfer.target_account_id,org),auditStatement(ctx,'ownership.accept',transfer.id,ctx.principal,org)],result)
 })
}
export async function revokeOwnershipTransfer(ctx:CommandContext,input:AcceptTransferInput):Promise<TransferSnapshot>{
 const normalized=transition(input),org=normalized.organizationId
 await getOrganization(ctx,ctx.principal,org)
 const transfer=await row(ctx,org,normalized.transferId)
 return withReceipt(ctx,'ownership.revoke',org,normalized,b=>owner(ctx,b,org),async digest=>{
  const b=new Bindings(),authority=owner(ctx,b,org),now=ctx.clock.now()
  if(!await allowed(ctx,b,authority))throw new Stage0Error('forbidden')
  const guard=`(${authority}) AND EXISTS(SELECT 1 FROM ownership_transfer_requests WHERE id=${b.add(transfer.id)} AND state='pending' AND version=${b.add(normalized.expectedVersion)} AND expires_at>${b.add(now)})`
  return commit(ctx,'ownership.revoke',org,org,digest,b,guard,[ctx.db.prepare("UPDATE ownership_transfer_requests SET state='revoked',version=version+1,finished_at=? WHERE id=?").bind(now,transfer.id),auditStatement(ctx,'ownership.revoke',transfer.id,ctx.principal,org)],{...snapshot(transfer,now),state:'revoked',version:normalized.expectedVersion+1} as TransferSnapshot)
 })
}
export async function getOwnershipTransfer(ctx:RequestContext,principal:Principal,organizationId:string,id:string):Promise<TransferSnapshot>{
 await getOrganization(ctx,principal,organizationId)
 const b=new Bindings(),read=accessPredicate(b,principal,organizationId,'organization.read',scope,ctx.clock.now())
 const found=await ctx.db.prepare(`SELECT t.* FROM ownership_transfer_requests t JOIN organizations o ON o.id=t.organization_id WHERE t.id=${b.add(id)} AND t.organization_id=${b.add(organizationId)} AND (${read}) AND (o.owner_account_id=${b.add(principal.accountId)} OR t.target_account_id=${b.add(principal.accountId)})`).bind(...b.values).first<TransferRow>()
 if(!found)throw new Stage0Error('not_found');return snapshot(found,ctx.clock.now())
}
