import { randomBytes } from 'node:crypto'
import { constants } from 'node:fs'
import { mkdir,open,rename,unlink } from 'node:fs/promises'
import { join } from 'node:path'

type SafeStorage={isEncryptionAvailable:()=>boolean;getSelectedStorageBackend:()=>string;encryptString:(text:string)=>Buffer;decryptString:(data:Buffer)=>string}
type Session={token:string;expiresAt:number}
const secret=/^[A-Za-z0-9_-]{43}$/
const valid=(value:unknown):value is Session=>{
 if(!value || typeof value!=='object' || Array.isArray(value))return false
 const row=value as Record<string,unknown>
 return Object.keys(row).sort().join(',')==='expiresAt,token' && typeof row.token==='string' && secret.test(row.token) && Number.isSafeInteger(row.expiresAt) && (row.expiresAt as number)>0
}

/** Atomic OS-encrypted storage. Unsupported or locked storage is memory-only;
 * no plaintext fallback is written. This does not authenticate a loaded token. */
export function createSessionVault(directory:string,storage:SafeStorage,platform:NodeJS.Platform) {
 const path=join(directory,'ovelle-workflow-session.bin')
 const available=()=>{
  // Linux keyring discovery can block startup in headless environments.
  // Until that path can be made non-blocking, keep Linux sessions in memory.
  try {return platform!=='linux' && storage.isEncryptionAvailable()}
  catch{return false}
 }
 async function load():Promise<Session|null>{
  if(!available())return null
  let handle
  try {
   handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW)
   const info=await handle.stat()
   if(!info.isFile() || info.size<1 || info.size>8192)return null
   const plain=storage.decryptString(await handle.readFile()),decoded:unknown=JSON.parse(plain)
   return valid(decoded)?decoded:null
  } catch {return null} finally {await handle?.close().catch(()=>{})}
 }
 async function save(session:Session):Promise<boolean>{
  if(!valid(session) || !available())return false
  const temporary=join(directory,`.ovelle-session-${randomBytes(16).toString('hex')}.tmp`)
  try {
   const encrypted=storage.encryptString(JSON.stringify(session))
   if(!encrypted.length || encrypted.length>8192)return false
   await mkdir(directory,{recursive:true,mode:0o700})
   const handle=await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600)
   try {await handle.writeFile(encrypted);await handle.sync()} finally {await handle.close()}
   await rename(temporary,path)
   return true
  } catch {return false} finally {await unlink(temporary).catch(()=>{})}
 }
 async function clear():Promise<boolean>{
  try {await unlink(path);return true} catch(error){return (error as NodeJS.ErrnoException).code==='ENOENT'}
 }
 return Object.freeze({load,save,clear})
}
