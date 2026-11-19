import type {CommandContext,Principal,RequestContext} from '../contracts'
import {Stage0Error} from '../errors'
import {authenticateRequest} from '../auth/http'
import { authResponse } from '../http/response'
import { boundedJsonBody } from '../http/body'
import {segment} from '../http/input'
import {exactObject} from '../domain/input'
import {createOrganization,updateOrganization,saveProgram,saveLocation} from './commands'
import {reviewHours,listHours,listServiceHistory,submitHours} from '../volunteer/hours'
import {createVolunteer,listVolunteers} from '../volunteer/people'
import {listReadiness,decideReadiness,openReadiness} from '../volunteer/readiness'
import {readRoster} from '../volunteer/roster'
import {listSchedule,getOccurrence,createOccurrence,createRole,publishOccurrence} from '../volunteer/schedule'
import {createAssignment,cancelAssignment} from '../volunteer/assignment'
import {checkIn,checkOut,recordPresence} from '../volunteer/attendance'
import {registerWalkIn} from '../volunteer/walk-in'
import {createCriterion,recordCriterionEvidence,listCriterionEvidence} from '../volunteer/criteria'
import {requestCorrection,resolveCorrection,listCorrections} from '../volunteer/corrections'
import {joinWaitlist,offerWaitlist,confirmOffer,withdrawOffer,leaveWaitlist,listWaitlist} from '../volunteer/waitlist'
import {recordClarification,getHoursHistory} from '../volunteer/clarifications'
import {getOrganization,getProgram,getLocation,listPrograms,listLocations} from './organizations'
import {getOrganizationPolicies,listAccessAudit,listAccessibleOrganizations,type PageInput} from './reads'

type Route = {kind:'create'} | {kind:'directory'} | {kind:'organization';organizationId:string}
 | {kind:'person-create';organizationId:string}
 | {kind:'person-search';organizationId:string}
 | {kind:'readiness';organizationId:string}
 | {kind:'readiness-decision';organizationId:string}
 | {kind:'criterion-evidence';organizationId:string}
 | {kind:'criterion-create';organizationId:string;occurrenceId:string;roleId:string}
 | {kind:'schedule';organizationId:string}
 | {kind:'occurrence';organizationId:string;occurrenceId:string}
 | {kind:'roster';organizationId:string;occurrenceId:string}
 | {kind:'role-create';organizationId:string;occurrenceId:string}
 | {kind:'publish';organizationId:string;occurrenceId:string}
 | {kind:'hours-queue';organizationId:string}
 | {kind:'service-history';organizationId:string}
 | {kind:'corrections';organizationId:string}
 | {kind:'correction-request';organizationId:string;assignmentId:string}
 | {kind:'correction-resolve';organizationId:string;correctionId:string}
 | {kind:'waitlist';organizationId:string;occurrenceId:string}
 | {kind:'waitlist-offer';organizationId:string;waitlistId:string}
 | {kind:'waitlist-leave';organizationId:string;waitlistId:string}
 | {kind:'offer-action';organizationId:string;offerId:string;action:'confirm'|'withdraw'}
 | {kind:'hours-submit';organizationId:string;assignmentId:string}
 | {kind:'hours-review';organizationId:string;submissionId:string}
 | {kind:'hours-history';organizationId:string;submissionId:string}
 | {kind:'hours-clarification';organizationId:string;submissionId:string}
 | {kind:'assignment';organizationId:string}
 | {kind:'walk-in';organizationId:string}
 | {kind:'assignment-cancel';organizationId:string;assignmentId:string}
 | {kind:'checkin';organizationId:string;assignmentId:string}
 | {kind:'checkout';organizationId:string;assignmentId:string}
 | {kind:'presence';organizationId:string;assignmentId:string}
 | {kind:'policies';organizationId:string} | {kind:'audit';organizationId:string}
 | {kind:'programs'|'locations';organizationId:string;resourceId?:string}
