import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, hostname, tmpdir } from 'node:os'
import { join } from 'node:path'

const repository = 'Atripix-Design/ovelle'
const origin = `git@github.com:${repository}.git`
const image = 'ovelle-ci-builder:node22'
const accountHost = 'jeremymathew100.workers.dev'
const stateRoot = join(homedir(), '.local/state/ovelle-ci')
const cacheRoot = join(homedir(), '.cache/ovelle-ci')
const branches = ['development', 'main']

process.env.PATH = `${join(homedir(), '.local/bin')}:${process.env.PATH ?? ''}`
mkdirSync(stateRoot, { recursive: true })
mkdirSync(join(cacheRoot, 'npm'), { recursive: true })
mkdirSync(join(cacheRoot, 'electron'), { recursive: true })

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, GIT_SSH_COMMAND: 'ssh -oBatchMode=yes' },
    ...options,
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}`)
}

function capture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: { ...process.env, GIT_SSH_COMMAND: 'ssh -oBatchMode=yes' },
    ...options,
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}: ${result.stderr.trim()}`)
  return result.stdout.trim()
}

function commitStatus(sha, state, description, targetUrl) {
  const args = [
    'api', '--method', 'POST', `repos/${repository}/statuses/${sha}`,
    '-f', `state=${state}`,
    '-f', 'context=ovelle/ubuntu-box',
    '-f', `description=${description.slice(0, 140)}`,
  ]
  if (targetUrl) args.push('-f', `target_url=${targetUrl}`)
  run('gh', args, { stdio: 'ignore' })
}

async function verifyDeployment(environment, filenames) {
  const base = `https://ovelle-${environment}.${accountHost}`
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(15000) })
      const health = await response.json()
      if (!response.ok || health.application !== 'ovelle' || health.environment !== environment || health.database !== true) {
        throw new Error(`Unexpected health response: ${JSON.stringify(health)}`)
      }
      for (const filename of filenames) {
        const head = await fetch(`${base}/downloads/${filename}`, {
          method: 'HEAD', signal: AbortSignal.timeout(15000),
        })
        if (!head.ok || Number(head.headers.get('content-length')) <= 0) {
          throw new Error(`Download unavailable: ${filename} (${head.status})`)
        }
        const redirect = await fetch(`${base}/downloads/${filename}`, {
          redirect: 'manual', signal: AbortSignal.timeout(15000),
        })
        if (redirect.status === 302) {
          const signed = new URL(redirect.headers.get('location') ?? base)
          if (signed.hostname !== '83952a1be987e4a12647732861a60925.r2.cloudflarestorage.com' ||
              !signed.pathname.startsWith(`/ovelle-storage-${environment}/releases/desktop/`) ||
              signed.searchParams.get('X-Amz-Algorithm') !== 'AWS4-HMAC-SHA256' ||
              Number(signed.searchParams.get('X-Amz-Expires')) > 300) {
            throw new Error(`Invalid R2 presigned URL: ${filename}`)
          }
          const sample = await fetch(signed, {
            headers: { Range: 'bytes=0-0' }, signal: AbortSignal.timeout(15000),
          })
          if (sample.status !== 206 || !sample.headers.get('content-disposition')?.includes(filename)) {
            throw new Error(`Presigned download failed: ${filename} (${sample.status})`)
          }
          await sample.body?.cancel()
        } else if (redirect.status !== 200 || !redirect.headers.get('content-disposition')?.includes(filename)) {
          throw new Error(`Download failed: ${filename} (${redirect.status})`)
        }
        await redirect.body?.cancel()
      }
      return base
    } catch (error) {
      if (attempt === 11) throw error
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }
  }
  throw new Error('Cloudflare deployment did not become healthy')
}

