import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const architecture = process.argv[2]
if (architecture !== 'x64' && architecture !== 'arm64') {
  throw new Error('Expected x64 or arm64 architecture')
}

const releaseDir = resolve(import.meta.dirname, '../release/desktop')
const appDir = resolve(releaseDir, architecture === 'x64' ? 'mac' : 'mac-arm64')
const executable = resolve(appDir, 'Ovelle.app/Contents/MacOS/Ovelle')
if (!existsSync(executable)) throw new Error(`Missing macOS executable: ${executable}`)

const version = JSON.parse(readFileSync(resolve(import.meta.dirname, '../apps/desktop/package.json'), 'utf8')).version
const name = `Ovelle-${version}-mac-${architecture}.zip`
const temporary = resolve(releaseDir, `${name}.tmp`)
const target = resolve(releaseDir, name)
rmSync(temporary, { force: true })
execFileSync('zip', ['-qry9', temporary, 'Ovelle.app'], { cwd: appDir, stdio: 'inherit' })
execFileSync('unzip', ['-tqq', temporary], { stdio: 'inherit' })
if (statSync(temporary).size > 300 * 1024 * 1024) {
  throw new Error(`${name} exceeds Wrangler's 300 MiB upload limit`)
}
renameSync(temporary, target)
rmSync(`${target}.blockmap`, { force: true })
console.log(`macOS ${architecture} archive ready: ${target}`)
