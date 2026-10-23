import {stage0Actions,type Action,type Grant,type Principal,type RequestContext,type Scope} from '../contracts'
import {Stage0Error} from '../errors'
import {getOrganization} from './organizations'
import {accessPredicate,Bindings} from './policy'

export interface CapabilitySnapshot {
  readonly organizationId:string
  readonly asOf:number
  readonly capabilities:ReadonlyArray<Grant>
  readonly truncated:boolean
}
interface Row {action:Action;scope_kind:Scope['kind'];program_id:string|null;location_id:string|null}
const organizationScope:Scope={kind:'organization'}
/** Display hints only: these policy matches do not approve a target command.
 * Do not accept this snapshot back as authority. Commands keep their own current
 * SQL guards, fixed operation scope, target and version/assurance requirements.
 */
export async function getAdvisoryCapabilities(ctx:RequestContext,principal:Principal,organizationId:string):Promise<CapabilitySnapshot>{
  if(typeof organizationId!=='string'||!organizationId||organizationId.length>256||/\p{Cc}/u.test(organizationId))throw new Stage0Error('invalid_input')
  await getOrganization(ctx,principal,organizationId)
  const b=new Bindings(),now=ctx.clock.now()
  // Organization candidates cover implicit owner rights and organization.read.
  // Grant candidates are selectors, not authority; the final policy still checks
  // current role, grants, scope resources, session/SSO and assurance for every row.
  const implicit=`SELECT value,'organization',NULL,NULL FROM json_each(${b.add(JSON.stringify(stage0Actions))})`
  const org=b.add(organizationId),account=b.add(principal.accountId)
  const allowed=stage0Actions.map(action=>{
    const selector=b.add(action)
    return `(capability.action=${selector} AND (${accessPredicate(b,principal,organizationId,action,organizationScope,now,'capability')}))`
  }).join(' OR ')
  const result=await ctx.db.prepare(`WITH candidates(action,scope_kind,program_id,location_id) AS (
    ${implicit} UNION SELECT g.action,g.scope_kind,g.program_id,g.location_id FROM membership_grants g
      JOIN organization_memberships member ON member.id=g.membership_id AND member.organization_id=g.organization_id
      WHERE g.organization_id=${org} AND member.account_id=${account}
  ) SELECT capability.action,capability.scope_kind,capability.program_id,capability.location_id FROM candidates capability
    WHERE ${allowed}
    ORDER BY capability.action,capability.scope_kind,coalesce(capability.program_id,''),coalesce(capability.location_id,'') LIMIT 101`)
    .bind(...b.values).all<Row>()
  // Every visible organization has implicit organization.read. An empty final
  // result means authority disappeared after preflight; do not return stale hints.
  if(!result.results.length)throw new Stage0Error('not_found')
  const capabilities:Grant[]=result.results.slice(0,100).map(row=>({action:row.action,scope:row.scope_kind==='organization'?{kind:'organization'}:
    {kind:'program_location',...(row.program_id!==null?{programId:row.program_id}:{}),...(row.location_id!==null?{locationId:row.location_id}:{})} as Scope}))
  return{organizationId,asOf:now,capabilities,truncated:result.results.length>100}
}
