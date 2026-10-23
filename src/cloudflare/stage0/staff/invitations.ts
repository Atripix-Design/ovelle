import type { D1PreparedStatement } from '@cloudflare/workers-types'
import type { CommandContext, Grant, Principal, RequestContext, Scope } from '../contracts'
import { parseAction } from '../contracts'
import { auditStatement } from '../db'
import { withReceipt, commit } from '../commands'
import { Stage0Error } from '../errors'
import { loadLiveSession } from '../auth/sessions'
import { consumeAuthEmailBudget, reserveAuthAttempt, finishAuthAttempt } from '../auth/limits'
import { randomSecret, secretDigest, secretPattern } from '../auth/secrets'
import { accessPredicate, Bindings, validateScope } from '../access/policy'
import { authorizeOrganization, getOrganization } from '../access/organizations'

type Preset = 'admin' | 'coordinator'
type State = 'pending' | 'accepted' | 'revoked' | 'expired'
interface Admission { ip: string; budgetKey: Uint8Array }
export interface CreateInvitationInput { organizationId: string; email: string; preset: Preset; grants: Grant[] }
export interface InvitationCommandInput { organizationId: string; invitationId: string; expectedVersion: number }
export interface AcceptInvitationInput { token: string }
export interface InvitationSnapshot { id: string; organizationId: string; email: string; preset: Preset; state: State; version: number; expiresAt: number; delivery: 'pending' | 'accepted' | 'failed' }
export interface MembershipSnapshot { id: string; organizationId: string; accountId: string; preset: Preset; state: 'active'; version: number }
interface InvitationRow { id: string; organization_id: string; email: string; preset: Preset; state: State; version: number; expires_at: number; delivery: InvitationSnapshot['delivery']; token_digest: string; delivery_version: number }
interface GrantRow { action: Grant['action']; scope_kind: Scope['kind']; program_id: string | null; location_id: string | null }
const lifetime = 259_200_000
const orgScope: Scope = {kind:'organization'}
const coordinatorActions = new Set(['program.read','program.manage','location.read','location.manage'])
function invalid(): never { throw new Stage0Error('invalid_input') }
function identifier(value: unknown): string { if(typeof value!=='string'||!value||value.length>256||/\p{Cc}/u.test(value))return invalid();return value }
function version(value: unknown): number { if(!Number.isSafeInteger(value)||(value as number)<1||(value as number)>=Number.MAX_SAFE_INTEGER)return invalid();return value as number }
function email(value: unknown): string { if(typeof value!=='string'||/\p{Cc}/u.test(value))return invalid();const address=value.trim().toLowerCase();if(address.length>254||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address))return invalid();return address }
function normalizedGrants(value: unknown, preset: Preset): Grant[] {
  if(!Array.isArray(value)||value.length>32)return invalid()
  const grants=value.map((entry: Grant)=>{
    if(!entry||typeof entry!=='object')return invalid()
    let action: Grant['action']
    try { action=parseAction(entry.action) } catch { return invalid() }
    if(action==='staff.manage_admins'||action==='ownership.transfer'||(preset==='coordinator'&&!coordinatorActions.has(action)))return invalid()
    validateScope(entry.scope)
    const scope: Scope=entry.scope.kind==='organization'?orgScope:{kind:'program_location',...('programId' in entry.scope&&entry.scope.programId!==undefined?{programId:identifier(entry.scope.programId)}:{}),...('locationId' in entry.scope&&entry.scope.locationId!==undefined?{locationId:identifier(entry.scope.locationId)}:{})} as Scope
    return {action,scope}
  }).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))
  if(new Set(grants.map(grant=>JSON.stringify(grant))).size!==grants.length)return invalid()
  return grants
}
function snapshot(row: InvitationRow, now: number): InvitationSnapshot { return {id:row.id,organizationId:row.organization_id,email:row.email,preset:row.preset,state:row.state==='pending'&&row.expires_at<=now?'expired':row.state,version:row.version,expiresAt:row.expires_at,delivery:row.delivery} }
function request(input: InvitationCommandInput) { if(!input||typeof input!=='object')return invalid();return {organizationId:identifier(input.organizationId),invitationId:identifier(input.invitationId),expectedVersion:version(input.expectedVersion)} }
async function offered(ctx: RequestContext,id: string): Promise<Grant[]> {
  const rows=await ctx.db.prepare('SELECT action,scope_kind,program_id,location_id FROM invitation_grants WHERE invitation_id=? ORDER BY id').bind(id).all<GrantRow>()
  return rows.results.map(row=>({action:row.action,scope:row.scope_kind==='organization'?orgScope:{kind:'program_location',...(row.program_id!==null?{programId:row.program_id}:{}),...(row.location_id!==null?{locationId:row.location_id}:{})} as Scope}))
}
async function row(ctx: RequestContext,organizationId: string,id: string): Promise<InvitationRow> {
  const found=await ctx.db.prepare('SELECT * FROM staff_invitations WHERE id=? AND organization_id=?').bind(id,organizationId).first<InvitationRow>()
  if(!found)throw new Stage0Error('not_found')
  return found
}
function manager(ctx: CommandContext,b: Bindings,org: string,preset: Preset,address: string): string {
  const owner=accessPredicate(b,ctx.principal,org,'staff.manage_admins',orgScope,ctx.clock.now())
  // Owner-only actions use an exclusive five-minute boundary in this flow.
  const recent=`EXISTS(SELECT 1 FROM stage0_live_sessions WHERE id=${b.add(ctx.principal.sessionId)} AND passkey_verified_at>${b.add(ctx.clock.now()-300_000)})`
  if(preset==='admin')return `(${owner}) AND ${recent}`
  const coor=accessPredicate(b,ctx.principal,org,'staff.manage_coordinators',orgScope,ctx.clock.now())
  const adminTarget=`EXISTS(SELECT 1 FROM organization_memberships m JOIN accounts a ON a.id=m.account_id WHERE m.organization_id=${b.add(org)} AND a.email=${b.add(address)} AND m.preset='admin')`
  return `((${coor}) AND NOT ${adminTarget}) OR ((${owner}) AND ${recent})`
}
async function authorizeManager(ctx: CommandContext,org: string,preset: Preset,address: string,grants?: Grant[]): Promise<void> {
  await getOrganization(ctx,ctx.principal,org)
  const b=new Bindings()
  if(!await ctx.db.prepare(`SELECT 1 WHERE ${manager(ctx,b,org,preset,address)}`).bind(...b.values).first())throw new Stage0Error('forbidden')
  if(grants)for(const grant of grants)await authorizeOrganization(ctx,ctx.principal,org,grant.action,grant.scope)
}
/** Original issuer sessions are evidence, not reusable request credentials. A
 * normal logout/12h expiry doesn't shorten the 72h invite, but security epoch,
 * live membership/grants, credential and federation changes invalidate authority.
 */
