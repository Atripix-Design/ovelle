import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { readD1Migrations } from '@cloudflare/vitest-plugin'
import { _electron, chromium } from 'playwright'

// This harness uses a synthetic browser session and a disposable local DB.
// It is not a deployment, real user sign-in, or a designed approval UI.
const origin='https://dev.ovelle.org',control=randomBytes(32).toString('hex')
const bundle=await build({entryPoints:['tests/worker/stage0/desktop-workflow-fixture-worker.ts'],bundle:true,format:'esm',platform:'node',write:false,banner:{js:"import {createRequire} from 'node:module'; const require=createRequire('/script-0.mjs');"}})
const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-10-06',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],bindings:{CONTROL:control},outboundService:()=>new Response(null,{status:503})}))
let server,app,browserApp,userData
try {
 const db=await runtime.getD1Database('DB')
 for(const migration of await readD1Migrations('./migrations'))await db.batch(migration.queries.map(query=>db.prepare(query)))
 const now=Date.now()
 await db.batch([
  db.prepare("INSERT INTO accounts(id,email,display_name,email_verified_at,created_at) VALUES('owner','owner@example.test','Owner',?,?)").bind(now,now),
  db.prepare("INSERT INTO accounts(id,email,display_name,email_verified_at,created_at) VALUES('coordinator','coordinator@example.test','Coordinator',?,?)").bind(now,now),
  db.prepare("INSERT INTO accounts(id,email,display_name,email_verified_at,created_at) VALUES('new-owner','new-owner@example.test','New Owner',?,?)").bind(now,now),
  db.prepare("INSERT INTO organizations(id,name,owner_account_id,created_by_account_id,created_at) VALUES('org-a','Fixture','owner','owner',?)").bind(now),
  db.prepare("INSERT INTO programs(id,organization_id,name) VALUES('program','org-a','Program')"),
  db.prepare("INSERT INTO locations(id,organization_id,name) VALUES('site','org-a','Site')"),
  db.prepare("INSERT INTO organization_memberships(id,organization_id,account_id,preset) VALUES('member','org-a','coordinator','coordinator')"),
  db.prepare("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind,program_id,location_id) VALUES('read','member','org-a','program.read','program_location','program','site')"),
 ])
 const boot=await runtime.dispatchFetch(`${origin}/__fixture/bootstrap`,{method:'POST',headers:{'X-Fixture-Control':control}})
 assert.equal(boot.status,200);const browser=await boot.json()
 let receiveApproval
 let approvalOpened=new Promise(resolve=>{receiveApproval=resolve})
 server=createServer(async(req,res)=>{
  try {
   if(req.socket.remoteAddress!=='127.0.0.1')throw new Error('outside fixture')
   const chunks=[];let size=0
   for await(const chunk of req){size+=chunk.length;if(size>20_000)throw new Error('too large');chunks.push(chunk)}
   if(req.url==='/__fixture/open'){
    if(req.headers['x-fixture-control']!==control || req.method!=='POST'){res.statusCode=404;res.end();return}
    receiveApproval(Buffer.concat(chunks).toString());res.statusCode=204;res.end();return
   }
   const result=await runtime.dispatchFetch(origin+req.url,{method:req.method,headers:req.headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})})
   res.statusCode=result.status
   for(const [name,value] of result.headers)if(name!=='set-cookie')res.setHeader(name,value)
   res.end(Buffer.from(await result.arrayBuffer()))
  } catch {res.statusCode=500;res.end('fixture failure')}
 })
 server.listen(0,'127.0.0.1');await once(server,'listening')
 const local=`http://127.0.0.1:${server.address().port}`
 const require=createRequire(import.meta.url)
 userData=await mkdtemp(join(tmpdir(),'ovelle-electron-backend-'))
 app=await _electron.launch({executablePath:require('electron'),args:[fileURLToPath(new URL('../apps/desktop/out/main/index.js',import.meta.url)),`--user-data-dir=${userData}`,'--disable-gpu']})
 const page=await app.firstWindow();await page.waitForFunction(()=>Boolean(window.ovelleWorkflow))
 await app.evaluate(({shell},{local,control,origin})=>{
  const nativeFetch=globalThis.fetch
  globalThis.fetch=(value,init)=>{
   const url=new URL(String(value))
   if(url.origin!==origin)throw new Error('unexpected outbound request')
   return nativeFetch(local+url.pathname+url.search,init)
  }
  shell.openExternal=async value=>{
   const opened=await nativeFetch(local+'/__fixture/open',{method:'POST',headers:{'X-Fixture-Control':control},body:value})
   if(!opened.ok)throw new Error('fixture browser launch failed')
  }
 },{local,control,origin})
 const approvalBundle=await build({stdin:{contents:`import React from 'react'; import {createRoot} from 'react-dom/client'; import Approval from './apps/web/src/DesktopApprovalPage'; createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode,null,React.createElement(Approval)));`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'esm',platform:'browser',jsx:'automatic',loader:{'.css':'empty'},write:false})
 browserApp=await chromium.launch({headless:true})
 const context=await browserApp.newContext({serviceWorkers:'block'})
 await context.addCookies([{name:'__Host-ovelle_session',value:browser.token,domain:'dev.ovelle.org',path:'/',secure:true,httpOnly:true,sameSite:'Strict'}])
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url())
  if(url.hostname==='127.0.0.1' && url.pathname==='/ovelle-auth/callback')return route.continue()
  if(url.origin!==origin)return route.abort()
  if(url.pathname==='/desktop/authorize')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Approval test fixture</title><div id="root"></div><script type="module" src="/__fixture/approval.js"></script>'})
  if(url.pathname==='/__fixture/approval.js')return route.fulfill({status:200,contentType:'text/javascript',body:approvalBundle.outputFiles[0].text})
  const response=await fetch(local+url.pathname+url.search,{method:request.method(),headers:await request.allHeaders(),...(request.postDataBuffer()?{body:request.postDataBuffer()}:{})})
  return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())})
 })
 const signIn=page.evaluate(()=>window.ovelleWorkflow.signIn()); signIn.catch(()=>{})
 const browserPage=await context.newPage(); browserPage.on('pageerror', error=>console.error('Approval page error:',error.message))
 const approvalUrl=await approvalOpened
 await browserPage.goto(approvalUrl)
 await browserPage.getByRole('button',{name:'Approve device'}).waitFor({timeout:8000}).catch(async error=>{console.error('Approval page:',await browserPage.locator('body').innerText());throw error})
 assert.equal(new URL(browserPage.url()).hash,'')
 await browserPage.getByRole('button',{name:'Approve device'}).click()
 await signIn
 const result=await page.evaluate(async()=>{
  const api=window.ovelleWorkflow,scope={organizationId:'org-a',programId:'program',locationId:'site'}
  let sequence=0
  const write=(operation,fields)=>api.request({operation,...scope,...fields,idempotencyKey:`electron-workflow-${++sequence}`})
  const organizations=await api.request({operation:'organizations'})
  await api.request({operation:'replaceVolunteerGrants',organizationId:'org-a',membershipId:'member',expectedVersion:1,grants:[{action:'assignment.manage',programId:'program',locationId:'site'}],idempotencyKey:'electron-grants-0001'})
  const grants=await api.request({operation:'volunteerGrants',organizationId:'org-a',membershipId:'member'})
  const start=Date.now()+60_000,end=start+60_000
  const occurrence=await write('createOccurrence',{title:'Fixture shift',startsAt:start,endsAt:end,capacity:1})
  const role=await write('createRole',{occurrenceId:occurrence.id,name:'Volunteer',capacity:1})
  const criterion=await write('createCriterion',{occurrenceId:occurrence.id,roleId:role.id,name:'Waiver'})
  await write('publishOccurrence',{occurrenceId:occurrence.id})
  const person=await write('createVolunteer',{displayName:'Fixture volunteer'})
  const search=await api.request({operation:'searchVolunteers',...scope,search:'Fixture'})
  const identity={occurrenceId:occurrence.id,roleId:role.id,personId:person.id}
  await write('openReadiness',identity)
  await write('recordEvidence',{...identity,criterionId:criterion.id,state:'verified',validFrom:start-1,validUntil:end,note:'Verified in fixture',expectedEvidenceId:null})
  await write('decideReadiness',{...identity,state:'ready',evidenceNote:'Reviewed'})
  const assigned=await write('assign',identity)
  const roster=await api.request({operation:'roster',...scope,occurrenceId:occurrence.id})
  await write('checkIn',{assignmentId:assigned.id});await write('checkOut',{assignmentId:assigned.id})
  const submission=await write('submitHours',{assignmentId:assigned.id,startAt:0,endAt:60_000,breakMinutes:0})
  const before=await api.request({operation:'serviceHistory',...scope})
  const question=await write('reviewHours',{submissionId:submission.id,decision:'clarify',approvedMinutes:null,reason:'Was there a break?'})
  await write('recordClarification',{submissionId:submission.id,expectedDecisionId:question.id,response:'Volunteer reported no break'})
  const decision=await write('reviewHours',{submissionId:submission.id,decision:'approve',approvedMinutes:1,reason:null,expectedDecisionId:question.id})
  const reviewHistory=await api.request({operation:'hoursHistory',...scope,submissionId:submission.id})
  const after=await api.request({operation:'serviceHistory',...scope})
  const correction=await write('requestCorrection',{assignmentId:assigned.id,reason:'Fixture checkout correction'})
  const queue=await api.request({operation:'corrections',...scope})
  await write('resolveCorrection',{correctionId:correction.id,expectedDecisionId:decision.id,checkedInAt:0,checkedOutAt:120_000,approvedMinutes:2,reason:'Confirmed corrected time'})
  const amended=await api.request({operation:'serviceHistory',...scope})
  const replacementShift=await write('createOccurrence',{title:'Replacement shift',startsAt:start+180_000,endsAt:end+180_000,capacity:1})
  const replacementRole=await write('createRole',{occurrenceId:replacementShift.id,name:'Volunteer',capacity:1})
  await write('publishOccurrence',{occurrenceId:replacementShift.id})
  const replacement=await write('createVolunteer',{displayName:'Replacement volunteer'})
  for(const personId of [person.id,replacement.id]){
   const candidate={occurrenceId:replacementShift.id,roleId:replacementRole.id,personId}
   await write('openReadiness',candidate);await write('decideReadiness',{...candidate,state:'ready',evidenceNote:'Reviewed'})
  }
  const initial=await write('assign',{occurrenceId:replacementShift.id,roleId:replacementRole.id,personId:person.id})
  const waiting=await write('joinWaitlist',{occurrenceId:replacementShift.id,roleId:replacementRole.id,personId:replacement.id})
  await write('cancelAssignment',{assignmentId:initial.id,reason:'Unavailable'})
  const offer=await write('offerWaitlist',{waitlistId:waiting.id,expiresAt:Date.now()+30_000})
  await write('confirmOffer',{offerId:offer.id,confirmationNote:'Accepted by phone'})
  const replacementRoster=await api.request({operation:'roster',...scope,occurrenceId:replacementShift.id})
  const walkShift=await write('createOccurrence',{title:'Walk-in shift',startsAt:start+360_000,endsAt:end+360_000,capacity:1})
  const walkRole=await write('createRole',{occurrenceId:walkShift.id,name:'Volunteer',capacity:1})
  await write('publishOccurrence',{occurrenceId:walkShift.id})
  const walkIdentity={occurrenceId:walkShift.id,roleId:walkRole.id,personId:person.id}
  await write('openReadiness',walkIdentity);await write('decideReadiness',{...walkIdentity,state:'ready',evidenceNote:'Reviewed'})
  await write('registerWalkIn',walkIdentity)
  const walkRoster=await api.request({operation:'roster',...scope,occurrenceId:walkShift.id})
  return {organizations,grants,search,roster,before,after,reviewHistory,queue,amended,replacementRoster,walkRoster}
 })
 assert.equal(result.organizations.organizations[0].id,'org-a')
 assert.deepEqual(result.grants.grants,[{action:'assignment.manage',programId:'program',locationId:'site'}])
 assert.equal(result.search.volunteers[0].displayName,'Fixture volunteer')
 assert.equal(result.roster.volunteers[0].name,'Fixture volunteer');assert.equal(result.roster.volunteers[0].readiness,'ready')
 assert.deepEqual(result.before.records,[]);assert.equal(result.after.records[0].approvedMinutes,1);assert.equal(result.after.records[0].name,'Fixture volunteer')
 assert.equal(result.reviewHistory.decisions[0].responseSource,'staff_recorded');assert.equal(result.reviewHistory.decisions[0].response,'Volunteer reported no break')
 assert.equal(result.queue.corrections[0].latestDecisionId,result.after.records[0].decisionId);assert.equal(result.amended.records[0].approvedMinutes,2)
 assert.equal(result.replacementRoster.volunteers[0].name,'Replacement volunteer')
 assert.equal(result.walkRoster.summary.onSite,1);assert.equal(result.walkRoster.volunteers[0].presence,'on_site')
 // The fixture authenticated through IPC; remount the renderer to observe that session.
 await page.reload()
 await page.getByLabel('Organization').selectOption('org-a')
 await page.getByLabel('Program').selectOption('program')
 await page.getByLabel('Location').selectOption('site')
 const localInput = value => { const d = new Date(value); return new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,16) }
 await page.getByLabel('Title',{exact:true}).fill('UI-created shift')
 await page.getByLabel('Start',{exact:true}).fill(localInput(Date.now()+86400000))
 await page.getByLabel('End',{exact:true}).fill(localInput(Date.now()+90000000))
 await page.getByLabel('Capacity',{exact:true}).fill('2')
 await page.getByRole('button',{name:'Create draft'}).click()
 await page.getByRole('button',{name:/UI-created shift.*Set up draft/}).click()
 await page.getByLabel('Role name').fill('UI role')
 await page.getByRole('button',{name:'Add role'}).click()
 await page.getByLabel('Role for requirement').selectOption({label:'UI role'})
 await page.getByLabel('Requirement name').fill('UI briefing')
 await page.getByRole('button',{name:'Add requirement'}).click()
 await page.getByText('UI briefing',{exact:false}).waitFor()
 await page.getByRole('button',{name:'Review publication'}).click()
 await page.getByRole('button',{name:'Confirm publication'}).click()
 await page.getByRole('button',{name:/UI-created shift.*Open roster/}).click()
 await page.getByRole('button',{name:'Readiness'}).click()
 await page.getByLabel('Volunteer name').fill('UI New Person')
 await page.getByRole('button',{name:'Search existing volunteers'}).click()
 await page.getByText('No matches found in this scope.').waitFor()
 await page.getByRole('button',{name:'Review new volunteer'}).click()
 await page.getByRole('button',{name:'Confirm new volunteer'}).click()
 await page.getByRole('combobox', { name: /^Volunteer/ }).selectOption({label:'UI New Person'})
 await page.getByLabel('Review role').selectOption({label:'UI role'})
 await page.getByRole('button',{name:'Open review'}).click()
 await page.getByRole('button',{name:/UI New Person.*UI-created shift/}).click()
 await page.getByRole('button',{name:'Record evidence for UI briefing'}).click()
 await page.getByLabel('Valid from').fill(localInput(Date.now()-86400000))
 await page.getByLabel('Evidence note').fill('Briefing verified')
 await page.getByRole('button',{name:'Review evidence'}).click()
 await page.getByRole('button',{name:'Confirm evidence'}).click()
 await page.getByRole('button',{name:/UI New Person.*UI-created shift/}).click()
 await page.getByLabel('Review note').fill('Requirements reviewed')
 await page.getByRole('button',{name:'Review ready decision'}).click()
 await page.getByRole('button',{name:'Confirm decision'}).click()
 await page.getByRole('button',{name:/UI New Person.*UI-created shift/}).click()
 await page.getByRole('button',{name:'Review assignment'}).click()
 await page.getByRole('button',{name:'Confirm assignment'}).click()
 await page.getByRole('heading',{name:'Day-of roster'}).waitFor()
 await page.getByText('UI New Person',{exact:true}).waitFor()
 await page.getByRole('button',{name:'Check in'}).click()
 await page.getByRole('button',{name:'Check out'}).click()
 await page.getByRole('button',{name:'Submit hours'}).click()
 await page.getByLabel('Hours start').fill(localInput(Date.now()-7200000))
 await page.getByLabel('Hours end').fill(localInput(Date.now()-3600000))
 await page.getByLabel('Unpaid break minutes').fill('15')
 await page.getByRole('button',{name:'Review submission'}).click()
 await page.getByRole('button',{name:'Confirm submission'}).click()
 await page.getByRole('button',{name:/UI New Person.*UI-created shift/}).click()
 await page.getByRole('button',{name:'Review approval'}).click()
 await page.getByRole('button',{name:'Confirm approval'}).click()
 await page.getByRole('button',{name:'Schedule'}).click()
 await page.getByRole('button',{name:/Walk-in shift.*Open roster/}).click({timeout:8000}).catch(async error => { console.error('Desktop state:', await page.locator('main').innerText()); throw error })
 await page.getByText('on site',{exact:true}).waitFor()
 await page.getByRole('button',{name:'Schedule'}).click()
 await page.getByRole('button',{name:/Replacement shift.*Open roster/}).click()
 await page.getByRole('button',{name:'Coverage'}).click()
 await page.getByText('Replacement volunteer',{exact:true}).waitFor()
 await page.getByText('assigned',{exact:true}).waitFor()
 await page.getByRole('button',{name:'Readiness'}).click()
 await page.getByRole('button',{name:/Fixture volunteer.*Fixture shift/}).click()
 await page.getByRole('button',{name:'Record evidence for Waiver'}).click()
 await page.getByLabel('Valid from').fill(localInput(Date.now()-86400000))
 await page.getByLabel('Evidence note').fill('Reviewed again in UI')
 await page.getByRole('button',{name:'Review evidence'}).click()
 await page.getByRole('button',{name:'Confirm evidence'}).click()
 await page.getByRole('button',{name:/Fixture volunteer.*Walk-in shift/}).waitFor()
 await page.getByRole('button',{name:'Hours review'}).click()
 await page.getByRole('button',{name:/Fixture volunteer.*Fixture shift/}).waitFor()
 await page.getByRole('button',{name:'Sign out'}).click()
 await page.getByRole('heading',{name:'Sign in to Ovelle'}).waitFor()
 assert.equal(await db.prepare('SELECT count(*) AS n FROM volunteer_hours_decisions').first('n'),4)
 const uiApproved = await db.prepare(`SELECT d.approved_minutes FROM volunteer_hours_decisions d JOIN volunteer_hours_submissions h ON h.id=d.submission_id AND h.organization_id=d.organization_id JOIN volunteer_assignments a ON a.id=h.assignment_id AND a.organization_id=h.organization_id JOIN volunteer_occurrences o ON o.id=a.occurrence_id AND o.organization_id=a.organization_id WHERE o.title='UI-created shift' AND d.decision='approve'`).first('approved_minutes')
 assert.equal(uiApproved,45)
 // A second synthetic passkey-verified account starts with no organizations.
 const newBoot=await runtime.dispatchFetch(`${origin}/__fixture/bootstrap`,{method:'POST',headers:{'X-Fixture-Control':control,'X-Fixture-Account':'new-owner'}})
 assert.equal(newBoot.status,200); const newBrowser=await newBoot.json()
 await context.addCookies([{name:'__Host-ovelle_session',value:newBrowser.token,domain:'dev.ovelle.org',path:'/',secure:true,httpOnly:true,sameSite:'Strict'}])
 approvalOpened=new Promise(resolve=>{receiveApproval=resolve})
 await page.getByRole('button',{name:'Sign in'}).click()
 await browserPage.goto(await approvalOpened)
 await browserPage.getByRole('button',{name:'Approve device'}).click()
 await page.getByLabel('Organization name').fill('UI New Organization')
 await page.getByLabel('Organization contact email').fill('org@example.test')
 await page.getByLabel('Time zone').fill('America/New_York')
 await page.getByLabel('First program').fill('First program')
 await page.getByLabel('First location').fill('First site')
 await page.getByRole('button',{name:'Review organization'}).click()
 await page.getByRole('button',{name:'Confirm organization'}).click()
 await page.getByRole('option',{name:'UI New Organization'}).waitFor({state:'attached'})
 assert.ok(await db.prepare("SELECT id FROM organizations WHERE name='UI New Organization' AND owner_account_id='new-owner'").first())
 console.log('Electron + Chromium + local Stage 0 fixture: explicit browser approval, schedule, eligibility, roster, hours correction and replacement passed; synthetic browser session and disposable data.')
} finally {
 if(browserApp)await browserApp.close()
 if(app)await app.close()
 if(userData)await rm(userData,{recursive:true,force:true})
 if(server?.listening)await new Promise(resolve=>{server.closeAllConnections();server.close(resolve)})
 await runtime.dispose()
}
