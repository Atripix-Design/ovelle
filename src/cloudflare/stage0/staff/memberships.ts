import type {CommandContext,Grant,Principal,RequestContext,Scope} from '../contracts'
import {Stage0Error} from '../errors'
import {auditStatement} from '../db'
import {withReceipt,commit} from '../commands'
import {getOrganization,authorizeOrganization} from '../access/organizations'
import {Bindings,accessPredicate} from '../access/policy'
import {identifier,version,normalizedGrants} from './validation'

export interface MembershipSnapshot {id:string;organizationId:string;accountId:string;preset:'admin'|'coordinator';state:'active'|'revoked';version:number}
export interface RevokeMembershipInput {organizationId:string;membershipId:string;expectedVersion:number}
export interface ChangeGrantsInput extends RevokeMembershipInput {grants:Grant[];preset?:'admin'|'coordinator'}
interface Member {id:string;organization_id:string;account_id:string;preset:MembershipSnapshot['preset'];state:MembershipSnapshot['state'];version:number}
const scope:Scope={kind:'organization'}
const snapshot=(m:Member):MembershipSnapshot=>({id:m.id,organizationId:m.organization_id,accountId:m.account_id,preset:m.preset,state:m.state,version:m.version})
function normalize(input:RevokeMembershipInput){if(!input||typeof input!=='object')throw new Stage0Error('invalid_input');return {organizationId:identifier(input.organizationId),membershipId:identifier(input.membershipId),expectedVersion:version(input.expectedVersion)}}
/** Current target grant containment applies to removal too: an administrator
 * cannot erase responsibilities in another administrator's delegated scope.
 * Historical/archived dimensions remain comparable; new grants need live scopes.
 */