function issuerAuthority(b: Bindings,id: string): string {
  return `EXISTS(SELECT 1 FROM staff_invitations i JOIN organizations o ON o.id=i.organization_id
    JOIN sessions s ON s.id=i.issued_session_id AND s.account_id=i.inviter_account_id
    JOIN accounts a ON a.id=s.account_id
    JOIN organization_memberships m ON m.organization_id=o.id AND m.account_id=a.id
    LEFT JOIN stage0_trusted_identities t ON t.id=s.external_identity_id AND t.account_id=a.id AND t.connection_id=s.connection_id
    LEFT JOIN identity_connections c ON c.id=s.connection_id
    LEFT JOIN passkey_credentials p ON p.id=s.passkey_credential_id AND p.account_id=a.id
    WHERE i.id=${b.add(id)} AND i.offer_sealed=1 AND a.disabled_at IS NULL AND a.email_verified_at IS NOT NULL AND a.security_version=s.account_security_version
      AND s.assurance='passkey' AND m.state='active' AND m.preset='admin'
      AND (s.passkey_credential_id IS NULL OR (p.id IS NOT NULL AND p.disabled_at IS NULL))
      AND (s.connection_id IS NULL OR (t.id IS NOT NULL AND t.version=s.external_identity_version AND t.connection_version=s.connection_version AND t.protocol=s.method AND (c.organization_id IS NULL OR c.organization_id=o.id)))
      AND (o.required_connection_id IS NULL OR (s.method='saml' AND s.connection_id=o.required_connection_id))
      AND (o.owner_account_id=a.id OR (i.preset='coordinator'
        AND NOT EXISTS(SELECT 1 FROM organization_memberships target JOIN accounts ta ON ta.id=target.account_id WHERE target.organization_id=o.id AND ta.email=i.email AND target.preset='admin')
        AND EXISTS(SELECT 1 FROM membership_grants g WHERE g.membership_id=m.id AND g.organization_id=o.id AND g.action='staff.manage_coordinators' AND g.scope_kind='organization')))
      AND NOT EXISTS(SELECT 1 FROM invitation_grants offer WHERE offer.invitation_id=i.id AND (
        (offer.program_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM programs pr WHERE pr.organization_id=o.id AND pr.id=offer.program_id AND pr.archived_at IS NULL))
        OR (offer.location_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM locations lo WHERE lo.organization_id=o.id AND lo.id=offer.location_id AND lo.archived_at IS NULL))
        OR (o.owner_account_id!=a.id AND NOT EXISTS(SELECT 1 FROM membership_grants g WHERE g.membership_id=m.id AND g.organization_id=o.id AND g.action=offer.action
          AND (g.scope_kind='organization' OR (offer.scope_kind='program_location' AND (g.program_id IS NULL OR g.program_id=offer.program_id) AND (g.location_id IS NULL OR g.location_id=offer.location_id))))))))`
}
function assertion(ctx: RequestContext,b: Bindings,condition: string): D1PreparedStatement[] {
  const id=ctx.ids.next()
  return [ctx.db.prepare(`INSERT INTO stage0_guards(allowed,id) VALUES(CASE WHEN (${condition}) THEN 1 ELSE 0 END,${b.add(id)})`).bind(...b.values),ctx.db.prepare('DELETE FROM stage0_guards WHERE id=?').bind(id)]
}
async function deliver(ctx: RequestContext,id: string,issuedVersion: number,address: string,secret: string): Promise<void> {
  let status:'accepted'|'failed'='failed'
  try { const outcome=await ctx.mailer.send({to:address,kind:'staff_invitation',url:`${ctx.config.origin}/account/staff-invitation#token=${secret}`});status=outcome.status } catch { /* Provider detail never enters receipts, audit or API errors. */ }
  await ctx.db.prepare('UPDATE staff_invitations SET delivery=?,delivery_finished_at=? WHERE id=? AND delivery_version=? AND token_digest=? AND delivery=?')
    .bind(status,ctx.clock.now(),id,issuedVersion,await secretDigest(secret),'pending').run()
}
export async function createStaffInvitation(ctx: CommandContext,input: CreateInvitationInput,admission: Admission): Promise<InvitationSnapshot> {
  if(!input||typeof input!=='object'||(input.preset!=='admin'&&input.preset!=='coordinator'))return invalid()
  const normalized={organizationId:identifier(input.organizationId),email:email(input.email),preset:input.preset,grants:normalizedGrants(input.grants,input.preset)}
  const org=normalized.organizationId
  await getOrganization(ctx,ctx.principal,org)
  return withReceipt(ctx,'invitation.create',org,normalized,b=>manager(ctx,b,org,normalized.preset,normalized.email),async digest=>{
    await authorizeManager(ctx,org,normalized.preset,normalized.email,normalized.grants)
    const b=new Bindings()
    const active=`EXISTS(SELECT 1 FROM organization_memberships m JOIN accounts a ON a.id=m.account_id WHERE m.organization_id=${b.add(org)} AND a.email=${b.add(normalized.email)} AND m.state='active')`
    const duplicate=`EXISTS(SELECT 1 FROM staff_invitations WHERE organization_id=${b.add(org)} AND email=${b.add(normalized.email)} AND state='pending' AND expires_at>${b.add(ctx.clock.now())})`
    if(await ctx.db.prepare(`SELECT 1 WHERE ${active} OR ${duplicate}`).bind(...b.values).first())throw new Stage0Error('conflict')
    await consumeAuthEmailBudget(ctx,{email:normalized.email,ip:admission.ip},admission.budgetKey)
    const id=ctx.ids.next(),secret=randomSecret(),now=ctx.clock.now()
    const result:InvitationSnapshot={id,organizationId:org,email:normalized.email,preset:normalized.preset,state:'pending',version:1,expiresAt:now+lifetime,delivery:'pending'}
    const guard=`(${manager(ctx,b,org,normalized.preset,normalized.email)}) AND NOT ${active} AND NOT ${duplicate}`
    const final=new Bindings()
    const statements=[
      ctx.db.prepare("INSERT INTO audit_events(id,organization_id,actor_account_id,session_id,action,resource_id,request_id,created_at) SELECT ?,organization_id,?,?,'invitation.expire',id,?,? FROM staff_invitations WHERE organization_id=? AND email=? AND state='pending' AND expires_at<=?").bind(ctx.ids.next(),ctx.principal.accountId,ctx.principal.sessionId,ctx.requestId,now,org,normalized.email,now),
      ctx.db.prepare("UPDATE staff_invitations SET state='expired',version=version+1,updated_at=? WHERE organization_id=? AND email=? AND state='pending' AND expires_at<=?").bind(now,org,normalized.email,now),
      ctx.db.prepare('INSERT INTO staff_invitations(id,organization_id,email,preset,inviter_account_id,issued_session_id,token_digest,created_at,updated_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,org,normalized.email,normalized.preset,ctx.principal.accountId,ctx.principal.sessionId,await secretDigest(secret),now,now,now+lifetime),
      ...normalized.grants.map(grant=>ctx.db.prepare('INSERT INTO invitation_grants(id,invitation_id,organization_id,action,scope_kind,program_id,location_id) VALUES(?,?,?,?,?,?,?)').bind(ctx.ids.next(),id,org,grant.action,grant.scope.kind,grant.scope.kind==='program_location'?grant.scope.programId??null:null,grant.scope.kind==='program_location'?grant.scope.locationId??null:null)),
      // Seal in the creation transaction before the final authority check.
      ctx.db.prepare('UPDATE staff_invitations SET offer_sealed=1 WHERE id=?').bind(id),
      ...assertion(ctx,final,issuerAuthority(final,id)),
      auditStatement(ctx,'invitation.create',id,ctx.principal,org),
    ]
    await commit(ctx,'invitation.create',org,org,digest,b,guard,statements,result)
    await deliver(ctx,id,1,normalized.email,secret)
    return result
  })
}
export async function getStaffInvitation(ctx: RequestContext,principal: Principal,organizationId: string,id: string): Promise<InvitationSnapshot & {grants:Grant[]}> {
  await authorizeOrganization(ctx,principal,organizationId,'staff.read',orgScope)
  const b=new Bindings()
  const allowed=accessPredicate(b,principal,organizationId,'staff.read',orgScope,ctx.clock.now())
  const found=await ctx.db.prepare(`SELECT i.* FROM staff_invitations i WHERE i.organization_id=${b.add(organizationId)} AND i.id=${b.add(id)} AND (${allowed})`).bind(...b.values).first<InvitationRow>()
  if(!found)throw new Stage0Error('not_found')
  return {...snapshot(found,ctx.clock.now()),grants:await offered(ctx,found.id)}
}
/** Bounded staff-only summaries; tokens and issuer session identifiers never leave D1. */
export async function listStaffInvitations(ctx: RequestContext,principal: Principal,organizationId: string): Promise<InvitationSnapshot[]> {
  await authorizeOrganization(ctx,principal,organizationId,'staff.read',orgScope)
  const b=new Bindings()
  const allowed=accessPredicate(b,principal,organizationId,'staff.read',orgScope,ctx.clock.now())
  const rows=await ctx.db.prepare(`SELECT i.* FROM staff_invitations i WHERE i.organization_id=${b.add(organizationId)} AND (${allowed}) ORDER BY i.created_at DESC,i.id LIMIT 100`).bind(...b.values).all<InvitationRow>()
  return rows.results.map(found=>snapshot(found,ctx.clock.now()))
}
export async function previewStaffInvitation(ctx: RequestContext,secret: string): Promise<{organizationName:string;state:State;expiresAt:number}> {
  if(!secretPattern.test(secret))throw new Stage0Error('unauthenticated')
  const found=await ctx.db.prepare('SELECT o.name,i.state,i.expires_at FROM staff_invitations i JOIN organizations o ON o.id=i.organization_id WHERE i.token_digest=?').bind(await secretDigest(secret)).first<{name:string;state:State;expires_at:number}>()
  if(!found)throw new Stage0Error('unauthenticated')
  return {organizationName:found.name,state:found.state==='pending'&&found.expires_at<=ctx.clock.now()?'expired':found.state,expiresAt:found.expires_at}
}
export async function resendStaffInvitation(ctx: CommandContext,input: InvitationCommandInput,admission: Admission): Promise<InvitationSnapshot> {
  const normalized=request(input),org=normalized.organizationId
  await getOrganization(ctx,ctx.principal,org)
  const invite=await row(ctx,org,normalized.invitationId)
  return withReceipt(ctx,'invitation.resend',org,normalized,b=>manager(ctx,b,org,invite.preset,invite.email),async digest=>{
    await authorizeManager(ctx,org,invite.preset,invite.email,await offered(ctx,invite.id))
    if(invite.state!=='pending'||invite.version!==normalized.expectedVersion||invite.expires_at<=ctx.clock.now())throw new Stage0Error('conflict')
    await consumeAuthEmailBudget(ctx,{email:invite.email,ip:admission.ip},admission.budgetKey)
    const secret=randomSecret(),now=ctx.clock.now(),nextVersion=normalized.expectedVersion+1
    const result={...snapshot(invite,now),version:nextVersion,expiresAt:now+lifetime,delivery:'pending' as const}
    const b=new Bindings()
    const guard=`(${manager(ctx,b,org,invite.preset,invite.email)}) AND EXISTS(SELECT 1 FROM staff_invitations WHERE id=${b.add(invite.id)} AND state='pending' AND version=${b.add(normalized.expectedVersion)} AND expires_at>${b.add(now)})`
    const final=new Bindings()
    await commit(ctx,'invitation.resend',org,org,digest,b,guard,[
      ctx.db.prepare("UPDATE staff_invitations SET token_digest=?,inviter_account_id=?,issued_session_id=?,version=version+1,updated_at=?,expires_at=?,delivery='pending',delivery_version=?,delivery_finished_at=NULL WHERE id=? AND version=? AND state='pending'").bind(await secretDigest(secret),ctx.principal.accountId,ctx.principal.sessionId,now,now+lifetime,nextVersion,invite.id,normalized.expectedVersion),
      ...assertion(ctx,final,issuerAuthority(final,invite.id)),
      auditStatement(ctx,'invitation.resend',invite.id,ctx.principal,org),
    ],result)
    await deliver(ctx,invite.id,nextVersion,invite.email,secret)
    return result
  })
}
export async function revokeStaffInvitation(ctx: CommandContext,input: InvitationCommandInput): Promise<InvitationSnapshot> {
  const normalized=request(input),org=normalized.organizationId
  await getOrganization(ctx,ctx.principal,org)
  const invite=await row(ctx,org,normalized.invitationId)
  return withReceipt(ctx,'invitation.revoke',org,normalized,b=>manager(ctx,b,org,invite.preset,invite.email),async digest=>{
    await authorizeManager(ctx,org,invite.preset,invite.email)
    const b=new Bindings(),now=ctx.clock.now()
    const guard=`(${manager(ctx,b,org,invite.preset,invite.email)}) AND EXISTS(SELECT 1 FROM staff_invitations WHERE id=${b.add(invite.id)} AND state='pending' AND version=${b.add(normalized.expectedVersion)} AND expires_at>${b.add(now)})`
    const result={...snapshot(invite,now),state:'revoked' as const,version:normalized.expectedVersion+1}
    return commit(ctx,'invitation.revoke',org,org,digest,b,guard,[ctx.db.prepare("UPDATE staff_invitations SET state='revoked',version=version+1,updated_at=?,revoked_at=? WHERE id=? AND version=? AND state='pending'").bind(now,now,invite.id,normalized.expectedVersion),auditStatement(ctx,'invitation.revoke',invite.id,ctx.principal,org)],result)
  })
}
function recipientAuthority(ctx: CommandContext,b: Bindings,invite: InvitationRow): string {
  return `EXISTS(SELECT 1 FROM stage0_live_sessions s JOIN accounts a ON a.id=s.account_id JOIN organizations o ON o.id=${b.add(invite.organization_id)} LEFT JOIN identity_connections c ON c.id=s.connection_id
    WHERE s.id=${b.add(ctx.principal.sessionId)} AND s.account_id=${b.add(ctx.principal.accountId)} AND s.transport=${b.add(ctx.principal.transport)} AND s.created_at<=${b.add(ctx.clock.now())} AND s.expires_at>${b.add(ctx.clock.now())}
      AND a.email=${b.add(invite.email)} AND s.assurance!='enrollment' AND (${invite.preset==='admin'?"s.assurance='passkey'":'1'})
      AND (s.connection_id IS NULL OR c.organization_id IS NULL OR c.organization_id=o.id)
      AND (o.required_connection_id IS NULL OR (s.method='saml' AND s.connection_id=o.required_connection_id)))`
}
export async function acceptStaffInvitation(ctx: CommandContext,input: AcceptInvitationInput,admission: Admission): Promise<MembershipSnapshot> {
  if(!input||!secretPattern.test(input.token))throw new Stage0Error('unauthenticated')
  await loadLiveSession(ctx,ctx.principal)
  const address=await ctx.db.prepare('SELECT email FROM accounts WHERE id=?').bind(ctx.principal.accountId).first<string>('email')
  const lease=await reserveAuthAttempt(ctx,{email:address!,ip:admission.ip},admission.budgetKey)
  let success=false
  try {
    const digest=await secretDigest(input.token)
    const invite=await ctx.db.prepare('SELECT * FROM staff_invitations WHERE token_digest=?').bind(digest).first<InvitationRow>()
    if(!invite)throw new Stage0Error('unauthenticated')
    const b=new Bindings()
    if(!await ctx.db.prepare(`SELECT 1 WHERE ${recipientAuthority(ctx,b,invite)}`).bind(...b.values).first())throw new Stage0Error('forbidden')
    const org=invite.organization_id
    const result=await withReceipt(ctx,'invitation.accept',org,{invitationId:invite.id,tokenDigest:digest},bindings=>accessPredicate(bindings,ctx.principal,org,'organization.read',orgScope,ctx.clock.now()),async requestDigest=>{
      const existing=await ctx.db.prepare('SELECT id,preset,state,version FROM organization_memberships WHERE organization_id=? AND account_id=?').bind(org,ctx.principal.accountId).first<{id:string;preset:Preset;state:string;version:number}>()
      if(existing?.state==='active')throw new Stage0Error('conflict')
      const id=existing?.id??ctx.ids.next(),now=ctx.clock.now()
      const result:MembershipSnapshot={id,organizationId:org,accountId:ctx.principal.accountId,preset:invite.preset,state:'active',version:existing?existing.version+1:1}
      const guardBindings=new Bindings()
      const guard=`${recipientAuthority(ctx,guardBindings,invite)} AND ${issuerAuthority(guardBindings,invite.id)}
        AND EXISTS(SELECT 1 FROM staff_invitations WHERE id=${guardBindings.add(invite.id)} AND state='pending' AND version=${guardBindings.add(invite.version)} AND token_digest=${guardBindings.add(digest)} AND expires_at>${guardBindings.add(now)})
        AND ${existing?`EXISTS(SELECT 1 FROM organization_memberships WHERE id=${guardBindings.add(existing.id)} AND state='revoked' AND version=${guardBindings.add(existing.version)})`:`NOT EXISTS(SELECT 1 FROM organization_memberships WHERE organization_id=${guardBindings.add(org)} AND account_id=${guardBindings.add(ctx.principal.accountId)})`}`
      return commit(ctx,'invitation.accept',org,org,requestDigest,guardBindings,guard,[
        ctx.db.prepare("UPDATE staff_invitations SET state='accepted',version=version+1,updated_at=?,accepted_at=?,accepted_account_id=? WHERE id=? AND state='pending' AND version=?").bind(now,now,ctx.principal.accountId,invite.id,invite.version),
        ctx.db.prepare("INSERT INTO organization_memberships(id,organization_id,account_id,preset,state) VALUES(?,?,?,?,'active') ON CONFLICT(organization_id,account_id) DO UPDATE SET preset=excluded.preset,state='active',version=organization_memberships.version+1").bind(id,org,ctx.principal.accountId,invite.preset),
        ctx.db.prepare('DELETE FROM membership_grants WHERE membership_id=? AND organization_id=?').bind(id,org),
        ctx.db.prepare('INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind,program_id,location_id) SELECT ?||id,?,?,action,scope_kind,program_id,location_id FROM invitation_grants WHERE invitation_id=?').bind(`${ctx.ids.next()}:`,id,org,invite.id),
        auditStatement(ctx,'invitation.accept',invite.id,ctx.principal,org),
      ],result)
    })
    success=true
    return result
  } finally { await finishAuthAttempt(ctx,lease,success) }
}
