import { execFileSync } from 'node:child_process'

const repository = 'Atripix-Design/ovelle'
const branches = process.argv[2] ? [process.argv[2]] : ['development']
for (const branch of branches) {
  if (!['development', 'main'].includes(branch)) throw new Error('Expected development or main')
  const sha = execFileSync('gh', ['api', `repos/${repository}/git/ref/heads/${branch}`, '--jq', '.object.sha'], { encoding: 'utf8' }).trim()
  const runs = JSON.parse(execFileSync('gh', ['api', `repos/${repository}/actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=100`], { encoding: 'utf8' })).workflow_runs
  let delivered = false
  for (const run of runs.filter(run => run.conclusion === 'success' && ['push', 'workflow_dispatch'].includes(run.event))) {
    const jobs = JSON.parse(execFileSync('gh', ['api', `repos/${repository}/actions/runs/${run.id}/jobs?per_page=100`], { encoding: 'utf8' })).jobs
    if (['build', 'typecheck', 'lint', 'Deploy application'].every(name => jobs.some(job => job.name === name && job.conclusion === 'success'))) {
      delivered = true
      break
    }
  }
  if (!delivered) throw new Error(`${branch} has no successful delivery run at its current SHA`)
  console.log(`${branch}: CI/CD verified at ${sha}`)
}