function buildInContainer(workdir, environment) {
  const command = [
    'npm ci',
    'npm run check',
    'npm run lint',
    'npm run build',
    'npm run package:all -w @ovelle/desktop',
    environment === 'development' ? 'npm run build:development -w @ovelle/web' : 'true',
  ].join(' && ')

  run('docker', [
    'run', '--rm', '--init',
    '--user', `${process.getuid()}:${process.getgid()}`,
    '--cap-drop=ALL', '--security-opt', 'no-new-privileges',
    '--cpus=4', '--memory=7g', '--pids-limit=1024',
    '-e', 'CI=1', '-e', 'HOME=/home/node',
    '-v', `${workdir}:/workspace`,
    '-v', `${join(cacheRoot, 'npm')}:/home/node/.npm`,
    '-v', `${join(cacheRoot, 'electron')}:/home/node/.cache`,
    '-w', '/workspace',
    image, 'bash', '-lc', command,
  ])
}

function publishReleases(workdir, branch, environment) {
  const version = JSON.parse(readFileSync(join(workdir, 'apps/desktop/package.json'), 'utf8')).version
  const filenames = [
    `Ovelle-${version}-mac-arm64.zip`,
    `Ovelle-${version}-mac-x64.zip`,
    `Ovelle-${version}-win-x64.exe`,
  ]
  const archiveDir = join(stateRoot, 'releases', branch)
  mkdirSync(archiveDir, { recursive: true })

  for (const filename of filenames) {
    const source = join(workdir, 'release/desktop', filename)
    if (!existsSync(source)) throw new Error(`Missing desktop release: ${filename}`)
    const archive = join(archiveDir, filename)
    copyFileSync(source, archive)
    run(join(workdir, 'node_modules/.bin/wrangler'), [
      'r2', 'object', 'put',
      `ovelle-storage-${environment}/releases/desktop/${filename}`,
      '--file', archive,
      '--content-type', filename.endsWith('.zip') ? 'application/zip' : 'application/octet-stream',
      '--content-disposition', `attachment; filename="${filename}"`,
      '--remote',
    ], { cwd: workdir })
  }
  return filenames
}

async function processBranch(branch) {
  const environment = branch === 'main' ? 'production' : 'development'
  const remote = capture('git', ['ls-remote', origin, `refs/heads/${branch}`])
  const sha = remote.split(/\s+/)[0]
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`Missing ${branch} branch SHA`)
  const stateFile = join(stateRoot, `${branch}.json`)
  if (existsSync(stateFile) && JSON.parse(readFileSync(stateFile, 'utf8')).sha === sha) {
    console.log(`${branch}: ${sha.slice(0, 7)} already delivered`)
    return
  }

  const workdir = mkdtempSync(join(tmpdir(), `ovelle-${branch}-`))
  try {
    run('git', ['clone', '--quiet', '--depth', '1', '--branch', branch, '--single-branch', origin, workdir])
    const checkedOutSha = capture('git', ['rev-parse', 'HEAD'], { cwd: workdir })
    if (checkedOutSha !== sha) throw new Error(`${branch} moved during checkout; retry on next poll`)
    if (!existsSync(join(workdir, 'package.json'))) {
      console.log(`${branch}: application source has not been promoted yet`)
      return
    }

    commitStatus(sha, 'pending', 'Building and deploying on ubuntu-box')
    buildInContainer(workdir, environment)
    const filenames = publishReleases(workdir, branch, environment)
    run(join(workdir, 'node_modules/.bin/wrangler'), ['deploy', '--env', environment], { cwd: workdir })
    const url = await verifyDeployment(environment, filenames)
    commitStatus(sha, 'success', `Built and deployed ${environment} on ubuntu-box`, url)
    writeFileSync(`${stateFile}.tmp`, JSON.stringify({ sha, environment, host: hostname(), url, completedAt: new Date().toISOString() }) + '\n')
    renameSync(`${stateFile}.tmp`, stateFile)
    console.log(`${branch}: delivered ${sha} to ${url}`)
  } catch (error) {
    try { commitStatus(sha, 'failure', `ubuntu-box delivery failed: ${error.message}`) } catch {}
    throw error
  } finally {
    rmSync(workdir, { recursive: true, force: true })
  }
}

capture('docker', ['image', 'inspect', image])
let failures = 0
for (const branch of branches) {
  try {
    await processBranch(branch)
  } catch (error) {
    failures += 1
    console.error(`${branch}: ${error.stack ?? error}`)
  }
}
if (failures) process.exitCode = 1
