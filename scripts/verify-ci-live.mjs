import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir, hostname } from 'node:os'
import { join } from 'node:path'

function output(command, args) {
  return execFileSync(command, args, { encoding: 'utf8' }).trim()
}

if (output('systemctl', ['--user', 'is-active', 'ovelle-ci.timer']) !== 'active') throw new Error('ubuntu-box CI timer is inactive')
if (output('systemctl', ['--user', 'show', 'ovelle-ci.service', '-p', 'Result', '--value']) !== 'success') {
  throw new Error('ubuntu-box CI service has not finished successfully')
}

for (const branch of ['development', 'main']) {
  const remote = output('git', ['ls-remote', 'git@github.com:Atripix-Design/ovelle.git', `refs/heads/${branch}`]).split(/\s+/)[0]
  const state = JSON.parse(readFileSync(join(homedir(), '.local/state/ovelle-ci', `${branch}.json`), 'utf8'))
  if (state.sha !== remote || state.host !== hostname()) throw new Error(`${branch} was not delivered on this ubuntu-box at the latest commit`)
  const status = JSON.parse(output('gh', ['api', `repos/Atripix-Design/ovelle/commits/${remote}/status`]))
  if (status.statuses.find((item) => item.context === 'ovelle/ubuntu-box')?.state !== 'success') {
    throw new Error(`${branch} is missing a successful ubuntu-box commit status`)
  }
}
console.log('ovelle ci verified')
