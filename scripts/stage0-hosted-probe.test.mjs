import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, symlinkSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = resolve(import.meta.dirname, '..')
function exercise(rejectLimit = false) {
  const dir = mkdtempSync(join(tmpdir(), 'ovelle-probe-test-'))
  symlinkSync(join(root, 'scripts'), join(dir, 'scripts'))
  const fixture = join(dir, 'fetch-fixture.mjs')
  writeFileSync(fixture, `
    import assert from 'node:assert/strict';
    const workers = new Set();
    const response = (status, result) => Response.json({success:status===200,result},{status});
    globalThis.fetch = async (input, options = {}) => {
      const url = new URL(input);
      if (url.hostname === 'api.cloudflare.com') {
        assert.equal(options.headers.Authorization, 'Bearer test-api-token');
        if (url.pathname.endsWith('/workers/subdomain')) return response(200,{subdomain:'fixture'});
        const name = url.pathname.split('/workers/scripts/')[1]?.split('/')[0];
        assert.match(name, /^ovelle-kdf-123-(pbkdf2|argon2)-[a-f0-9]{12}$/);
        if (options.method === 'DELETE') { workers.delete(name); return response(200,{}); }
        if (options.method === 'PUT') {
          const metadata = JSON.parse(await options.body.get('metadata').text());
          assert.equal(metadata.limits.cpu_ms,10);
          assert.equal(metadata.observability.enabled,false);
          assert.deepEqual(metadata.bindings.map(x=>x.type),['secret_text','plain_text']);
          assert.match(metadata.bindings[0].text,/^[a-f0-9]{64}$/);
          assert.ok(Number(metadata.bindings[1].text)>Date.now());
          assert.match(await options.body.get('worker.js').text(),/probeCandidate/);
          workers.add(name); return response(200,{});
        }
        if (!workers.has(name)) return response(404,{});
        if (url.pathname.endsWith('/settings')) return response(200,{limits:{cpu_ms:${rejectLimit ? 30 : 10}}});
        if (url.pathname.endsWith('/subdomain')) return response(200,{});
        throw new Error('Unexpected API call');
      }
      assert.match(url.hostname,/^ovelle-kdf-123-(pbkdf2|argon2)-[a-f0-9]{12}\.fixture\.workers\.dev$/);
      if (!options.headers) return new Response(null,{status:404});
      if (url.pathname === '/health') { assert.match(options.headers.Authorization,/^Bearer [a-f0-9]{64}$/); return Response.json({probe:'ovelle-stage0-v1'}); }
      assert.equal(options.method,'POST');
      assert.match(options.headers.Authorization,/^Bearer [a-f0-9]{64}$/);
      assert.ok(!options.body);
      return Response.json({status:'ok',matches:url.pathname==='/match'});
    };
    process.on('exit',()=> { if(workers.size) { console.error('Leaked probe'); process.exitCode=2; } });
  `)
  try {
    const result = spawnSync(process.execPath, ['--import', fixture, join(root, 'scripts/stage0-hosted-probe.mjs')], {
      cwd: dir, encoding: 'utf8', env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_API_TOKEN: 'test-api-token', GITHUB_RUN_ID: '123', GITHUB_SHA: 'fixture-sha' },
    })
    assert.ok(existsSync(join(dir, 'stage0-hosted-runtime.json')), result.stderr)
    const report = JSON.parse(readFileSync(join(dir, 'stage0-hosted-runtime.json'), 'utf8'))
    assert.equal(report.cleanupConfirmed, true)
    assert.ok(!JSON.stringify(report).includes('test-api-token'))
    return { result, report }
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
test('hosted runner restricts resources, preserves synthetic results and confirms cleanup', () => {
  const { result, report } = exercise()
  assert.equal(result.status, 0, result.stderr)
  assert.equal(report.measurements.length, 2)
  assert.deepEqual(report.measurements[0].samples.map(x=>JSON.parse(x.body).matches), [true,true,false])
})
test('unconfirmed free CPU limit aborts before KDF calls and still removes the Worker', () => {
  const { result, report } = exercise(true)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr,/Hosted CPU limit was not confirmed/)
  assert.equal(report.measurements.length, 0)
})
