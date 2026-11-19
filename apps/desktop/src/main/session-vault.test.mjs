import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSessionVault } from './session-vault.ts'

const key=randomBytes(32)
const storage={
 isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=> 'gnome_libsecret',
 encryptString(text){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);const data=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data])},
 decryptString(data){const cipher=createDecipheriv('aes-256-gcm',key,data.subarray(0,12));cipher.setAuthTag(data.subarray(12,28));return Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]).toString('utf8')}
}
const session={token:'T'.repeat(43),expiresAt:Date.now()+60_000}

test('vault encrypts, restores and rejects tampered sessions',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ovelle-vault-'))
 try {
  const vault=createSessionVault(dir,storage,'darwin'),path=join(dir,'ovelle-workflow-session.bin')
  assert.equal(await vault.save(session),true)
  const data=await readFile(path);assert.equal(data.includes(session.token),false)
  assert.equal((await stat(path)).mode & 0o777,0o600)
  assert.deepEqual(await vault.load(),session)
  data[data.length-1]^=1;await writeFile(path,data)
  assert.equal(await vault.load(),null)
  assert.equal(await vault.clear(),true)
 } finally {await rm(dir,{recursive:true,force:true})}
})

test('vault refuses insecure or unavailable storage and does not follow symlinks',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ovelle-vault-'))
 try {
  for(const insecure of [{...storage,getSelectedStorageBackend:()=> 'basic_text'},{...storage,isEncryptionAvailable:()=>false}]){
   const vault=createSessionVault(dir,insecure,'linux');assert.equal(await vault.save(session),false);assert.equal(await vault.load(),null)
  }
  const target=join(dir,'target'),path=join(dir,'ovelle-workflow-session.bin')
  await writeFile(target,storage.encryptString(JSON.stringify(session)));await symlink(target,path)
  const vault=createSessionVault(dir,storage,'darwin');assert.equal(await vault.load(),null);assert.equal(await vault.clear(),true)
  assert.ok((await stat(target)).isFile())
 } finally {await rm(dir,{recursive:true,force:true})}
})
