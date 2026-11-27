import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { request as httpRequest } from 'node:http'
import { desktopHandoff } from './handoff.ts'

const origin='https://dev.ovelle.org'
const code='c'.repeat(43), token='t'.repeat(43)

test('native listener validates state, exchanges PKCE once, and never returns a bearer in the callback',async()=>{
  let callbackUri='',state='',challenge='', exchanges=0
  const fetcher=async(input,init)=>{
    assert.equal(init?.method,'POST');assert.equal(init?.redirect,'error')
    const body=JSON.parse(String(init?.body))
    if(String(input).endsWith('/requests')) {
      callbackUri=body.callbackUri;state=body.state;challenge=body.challenge
      assert.match(callbackUri,/^http:\/\/127\.0\.0\.1:\d+\/ovelle-auth\/callback$/)
      return Response.json({requestId:'request-1',expiresAt:Date.now()+60_000})
    }
    assert.equal(String(input),`${origin}/api/v1/auth/desktop/exchange`)
    exchanges++
    assert.equal(body.requestId,'request-1');assert.equal(body.code,code);assert.equal(body.state,state);assert.equal(body.callbackUri,callbackUri)
    assert.equal(createHash('sha256').update(body.verifier).digest('base64url'),challenge)
    return Response.json({token,expiresAt:Date.now()+60_000})
  }
  const result=await desktopHandoff({origin,fetcher,timeoutMs:2000,openApproval:async url=>{
    const approval=new URL(url),fragment=new URLSearchParams(approval.hash.slice(1))
    assert.equal(approval.origin,origin);assert.equal(approval.pathname,'/desktop/authorize')
    assert.equal(fragment.get('requestId'),'request-1');assert.equal(fragment.get('state'),state)
    const bad=await fetch(`${callbackUri}?code=${code}&state=${'x'.repeat(43)}`);assert.equal(bad.status,400)
    const duplicate=await fetch(`${callbackUri}?code=${code}&state=${state}&state=${state}`);assert.equal(duplicate.status,400)
    const wrongHost=await new Promise((resolve,reject)=>{
      const req=httpRequest(`${callbackUri}?code=${code}&state=${state}`,{headers:{Host:'localhost'}},res=>{res.resume();resolve(res.statusCode)})
      req.on('error',reject);req.end()
    });assert.equal(wrongHost,400)
    const wrongMethod=await fetch(`${callbackUri}?code=${code}&state=${state}`,{method:'POST'});assert.equal(wrongMethod.status,400)
    const valid=await fetch(`${callbackUri}?code=${code}&state=${state}`)
    assert.equal(valid.status,200);assert.equal(valid.headers.get('cache-control'),'no-store')
    const text=await valid.text();assert.doesNotMatch(text,new RegExp(`${token}|${code}|${state}`))
  }})
  assert.equal(result.token,token);assert.equal(exchanges,1)
  await assert.rejects(fetch(callbackUri))
})

test('rejects untrusted origins, failed exchange and unanswered sign-in',async()=>{
  await assert.rejects(desktopHandoff({origin:'http://example.com',openApproval:async()=>{}}),/unavailable/)
  await assert.rejects(desktopHandoff({origin:'https://dev.ovelle.org/path',openApproval:async()=>{}}),/unavailable/)
  let callbackUri=''
  const fetcher=async(input,init)=>{
    if(String(input).endsWith('/requests')) {callbackUri=(JSON.parse(String(init?.body))).callbackUri;return Response.json({requestId:'r',expiresAt:Date.now()+60_000})}
    return new Response('refused',{status:403})
  }
  await assert.rejects(desktopHandoff({origin,fetcher,timeoutMs:1000,openApproval:async url=>{
    const state=new URLSearchParams(new URL(url).hash.slice(1)).get('state')
    assert.equal((await fetch(`${callbackUri}?code=${code}&state=${state}`)).status,200)
  }}),/unavailable/)
  await assert.rejects(desktopHandoff({origin,fetcher,timeoutMs:20,openApproval:async()=>{}}),/unavailable/)
  await assert.rejects(fetch(callbackUri))
  await assert.rejects(desktopHandoff({origin,fetcher,timeoutMs:20,openApproval:()=>new Promise(()=>{})}),/unavailable/)
})
