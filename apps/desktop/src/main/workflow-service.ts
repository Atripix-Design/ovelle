type Spec = {path:string; method:'GET'|'POST'|'PATCH'; query?:string[]; optionalQuery?:string[]; body?:string[]; optionalBody?:string[]}
const scoped=['programId','locationId']
const identity=[...scoped,'occurrenceId','roleId','personId']
const specs:Record<string,Spec>={
  organizations:{path:'/me/organizations',method:'GET',optionalQuery:['limit','cursor']},
  createOrganization:{path:'/organizations',method:'POST',body:['name','contactEmail','timeZone','firstProgram','firstLocation']},
  programs:{path:'/organizations/:organizationId/programs',method:'GET',optionalQuery:['locationId']},
  locations:{path:'/organizations/:organizationId/locations',method:'GET',optionalQuery:['programId']},
  schedule:{path:'/organizations/:organizationId/volunteer-schedule',method:'GET',query:[...scoped,'from','until'],optionalQuery:['cursor']},
  occurrence:{path:'/organizations/:organizationId/volunteer-occurrences/:occurrenceId',method:'GET',query:scoped},
  readiness:{path:'/organizations/:organizationId/volunteer-readiness',method:'GET',query:scoped,optionalQuery:['cursor']},
  criterionEvidence:{path:'/organizations/:organizationId/volunteer-readiness/evidence',method:'GET',query:identity},
  roster:{path:'/organizations/:organizationId/volunteer-occurrences/:occurrenceId/roster',method:'GET',query:scoped,optionalQuery:['cursor']},
  waitlist:{path:'/organizations/:organizationId/volunteer-occurrences/:occurrenceId/waitlist',method:'GET',query:scoped,optionalQuery:['cursor']},
  hours:{path:'/organizations/:organizationId/volunteer-hours',method:'GET',query:scoped,optionalQuery:['cursor']},
  hoursHistory:{path:'/organizations/:organizationId/volunteer-hours/:submissionId/history',method:'GET',query:scoped,optionalQuery:['cursor']},
  corrections:{path:'/organizations/:organizationId/volunteer-corrections',method:'GET',query:scoped,optionalQuery:['cursor']},
  serviceHistory:{path:'/organizations/:organizationId/volunteer-service-history',method:'GET',query:scoped,optionalQuery:['personId','cursor']},
  volunteers:{path:'/organizations/:organizationId/volunteers',method:'GET',query:scoped,optionalQuery:['cursor']},
  searchVolunteers:{path:'/organizations/:organizationId/volunteers/search',method:'POST',body:[...scoped,'search'],optionalBody:['cursor']},
  volunteerGrants:{path:'/organizations/:organizationId/memberships/:membershipId/volunteer-grants',method:'GET'},
  replaceVolunteerGrants:{path:'/organizations/:organizationId/memberships/:membershipId/volunteer-grants',method:'PATCH',body:['expectedVersion','grants']},
  createOccurrence:{path:'/organizations/:organizationId/volunteer-schedule',method:'POST',body:[...scoped,'title','startsAt','endsAt','capacity']},
  createRole:{path:'/organizations/:organizationId/volunteer-occurrences/:occurrenceId/roles',method:'POST',body:[...scoped,'name','capacity']},
  createCriterion:{path:'/organizations/:organizationId/volunteer-occurrences/:occurrenceId/roles/:roleId/criteria',method:'POST',body:[...scoped,'name']},
  publishOccurrence:{path:'/organizations/:organizationId/volunteer-occurrences/:occurrenceId/publish',method:'POST',body:scoped},
  createVolunteer:{path:'/organizations/:organizationId/volunteers',method:'POST',body:[...scoped,'displayName']},
  openReadiness:{path:'/organizations/:organizationId/volunteer-readiness',method:'POST',body:identity},
  decideReadiness:{path:'/organizations/:organizationId/volunteer-readiness/decision',method:'POST',body:[...identity,'state','evidenceNote'],optionalBody:['expectedDecisionId']},
  recordEvidence:{path:'/organizations/:organizationId/volunteer-readiness/evidence',method:'POST',body:[...identity,'criterionId','state','validFrom','validUntil','note','expectedEvidenceId']},
  assign:{path:'/organizations/:organizationId/volunteer-assignments',method:'POST',body:identity},
  registerWalkIn:{path:'/organizations/:organizationId/volunteer-walk-ins',method:'POST',body:identity},
  joinWaitlist:{path:'/organizations/:organizationId/volunteer-occurrences/:occurrenceId/waitlist',method:'POST',body:[...scoped,'roleId','personId']},
  offerWaitlist:{path:'/organizations/:organizationId/volunteer-waitlist/:waitlistId/offers',method:'POST',body:[...scoped,'expiresAt']},
  leaveWaitlist:{path:'/organizations/:organizationId/volunteer-waitlist/:waitlistId/withdraw',method:'POST',body:[...scoped,'reason']},
  confirmOffer:{path:'/organizations/:organizationId/volunteer-offers/:offerId/confirm',method:'POST',body:[...scoped,'confirmationNote']},
  withdrawOffer:{path:'/organizations/:organizationId/volunteer-offers/:offerId/withdraw',method:'POST',body:[...scoped,'reason']},
  cancelAssignment:{path:'/organizations/:organizationId/volunteer-assignments/:assignmentId/cancel',method:'POST',body:[...scoped,'reason']},
  checkIn:{path:'/organizations/:organizationId/volunteer-assignments/:assignmentId/check-in',method:'POST',body:scoped},
  checkOut:{path:'/organizations/:organizationId/volunteer-assignments/:assignmentId/check-out',method:'POST',body:scoped},
  recordPresence:{path:'/organizations/:organizationId/volunteer-assignments/:assignmentId/presence',method:'POST',body:[...scoped,'state','expectedEventId','reason','confirmation']},
  submitHours:{path:'/organizations/:organizationId/volunteer-assignments/:assignmentId/hours',method:'POST',body:[...scoped,'startAt','endAt','breakMinutes']},
  reviewHours:{path:'/organizations/:organizationId/volunteer-hours/:submissionId/review',method:'POST',body:[...scoped,'decision','approvedMinutes','reason'],optionalBody:['expectedDecisionId']},
  recordClarification:{path:'/organizations/:organizationId/volunteer-hours/:submissionId/clarification',method:'POST',body:[...scoped,'expectedDecisionId','response']},
  requestCorrection:{path:'/organizations/:organizationId/volunteer-assignments/:assignmentId/corrections',method:'POST',body:[...scoped,'reason']},
  resolveCorrection:{path:'/organizations/:organizationId/volunteer-corrections/:correctionId/resolve',method:'POST',body:[...scoped,'expectedDecisionId','checkedInAt','checkedOutAt','approvedMinutes','reason']},
}
const unavailable=()=>new Error('Workflow service unavailable')
const invalid=()=>new Error('Invalid workflow request')
const validId=(v:unknown):v is string=>typeof v==='string' && v.length>0 && v.length<=256 && v!=='.' && v!=='..' && !/[\/\\\p{Cc}]/u.test(v)
type NativeSession={token:string;expiresAt:number}
type SessionVault={load:()=>Promise<NativeSession|null>;save:(session:NativeSession)=>Promise<boolean>;clear:()=>Promise<boolean>}

