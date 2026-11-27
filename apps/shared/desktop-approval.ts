const secretPattern=/^[A-Za-z0-9_-]{43}$/
const unavailable=()=>new Error('Desktop approval unavailable. Start sign-in again.')
export type ApprovalAccount={displayName:string;email:string}
export type ApprovalStatus={kind:'signInRequired'}|{kind:'ready';account:ApprovalAccount}

/** The page creates one controller per handoff. Approval only occurs when its
 * explicit approve action is invoked; it is never triggered by loading a URL. */
export function prepareDesktopApproval(options:{
  currentUrl:string
  clearFragment:(cleanUrl:string)=>void
  navigateToCallback:(url:string)=>void
  fetcher?:typeof fetch
}) {
  const page=new URL(options.currentUrl)
  const fragment=page.hash.slice(1)
  page.hash=''
  options.clearFragment(page.href)
  if(!['https://dev.ovelle.org','https://ovelle.org'].includes(page.origin) || page.pathname!=='/desktop/authorize' || page.search)throw unavailable()
  const fields=new URLSearchParams(fragment)
  if([...fields.keys()].sort().join(',')!=='requestId,state')throw unavailable()
  let requestId=fields.get('requestId') ?? '',state=fields.get('state') ?? ''
  if(!requestId || requestId.length>256 || /\p{Cc}/u.test(requestId) || !secretPattern.test(state))throw unavailable()
  const fetcher=options.fetcher ?? fetch
  let csrf:string|null=null,attempted=false
  async function load():Promise<ApprovalStatus> {
    if(attempted)throw unavailable()
    let response:Response
    try {response=await fetcher(`${page.origin}/api/v1/me`,{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer'})} catch {throw unavailable()}
    if(response.status===401){csrf=null;return {kind:'signInRequired'}}
    if(!response.ok)throw unavailable()
    let value:unknown
    try {value=await response.json()} catch {throw unavailable()}
    if(!value || typeof value!=='object' || Array.isArray(value))throw unavailable()
    const data=value as Record<string,unknown>,account=data.account
    if(!account || typeof account!=='object' || Array.isArray(account) || typeof data.csrfToken!=='string' || !secretPattern.test(data.csrfToken))throw unavailable()
    const {displayName,email}=account as Record<string,unknown>
    if(typeof displayName!=='string' || !displayName || typeof email!=='string' || !email)throw unavailable()
    csrf=data.csrfToken
    return {kind:'ready',account:{displayName,email}}
  }
  async function approve():Promise<void> {
    if(attempted || !csrf)throw unavailable()
    // An ambiguous response must start a fresh handoff: approval may already
    // have consumed the one-time server request even if the response was lost.
    attempted=true
    let response:Response
    try {response=await fetcher(`${page.origin}/api/v1/auth/desktop/approve`,{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({requestId,state,confirmation:true})})} catch {throw unavailable()}
    csrf=null
    if(!response.ok)throw unavailable()
    let value:unknown
    try {value=await response.json()} catch {throw unavailable()}
    if(!value || typeof value!=='object' || Array.isArray(value))throw unavailable()
    const url=(value as Record<string,unknown>).callbackUrl
    if(typeof url!=='string')throw unavailable()
    const match=/^http:\/\/127\.0\.0\.1:([1-9][0-9]{3,4})\/ovelle-auth\/callback\?code=([A-Za-z0-9_-]{43})&state=([A-Za-z0-9_-]{43})$/.exec(url)
    if(!match || Number(match[1])<1024 || Number(match[1])>65535 || match[3]!==state)throw unavailable()
    requestId='';state=''
    options.navigateToCallback(url)
  }
  function cancel():void {attempted=true;csrf=null;requestId='';state=''}
  return Object.freeze({load,approve,cancel})
}
