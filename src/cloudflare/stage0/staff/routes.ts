import type {CommandContext, Principal, RequestContext} from '../contracts'
import {segment,object,grants} from '../http-input'
import {Stage0Error} from '../errors'
import {authenticateRequest} from '../auth/http'
import {authResponse, boundedJsonBody} from '../auth/web'
import {acceptStaffInvitation, createStaffInvitation, getStaffInvitation, listStaffInvitations, previewStaffInvitation, resendStaffInvitation, revokeStaffInvitation} from './invitations'

export interface StaffHttpDependencies {trustedIp:string;budgetKey:Uint8Array}
type Route = {kind:'preview'} | {kind:'accept'} | {kind:'list';organizationId:string}
  | {kind:'detail'|'resend'|'revoke';organizationId:string;invitationId:string}
function route(path:string):Route|null {
  if(path==='/api/v1/invitations/preview')return {kind:'preview'}
  if(path==='/api/v1/invitations/accept')return {kind:'accept'}
  const match=/^\/api\/v1\/organizations\/([^/]+)\/invitations(?:\/([^/]+)(?:\/(resend|revoke))?)?$/.exec(path)
  if(!match)return null
  const organizationId=segment(match[1])
  if(!match[2])return {kind:'list',organizationId}
  return {kind:(match[3] as 'resend'|'revoke'|undefined)??'detail',organizationId,invitationId:segment(match[2])}
}
/** Internal composition only. Transport, edge IP and quota key are selected by
 * a trusted server route; none can be overridden by a request DTO or header.
 * Public Worker routing remains disconnected until recovery/rollout gates pass.
 */
export async function handleStaffInvitationRequest(ctx:RequestContext,request:Request,transport:Principal['transport'],deps:StaffHttpDependencies):Promise<Response> {
  try {
    const url=new URL(request.url),matched=route(url.pathname)
    if(!matched)return authResponse(ctx,{error:'not_found'},404)
    const methods=matched.kind==='list'?['GET','POST']:matched.kind==='detail'||matched.kind==='preview'?['GET']:['POST']
    if(!methods.includes(request.method))return authResponse(ctx,{error:'method_not_allowed'},405,{Allow:methods.join(', ')})
    if(url.search)throw new Stage0Error('invalid_input')
    const principal=await authenticateRequest(ctx,request,transport)
    if(matched.kind==='preview'){
      // A future client reads the mail fragment and deliberately sets this
      // header. Navigating/prefetching the link cannot consume its capability.
      return authResponse(ctx,await previewStaffInvitation(ctx,request.headers.get('X-Invitation-Token')??''))
    }
    if(matched.kind==='list'&&request.method==='GET')return authResponse(ctx,{invitations:await listStaffInvitations(ctx,principal,matched.organizationId)})
    if(matched.kind==='detail')return authResponse(ctx,await getStaffInvitation(ctx,principal,matched.organizationId,matched.invitationId!))
    const fields=matched.kind==='accept'?['token']:matched.kind==='list'?['email','preset','grants']:['expectedVersion']
    const parsed=object(await boundedJsonBody(request,16_384),fields,true)
    if(matched.kind==='accept'&&typeof parsed.token!=='string')throw new Stage0Error('invalid_input')
    const command:CommandContext={...ctx,principal,idempotencyKey:request.headers.get('Idempotency-Key')??'',requestDigest:''}
    const admission={ip:deps.trustedIp,budgetKey:deps.budgetKey}
    if(matched.kind==='accept')return authResponse(ctx,await acceptStaffInvitation(command,{token:parsed.token as string},admission))
    if(matched.kind==='list')return authResponse(ctx,await createStaffInvitation(command,{organizationId:matched.organizationId,email:parsed.email as string,preset:parsed.preset as 'admin'|'coordinator',grants:grants(parsed.grants)},admission),201)
    const input={organizationId:matched.organizationId,invitationId:matched.invitationId!,expectedVersion:parsed.expectedVersion as number}
    return authResponse(ctx,await (matched.kind==='resend'?resendStaffInvitation(command,input,admission):revokeStaffInvitation(command,input)))
  }catch(error){return error instanceof Stage0Error?authResponse(ctx,{error:error.code},error.status):authResponse(ctx,{error:'unavailable'},503)}
}
