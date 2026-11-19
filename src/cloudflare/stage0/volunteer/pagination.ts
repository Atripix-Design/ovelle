import { encodeBase64Url } from '../domain/base64url'
import { Stage0Error } from '../errors'

export interface WorkflowPosition { time:number; ids:string[] }
/** Cursors carry stable identifiers and ordering time, never names or evidence. */
export function encodeWorkflowCursor(scope:string[],position:WorkflowPosition):string {
 return encodeBase64Url(new TextEncoder().encode(JSON.stringify([1,scope,position.time,position.ids])))
}
export function decodeWorkflowCursor(raw:string,scope:string[],idCount:number):WorkflowPosition {
 try {
  if(raw.length>2048 || !/^[A-Za-z0-9_-]+$/.test(raw))throw new Error()
  const value:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(Uint8Array.from(atob(raw.replaceAll('-','+').replaceAll('_','/')),v=>v.charCodeAt(0))))
  if(!Array.isArray(value) || value.length!==4 || value[0]!==1 || !Array.isArray(value[1]) || value[1].length!==scope.length || scope.some((v,i)=>value[1][i]!==v) || !Number.isSafeInteger(value[2]) || value[2]<0 || !Array.isArray(value[3]) || value[3].length!==idCount || value[3].some((v:unknown)=>typeof v!=='string' || !v || v.length>256 || /\p{Cc}/u.test(v)))throw new Error()
  const position={time:value[2] as number,ids:value[3] as string[]}
  if(encodeWorkflowCursor(scope,position)!==raw)throw new Error()
  return position
 }catch {throw new Stage0Error('invalid_input')}
}