function manager(ctx:CommandContext,b:Bindings,org:string,id:string,preset?:MembershipSnapshot['preset']):string {
 const owner=accessPredicate(b,ctx.principal,org,'staff.manage_admins',scope,ctx.clock.now())
 const recent=`EXISTS(SELECT 1 FROM stage0_live_sessions WHERE id=${b.add(ctx.principal.sessionId)} AND passkey_verified_at>${b.add(ctx.clock.now()-300000)})`
 const coordinator=accessPredicate(b,ctx.principal,org,'staff.manage_coordinators',scope,ctx.clock.now())
 return `EXISTS(SELECT 1 FROM organization_memberships target JOIN organizations o ON o.id=target.organization_id
 WHERE target.id=${b.add(id)} AND target.organization_id=${b.add(org)} AND target.account_id!=o.owner_account_id
 AND (((${preset==='admin'?'1':"target.preset='admin'"}) AND (${owner}) AND ${recent}) OR ((${preset==='admin'?'0':"target.preset='coordinator'"}) AND (${coordinator}) AND
 (o.owner_account_id=${b.add(ctx.principal.accountId)} OR NOT EXISTS(SELECT 1 FROM membership_grants old WHERE old.membership_id=target.id AND old.organization_id=o.id
 AND NOT EXISTS(SELECT 1 FROM membership_grants g JOIN organization_memberships actor ON actor.id=g.membership_id AND actor.organization_id=g.organization_id
 WHERE actor.account_id=${b.add(ctx.principal.accountId)} AND actor.organization_id=o.id AND actor.state='active' AND g.action=old.action
 AND (g.scope_kind='organization' OR (old.scope_kind='program_location' AND (g.program_id IS NULL OR g.program_id=old.program_id) AND (g.location_id IS NULL OR g.location_id=old.location_id)))))))))`
}
async function member(ctx:RequestContext,org:string,id:string):Promise<Member>{
 const row=await ctx.db.prepare('SELECT * FROM organization_memberships WHERE organization_id=? AND id=?').bind(org,id).first<Member>()
 if(!row)throw new Stage0Error('not_found');return row
}
async function mutate(ctx:CommandContext,input:RevokeMembershipInput,grants?:Grant[],preset?:MembershipSnapshot['preset']):Promise<MembershipSnapshot>{
 const normalized=normalize(input),org=normalized.organizationId
 await getOrganization(ctx,ctx.principal,org)
 const target=await member(ctx,org,normalized.membershipId)
 // Hash the caller's explicit role choice, not mutable membership state, so a
 // receipt remains replayable after a later role change. Enforce the effective
 // role's grant vocabulary only when applying a new command.
 const reviewed=grants===undefined?undefined:normalizedGrants(grants,'admin')
 const command=reviewed===undefined?'membership.revoke':'membership.grants'
 return withReceipt(ctx,command,org,{...normalized,...(reviewed===undefined?{}:{grants:reviewed,preset:preset??null})},b=>manager(ctx,b,org,target.id,preset),async digest=>{
  const effectivePreset=preset??target.preset
  if(reviewed)normalizedGrants(reviewed,effectivePreset)
  const b=new Bindings(),allowed=manager(ctx,b,org,target.id,preset)
  if(!await ctx.db.prepare(`SELECT 1 WHERE ${allowed}`).bind(...b.values).first())throw new Stage0Error('forbidden')
  // Only promotion needs credential readiness; an administrator who loses a key
  // must still be removable. The same predicate runs inside the final batch.
  const promotionReady=preset==='admin'?`EXISTS(SELECT 1 FROM organization_memberships target JOIN accounts a ON a.id=target.account_id WHERE target.id=${b.add(target.id)} AND target.organization_id=${b.add(org)} AND (target.preset='admin' OR (a.disabled_at IS NULL AND a.email_verified_at IS NOT NULL AND EXISTS(SELECT 1 FROM passkey_credentials p WHERE p.account_id=a.id AND p.disabled_at IS NULL))))`:'1'
  if(!await ctx.db.prepare(`SELECT 1 WHERE (${allowed}) AND (${promotionReady})`).bind(...b.values).first())throw new Stage0Error('forbidden')
  if(reviewed)for(const grant of reviewed)await authorizeOrganization(ctx,ctx.principal,org,grant.action,grant.scope)
  const coverage=(reviewed??[]).map(grant=>accessPredicate(b,ctx.principal,org,grant.action,grant.scope,ctx.clock.now()))
  const guard=`(${allowed}) AND (${promotionReady}) AND EXISTS(SELECT 1 FROM organization_memberships WHERE id=${b.add(target.id)} AND organization_id=${b.add(org)} AND version=${b.add(normalized.expectedVersion)} AND state='active')${coverage.map(predicate=>` AND (${predicate})`).join('')}`
  const result={...snapshot(target),preset:effectivePreset,version:normalized.expectedVersion+1,state:reviewed===undefined?'revoked' as const:'active' as const}
  const statements=[ctx.db.prepare('UPDATE organization_memberships SET state=?,preset=?,version=version+1 WHERE id=? AND organization_id=?').bind(result.state,result.preset,target.id,org),ctx.db.prepare('DELETE FROM membership_grants WHERE membership_id=? AND organization_id=?').bind(target.id,org),
   ...(reviewed??[]).map(grant=>ctx.db.prepare('INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind,program_id,location_id) VALUES(?,?,?,?,?,?,?)').bind(ctx.ids.next(),target.id,org,grant.action,grant.scope.kind,grant.scope.kind==='program_location'?grant.scope.programId??null:null,grant.scope.kind==='program_location'?grant.scope.locationId??null:null)),auditStatement(ctx,command,target.id,ctx.principal,org)]
  return commit(ctx,command,org,org,digest,b,guard,statements,result)
 })
}
export async function changeMembershipGrants(ctx:CommandContext,input:ChangeGrantsInput):Promise<MembershipSnapshot>{
 if(!input||!Array.isArray(input.grants))throw new Stage0Error('invalid_input')
 if(input.preset!==undefined&&input.preset!=='admin'&&input.preset!=='coordinator')throw new Stage0Error('invalid_input')
 return mutate(ctx,input,input.grants,input.preset)
}
export async function revokeMembership(ctx:CommandContext,input:RevokeMembershipInput):Promise<MembershipSnapshot>{return mutate(ctx,input)}
function readable(ctx:RequestContext,principal:Principal,b:Bindings,org:string):string{
 const own=accessPredicate(b,principal,org,'organization.read',scope,ctx.clock.now()),staff=accessPredicate(b,principal,org,'staff.read',scope,ctx.clock.now())
 return `((${own}) AND m.account_id=${b.add(principal.accountId)}) OR (${staff})`
}
export async function listMemberships(ctx:RequestContext,principal:Principal,organizationId:string):Promise<MembershipSnapshot[]>{
 await getOrganization(ctx,principal,organizationId)
 const b=new Bindings(),allowed=readable(ctx,principal,b,organizationId)
 const result=await ctx.db.prepare(`SELECT m.* FROM organization_memberships m WHERE m.organization_id=${b.add(organizationId)} AND (${allowed}) ORDER BY m.id LIMIT 100`).bind(...b.values).all<Member>()
 return result.results.map(snapshot)
}
export async function getMembership(ctx:RequestContext,principal:Principal,organizationId:string,id:string):Promise<MembershipSnapshot & {grants:Grant[]}>{
 await getOrganization(ctx,principal,organizationId)
 const b=new Bindings(),allowed=readable(ctx,principal,b,organizationId),where=`m.organization_id=${b.add(organizationId)} AND m.id=${b.add(id)} AND (${allowed})`
 const found=await ctx.db.prepare(`SELECT m.* FROM organization_memberships m WHERE ${where}`).bind(...b.values).first<Member>()
 if(!found)throw new Stage0Error('not_found')
 const grants=await ctx.db.prepare(`SELECT g.action,g.scope_kind,g.program_id,g.location_id FROM membership_grants g JOIN organization_memberships m ON m.id=g.membership_id AND m.organization_id=g.organization_id WHERE ${where} ORDER BY g.id`).bind(...b.values).all<{action:Grant['action'];scope_kind:Scope['kind'];program_id:string|null;location_id:string|null}>()
 return {...snapshot(found),grants:grants.results.map(g=>({action:g.action,scope:g.scope_kind==='organization'?scope:{kind:'program_location',...(g.program_id?{programId:g.program_id}:{}),...(g.location_id?{locationId:g.location_id}:{})} as Scope}))}
}
