import { execFileSync } from 'node:child_process'
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const version = JSON.parse(readFileSync(resolve(import.meta.dirname, '../apps/desktop/package.json'), 'utf8')).version
const filenames = [
  `Ovelle-${version}-mac-arm64.zip`,
  `Ovelle-${version}-mac-x64.zip`,
  `Ovelle-${version}-win-x64.exe`,
]
const forbiddenArtifactAction = /actions\/upload-artifact@/i
if (!forbiddenArtifactAction.test('actions/upload-artifact@v4')) throw new Error('Artifact absence control is broken')
const workflowDir = resolve(import.meta.dirname, '../.github/workflows')
for (const name of existsSync(workflowDir) ? readdirSync(workflowDir) : []) {
  if (forbiddenArtifactAction.test(readFileSync(join(workflowDir, name), 'utf8'))) {
    throw new Error(`GitHub artifact upload remains in ${name}`)
  }
}

for (const [branch, environment] of [['development', 'development'], ['main', 'production']]) {
  for (const filename of filenames) {
    const path = join(homedir(), '.local/state/ovelle-ci/releases', branch, filename)
    const size = statSync(path).size
    if (size < 1_000_000 || size > 300 * 1024 * 1024) throw new Error(`Unexpected package size: ${path}`)
    const descriptor = openSync(path, 'r')
    const header = Buffer.alloc(2)
    readSync(descriptor, header, 0, 2, 0)
    closeSync(descriptor)
    const magic = header.toString('ascii')
    if (magic !== (filename.endsWith('.zip') ? 'PK' : 'MZ')) throw new Error(`Invalid package header: ${path}`)
    if (filename.endsWith('.zip')) {
      const entries = execFileSync('unzip', ['-Z', '-1', path], { encoding: 'utf8' })
      if (!entries.includes('Ovelle.app/Contents/MacOS/Ovelle')) throw new Error(`Missing macOS executable: ${path}`)
    }
    const response = await fetch(`https://ovelle-${environment}.jeremymathewgithub.workers.dev/downloads/${filename}`, { method: 'HEAD' })
    if (!response.ok || Number(response.headers.get('content-length')) !== size) {
      throw new Error(`${environment} download mismatch: ${filename}`)
    }
  }
}
console.log('ovelle desktop releases verified')