/** The bearer stays in main and optional OS-protected storage. The renderer
 * cannot select an origin, path, credentials or headers. */
export function createWorkflowService(options:{origin:string;openApproval:(url:string)=>Promise<void>;fetcher?:typeof fetch;vault?:SessionVault;handoff:(options:{origin:string;openApproval:(url:string)=>Promise<void>;fetcher?:typeof fetch})=>Promise<NativeSession>}) {
  if(options.origin!=='https://dev.ovelle.org')throw unavailable()
  const fetcher:typeof fetch=(input,init)=>(options.fetcher ?? fetch)(input,init), handoff=options.handoff
  let session:NativeSession|null=null,candidate:NativeSession|null=null,generation=0,pending:Promise<void>|null=null,signingOut:Promise<{revoked:boolean;localCleared:boolean}>|null=null,persistent=false
  let vaultWork:Promise<unknown>=Promise.resolve()
  function enqueue<T>(work:()=>Promise<T>):Promise<T>{const next=vaultWork.then(work,work);vaultWork=next.then(()=>undefined,()=>undefined);return next}
  async function revoke(prior:NativeSession):Promise<boolean>{
    try {const response=await fetcher(`${options.origin}/api/v1/native/auth/logout`,{method:'POST',headers:{Authorization:`Bearer ${prior.token}`},redirect:'error',signal:AbortSignal.timeout(15_000)});return response.status===204 || response.status===401} catch {return false}
  }
  async function validateCandidate(saved:NativeSession,started:number):Promise<void>{
    if(saved.expiresAt<=Date.now()){
      if(started===generation && candidate===saved){candidate=null;if(options.vault)await enqueue(async()=>started===generation && options.vault!.clear()).catch(()=>false)}
      return
    }
    try {
      const response=await fetcher(`${options.origin}/api/v1/native/me`,{method:'GET',headers:{Authorization:`Bearer ${saved.token}`},redirect:'error',signal:AbortSignal.timeout(15_000)})
      if(started!==generation)return
      if(response.status===401){candidate=null;if(options.vault)await enqueue(async()=>started===generation && options.vault!.clear()).catch(()=>false);return}
      if(response.status===200 && /^application\/json(?:\s*;|\s*$)/i.test(response.headers.get('content-type') ?? '')){
        const identity=await readJson(response)
        if(started===generation && saved.expiresAt>Date.now() && validRestoredIdentity(identity)){session=saved;candidate=null;persistent=true}
      }
    } catch { /* Keep encrypted data for a later online attempt; do not trust it offline. */ }
  }
  let restoring:Promise<void>|null=null
  async function retryCandidate():Promise<void>{
    if(restoring)return restoring
    if(!candidate)return
    const task=validateCandidate(candidate,generation)
    restoring=task
    try{await task}finally{if(restoring===task)restoring=null}
  }
  const ready=(async()=>{
    if(!options.vault)return
    const started=generation,saved=await options.vault.load().catch(()=>null)
    if(!saved || started!==generation)return
    candidate=saved
    await retryCandidate()
  })()
  function active(){if(session && session.expiresAt<=Date.now()){session=null;persistent=false;if(options.vault)void enqueue(()=>options.vault!.clear()).catch(()=>false)}return session}
  async function signIn():Promise<void>{
    const invoked=generation
    await ready;if(signingOut)await signingOut
    if(invoked!==generation)throw unavailable()
    if(active())return
    if(candidate)await retryCandidate()
    if(invoked!==generation)throw unavailable()
    if(active())return
    if(pending)return pending
    const started=generation
    const task=(async()=>{
      const next=await handoff({origin:options.origin,openApproval:options.openApproval,fetcher})
      if(started!==generation){await revoke(next);throw unavailable()}
      session=next;candidate=null
      const stored=options.vault?await enqueue(async()=>{
        if(started!==generation)return false
        const saved=await options.vault!.save(next).catch(()=>false)
        // Remove a previous account's persisted session if replacement fails.
        if(!saved)await options.vault!.clear().catch(()=>false)
        return saved
      }).catch(()=>false):false
      if(started!==generation)throw unavailable()
      persistent=stored
    })()
    pending=task
    try {await task} finally {if(pending===task)pending=null}
  }
  async function signOut():Promise<{revoked:boolean;localCleared:boolean}>{
    if(signingOut)return signingOut
    const hadPending=!!pending
    generation++
    const task=(async()=>{
      await ready
      const prior=session ?? candidate;session=null;candidate=null;persistent=false
      const localCleared=options.vault?await enqueue(()=>options.vault!.clear()).catch(()=>false):true
      if(!prior)return {revoked:!hadPending,localCleared}
      return {revoked:(await revoke(prior)) && !hadPending,localCleared}
    })()
    signingOut=task
    try{return await task}finally{if(signingOut===task)signingOut=null}
  }
  async function request(value:unknown):Promise<unknown>{
    await ready;if(signingOut)await signingOut
    if(!value || typeof value!=='object' || Array.isArray(value))throw invalid()
    const input=value as Record<string,unknown>,operation=input.operation
    if(typeof operation!=='string' || !Object.hasOwn(specs,operation))throw invalid()
    const spec=specs[operation],pathKeys=[...spec.path.matchAll(/:([A-Za-z]+)/g)].map(match=>match[1])
    const needsIdempotency=spec.method!=='GET' && operation!=='searchVolunteers'
    const required=[...pathKeys,...(spec.query??[]),...(spec.body??[]),...(needsIdempotency?['idempotencyKey']:[])]
    const allowed=new Set(['operation',...required,...(spec.optionalQuery??[]),...(spec.optionalBody??[])])
    if(Object.keys(input).some(k=>!allowed.has(k)) || required.some(k=>!Object.hasOwn(input,k) || input[k]===undefined))throw invalid()
    let path=spec.path
    for(const name of pathKeys){if(!validId(input[name]))throw invalid();path=path.replace(`:${name}`,encodeURIComponent(input[name] as string))}
    const query=new URLSearchParams()
    for(const name of [...(spec.query??[]),...(spec.optionalQuery??[])])if(input[name]!==undefined){const v=input[name];if((typeof v!=='string' && !(typeof v==='number' && Number.isSafeInteger(v))) || String(v).length>(name==='cursor'?2048:256) || !String(v) || /\p{Cc}/u.test(String(v)))throw invalid();query.set(name,String(v))}
    const headers:Record<string,string>={}
    let body:string|undefined
    if(spec.method!=='GET'){
      if(needsIdempotency && (typeof input.idempotencyKey!=='string' || !/^[A-Za-z0-9_-]{16,128}$/.test(input.idempotencyKey)))throw invalid()
      const fields=[...(spec.body??[]),...(spec.optionalBody??[])],data:Record<string,unknown>={}
      for(const name of fields)if(Object.hasOwn(input,name)){
        const v=input[name]
        if(name==='grants' && operation==='replaceVolunteerGrants'){
          if(!Array.isArray(v) || v.length>100 || v.some(g=>!g || typeof g!=='object' || Array.isArray(g) || Object.keys(g).sort().join(',')!=='action,locationId,programId' || !validId(g.action) || !validId(g.programId) || !validId(g.locationId)))throw invalid()
        }else if(v!==null && typeof v!=='string' && typeof v!=='boolean' && !(typeof v==='number' && Number.isSafeInteger(v)))throw invalid()
        data[name]=v
      }
      body=JSON.stringify(data);if(Buffer.byteLength(body)>16_384)throw invalid()
      headers['Content-Type']='application/json';if(needsIdempotency)headers['Idempotency-Key']=input.idempotencyKey as string
    }
    const current=active();if(!current)throw new Error('Sign in required')
    headers.Authorization=`Bearer ${current.token}`
    let response:Response
    try {response=await fetcher(`${options.origin}/api/v1/native${path}${query.size?`?${query}`:''}`,{method:spec.method,headers,body,redirect:'error',signal:AbortSignal.timeout(15_000)})} catch {throw unavailable()}
    if(response.status===401){if(session===current){session=null;persistent=false;if(options.vault)await enqueue(()=>options.vault!.clear()).catch(()=>false)}throw new Error('Sign in required')}
    if(!response.ok){if(response.status===409)throw new Error('Workflow changed; refresh and retry');if(response.status===403 || response.status===404)throw new Error('Workflow unavailable or access denied');if(response.status===400)throw invalid();throw unavailable()}
    return readJson(response)
  }
  async function status(){await ready;if(signingOut)await signingOut;return {signedIn:!!active(),persistent}}
  return Object.freeze({signIn,signOut,status,request})
}

