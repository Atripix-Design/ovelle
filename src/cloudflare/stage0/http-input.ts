import type {Grant} from './contracts'
import {Stage0Error} from './errors'

// Shared strict transport DTO parsing; domain validation remains in services.
export function segment(value:string):string {
  let decoded:string
  try {decoded=decodeURIComponent(value)} catch {throw new Stage0Error('invalid_input')}
  if(!decoded||decoded.length>256||/[\p{Cc}/?#]/u.test(decoded))throw new Stage0Error('invalid_input')
  return decoded
}
export function object(value:unknown,fields:string[],required=false):Record<string,unknown> {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!fields.includes(key))||(required&&fields.some(key=>!Object.hasOwn(value,key))))throw new Stage0Error('invalid_input')
  return value as Record<string,unknown>
}
export function grants(value:unknown):Grant[] {
  if(!Array.isArray(value)||value.length>32)throw new Stage0Error('invalid_input')
  for(const grant of value){const parsed=object(grant,['action','scope'],true);object(parsed.scope,['kind','programId','locationId'])}
  // Domain validation owns the closed action vocabulary and dimensional rules.
  return value as Grant[]
}
