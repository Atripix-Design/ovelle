import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { chromium } from 'playwright'
const source=await build({entryPoints:['apps/shared/desktop-approval.ts'],bundle:true,format:'iife',globalName:'approvalModule',platform:'browser',write:false})
const state='s'.repeat(43),code='c'.repeat(43),csrf='t'.repeat(43)
const browser=await chromium.launch({headless:true})
try {
 const context=await browser.newContext({serviceWorkers:'block'})
 let signedIn=false,posts=0,callback=`http://127.0.0.1:12345/ovelle-auth/callback?code=${code}&state=${state}`,observed
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url())
  if(url.origin!=='https://dev.ovelle.org')return route.abort()
  if(url.pathname==='/desktop/authorize')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Approval test fixture</title>'})
  if(url.pathname==='/api/v1/me')return route.fulfill(signedIn?{status:200,json:{account:{displayName:'Owner',email:'owner@example.test'},csrfToken:csrf}}:{status:401,json:{error:'unauthenticated'}})
  if(url.pathname==='/api/v1/auth/desktop/approve'){
   posts++;observed={body:request.postDataJSON(),headers:request.headers()}
   return route.fulfill({status:200,json:{callbackUrl:callback}})
  }
  return route.abort()
 })
 async function open(){
  const page=await context.newPage()
  await page.goto(`https://dev.ovelle.org/desktop/authorize#requestId=request-1&state=${state}`)
  await page.addScriptTag({content:source.outputFiles[0].text})
  await page.evaluate(()=>{window.destinations=[];window.approval=window.approvalModule.prepareDesktopApproval({currentUrl:location.href,clearFragment:url=>history.replaceState(null,'',url),navigateToCallback:url=>window.destinations.push(url)})})
  return page
 }
 const page=await open()
 assert.equal(new URL(page.url()).hash,'')
 assert.equal(await page.evaluate(()=>window.approval.approve().then(()=>false,()=>true)),true)
 assert.deepEqual(await page.evaluate(()=>window.approval.load()),{kind:'signInRequired'})
 assert.equal(posts,0)
 signedIn=true
 assert.deepEqual(await page.evaluate(()=>window.approval.load()),{kind:'ready',account:{displayName:'Owner',email:'owner@example.test'}})
 assert.equal(posts,0)
 await page.evaluate(()=>window.approval.approve())
 assert.equal(posts,1);assert.deepEqual(observed.body,{requestId:'request-1',state,confirmation:true})
 assert.equal(observed.headers['x-csrf-token'],csrf);assert.deepEqual(await page.evaluate(()=>window.destinations),[callback])
 assert.equal(await page.evaluate(()=>window.approval.approve().then(()=>false,()=>true)),true);assert.equal(posts,1)
 callback=`http://evil.example:12345/ovelle-auth/callback?code=${code}&state=${state}`
 const malicious=await open();await malicious.evaluate(()=>window.approval.load())
 assert.equal(await malicious.evaluate(()=>window.approval.approve().then(()=>false,()=>true)),true)
 assert.deepEqual(await malicious.evaluate(()=>window.destinations),[])
 assert.equal(await malicious.evaluate(()=>window.approval.approve().then(()=>false,()=>true)),true)
 const invalid=await context.newPage();await invalid.goto(`https://dev.ovelle.org/desktop/authorize#requestId=r&state=${state}&state=${state}`);await invalid.addScriptTag({content:source.outputFiles[0].text})
 assert.equal(await invalid.evaluate(()=>{try{window.approvalModule.prepareDesktopApproval({currentUrl:location.href,clearFragment:url=>history.replaceState(null,'',url),navigateToCallback:()=>{}});return false}catch{return true}}),true)
 assert.equal(new URL(invalid.url()).hash,'')
 console.log('Desktop browser approval controller: explicit consent, session/CSRF, URL redaction and callback restrictions passed with fixture HTTP.')
} finally {await browser.close()}
