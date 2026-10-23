import type {Principal,RequestContext} from '../contracts'
import {auditStatement,guardedBatch} from '../db'
import {Stage0Error} from '../errors'
import {object} from '../http-input'
import {consumeDesktopStartBudget,finishAuthAttempt,reserveAuthAttempt} from './limits'
import {randomSecret,secretDigest,secretPattern} from './secrets'
import {loadLiveSession,prepareSessionIssuance,type SessionRow} from './sessions'

export interface DesktopRequestInput {state:string;challenge:string;callbackUri:string}
export interface DesktopApprovalInput {requestId:string;state:string;confirmation:true}
export interface DesktopExchangeInput {requestId:string;state:string;code:string;verifier:string;callbackUri:string}
interface HandoffRow {id:string;session_id:string;account_id:string;approved_at:number;code_expires_at:number;expires_at:number}
const encode=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')
async function challenge(verifier:string):Promise<string>{return encode(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))))}
function secret(value:unknown):asserts value is string {if(typeof value!=='string'||!secretPattern.test(value))throw new Stage0Error('invalid_input')}
function identifier(value:unknown):asserts value is string {if(typeof value!=='string'||!value||value.length>256||/\p{Cc}/u.test(value))throw new Stage0Error('invalid_input')}
function callback(value:unknown):asserts value is string {
  // Match raw text before URL parsing: WHATWG normalization must not turn an
  // alias, encoded path, userinfo, backslash or dot segment into a trusted URI.
  if(typeof value!=='string')throw new Stage0Error('invalid_input')
  const match=/^http:\/\/127\.0\.0\.1:([1-9][0-9]{3,4})\/ovelle-auth\/callback$/.exec(value)
  if(!match||Number(match[1])<1024||Number(match[1])>65535)throw new Stage0Error('invalid_input')
}
export async function createDesktopRequest(ctx:RequestContext,input:DesktopRequestInput,ip:string,budgetKey:Uint8Array):Promise<{requestId:string;expiresAt:number}>{
  object(input,['state','challenge','callbackUri'],true);secret(input.state);callback(input.callbackUri)
  if(typeof input.challenge!=='string'||!(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/).test(input.challenge))throw new Stage0Error('invalid_input')
  await consumeDesktopStartBudget(ctx,ip,budgetKey)
  const now=ctx.clock.now(),id=ctx.ids.next(),expiresAt=now+300_000
  await ctx.db.batch([
    ctx.db.prepare('DELETE FROM desktop_auth_requests WHERE id IN (SELECT id FROM desktop_auth_requests WHERE expires_at<=? LIMIT 100)').bind(now),
    ctx.db.prepare('INSERT INTO desktop_auth_requests(id,origin,state_digest,challenge,callback_uri,created_at,expires_at) VALUES(?,?,?,?,?,?,?)')
      .bind(id,ctx.config.origin,await secretDigest(input.state),input.challenge,input.callbackUri,now,expiresAt),
  ])
  return{requestId:id,expiresAt}
}
export async function approveDesktopRequest(ctx:RequestContext,principal:Principal,input:DesktopApprovalInput):Promise<{callbackUrl:string}>{
  object(input,['requestId','state','confirmation'],true);identifier(input.requestId);secret(input.state)
  if(input.confirmation!==true)throw new Stage0Error('invalid_input')
  const source=await loadLiveSession(ctx,principal)
  if(source.transport!=='browser'||source.assurance==='enrollment')throw new Stage0Error('forbidden')
  const now=ctx.clock.now(),code=randomSecret()
  // One UPDATE checks the live browser and pending request while claiming the
  // approval. A second click cannot mint a replacement code or change identity.
  const row=await ctx.db.prepare(`UPDATE desktop_auth_requests SET account_id=?,session_id=?,approved_at=?,code_digest=?,code_expires_at=min(expires_at,?,?)
    WHERE id=? AND origin=? AND state_digest=? AND created_at<=? AND expires_at>? AND approved_at IS NULL AND consumed_at IS NULL
      AND EXISTS(SELECT 1 FROM stage0_live_sessions s WHERE s.id=? AND s.account_id=? AND s.transport='browser' AND s.assurance!='enrollment' AND s.expires_at>? AND s.created_at<=?)
    RETURNING callback_uri`).bind(source.account_id,source.id,now,await secretDigest(code),now+60_000,source.expires_at,input.requestId,ctx.config.origin,await secretDigest(input.state),now,now,source.id,source.account_id,now,now).first<{callback_uri:string}>()
  if(!row)throw new Stage0Error('unauthenticated')
  callback(row.callback_uri)
  const url=new URL(row.callback_uri);url.searchParams.set('code',code);url.searchParams.set('state',input.state)
  return{callbackUrl:url.href}
}
export async function exchangeDesktopCode(ctx:RequestContext,input:DesktopExchangeInput,ip:string,budgetKey:Uint8Array){
  object(input,['requestId','state','code','verifier','callbackUri'],true);identifier(input.requestId);secret(input.state);secret(input.code);callback(input.callbackUri)
  if(typeof input.verifier!=='string'||!/^[A-Za-z0-9._~-]{43,128}$/.test(input.verifier))throw new Stage0Error('invalid_input')
  const lease=await reserveAuthAttempt(ctx,{email:'desktop-exchange',ip},budgetKey)
  let success=false
  try{
    const now=ctx.clock.now(),stateDigest=await secretDigest(input.state),codeDigest=await secretDigest(input.code),codeChallenge=await challenge(input.verifier)
    const match=`id=? AND origin=? AND state_digest=? AND code_digest=? AND challenge=? AND callback_uri=?
      AND created_at<=? AND expires_at>? AND approved_at<=? AND code_expires_at>? AND consumed_at IS NULL`
    const values=[input.requestId,ctx.config.origin,stateDigest,codeDigest,codeChallenge,input.callbackUri,now,now,now,now]
    const handoff=await ctx.db.prepare(`SELECT id,session_id,account_id,approved_at,code_expires_at,expires_at FROM desktop_auth_requests WHERE ${match}`).bind(...values).first<HandoffRow>()
    if(!handoff)throw new Stage0Error('unauthenticated')
    const source=await loadLiveSession(ctx,{sessionId:handoff.session_id,accountId:handoff.account_id,transport:'browser'} as Principal)
    if(source.assurance==='enrollment')throw new Stage0Error('unauthenticated')
    // The source row is immutable authentication evidence. Copy provenance,
    // credential binding and absolute expiry; exchanging is not reauthentication.
    const row:SessionRow={...source,id:ctx.ids.next(),transport:'desktop',created_at:now}
    const prepared=await prepareSessionIssuance(ctx,row)
    await guardedBatch(ctx,`EXISTS(SELECT 1 FROM desktop_auth_requests WHERE ${match} AND session_id=? AND account_id=?)
      AND EXISTS(SELECT 1 FROM stage0_live_sessions s WHERE s.id=? AND s.account_id=? AND s.transport='browser' AND s.assurance!='enrollment' AND s.expires_at>? AND s.created_at<=?)`,
    [...values,source.id,source.account_id,source.id,source.account_id,now,now],[
      ctx.db.prepare('UPDATE desktop_auth_requests SET consumed_at=? WHERE id=?').bind(now,handoff.id),prepared.insert,
      auditStatement(ctx,'session.issue',row.id,{accountId:source.account_id,sessionId:source.id}),
    ])
    success=true
    return {...prepared.issued,expiresAt:row.expires_at}
  }finally{await finishAuthAttempt(ctx,lease,success)}
}
