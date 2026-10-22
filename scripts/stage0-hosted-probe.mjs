import { build } from 'esbuild'
import { randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

// Only isolated, run-owned Workers are ever written. No application bindings,
// credentials, provider registrations or billing configuration are changed.
const account = process.env.CLOUDFLARE_ACCOUNT_ID
const apiToken = process.env.CLOUDFLARE_API_TOKEN
const run = process.env.GITHUB_RUN_ID
if (!/^[a-f0-9]{32}$/.test(account ?? '') || !apiToken || !/^\d+$/.test(run ?? '')) throw new Error('Missing hosted probe environment')
const manifest = '.stage0-probe-workers.json'
const reportPath = 'stage0-hosted-runtime.json'
const prefix = `ovelle-kdf-${run}-`
async function api(path, options = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`, {
    ...options, headers: { Authorization: `Bearer ${apiToken}`, ...options.headers }, signal: AbortSignal.timeout(30000),
  })
  const body = await response.json()
  return { status: response.status, body }
}
async function cpuMetrics(name, start) {
  // Optional read-only telemetry. A token without Analytics read permission does
  // not justify broadening permissions or treating elapsed HTTP time as CPU time.
  const query = `query($account: string!, $script: string!, $start: Time!, $end: Time!) {
    viewer { accounts(filter: {accountTag: $account}) {
      workersInvocationsAdaptive(limit: 1, filter: {scriptName: $script, datetime_geq: $start, datetime_leq: $end}) {
        sum { requests errors } quantiles { cpuTimeP50 cpuTimeP99 }
      }
    }}
  }`
  for (let attempt = 0; attempt < 4; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 15000))
    try {
      const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
        method: 'POST', headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { account, script: name, start, end: new Date().toISOString() } }), signal: AbortSignal.timeout(10000),
      })
      const body = await response.json()
      if (!response.ok || body.errors?.length) return { status: 'unavailable', httpStatus: response.status, errors: body.errors?.map(error => error.message) }
      const rows = body.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive
      if (rows?.length && rows[0].sum.requests > 0) return { status: 'available', raw: rows, includesAuthenticatedHealthRequests: true }
    } catch (error) { return { status: 'unavailable', error: error.name } }
  }
  return { status: 'not-yet-available' }
}
async function cleanup() {
  let names
  try { names = JSON.parse(await readFile(manifest, 'utf8')) } catch (error) { if (error.code === 'ENOENT') return; throw error }
  const failures = []
  for (const name of names) {
    try {
    if (!new RegExp(`^${prefix}(pbkdf2|argon2)-[a-f0-9]{12}$`).test(name)) throw new Error('Refusing cleanup of non-probe Worker')
    const deleted = await api(`/workers/scripts/${name}`, { method: 'DELETE' })
    if (deleted.status !== 404 && !deleted.body.success) throw new Error(`Probe cleanup failed: ${deleted.status}`)
    const checked = await api(`/workers/scripts/${name}/settings`)
    if (checked.status !== 404) throw new Error(`Probe deletion unconfirmed: ${checked.status}`)
    } catch (error) { failures.push(error) }
  }
  if (failures.length) throw new AggregateError(failures, 'Probe cleanup incomplete')
  console.log('All run-owned probe Workers confirmed deleted')
}
if (process.argv.includes('--cleanup')) {
  await cleanup()
} else {
  const names = []
  const report = { sourceSha: process.env.GITHUB_SHA, runId: run, compatibilityDate: '2026-10-06', requestedCpuLimitMs: 10, syntheticInputsOnly: true, measurements: [], cleanupConfirmed: false,
    limitation: 'HTTP elapsed time is not CPU time. Passing requests alone do not prove sustained free-tier suitability.' }
  try {
    const subdomain = await api('/workers/subdomain')
    if (!subdomain.body.success) throw new Error(`Cannot read Workers subdomain: ${subdomain.status}`)
    for (const [label, candidate] of [['pbkdf2', 'pbkdf2-webcrypto'], ['argon2', 'argon2id-noble']]) {
      const name = `${prefix}${label}-${randomBytes(6).toString('hex')}`
      const exists = await api(`/workers/scripts/${name}/settings`)
      if (exists.status !== 404) throw new Error('Cannot establish unused probe name')
      const token = randomBytes(32).toString('hex')
      const expires = Date.now() + 10 * 60 * 1000
      const bundled = await build({ stdin: { contents: `
        import { probeCandidate } from './scripts/stage0-password-probe.ts';
        export default { async fetch(request, env) {
          if (Date.now() > Number(env.EXPIRES) || request.headers.get('Authorization') !== 'Bearer ' + env.PROBE_TOKEN) return new Response(null, {status:404});
          const path = new URL(request.url).pathname;
          if (request.method === 'GET' && path === '/health') return Response.json({probe:'ovelle-stage0-v1'});
          if (request.method !== 'POST' || !['/match','/mismatch'].includes(path)) return new Response(null,{status:404});
          try { return Response.json({status:'ok', matches:await probeCandidate(${JSON.stringify(candidate)},path === '/mismatch')}); }
          catch(error) { return Response.json({status:'error',name:error.name,message:error.message}); }
        }};`, resolveDir: process.cwd(), sourcefile: 'stage0-hosted-entry.ts' }, bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' })
      const data = new FormData()
      data.set('metadata', new Blob([JSON.stringify({ main_module: 'worker.js', compatibility_date: report.compatibilityDate, limits: { cpu_ms: 10 }, observability: { enabled: false }, bindings: [
        { type: 'secret_text', name: 'PROBE_TOKEN', text: token }, { type: 'plain_text', name: 'EXPIRES', text: String(expires) },
      ] })], { type: 'application/json' }))
      data.set('worker.js', new Blob([bundled.outputFiles[0].text], { type: 'application/javascript+module' }), 'worker.js')
      names.push(name)
      await writeFile(manifest, JSON.stringify(names))
      const upload = await api(`/workers/scripts/${name}`, { method: 'PUT', body: data })
      if (!upload.body.success) throw new Error(`Probe upload failed: ${JSON.stringify(upload.body.errors)}`)
      const settings = await api(`/workers/scripts/${name}/settings`)
      if (settings.body.result?.limits?.cpu_ms !== 10) throw new Error('Hosted CPU limit was not confirmed')
      const enabled = await api(`/workers/scripts/${name}/subdomain`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: true, previews_enabled: false }) })
      if (!enabled.body.success) throw new Error(`Cannot enable isolated probe: ${enabled.status}`)
      const base = `https://${name}.${subdomain.body.result.subdomain}.workers.dev`
      // Let only routing propagate, without running any KDF during readiness checks.
      let ready = false
      for (let attempt = 0; attempt < 12; attempt++) {
        try {
          const response = await fetch(`${base}/health`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) })
          if (response.ok && (await response.json()).probe === 'ovelle-stage0-v1') { ready = true; break }
        } catch { /* new DNS can take a few seconds */ }
        await new Promise(resolve => setTimeout(resolve, 3000))
      }
      if (!ready) throw new Error('Probe route did not become ready')
      const started = new Date(Date.now() - 60000).toISOString()
      const measurement = { candidate, cpuLimitConfirmedMs: settings.body.result.limits.cpu_ms, samples: [] }
      report.measurements.push(measurement)
      for (const operation of ['match', 'match', 'mismatch']) {
        const start = performance.now()
        try {
          const response = await fetch(`${base}/${operation}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) })
          const body = await response.text()
          measurement.samples.push({ operation, httpStatus: response.status, elapsedMs: Math.round(performance.now() - start), body: body.slice(0, 1500) })
        } catch (error) { measurement.samples.push({ operation, error: error.name }) }
      }
      measurement.cpuMetrics = await cpuMetrics(name, started)
    }
  } finally {
    try { await cleanup(); report.cleanupConfirmed = true } finally { await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n') }
  }
  console.log(JSON.stringify(report, null, 2))
}