function route(path:string):Route|null{
 if(path==='/api/v1/organizations')return {kind:'create'}
 if(path==='/api/v1/me/organizations')return {kind:'directory'}
 const search=/^\/api\/v1\/organizations\/([^/]+)\/volunteers\/search$/.exec(path)
 if(search)return {kind:'person-search',organizationId:segment(search[1])}
 const person=/^\/api\/v1\/organizations\/([^/]+)\/volunteers$/.exec(path)
 if(person)return {kind:'person-create',organizationId:segment(person[1])}
 const readinessDecision=/^\/api\/v1\/organizations\/([^/]+)\/volunteer-readiness\/decision$/.exec(path)
 if(readinessDecision)return {kind:'readiness-decision',organizationId:segment(readinessDecision[1])}
 const evidence=/^\/api\/v1\/organizations\/([^/]+)\/volunteer-readiness\/evidence$/.exec(path)
 if(evidence)return {kind:'criterion-evidence',organizationId:segment(evidence[1])}
 const readiness=/^\/api\/v1\/organizations\/([^/]+)\/volunteer-readiness$/.exec(path)
 if(readiness)return {kind:'readiness',organizationId:segment(readiness[1])}
 const queue=/^\/api\/v1\/organizations\/([^/]+)\/volunteer-hours$/.exec(path)
 if(queue)return {kind:'hours-queue',organizationId:segment(queue[1])}
 const corrections=/^\/api\/v1\/organizations\/([^/]+)\/volunteer-corrections$/.exec(path)
 if(corrections)return {kind:'corrections',organizationId:segment(corrections[1])}
 const correctionResolve=/^\/api\/v1\/organizations\/([^/]+)\/volunteer-corrections\/([^/]+)\/resolve$/.exec(path)
 if(correctionResolve)return {kind:'correction-resolve',organizationId:segment(correctionResolve[1]),correctionId:segment(correctionResolve[2])}
 const history=/^\/api\/v1\/organizations\/([^/]+)\/volunteer-service-history$/.exec(path)
 if(history)return {kind:'service-history',organizationId:segment(history[1])}
 const hours=/^\/api\/v1\/organizations\/([^/]+)\/volunteer-hours\/([^/]+)\/review$/.exec(path)
 if(hours)return {kind:'hours-review',organizationId:segment(hours[1]),submissionId:segment(hours[2])}
 const hoursDetail=/^\/api\/v1\/organizations\/([^/]+)\/volunteer-hours\/([^/]+)\/(history|clarification)$/.exec(path)
 if(hoursDetail)return {kind:hoursDetail[3]==='history'?'hours-history':'hours-clarification',organizationId:segment(hoursDetail[1]),submissionId:segment(hoursDetail[2])}
 const publish=/^\/api\/v1\/organizations\/([^/]+)\/volunteer-occurrences\/([^/]+)\/publish$/.exec(path)
 if(publish)return {kind:'publish',organizationId:segment(publish[1]),occurrenceId:segment(publish[2])}
 const waitlist=/^\/api\/v1\/organizations\/([^/]+)\/volunteer-occurrences\/([^/]+)\/waitlist$/.exec(path)
 if(waitlist)return {kind:'waitlist',organizationId:segment(waitlist[1]),occurrenceId:segment(waitlist[2])}
 const offer=/^\/api\/v1\/organizations\/([^/]+)\/volunteer-waitlist\/([^/]+)\/offers$/.exec(path)
 if(offer)return {kind:'waitlist-offer',organizationId:segment(offer[1]),waitlistId:segment(offer[2])}
 const leave=/^\/api\/v1\/organizations\/([^/]+)\/volunteer-waitlist\/([^/]+)\/withdraw$/.exec(path)
 if(leave)return {kind:'waitlist-leave',organizationId:segment(leave[1]),waitlistId:segment(leave[2])}
 const offerAction=/^\/api\/v1\/organizations\/([^/]+)\/volunteer-offers\/([^/]+)\/(confirm|withdraw)$/.exec(path)
 if(offerAction)return {kind:'offer-action',organizationId:segment(offerAction[1]),offerId:segment(offerAction[2]),action:offerAction[3] as 'confirm'|'withdraw'}
 const criterion=/^\/api\/v1\/organizations\/([^/]+)\/volunteer-occurrences\/([^/]+)\/roles\/([^/]+)\/criteria$/.exec(path)
 if(criterion)return {kind:'criterion-create',organizationId:segment(criterion[1]),occurrenceId:segment(criterion[2]),roleId:segment(criterion[3])}
 const role=/^\/api\/v1\/organizations\/([^/]+)\/volunteer-occurrences\/([^/]+)\/roles$/.exec(path)
 if(role)return {kind:'role-create',organizationId:segment(role[1]),occurrenceId:segment(role[2])}
 const roster=/^\/api\/v1\/organizations\/([^/]+)\/volunteer-occurrences\/([^/]+)\/roster$/.exec(path)
 if(roster)return {kind:'roster',organizationId:segment(roster[1]),occurrenceId:segment(roster[2])}
 const occurrence=/^\/api\/v1\/organizations\/([^/]+)\/volunteer-occurrences\/([^/]+)$/.exec(path)
 if(occurrence)return {kind:'occurrence',organizationId:segment(occurrence[1]),occurrenceId:segment(occurrence[2])}
 const schedule=/^\/api\/v1\/organizations\/([^/]+)\/volunteer-schedule$/.exec(path)
 if(schedule)return {kind:'schedule',organizationId:segment(schedule[1])}
 const submission=/^\/api\/v1\/organizations\/([^/]+)\/volunteer-assignments\/([^/]+)\/hours$/.exec(path)
 if(submission)return {kind:'hours-submit',organizationId:segment(submission[1]),assignmentId:segment(submission[2])}
 const correctionRequest=/^\/api\/v1\/organizations\/([^/]+)\/volunteer-assignments\/([^/]+)\/corrections$/.exec(path)
 if(correctionRequest)return {kind:'correction-request',organizationId:segment(correctionRequest[1]),assignmentId:segment(correctionRequest[2])}
 const checkin=/^\/api\/v1\/organizations\/([^/]+)\/volunteer-assignments\/([^/]+)\/check-(in|out)$/.exec(path)
 if(checkin)return {kind:checkin[3]==='in'?'checkin':'checkout',organizationId:segment(checkin[1]),assignmentId:segment(checkin[2])}
 const presence=/^\/api\/v1\/organizations\/([^/]+)\/volunteer-assignments\/([^/]+)\/presence$/.exec(path)
 if(presence)return {kind:'presence',organizationId:segment(presence[1]),assignmentId:segment(presence[2])}
 const walkIn=/^\/api\/v1\/organizations\/([^/]+)\/volunteer-walk-ins$/.exec(path)
 if(walkIn)return {kind:'walk-in',organizationId:segment(walkIn[1])}
 const assignment=/^\/api\/v1\/organizations\/([^/]+)\/volunteer-assignments$/.exec(path)
 if(assignment)return {kind:'assignment',organizationId:segment(assignment[1])}
 const cancel=/^\/api\/v1\/organizations\/([^/]+)\/volunteer-assignments\/([^/]+)\/cancel$/.exec(path)
 if(cancel)return {kind:'assignment-cancel',organizationId:segment(cancel[1]),assignmentId:segment(cancel[2])}
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
  const methods=matched.kind==='schedule'||matched.kind==='readiness'||matched.kind==='person-create'||matched.kind==='criterion-evidence'||matched.kind==='waitlist'?['GET','POST']:matched.kind==='create'||(matched.kind==='person-search'||matched.kind==='assignment'||matched.kind==='walk-in'||matched.kind==='assignment-cancel'||matched.kind==='checkin'||matched.kind==='checkout'||matched.kind==='presence'||matched.kind==='hours-review'||matched.kind==='hours-clarification'||matched.kind==='hours-submit'||matched.kind==='correction-request'||matched.kind==='correction-resolve'||matched.kind==='readiness-decision'||matched.kind==='criterion-create'||matched.kind==='role-create'||matched.kind==='publish'||matched.kind==='waitlist-offer'||matched.kind==='waitlist-leave'||matched.kind==='offer-action')?['POST']:matched.kind==='organization'?['GET','PATCH']:
   matched.kind==='programs'||matched.kind==='locations'?matched.resourceId?['GET','PATCH']:['GET','POST']:['GET']
  if(!methods.includes(request.method))return authResponse(ctx,{error:'method_not_allowed'},405,{Allow:methods.join(', ')})
  const read=request.method==='GET'
  const selectors=query(url,!read?[]:matched.kind==='criterion-evidence'?['programId','locationId','occurrenceId','roleId','personId']:matched.kind==='service-history'?['programId','locationId','personId','cursor']:matched.kind==='hours-history'||matched.kind==='roster'||matched.kind==='waitlist'||matched.kind==='corrections'||matched.kind==='hours-queue'||matched.kind==='readiness'||matched.kind==='person-create'?['programId','locationId','cursor']:matched.kind==='occurrence'?['programId','locationId']:matched.kind==='schedule'?['programId','locationId','from','until','cursor']:matched.kind==='directory'||matched.kind==='audit'?['limit','cursor']:matched.kind==='programs'?['locationId']:matched.kind==='locations'?['programId']:[])
  const principal=await authenticateRequest(ctx,request,transport)
  if(matched.kind==='hours-history')return authResponse(ctx,await getHoursHistory(ctx,principal,matched.organizationId,matched.submissionId,selectors))
  if(matched.kind==='hours-clarification'){
   const parsed=exactObject(await boundedJsonBody(request,16_384),['programId','locationId','expectedDecisionId','response'],true)
   return authResponse(ctx,await recordClarification({...ctx,principal,idempotencyKey:request.headers.get('Idempotency-Key')??''},{...parsed,organizationId:matched.organizationId,submissionId:matched.submissionId}),201)
  }
  if(matched.kind==='person-search'){
   const parsed=exactObject(await boundedJsonBody(request,16_384),['programId','locationId','search','cursor'])
   if(typeof parsed.search!=='string' || (parsed.cursor!==undefined && typeof parsed.cursor!=='string'))throw new Stage0Error('invalid_input')
   return authResponse(ctx,await listVolunteers(ctx,principal,matched.organizationId,parsed.programId as string,parsed.locationId as string,parsed.cursor as string|undefined,parsed.search))
  }
  if(matched.kind==='waitlist'&&read)return authResponse(ctx,await listWaitlist(ctx,principal,matched.organizationId,matched.occurrenceId,selectors.programId,selectors.locationId,selectors.cursor))
  if(matched.kind==='waitlist'){
   const parsed=exactObject(await boundedJsonBody(request,16_384),['programId','locationId','roleId','personId'],true)
   return authResponse(ctx,await joinWaitlist({...ctx,principal,idempotencyKey:request.headers.get('Idempotency-Key')??''},{...parsed,organizationId:matched.organizationId,occurrenceId:matched.occurrenceId}),201)
  }
  if(matched.kind==='waitlist-offer'){
   const parsed=exactObject(await boundedJsonBody(request,16_384),['programId','locationId','expiresAt'],true)
   return authResponse(ctx,await offerWaitlist({...ctx,principal,idempotencyKey:request.headers.get('Idempotency-Key')??''},{...parsed,organizationId:matched.organizationId,waitlistId:matched.waitlistId}),201)
  }
  if(matched.kind==='waitlist-leave'){
   const parsed=exactObject(await boundedJsonBody(request,16_384),['programId','locationId','reason'],true)
   return authResponse(ctx,await leaveWaitlist({...ctx,principal,idempotencyKey:request.headers.get('Idempotency-Key')??''},{...parsed,organizationId:matched.organizationId,waitlistId:matched.waitlistId}))
  }
  if(matched.kind==='offer-action'){
   const parsed=exactObject(await boundedJsonBody(request,16_384),matched.action==='confirm'?['programId','locationId','confirmationNote']:['programId','locationId','reason'],true)
   return authResponse(ctx,await (matched.action==='confirm'?confirmOffer:withdrawOffer)({...ctx,principal,idempotencyKey:request.headers.get('Idempotency-Key')??''},{...parsed,organizationId:matched.organizationId,offerId:matched.offerId}))
  }
  if(matched.kind==='corrections')return authResponse(ctx,await listCorrections(ctx,principal,matched.organizationId,selectors.programId,selectors.locationId,selectors.cursor))
  if(matched.kind==='correction-request'){
   const parsed=exactObject(await boundedJsonBody(request,16_384),['programId','locationId','reason'],true)
   return authResponse(ctx,await requestCorrection({...ctx,principal,idempotencyKey:request.headers.get('Idempotency-Key')??''},{...parsed,organizationId:matched.organizationId,assignmentId:matched.assignmentId}),201)
  }
  if(matched.kind==='correction-resolve'){
   const parsed=exactObject(await boundedJsonBody(request,16_384),['programId','locationId','expectedDecisionId','checkedInAt','checkedOutAt','approvedMinutes','reason'],true)
   return authResponse(ctx,await resolveCorrection({...ctx,principal,idempotencyKey:request.headers.get('Idempotency-Key')??''},{...parsed,organizationId:matched.organizationId,correctionId:matched.correctionId}))
  }
  if(matched.kind==='criterion-evidence'&&read)return authResponse(ctx,await listCriterionEvidence(ctx,principal,matched.organizationId,selectors))
  if(matched.kind==='criterion-evidence'){
   const parsed=exactObject(await boundedJsonBody(request,16_384),['occurrenceId','roleId','criterionId','personId','programId','locationId','state','validFrom','validUntil','note','expectedEvidenceId'],true)
   return authResponse(ctx,await recordCriterionEvidence({...ctx,principal,idempotencyKey:request.headers.get('Idempotency-Key')??''},{...parsed,organizationId:matched.organizationId}),201)
  }
  if(matched.kind==='criterion-create'){
   const parsed=exactObject(await boundedJsonBody(request,16_384),['programId','locationId','name'],true)
   return authResponse(ctx,await createCriterion({...ctx,principal,idempotencyKey:request.headers.get('Idempotency-Key')??''},{...parsed,organizationId:matched.organizationId,occurrenceId:matched.occurrenceId,roleId:matched.roleId}),201)
  }
  if(matched.kind==='readiness'&&read)return authResponse(ctx,await listReadiness(ctx,principal,matched.organizationId,selectors.programId,selectors.locationId,selectors.cursor))
  if(matched.kind==='readiness'){
   const parsed=exactObject(await boundedJsonBody(request,16_384),['occurrenceId','roleId','personId','programId','locationId'],true)
   return authResponse(ctx,await openReadiness({...ctx,principal,idempotencyKey:request.headers.get('Idempotency-Key')??''},{...parsed,organizationId:matched.organizationId} as Parameters<typeof openReadiness>[1]),201)
  }
  if(matched.kind==='hours-queue')return authResponse(ctx,await listHours(ctx,principal,matched.organizationId,selectors.programId,selectors.locationId,selectors.cursor))
  if(matched.kind==='service-history')return authResponse(ctx,await listServiceHistory(ctx,principal,matched.organizationId,selectors))
  if(matched.kind==='roster')return authResponse(ctx,await readRoster(ctx,principal,matched.organizationId,matched.occurrenceId,selectors))
  if(matched.kind==='occurrence')return authResponse(ctx,await getOccurrence(ctx,principal,matched.organizationId,matched.occurrenceId,selectors))
  if(matched.kind==='schedule'&&read)return authResponse(ctx,await listSchedule(ctx,principal,matched.organizationId,selectors))
  if(matched.kind==='schedule'){
   const parsed=exactObject(await boundedJsonBody(request,16_384),['programId','locationId','title','startsAt','endsAt','capacity'],true)
   return authResponse(ctx,await createOccurrence({...ctx,principal,idempotencyKey:request.headers.get('Idempotency-Key')??''},{...parsed,organizationId:matched.organizationId}),201)
  }
  if(matched.kind==='directory')return authResponse(ctx,await listAccessibleOrganizations(ctx,principal,page(selectors)))
  if(matched.kind==='policies')return authResponse(ctx,await getOrganizationPolicies(ctx,principal,matched.organizationId))
  if(matched.kind==='audit')return authResponse(ctx,await listAccessAudit(ctx,principal,matched.organizationId,page(selectors)))
  if(matched.kind==='organization'&&read)return authResponse(ctx,await getOrganization(ctx,principal,matched.organizationId))
  if((matched.kind==='programs'||matched.kind==='locations')&&read){
   const org=matched.organizationId,id=matched.resourceId
   if(matched.kind==='programs')return authResponse(ctx,id?await getProgram(ctx,principal,org,id,{locationId:selectors.locationId}):{programs:await listPrograms(ctx,principal,org,{locationId:selectors.locationId})})
   return authResponse(ctx,id?await getLocation(ctx,principal,org,id,{programId:selectors.programId}):{locations:await listLocations(ctx,principal,org,{programId:selectors.programId})})
  }
  if(matched.kind==='person-create'&&read)return authResponse(ctx,await listVolunteers(ctx,principal,matched.organizationId,selectors.programId,selectors.locationId,selectors.cursor))
  if(matched.kind==='person-create'){
   const parsed=exactObject(await boundedJsonBody(request,16_384),['programId','locationId','displayName'],true)
   return authResponse(ctx,await createVolunteer({...ctx,principal,idempotencyKey:request.headers.get('Idempotency-Key')??''},{...parsed,organizationId:matched.organizationId}),201)
  }
  if(matched.kind==='publish'){
   const parsed=exactObject(await boundedJsonBody(request,16_384),['programId','locationId'],true)
   return authResponse(ctx,await publishOccurrence({...ctx,principal,idempotencyKey:request.headers.get('Idempotency-Key')??''},{...parsed,organizationId:matched.organizationId,occurrenceId:matched.occurrenceId}))
  }
  if(matched.kind==='role-create'){
   const parsed=exactObject(await boundedJsonBody(request,16_384),['programId','locationId','name','capacity'],true)
   return authResponse(ctx,await createRole({...ctx,principal,idempotencyKey:request.headers.get('Idempotency-Key')??''},{...parsed,organizationId:matched.organizationId,occurrenceId:matched.occurrenceId}),201)
  }
  if(matched.kind==='readiness-decision'){
   const parsed=exactObject(await boundedJsonBody(request,16_384),['occurrenceId','roleId','personId','programId','locationId','state','evidenceNote','expectedDecisionId'])
   return authResponse(ctx,await decideReadiness({...ctx,principal,idempotencyKey:request.headers.get('Idempotency-Key')??''},{...parsed,organizationId:matched.organizationId} as Parameters<typeof decideReadiness>[1]))
  }
  if(matched.kind==='hours-submit'){
   const parsed=exactObject(await boundedJsonBody(request,16_384),['programId','locationId','startAt','endAt','breakMinutes'],true)
   return authResponse(ctx,await submitHours({...ctx,principal,idempotencyKey:request.headers.get('Idempotency-Key')??''},{...parsed,organizationId:matched.organizationId,assignmentId:matched.assignmentId}),201)
  }
  if(matched.kind==='hours-review'){
   const parsed=exactObject(await boundedJsonBody(request,16_384),['programId','locationId','decision','approvedMinutes','reason','expectedDecisionId'])
   return authResponse(ctx,await reviewHours({...ctx,principal,idempotencyKey:request.headers.get('Idempotency-Key')??''},{...parsed,organizationId:matched.organizationId,submissionId:matched.submissionId}))
  }
  if(matched.kind==='checkin'||matched.kind==='checkout'){
   const parsed=exactObject(await boundedJsonBody(request,16_384),['programId','locationId'],true)
   return authResponse(ctx,await (matched.kind==='checkin'?checkIn:checkOut)({...ctx,principal,idempotencyKey:request.headers.get('Idempotency-Key')??''},{...parsed,organizationId:matched.organizationId,assignmentId:matched.assignmentId}))
  }
  if(matched.kind==='presence'){
   const parsed=exactObject(await boundedJsonBody(request,16_384),['programId','locationId','state','expectedEventId','reason','confirmation'],true)
   return authResponse(ctx,await recordPresence({...ctx,principal,idempotencyKey:request.headers.get('Idempotency-Key')??''},{...parsed,organizationId:matched.organizationId,assignmentId:matched.assignmentId}))
  }
  if(matched.kind==='assignment'){
   const parsed=exactObject(await boundedJsonBody(request,16_384),['occurrenceId','personId','roleId','programId','locationId'],true)
   return authResponse(ctx,await createAssignment({...ctx,principal,idempotencyKey:request.headers.get('Idempotency-Key')??''},{...parsed,organizationId:matched.organizationId}),201)
  }
  if(matched.kind==='walk-in'){
   const parsed=exactObject(await boundedJsonBody(request,16_384),['occurrenceId','personId','roleId','programId','locationId'],true)
   return authResponse(ctx,await registerWalkIn({...ctx,principal,idempotencyKey:request.headers.get('Idempotency-Key')??''},{...parsed,organizationId:matched.organizationId}),201)
  }
  if(matched.kind==='assignment-cancel'){
   const parsed=exactObject(await boundedJsonBody(request,16_384),['programId','locationId','reason'],true)
   return authResponse(ctx,await cancelAssignment({...ctx,principal,idempotencyKey:request.headers.get('Idempotency-Key')??''},{...parsed,organizationId:matched.organizationId,assignmentId:matched.assignmentId}))
  }
  const fields=matched.kind==='create'?['name','contactEmail','timeZone','firstProgram','firstLocation']:matched.kind==='organization'?['name','contactEmail','timeZone','expectedVersion']:request.method==='POST'?['name']:['name','expectedVersion','archived']
  const parsed=exactObject(await boundedJsonBody(request,16_384),fields,request.method==='POST'||matched.kind==='organization')
  const command:CommandContext={...ctx,principal,idempotencyKey:request.headers.get('Idempotency-Key')??''}
  const settings={name:parsed.name as string,contactEmail:parsed.contactEmail as string,timeZone:parsed.timeZone as string}
  if(matched.kind==='create')return authResponse(ctx,await createOrganization(command,{...settings,firstProgram:parsed.firstProgram as string,firstLocation:parsed.firstLocation as string}),201)
  if(matched.kind==='organization')return authResponse(ctx,await updateOrganization(command,{...settings,organizationId:matched.organizationId,expectedVersion:parsed.expectedVersion as number}))
  const input={organizationId:matched.organizationId,name:parsed.name as string,...(matched.resourceId?{id:matched.resourceId,expectedVersion:parsed.expectedVersion as number,archived:parsed.archived as boolean|undefined}:{})}
  return authResponse(ctx,await(matched.kind==='programs'?saveProgram(command,input):saveLocation(command,input)),matched.resourceId?200:201)
 }catch(error){return error instanceof Stage0Error?authResponse(ctx,{error:error.code},error.status):authResponse(ctx,{error:'unavailable'},503)}
}
