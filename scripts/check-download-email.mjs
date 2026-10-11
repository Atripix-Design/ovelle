import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { sendDownloadEmail } from '../src/cloudflare/download-email.ts';
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(await readFile(new URL('../migrations/0001_download_email_limits.sql', import.meta.url), 'utf8'));
const DB = {
  prepare(sql) { return { values: [], bind(...values) { this.values = values; return this; }, async run() { return sqlite.prepare(sql).run(...this.values); }, sql }; },
  async batch(statements) { sqlite.exec('BEGIN'); try { const result = statements.map(s => ({ results: sqlite.prepare(s.sql).all(...s.values) })); sqlite.exec('COMMIT'); return result; } catch(e) { sqlite.exec('ROLLBACK'); throw e; } },
};
const messages = [];
const env = { APP_ENV:'development', DB, DOWNLOAD_EMAIL_FROM:'downloads@dev.mail.ovelle.org', EMAIL:{ async send(message) { messages.push(message); return { messageId:'test-ack' }; } } };
const request = (email, extra = {}) => new Request('https://dev.ovelle.org/api/download-email', { method:'POST', headers:{ 'Content-Type':'application/json', 'Origin':'https://dev.ovelle.org', 'CF-Connecting-IP':'192.0.2.1', ...extra }, body:JSON.stringify({email}) });
assert.equal((await sendDownloadEmail(new Request('https://dev.ovelle.org/api/download-email'), env)).status,405);
assert.equal((await sendDownloadEmail(request('reader@example.com', {Origin:'https://attacker.example'}),env)).status,403);
assert.equal((await sendDownloadEmail(request('reader@example.com', {'Sec-Fetch-Site':'cross-site'}),env)).status,403);
assert.equal((await sendDownloadEmail(request('reader@example.com\r\nBcc: other@example.com'),env)).status,400);
assert.equal((await sendDownloadEmail(request('invalid'),env)).status,400);
assert.equal((await sendDownloadEmail(request('x'.repeat(1500)),env)).status,413);
assert.equal((await sendDownloadEmail(request('reader@example.com'),{...env,APP_ENV:'production'})).status,503);
assert.equal(messages.length,0,'Rejected requests never send');
const results = await Promise.all(Array.from({length:4},()=>sendDownloadEmail(request('reader@example.com'),env)));
assert.deepEqual(results.map(r=>r.status).sort(),[200,200,200,429]);
assert.equal(messages.length,3);
assert.deepEqual(messages[0].from,{email:'downloads@dev.mail.ovelle.org',name:'Ovelle'});
assert.match(messages[0].html,/https:\/\/dev\.ovelle\.org\/#download/);
assert.equal((await sendDownloadEmail(request('second@example.com'),env)).status,200);
assert.equal((await sendDownloadEmail(request('third@example.com'),env)).status,429,'IP quota spans recipients');
assert.equal((await sendDownloadEmail(request('failed@example.com',{'CF-Connecting-IP':'192.0.2.2'}),{...env,EMAIL:{async send(){throw Error('provider unavailable')}}})).status,503);
assert.equal((await sendDownloadEmail(request('unacknowledged@example.com',{'CF-Connecting-IP':'192.0.2.3'}),{...env,EMAIL:{async send(){return {}}}})).status,503);
assert.ok(sqlite.prepare('SELECT key FROM download_email_limits').all().every(r=>!r.key.includes('@')),'D1 contains quota hashes, not addresses');
sqlite.close(); console.log('ovelle download email validation and quotas verified');
