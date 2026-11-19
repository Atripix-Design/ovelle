/** Test-only bridge: never imported by the application Worker. */
import type { D1Database } from '@cloudflare/workers-types'
import { createStage0Backend } from '../../../src/cloudflare/stage0/backend'
import { loadStage0Config } from '../../../src/cloudflare/stage0/config'
import { issueSession } from '../../../src/cloudflare/stage0/auth/sessions'

const origin='https://dev.ovelle.org'
const settings={APP_ENV:'development',AUTH_ORIGIN:origin,AUTH_RP_ID:'dev.ovelle.org',AUTH_EMAIL_FROM:'accounts@auth.example.test',TURNSTILE_SITE_KEY:'fixture',TURNSTILE_SECRET_KEY:'fixture',AUTH_ADMISSION_KEY:'HR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0',AUTH_GOOGLE_CONNECTION_ID:'google',AUTH_GOOGLE_CONNECTION_VERSION:'1',AUTH_GOOGLE_CLIENT_ID:'fixture',AUTH_GOOGLE_CLIENT_SECRET:'fixture'}
export default {
 async fetch(request:Request,env:{DB:D1Database;CONTROL:string}):Promise<Response> {
  if(new URL(request.url).pathname==='/__fixture/bootstrap') {
   if(request.method!=='POST' || request.headers.get('X-Fixture-Control')!==env.CONTROL)return new Response(null,{status:404})
   const issued=await issueSession({db:env.DB,config:loadStage0Config(settings),clock:{now:Date.now},ids:{next:()=>crypto.randomUUID()},requestId:crypto.randomUUID(),mailer:{async send(){throw new Error('not used')}}},{accountId:'owner',method:'passkey'},'browser')
   return Response.json({token:issued.token,csrfToken:issued.csrfToken})
  }
  const app=createStage0Backend(settings,{db:env.DB,email:{async send(){throw new Error('no outbound mail')}}})
  return app.fetch(request,'127.0.0.1')
 }
}