function validRestoredIdentity(value:unknown):boolean{
  if(!value || typeof value!=='object' || Array.isArray(value))return false
  const body=value as Record<string,unknown>, account=body.account, session=body.session
  if(!account || typeof account!=='object' || Array.isArray(account) || !session || typeof session!=='object' || Array.isArray(session) || body.csrfToken!==null)return false
  const a=account as Record<string,unknown>,s=session as Record<string,unknown>
  return validId(a.id) && typeof a.email==='string' && a.email.length>0 && a.email.length<=320 && typeof a.displayName==='string' && a.displayName.length>0 && a.displayName.length<=256
    && (a.verifiedAt===null || (Number.isSafeInteger(a.verifiedAt) && (a.verifiedAt as number)>=0))
    && (s.assurance==='authenticated' || s.assurance==='passkey') && ['password','passkey','oidc','saml'].includes(s.method as string)
    && Number.isSafeInteger(s.authenticatedAt) && (s.authenticatedAt as number)>=0 && (s.passkeyVerifiedAt===null || (Number.isSafeInteger(s.passkeyVerifiedAt) && (s.passkeyVerifiedAt as number)>=0))
}

async function readJson(response:Response):Promise<unknown>{
  if(!response.body)throw unavailable()
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0
  try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1_048_576){await reader.cancel();throw unavailable()}chunks.push(value)}} catch {throw unavailable()}
  try {return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown} catch {throw unavailable()}
}
