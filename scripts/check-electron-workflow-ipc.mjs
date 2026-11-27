import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright'

const require=createRequire(import.meta.url)
const userData=await mkdtemp(join(tmpdir(),'ovelle-electron-ipc-'))
const app=await _electron.launch({executablePath:require('electron'),args:[fileURLToPath(new URL('../apps/desktop/out/main/index.js',import.meta.url)),`--user-data-dir=${userData}`,'--disable-gpu']})
try {
  const page=await app.firstWindow()
  await page.waitForFunction(()=>Boolean(window.ovelleWorkflow))
  await app.evaluate(({shell})=>{
    const realFetch=globalThis.fetch
    globalThis.workflowCalls=[]
    globalThis.fetch=async(url,init)=>{
      globalThis.workflowCalls.push({url:String(url),headers:init?.headers,body:init?.body})
      if(String(url).endsWith('/auth/desktop/requests')) {
        globalThis.workflowPending=JSON.parse(init.body)
        return Response.json({requestId:'fixture-request',expiresAt:Date.now()+60_000})
      }
      if(String(url).endsWith('/auth/desktop/exchange'))return Response.json({token:'T'.repeat(43),expiresAt:Date.now()+60_000})
      if(String(url).endsWith('/native/me/organizations'))return Response.json({organizations:[{id:'fixture-org'}],nextCursor:null})
      if(String(url).endsWith('/native/auth/logout'))return new Response(null,{status:204})
      return new Response(null,{status:404})
    }
    shell.openExternal=async(url)=>{
      const state=new URLSearchParams(new URL(url).hash.slice(1)).get('state')
      const response=await realFetch(`${globalThis.workflowPending.callbackUri}?code=${'c'.repeat(43)}&state=${state}`)
      if(!response.ok)throw new Error('fixture callback failed')
    }
  })
  assert.deepEqual(await page.evaluate(()=>window.ovelleWorkflow.status()),{signedIn:false,persistent:false})
  const signedIn=await page.evaluate(()=>window.ovelleWorkflow.signIn())
  assert.equal(signedIn.signedIn,true);assert.equal(typeof signedIn.persistent,'boolean')
  const result=await page.evaluate(()=>window.ovelleWorkflow.request({operation:'organizations'}))
  assert.deepEqual(result,{organizations:[{id:'fixture-org'}],nextCursor:null})
  assert.equal(JSON.stringify(result).includes('T'.repeat(43)),false)
  const calls=await app.evaluate(()=>globalThis.workflowCalls)
  assert.equal(calls.at(-1).headers.Authorization,`Bearer ${'T'.repeat(43)}`)
  await assert.rejects(page.evaluate(()=>window.ovelleWorkflow.request({operation:'fetch',url:'https://evil.test'})),/Invalid workflow request/)
  await page.goto('about:blank')
  await page.waitForFunction(()=>Boolean(window.ovelleWorkflow))
  await assert.rejects(page.evaluate(()=>window.ovelleWorkflow.status()),/Untrusted workflow request/)
  await assert.rejects(page.evaluate(()=>window.ovelleWorkflow.request({operation:'organizations'})),/Untrusted workflow request/)
  console.log('Electron workflow IPC: fixture handoff, bearer isolation, allowlist and navigation revocation passed.')
} finally {await app.close();await rm(userData,{recursive:true,force:true})}
