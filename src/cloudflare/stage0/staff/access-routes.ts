import type {CommandContext,Principal,RequestContext} from '../contracts'
import {Stage0Error} from '../errors'
import {authenticateRequest} from '../auth/http'
import {authResponse,boundedJsonBody} from '../auth/web'
import {segment,object,grants} from '../http-input'
import {changeMembershipGrants,getMembership,listMemberships,revokeMembership} from './memberships'
import {acceptOwnershipTransfer,getOwnershipTransfer,requestOwnershipTransfer,revokeOwnershipTransfer} from './ownership'

type Route = {kind:'memberships';organizationId:string}
 | {kind:'membership';organizationId:string;membershipId:string}
 | {kind:'grants';organizationId:string;membershipId:string}
 | {kind:'revoke';organizationId:string;membershipId:string}
 | {kind:'request';organizationId:string}
 | {kind:'transfer';organizationId:string;transferId:string}
 | {kind:'accept';organizationId:string;transferId:string}
 | {kind:'cancel';organizationId:string;transferId:string}
function route(path:string):Route|null {
 const member=/^\/api\/v1\/organizations\/([^/]+)\/memberships(?:\/([^/]+)(?:\/(grants|revoke))?)?$/.exec(path)
 if(member){
  const organizationId=segment(member[1])
  return member[2]?{kind:(member[3] as 'grants'|'revoke'|undefined)??'membership',organizationId,membershipId:segment(member[2])}:{kind:'memberships',organizationId}
 }
 const transfer=/^\/api\/v1\/organizations\/([^/]+)\/ownership-transfer(?:\/([^/]+)(?:\/(accept|revoke))?)?$/.exec(path)
 if(!transfer)return null
 const organizationId=segment(transfer[1])
 return transfer[2]?{kind:transfer[3]==='revoke'?'cancel':transfer[3]==='accept'?'accept':'transfer',organizationId,transferId:segment(transfer[2])}:{kind:'request',organizationId}
}
/** Internal adapter. The trusted server chooses transport; request JSON cannot
 * supply identity, assurance or tenancy. Public Worker composition stays gated
 * on recovery and rollout; importing this module never registers live routes.
 */
export async function handleStaffAccessRequest(ctx:RequestContext,request:Request,transport:Principal['transport']):Promise<Response>{
 try{
  const url=new URL(request.url),matched=route(url.pathname)
  if(!matched)return authResponse(ctx,{error:'not_found'},404)
  const read=['memberships','membership','transfer'].includes(matched.kind)
  const method=read?'GET':matched.kind==='grants'?'PATCH':'POST'
  if(request.method!==method)return authResponse(ctx,{error:'method_not_allowed'},405,{Allow:method})
  if(url.search)throw new Stage0Error('invalid_input')
  const principal=await authenticateRequest(ctx,request,transport)
  if(matched.kind==='memberships')return authResponse(ctx,{memberships:await listMemberships(ctx,principal,matched.organizationId)})
  if(matched.kind==='membership')return authResponse(ctx,await getMembership(ctx,principal,matched.organizationId,matched.membershipId))
  if(matched.kind==='transfer')return authResponse(ctx,await getOwnershipTransfer(ctx,principal,matched.organizationId,matched.transferId))
  const fields=matched.kind==='grants'?['expectedVersion','grants','preset']:matched.kind==='request'?['targetMembershipId','expectedOwnerVersion','expectedTargetVersion']:['expectedVersion']
  const parsed=object(await boundedJsonBody(request,16_384),fields,matched.kind!=='grants')
  const command:CommandContext={...ctx,principal,idempotencyKey:request.headers.get('Idempotency-Key')??'',requestDigest:''}
  if(matched.kind==='grants')return authResponse(ctx,await changeMembershipGrants(command,{organizationId:matched.organizationId,membershipId:matched.membershipId,expectedVersion:parsed.expectedVersion as number,grants:grants(parsed.grants),...(Object.hasOwn(parsed,'preset')?{preset:parsed.preset as 'admin'|'coordinator'}:{})}))
  if(matched.kind==='revoke')return authResponse(ctx,await revokeMembership(command,{organizationId:matched.organizationId,membershipId:matched.membershipId,expectedVersion:parsed.expectedVersion as number}))
  if(matched.kind==='request')return authResponse(ctx,await requestOwnershipTransfer(command,{organizationId:matched.organizationId,targetMembershipId:parsed.targetMembershipId as string,expectedOwnerVersion:parsed.expectedOwnerVersion as number,expectedTargetVersion:parsed.expectedTargetVersion as number}),201)
  const input={organizationId:matched.organizationId,transferId:matched.transferId,expectedVersion:parsed.expectedVersion as number}
  return authResponse(ctx,await(matched.kind==='accept'?acceptOwnershipTransfer(command,input):revokeOwnershipTransfer(command,input)))
 }catch(error){return error instanceof Stage0Error?authResponse(ctx,{error:error.code},error.status):authResponse(ctx,{error:'unavailable'},503)}
}
