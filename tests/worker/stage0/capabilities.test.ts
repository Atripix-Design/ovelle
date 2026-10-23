import {beforeEach,expect,it} from 'vitest'
import {databaseFixture} from './database'
import {getAdvisoryCapabilities} from '../../../src/cloudflare/stage0/access/capabilities'
import {authorizeOrganization} from '../../../src/cloudflare/stage0/access/organizations'
import {saveProgram} from '../../../src/cloudflare/stage0/access/commands'
import {issueSession} from '../../../src/cloudflare/stage0/auth/sessions'
import type {Action,Principal} from '../../../src/cloudflare/stage0/contracts'
let f:Awaited<ReturnType<typeof databaseFixture>>,owner:Principal,admin:Principal,coordinator:Principal
async function grant(member:string,org:string,action:Action,program:string|null=null,location:string|null=null){await f.execute('INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind,program_id,location_id) VALUES(?,?,?,?,?,?,?)',f.ctx.ids.next(),member,org,action,program||location?'program_location':'organization',program,location).run()}
beforeEach(async()=>{f=await databaseFixture();owner=(await issueSession(f.ctx,{accountId:'a',method:'passkey'},'browser')).principal;admin=(await issueSession(f.ctx,{accountId:'c',method:'passkey'},'browser')).principal;coordinator=(await issueSession(f.ctx,{accountId:'d',method:'password'},'desktop')).principal})
it('returns only safe current org/action/scope display data and all current owner actions',async()=>{
 const result=await getAdvisoryCapabilities(f.ctx,owner,'org-a')
 expect(Object.keys(result).sort()).toEqual(['asOf','capabilities','organizationId','truncated'])
 expect(result).toMatchObject({organizationId:'org-a',asOf:f.ctx.clock.now(),truncated:false})
 expect(result.capabilities.map(g=>g.action)).toEqual(['audit.read','location.manage','location.read','organization.read','organization.update','ownership.transfer','program.manage','program.read','staff.manage_admins','staff.manage_coordinators','staff.read'])
 expect(result.capabilities.every(g=>JSON.stringify(g.scope)==='{"kind":"organization"}')).toBe(true)
 expect(JSON.stringify(result)).not.toMatch(/sessionId|accountId|token|digest|security_version/)
 await expect(getAdvisoryCapabilities(f.ctx,owner,'org-b')).rejects.toMatchObject({code:'not_found'})
})
it('uses each organization current role, never a global admin flag or a stored reserved grant',async()=>{
 await grant('mc-a','org-a','staff.read');await grant('mc-b','org-b','program.read','b1')
 // Reserved/private actions are denied by role even if a historical row exists.
 await grant('mc-b','org-b','audit.read');await grant('mc-a','org-a','ownership.transfer')
 expect((await getAdvisoryCapabilities(f.ctx,admin,'org-a')).capabilities.map(g=>g.action)).toEqual(['organization.read','staff.read'])
 expect((await getAdvisoryCapabilities(f.ctx,{...admin,assurance:'passkey'},'org-b')).capabilities).toEqual([{action:'organization.read',scope:{kind:'organization'}},{action:'program.read',scope:{kind:'program_location',programId:'b1'}}])
})
it('preserves complete intersections and one-dimensional grants without creating cross-products',async()=>{
 await grant('md-a','org-a','program.read','a1','ax');await grant('md-a','org-a','program.read','a2','ay');await grant('md-a','org-a','location.read',null,'ax')
 const result=await getAdvisoryCapabilities(f.ctx,coordinator,'org-a')
 expect(result.capabilities).toEqual([{action:'location.read',scope:{kind:'program_location',locationId:'ax'}},{action:'organization.read',scope:{kind:'organization'}},{action:'program.read',scope:{kind:'program_location',programId:'a1',locationId:'ax'}},{action:'program.read',scope:{kind:'program_location',programId:'a2',locationId:'ay'}}])
 await expect(authorizeOrganization(f.ctx,coordinator,'org-a','program.read',{kind:'program_location',programId:'a1',locationId:'ay'})).rejects.toMatchObject({code:'forbidden'})
})
it('applies current assurance and recent owner authentication from D1 rather than forged fields',async()=>{
 const password=(await issueSession(f.ctx,{accountId:'a',method:'password'},'browser')).principal
 const before=(await getAdvisoryCapabilities(f.ctx,{...password,assurance:'passkey',passkeyVerifiedAt:f.ctx.clock.now()},'org-a')).capabilities.map(g=>g.action)
 expect(before).toEqual(['audit.read','location.read','organization.read','program.read','staff.read'])
 f.advance(300_001)
 const after=(await getAdvisoryCapabilities(f.ctx,owner,'org-a')).capabilities.map(g=>g.action)
 expect(after).toContain('program.manage');expect(after).not.toContain('ownership.transfer');expect(after).not.toContain('staff.manage_admins')
})
it('drops archived scope pairs and current revoked grants without broadening the remaining dimensions',async()=>{
 await grant('md-a','org-a','program.read','a1','ax');await grant('md-a','org-a','program.read','a2','ay')
 await f.execute("UPDATE locations SET archived_at=1 WHERE id='ax'").run()
 let result=await getAdvisoryCapabilities(f.ctx,coordinator,'org-a')
 expect(result.capabilities).toEqual([{action:'organization.read',scope:{kind:'organization'}},{action:'program.read',scope:{kind:'program_location',programId:'a2',locationId:'ay'}}])
 await f.execute("DELETE FROM membership_grants WHERE membership_id='md-a'").run();result=await getAdvisoryCapabilities(f.ctx,coordinator,'org-a')
 expect(result.capabilities).toEqual([{action:'organization.read',scope:{kind:'organization'}}])
})
it('denies enrollment, revoked session/membership and wrong required SSO context',async()=>{
 await f.execute("UPDATE accounts SET email_verified_at=NULL WHERE id='b'").run();const enrollment=(await issueSession(f.ctx,{accountId:'b',method:'password'},'browser')).principal
 await expect(getAdvisoryCapabilities(f.ctx,enrollment,'org-b')).rejects.toMatchObject({code:'not_found'})
 await f.execute("INSERT INTO identity_connections(id,organization_id,protocol,provider,issuer,created_at) VALUES('cap-saml','org-a','saml','enterprise_saml','urn:cap:saml',1)").run()
 await f.execute("UPDATE organizations SET required_connection_id='cap-saml',version=version+1 WHERE id='org-a'").run()
 await expect(getAdvisoryCapabilities(f.ctx,admin,'org-a')).rejects.toMatchObject({code:'not_found'})
 await f.execute("UPDATE organizations SET required_connection_id=NULL,version=version+1 WHERE id='org-a'").run()
 await f.execute("UPDATE organization_memberships SET state='revoked',version=version+1 WHERE id='md-a'").run()
 await expect(getAdvisoryCapabilities(f.ctx,coordinator,'org-a')).rejects.toMatchObject({code:'not_found'})
 await f.execute('UPDATE sessions SET revoked_at=? WHERE id=?',f.ctx.clock.now(),admin.sessionId).run()
 await expect(getAdvisoryCapabilities(f.ctx,admin,'org-a')).rejects.toMatchObject({code:'unauthenticated'})
})
it('returns a bounded deterministic snapshot with explicit truncation for larger historical grant sets',async()=>{
 await f.db.batch(Array.from({length:102},(_,i)=>f.execute("INSERT INTO programs(id,organization_id,name) VALUES(?,'org-a','Historical')",`cap-${String(i).padStart(3,'0')}`)))
 await f.db.batch(Array.from({length:102},(_,i)=>f.execute("INSERT INTO membership_grants(id,membership_id,organization_id,action,scope_kind,program_id) VALUES(?,'md-a','org-a','program.read','program_location',?)",`cap-grant-${i}`,`cap-${String(i).padStart(3,'0')}`)))
 const result=await getAdvisoryCapabilities(f.ctx,coordinator,'org-a');expect(result.capabilities).toHaveLength(100);expect(result.truncated).toBe(true)
 expect(result.capabilities[0]).toEqual({action:'organization.read',scope:{kind:'organization'}})
 expect(result.capabilities.at(-1)).toEqual({action:'program.read',scope:{kind:'program_location',programId:'cap-098'}})
})
it('rechecks authority in the final SELECT after preflight and never emits stale grant candidates',async()=>{
 await grant('md-a','org-a','program.read','a1','ax');const db=f.db,ctx={...f.ctx}
 ctx.db=new Proxy(db,{get(target,key){if(key==='prepare')return(sql:string)=>{if(sql.startsWith('WITH candidates'))return{bind:(...values:Parameters<ReturnType<typeof db.prepare>['bind']>)=>({all:async()=>{await f.execute("UPDATE accounts SET security_version=security_version+1 WHERE id='d'").run();return target.prepare(sql).bind(...values).all()}})};return target.prepare(sql)};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}})
 await expect(getAdvisoryCapabilities(ctx,coordinator,'org-a')).rejects.toMatchObject({code:'not_found'})
})
it('cannot use a previously returned or edited capability as authority after revocation',async()=>{
 await grant('md-a','org-a','program.manage','a1');const snapshot=await getAdvisoryCapabilities(f.ctx,coordinator,'org-a')
 expect(snapshot.capabilities).toContainEqual({action:'program.manage',scope:{kind:'program_location',programId:'a1'}})
 await f.execute("DELETE FROM membership_grants WHERE membership_id='md-a'").run()
 await expect(saveProgram({...f.ctx,principal:{...coordinator,...snapshot},idempotencyKey:'cached-capability-command-001',requestDigest:'0'.repeat(64)},{organizationId:'org-a',id:'a1',name:'Forbidden',expectedVersion:1})).rejects.toMatchObject({code:'forbidden'})
 expect(await f.execute("SELECT name FROM programs WHERE id='a1'").first('name')).toBe('A1')
})
it('keeps one snapshot query inside documented D1 size/parameter limits and deduplicates identical candidates',async()=>{
 await grant('mc-a','org-a','organization.read');await grant('mc-a','org-a','program.read')
 const db=f.db,ctx={...f.ctx};let measured=0
 ctx.db=new Proxy(db,{get(target,key){if(key==='prepare')return(sql:string)=>{if(sql.startsWith('WITH candidates'))return{bind:(...values:Parameters<ReturnType<typeof db.prepare>['bind']>)=>{measured++;expect(values.length).toBeLessThanOrEqual(100);expect(new TextEncoder().encode(sql).byteLength).toBeLessThanOrEqual(100_000);return target.prepare(sql).bind(...values)}};return target.prepare(sql)};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}})
 expect((await getAdvisoryCapabilities(ctx,admin,'org-a')).capabilities).toEqual([{action:'organization.read',scope:{kind:'organization'}},{action:'program.read',scope:{kind:'organization'}}]);expect(measured).toBe(1)
})
it('accepts current required SAML evidence without elevating assurance and denies after provider disablement',async()=>{
 await f.execute("INSERT INTO identity_connections(id,organization_id,protocol,provider,issuer,created_at) VALUES('snapshot-saml','org-a','saml','enterprise_saml','urn:snapshot:saml',1)").run()
 await f.execute("INSERT INTO external_identities(id,account_id,connection_id,issuer,subject,created_at) VALUES('snapshot-identity','c','snapshot-saml','urn:snapshot:saml','subject-c',1)").run()
 await f.execute("UPDATE organizations SET required_connection_id='snapshot-saml',version=version+1 WHERE id='org-a'").run()
 const saml=(await issueSession(f.ctx,{accountId:'c',method:'saml',externalIdentityId:'snapshot-identity',identityVersion:1,connectionVersion:1},'browser')).principal
 await grant('mc-a','org-a','program.read','a1');await grant('mc-a','org-a','program.manage','a1')
 expect((await getAdvisoryCapabilities(f.ctx,saml,'org-a')).capabilities).toEqual([{action:'organization.read',scope:{kind:'organization'}},{action:'program.read',scope:{kind:'program_location',programId:'a1'}}])
 await f.execute("UPDATE identity_connections SET enabled=0,version=version+1 WHERE id='snapshot-saml'").run()
 await expect(getAdvisoryCapabilities(f.ctx,saml,'org-a')).rejects.toMatchObject({code:'unauthenticated'})
})
it('applies current membership downgrade in the final query, including a historical disallowed staff grant',async()=>{
 await grant('mc-a','org-a','staff.read');const db=f.db,ctx={...f.ctx}
 ctx.db=new Proxy(db,{get(target,key){if(key==='prepare')return(sql:string)=>{if(sql.startsWith('WITH candidates'))return{bind:(...values:Parameters<ReturnType<typeof db.prepare>['bind']>)=>({all:async()=>{await f.execute("UPDATE organization_memberships SET preset='coordinator',version=version+1 WHERE id='mc-a'").run();return target.prepare(sql).bind(...values).all()}})};return target.prepare(sql)};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}})
 expect((await getAdvisoryCapabilities(ctx,admin,'org-a')).capabilities).toEqual([{action:'organization.read',scope:{kind:'organization'}}])
})
