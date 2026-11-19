import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

const secretPattern = /^[A-Za-z0-9_-]{43}$/
const maxHandoffMs = 5 * 60_000
const failure = () => new Error('Desktop sign-in unavailable')

/** This protocol lives in Electron main. Neither the bearer nor the verifier is
 * returned to the renderer. The caller owns session storage and all API calls.
 * The origin and browser opener are selected by main, never by renderer input. */
export async function desktopHandoff(options: {
  origin: string
  openApproval: (url: string) => Promise<void>
  fetcher?: typeof fetch
  timeoutMs?: number
}): Promise<{token:string;expiresAt:number}> {
  const origin = new URL(options.origin)
  if (origin.protocol !== 'https:' || origin.origin !== options.origin || origin.username || origin.password) throw failure()
  const timeoutMs = options.timeoutMs ?? maxHandoffMs
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > maxHandoffMs) throw failure()
  let deadline=Date.now()+timeoutMs
  const state=randomBytes(32).toString('base64url')
  const verifier=randomBytes(32).toString('base64url')
  const challenge=createHash('sha256').update(verifier).digest('base64url')
  let accept: ((value:string)=>void) | undefined
  let port=0
  let consumed=false
  const callback = new Promise<string>(resolve => { accept=resolve })
  const server=createServer((req,res)=>{
    const code=validateCallback(req,port,state)
    if (!code || consumed) {respond(res,400,'Invalid sign-in response.');return}
    consumed=true
    respond(res,200,'You can return to Ovelle.')
    accept?.(code)
  })
  server.maxHeadersCount=32
  server.requestTimeout=5_000
  server.headersTimeout=5_000
  try {
    await new Promise<void>((resolve,reject)=>{
      server.once('error',reject)
      server.listen({host:'127.0.0.1',port:0,exclusive:true},()=>resolve())
    })
    port=(server.address() as AddressInfo).port
    if(port<1024 || port>65535)throw failure()
    const callbackUri=`http://127.0.0.1:${port}/ovelle-auth/callback`
    const fetcher=options.fetcher ?? fetch
    const post=async(path:string,body:unknown):Promise<Record<string,unknown>>=>{
      const remaining=deadline-Date.now()
      if(remaining<=0)throw failure()
      const response=await fetcher(`${origin.origin}${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(remaining)})
      if(!response.ok)throw failure()
      const result:unknown=await response.json()
      if(!result || typeof result!=='object' || Array.isArray(result))throw failure()
      return result as Record<string,unknown>
    }
    const pending=await post('/api/v1/auth/desktop/requests',{state,challenge,callbackUri})
    if(typeof pending.requestId!=='string' || !pending.requestId || pending.requestId.length>256 || /\p{Cc}/u.test(pending.requestId) || !Number.isSafeInteger(pending.expiresAt) || (pending.expiresAt as number)<=Date.now())throw failure()
    deadline=Math.min(deadline,pending.expiresAt as number)
    const approval=new URL('/desktop/authorize',origin)
    approval.hash=new URLSearchParams({requestId:pending.requestId,state}).toString()
    await beforeDeadline(options.openApproval(approval.href),deadline)
    const code=await beforeDeadline(callback,deadline)
    const issued=await post('/api/v1/auth/desktop/exchange',{requestId:pending.requestId,state,code,verifier,callbackUri})
    if(typeof issued.token!=='string' || !secretPattern.test(issued.token) || !Number.isSafeInteger(issued.expiresAt) || (issued.expiresAt as number)<=Date.now())throw failure()
    return {token:issued.token,expiresAt:issued.expiresAt as number}
  } catch {throw failure()}
  finally {server.closeAllConnections();server.close()}
}

async function beforeDeadline<T>(work:Promise<T>,deadline:number):Promise<T> {
  const remaining=deadline-Date.now()
  if(remaining<=0)throw failure()
  let timer:ReturnType<typeof setTimeout> | undefined
  try {return await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(failure()),remaining)})])}
  finally {if(timer)clearTimeout(timer)}
}

function validateCallback(req:IncomingMessage,port:number,state:string):string|null {
  if(req.method!=='GET' || req.socket.remoteAddress!=='127.0.0.1' || req.headers.host!==`127.0.0.1:${port}` || !req.url?.startsWith('/ovelle-auth/callback?'))return null
  let url:URL
  try {url=new URL(req.url,`http://127.0.0.1:${port}`)} catch {return null}
  if(url.pathname!=='/ovelle-auth/callback' || url.hash || [...url.searchParams.keys()].sort().join(',')!=='code,state')return null
  const returned=url.searchParams.get('state'),code=url.searchParams.get('code')
  if(!returned || !code || !secretPattern.test(returned) || !secretPattern.test(code))return null
  if(!timingSafeEqual(Buffer.from(returned),Buffer.from(state)))return null
  return code
}
function respond(res:ServerResponse,status:number,message:string) {
  res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff','Connection':'close'})
  res.end(message)
}
