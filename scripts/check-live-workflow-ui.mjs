import assert from 'node:assert/strict'
import { chromium } from 'playwright'

// Fixture bridge proves renderer sequencing, not deployed service or real sign-in.
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    window.fixtureCalls = []
    window.ovelleWorkflow = {
      status: async () => ({ signedIn: true }),
      signIn: async () => ({ signedIn: true }),
      signOut: async () => ({ revoked: true, localCleared: true }),
      request: async input => {
        window.fixtureCalls.push(input)
        switch (input.operation) {
          case 'organizations': return { organizations: [{ id: 'org', name: 'Org' }], nextCursor: null }
          case 'programs': return { programs: [{ id: 'p', name: 'Program' }] }
          case 'locations': return { locations: [{ id: 'l', name: 'Location' }] }
          case 'schedule': return { occurrences: [{ id: 's', title: 'Shift', startsAt: 1700000000000, endsAt: 1700003600000, capacity: 2, assigned: 1, held: 0 }], nextCursor: null }
          case 'roster': return { volunteers: [{ assignmentId: 'a', name: 'Avery', role: 'Volunteer', readiness: 'ready', presence: 'expected' }], nextCursor: null }
          case 'checkIn': return {}
          case 'waitlist': return { entries: [{ id: 'w', name: 'Morgan', role: 'Volunteer', readiness: 'ready', state: 'waiting', offerId: null, offerExpiresAt: null }], nextCursor: null }
          case 'offerWaitlist': return { id: 'offer' }
          case 'hours': return { submissions: [{ id: 'h', name: 'Avery', title: 'Shift', state: 'pending', startAt: 0, endAt: 3600000, breakMinutes: 0, checkedInAt: 0, checkedOutAt: 3600000 }], nextCursor: null }
          case 'hoursHistory': return { decisions: [], nextCursor: null }
          case 'reviewHours': return { id: 'd' }
          case 'readiness': return { cases: [{ occurrenceId: 's', roleId: 'r', personId: 'person', name: 'Avery', role: 'Volunteer', title: 'Shift', state: 'pending', latestDecisionId: null }], nextCursor: null }
          case 'criterionEvidence': return { criteria: [{ id: 'c', name: 'Waiver', state: 'verified', validUntil: null, note: null }], truncated: false }
          case 'decideReadiness': return { id: 'decision' }
          default: throw Error(`Unexpected operation: ${input.operation}`)
        }
      },
    }
  })
  await page.goto(process.env.OVELLE_DESKTOP_PREVIEW_URL || 'http://127.0.0.1:5175/', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Live workspace' }).click()
  await page.getByLabel('Organization').selectOption('org')
  await page.getByLabel('Program').selectOption('p')
  await page.getByLabel('Location').selectOption('l')
  await page.getByRole('button', { name: 'Readiness' }).click()
  await page.getByRole('button', { name: /Avery.*Shift/ }).click()
  await page.getByLabel('Review note').fill('Evidence reviewed')
  await page.getByRole('button', { name: 'Review ready decision' }).click()
  assert.equal((await page.evaluate(() => window.fixtureCalls)).filter(call => call.operation === 'decideReadiness').length, 0)
  await page.getByRole('button', { name: 'Confirm decision' }).click()
  await page.waitForFunction(() => window.fixtureCalls.some(call => call.operation === 'decideReadiness'))
  await page.getByRole('button', { name: 'Schedule' }).click()
  await page.getByRole('button', { name: /Shift.*Open roster/ }).click()
  await page.getByRole('button', { name: 'Check in' }).click()
  await page.getByRole('button', { name: 'Coverage' }).click()
  await page.getByText('1/2 assigned', { exact: false }).waitFor()
  await page.getByRole('button', { name: 'Prepare offer' }).click()
  const deadline = new Date(Date.now() + 86400000)
  const local = new Date(deadline.getTime() - deadline.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  await page.getByLabel('Offer deadline').fill(local)
  await page.getByRole('button', { name: 'Review offer' }).click()
  assert.equal((await page.evaluate(() => window.fixtureCalls)).filter(call => call.operation === 'offerWaitlist').length, 0)
  await page.getByRole('button', { name: 'Confirm offer' }).click()
  await page.waitForFunction(() => window.fixtureCalls.some(call => call.operation === 'offerWaitlist'))
  await page.getByRole('button', { name: 'Hours review' }).click()
  await page.getByRole('button', { name: /Avery.*Shift/ }).click()
  await page.getByRole('button', { name: 'Review approval' }).click()
  assert.equal((await page.evaluate(() => window.fixtureCalls)).filter(call => call.operation === 'reviewHours').length, 0)
  await page.getByRole('button', { name: 'Confirm approval' }).click()
  await page.waitForFunction(() => window.fixtureCalls.some(call => call.operation === 'reviewHours'))
  const decision = (await page.evaluate(() => window.fixtureCalls)).find(call => call.operation === 'reviewHours')
  assert.equal(decision.organizationId, 'org'); assert.equal(decision.approvedMinutes, 60)
  assert.deepEqual(errors, [])
  console.log('Live workflow renderer: scoped fixture data, check-in and explicit approval confirmation passed.')
} finally { await browser.close() }
