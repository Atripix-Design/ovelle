import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyze, isCode } from './dependencies.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')
const config = JSON.parse(read('architecture/ownership.json'))
// Include untracked, nonignored work so local verification cannot miss new files.
const paths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
const sources = Object.fromEntries([...new Set(paths)].filter(path => existsSync(resolve(root, path))).map(path => [path, isCode(path) ? read(path) : '']))
const packageExports = Object.fromEntries(config.packages.map(path => {
  const pkg = JSON.parse(read(path))
  return [pkg.name, Object.keys(pkg.exports)]
}))
for (const concept of config.concepts) {
  if (!concept.reason || !concept.owner || !existsSync(resolve(root, concept.owner))) throw new Error(`Invalid concept owner: ${JSON.stringify(concept)}`)
}
const findings = analyze(sources, config, packageExports)
const exceptions = JSON.parse(read('architecture/exceptions.json'))
const key = item => JSON.stringify([item.rule, item.from, item.target])
const remaining = new Map(findings.map(item => [key(item), item]))
const errors = []
const seen = new Set()
for (const exception of exceptions) {
  if (!exception.reason || !exception.removal || !exception.tracking || seen.has(key(exception))) errors.push(`Invalid or duplicate exception: ${key(exception)}`)
  seen.add(key(exception))
  if (!remaining.delete(key(exception))) errors.push(`Stale exception; remove it: ${key(exception)}`)
}
errors.push(...[...remaining.values()].map(item => `${item.rule}: ${item.from} -> ${item.target}`))
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1 }
console.log(`Architecture: ${Object.keys(sources).filter(isCode).length} code files, ${findings.length} findings, ${exceptions.length} explicit exceptions, ${errors.length} errors.`)
