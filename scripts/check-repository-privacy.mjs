import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

// Inspect tracked content, including metadata in binary assets. Report locations,
// never matched values, so a future credential cannot be repeated in CI logs.
const rules = [
  ['machine name', /ubuntu[\s_-]box/i],
  ['personal home path', /(?:\/home\/(?!node(?:\/|\b)|ci-runner(?:\/|\b))[^/\s]+\/|\/Users\/[^/\s]+\/)/],
  ['private preview address', /\b(?:100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])|192\.168|10\.\d+)\.\d+\.\d+\b/],
  ['account-specific Worker domain', /https?:\/\/[^\s/`'"<>]+\.[^\s/.`'"<>]+\.workers\.dev\b/],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['GitHub credential', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
]
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)
const findings = []
for (const file of files) {
  if (!existsSync(file)) continue
  const text = readFileSync(file).toString('utf8')
  for (const [label, pattern] of rules) if (pattern.test(text)) findings.push(`${file}: ${label}`)
}
if (findings.length) throw new Error(`Repository privacy check failed:\n${findings.join('\n')}`)
console.log(`Repository privacy check passed (${files.length} tracked files)`)
