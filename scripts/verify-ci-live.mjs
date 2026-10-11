import { execFileSync } from 'node:child_process'

const repository = 'Atripix-Design/ovelle'
const branches = process.argv[2] ? [process.argv[2]] : ['development']
for (const branch of branches) {
  if (!['development', 'main'].includes(branch)) throw new Error('Expected development or main')
  const sha = execFileSync('gh', ['api', `repos/${repository}/git/ref/heads/${branch}`, '--jq', '.object.sha'], { encoding: 'utf8' }).trim()
  const runs = JSON.parse(execFileSync('gh', ['api', `repos/${repository}/actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=100`], { encoding: 'utf8' })).workflow_runs
  const successful = runs.find(run => run.conclusion === 'success')
  if (!successful) throw new Error(`${branch} has no successful CI/CD run at its current SHA`)
  const jobs = JSON.parse(execFileSync('gh', ['api', `repos/${repository}/actions/runs/${successful.id}/jobs?per_page=100`], { encoding: 'utf8' })).jobs
  for (const name of ['build', 'typecheck', 'lint', 'Deploy application']) {
    if (!jobs.some(job => job.name === name && job.conclusion === 'success')) throw new Error(`${branch} is missing successful ${name}`)
  }
  console.log(`${branch}: CI/CD verified at ${sha}`)
}
