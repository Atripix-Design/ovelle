import type {RequestContext} from '../contracts'
import {Stage0Error} from '../errors'
import {object} from '../http-input'
import {authenticateRequest} from './http'
import {approveDesktopRequest,createDesktopRequest,exchangeDesktopCode,type DesktopApprovalInput,type DesktopExchangeInput,type DesktopRequestInput} from './desktop'
import {authResponse,boundedJsonBody} from './web'

/** Compose only at fixed server routes. The edge supplies canonical IP and a
 * stable environment HMAC key; never read either from a request body/header here.
 * Native creation/exchange must not be reachable through browser credentials. */
export async function handleDesktopAuthRequest(ctx:RequestContext,request:Request,ip:string,budgetKey:Uint8Array):Promise<Response>{
  try{
    const url=new URL(request.url)
    if(url.origin!==ctx.config.origin)throw new Stage0Error('forbidden')
    const match=/^\/api\/v1\/auth\/desktop\/(requests|approve|exchange)$/.exec(url.pathname)
    if(!match)throw new Stage0Error('not_found')
    if(url.search)throw new Stage0Error('invalid_input')
    if(request.method!=='POST')return authResponse(ctx,{error:'invalid_input'},405,{Allow:'POST'})
    const action=match[1]
    if(action==='approve'){
      const principal=await authenticateRequest(ctx,request,'browser')
      const input=object(await boundedJsonBody(request,4096),['requestId','state','confirmation'],true) as unknown as DesktopApprovalInput
      return authResponse(ctx,await approveDesktopRequest(ctx,principal,input))
    }
    if(['Cookie','Origin','Authorization','Sec-Fetch-Site'].some(name=>request.headers.has(name)))throw new Stage0Error('forbidden')
    if(action==='requests'){
      const input=object(await boundedJsonBody(request,4096),['state','challenge','callbackUri'],true) as unknown as DesktopRequestInput
      return authResponse(ctx,await createDesktopRequest(ctx,input,ip,budgetKey),201)
    }
    const input=object(await boundedJsonBody(request,4096),['requestId','state','code','verifier','callbackUri'],true) as unknown as DesktopExchangeInput
    const issued=await exchangeDesktopCode(ctx,input,ip,budgetKey)
    // This secret is returned solely to native main's exchange, never a browser
    // cookie, redirect, account snapshot or renderer-facing IPC response.
    return authResponse(ctx,{token:issued.token,expiresAt:issued.expiresAt})
  }catch(error){const safe=error instanceof Stage0Error?error:new Stage0Error('configuration');return authResponse(ctx,{error:safe.code},safe.status)}
}
