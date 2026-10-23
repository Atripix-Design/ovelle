import type {Grant,Scope} from '../contracts'
import {parseAction} from '../contracts'
import {Stage0Error} from '../errors'
import {validateScope} from '../access/policy'
const orgScope:Scope={kind:'organization'}
const coordinatorActions = new Set(['program.read','program.manage','location.read','location.manage'])
function invalid(): never { throw new Stage0Error('invalid_input') }
export function identifier(value: unknown): string { if(typeof value!=='string'||!value||value.length>256||/\p{Cc}/u.test(value))return invalid();return value }
export function version(value: unknown): number { if(!Number.isSafeInteger(value)||(value as number)<1||(value as number)>=Number.MAX_SAFE_INTEGER)return invalid();return value as number }
export function normalizedGrants(value: unknown, preset: 'admin'|'coordinator'): Grant[] {
  if(!Array.isArray(value)||value.length>32)return invalid()
  const grants=value.map((entry: Grant)=>{
    if(!entry||typeof entry!=='object')return invalid()
    let action: Grant['action']
    try { action=parseAction(entry.action) } catch { return invalid() }
    if(action==='staff.manage_admins'||action==='ownership.transfer'||(preset==='coordinator'&&!coordinatorActions.has(action)))return invalid()
    validateScope(entry.scope)
    const scope: Scope=entry.scope.kind==='organization'?orgScope:{kind:'program_location',...('programId' in entry.scope&&entry.scope.programId!==undefined?{programId:identifier(entry.scope.programId)}:{}),...('locationId' in entry.scope&&entry.scope.locationId!==undefined?{locationId:identifier(entry.scope.locationId)}:{})} as Scope
    return {action,scope}
  }).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))
  if(new Set(grants.map(grant=>JSON.stringify(grant))).size!==grants.length)return invalid()
  return grants
}
