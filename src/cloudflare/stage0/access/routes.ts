import type {CommandContext,Principal,RequestContext} from '../contracts'
import {Stage0Error} from '../errors'
import {authenticateRequest} from '../auth/http'
import {authResponse,boundedJsonBody} from '../auth/web'
import {segment,object} from '../http-input'
import {createOrganization,updateOrganization,saveProgram,saveLocation} from './commands'
import {getOrganization,getProgram,getLocation,listPrograms,listLocations} from './organizations'
import {getOrganizationPolicies,listAccessAudit,listAccessibleOrganizations,type PageInput} from './reads'

type Route = {kind:'create'} | {kind:'directory'} | {kind:'organization';organizationId:string}
 | {kind:'policies';organizationId:string} | {kind:'audit';organizationId:string}
 | {kind:'programs'|'locations';organizationId:string;resourceId?:string}
function route(path:string):Route|null{
 if(path==='/api/v1/organizations')return {kind:'create'}
 if(path==='/api/v1/me/organizations')return {kind:'directory'}
 const match=/^\/api\/v1\/organizations\/([^/]+)(?:\/(programs|locations|policies|audit)(?:\/([^/]+))?)?$/.exec(path)
 if(!match)return null
 const organizationId=segment(match[1])
 if(!match[2])return {kind:'organization',organizationId}
 if(match[2]==='policies'||match[2]==='audit')return match[3]?null:{kind:match[2],organizationId}
 return {kind:match[2] as 'programs'|'locations',organizationId,...(match[3]?{resourceId:segment(match[3])}:{})}
}
function query(url:URL,allowed:string[]):Record<string,string>{
 const values:Record<string,string>={}
 for(const [key,value] of url.searchParams){
  if(!allowed.includes(key)||Object.hasOwn(values,key)||!value||value.length>2048||/\p{Cc}/u.test(value))throw new Stage0Error('invalid_input')
  values[key]=value
 }
 return values
}
function page(values:Record<string,string>):PageInput{
 if(values.limit!==undefined&&(!/^[1-9]\d{0,2}$/.test(values.limit)||Number(values.limit)>100))throw new Stage0Error('invalid_input')
 return {...(values.limit!==undefined?{limit:Number(values.limit)}:{}),...(values.cursor!==undefined?{cursor:values.cursor}:{})}
}
/** Internal composition only. The trusted server chooses transport. All writes
 * reuse guarded domain commands; a client-selected organization or read filter
 * cannot supply a role or broaden a mutation's required scope.
 */
export async function handleOrganizationRequest(ctx:RequestContext,request:Request,transport:Principal['transport']):Promise<Response>{
 try{
  const url=new URL(request.url),matched=route(url.pathname)
  if(!matched)return authResponse(ctx,{error:'not_found'},404)
  const methods=matched.kind==='create'?['POST']:matched.kind==='organization'?['GET','PATCH']:
   matched.kind==='programs'||matched.kind==='locations'?matched.resourceId?['GET','PATCH']:['GET','POST']:['GET']
  if(!methods.includes(request.method))return authResponse(ctx,{error:'method_not_allowed'},405,{Allow:methods.join(', ')})
  const read=request.method==='GET'
  const selectors=query(url,!read?[]:matched.kind==='directory'||matched.kind==='audit'?['limit','cursor']:matched.kind==='programs'?['locationId']:matched.kind==='locations'?['programId']:[])
  const principal=await authenticateRequest(ctx,request,transport)
  if(matched.kind==='directory')return authResponse(ctx,await listAccessibleOrganizations(ctx,principal,page(selectors)))
  if(matched.kind==='policies')return authResponse(ctx,await getOrganizationPolicies(ctx,principal,matched.organizationId))
  if(matched.kind==='audit')return authResponse(ctx,await listAccessAudit(ctx,principal,matched.organizationId,page(selectors)))
  if(matched.kind==='organization'&&read)return authResponse(ctx,await getOrganization(ctx,principal,matched.organizationId))
  if((matched.kind==='programs'||matched.kind==='locations')&&read){
   const org=matched.organizationId,id=matched.resourceId
   if(matched.kind==='programs')return authResponse(ctx,id?await getProgram(ctx,principal,org,id,{locationId:selectors.locationId}):{programs:await listPrograms(ctx,principal,org,{locationId:selectors.locationId})})
   return authResponse(ctx,id?await getLocation(ctx,principal,org,id,{programId:selectors.programId}):{locations:await listLocations(ctx,principal,org,{programId:selectors.programId})})
  }
  const fields=matched.kind==='create'?['name','contactEmail','timeZone','firstProgram','firstLocation']:matched.kind==='organization'?['name','contactEmail','timeZone','expectedVersion']:request.method==='POST'?['name']:['name','expectedVersion','archived']
  const parsed=object(await boundedJsonBody(request,16_384),fields,request.method==='POST'||matched.kind==='organization')
  const command:CommandContext={...ctx,principal,idempotencyKey:request.headers.get('Idempotency-Key')??'',requestDigest:''}
  const settings={name:parsed.name as string,contactEmail:parsed.contactEmail as string,timeZone:parsed.timeZone as string}
  if(matched.kind==='create')return authResponse(ctx,await createOrganization(command,{...settings,firstProgram:parsed.firstProgram as string,firstLocation:parsed.firstLocation as string}),201)
  if(matched.kind==='organization')return authResponse(ctx,await updateOrganization(command,{...settings,organizationId:matched.organizationId,expectedVersion:parsed.expectedVersion as number}))
  const input={organizationId:matched.organizationId,name:parsed.name as string,...(matched.resourceId?{id:matched.resourceId,expectedVersion:parsed.expectedVersion as number,archived:parsed.archived as boolean|undefined}:{})}
  return authResponse(ctx,await(matched.kind==='programs'?saveProgram(command,input):saveLocation(command,input)),matched.resourceId?200:201)
 }catch(error){return error instanceof Stage0Error?authResponse(ctx,{error:error.code},error.status):authResponse(ctx,{error:'unavailable'},503)}
}
