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
    window.fixtureDraft = null
    window.fixtureRoles = []
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
          case 'schedule': return { occurrences: [{ id: 's', title: 'Shift', startsAt: 1700000000000, endsAt: 1700003600000, capacity: 2, assigned: 1, held: 0 }, ...(window.fixtureDraft ? [window.fixtureDraft] : [])], nextCursor: null }
          case 'createOccurrence': window.fixtureDraft = { id: 'draft', title: input.title, startsAt: input.startsAt, endsAt: input.endsAt, capacity: input.capacity, assigned: 0, held: 0, status: 'draft' }; return { id: 'draft' }
          case 'occurrence': return { roles: window.fixtureRoles, criteria: [], truncated: false, criteriaTruncated: false }
          case 'createRole': window.fixtureRoles.push({ id: 'role', name: input.name, capacity: input.capacity }); return { id: 'role' }
          case 'publishOccurrence': window.fixtureDraft.status = 'published'; return { id: 'draft', status: 'published' }
          case 'roster': { const checkedIn = window.fixtureCalls.some(call => call.operation === 'checkIn'); return { volunteers: [{ assignmentId: 'a', name: 'Avery', role: 'Volunteer', readiness: checkedIn ? 'blocked' : 'ready', presence: checkedIn ? 'on_site' : 'expected' }], nextCursor: null } }
          case 'checkIn': return {}
          case 'checkOut': return {}
          case 'waitlist': { const offered = window.fixtureCalls.some(call => call.operation === 'offerWaitlist'); return { entries: [{ id: 'w', name: 'Morgan', role: 'Volunteer', readiness: 'ready', state: offered ? 'offered' : 'waiting', offerId: offered ? 'offer' : null, offerExpiresAt: offered ? Date.now() + 86400000 : null }], nextCursor: null } }
          case 'offerWaitlist': return { id: 'offer' }
          case 'confirmOffer': return { id: 'assignment' }
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
  async function checkWidths() {
    for (const width of [320, 640, 1100, 1440]) {
      await page.setViewportSize({ width, height: 850 })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `horizontal overflow at ${width}px`)
    }
    await page.setViewportSize({ width: 1100, height: 850 })
  }
  await page.goto(process.env.OVELLE_DESKTOP_PREVIEW_URL || 'http://127.0.0.1:5175/', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Live workspace' }).click()
  await page.getByLabel('Organization').selectOption('org')
  await page.getByLabel('Program').selectOption('p')
  await page.getByLabel('Location').selectOption('l')
  await checkWidths()
  await page.getByLabel('Title', { exact: true }).fill('New shift')
  await page.getByLabel('Start', { exact: true }).fill('2027-01-10T10:00')
  await page.getByLabel('End', { exact: true }).fill('2027-01-10T12:00')
  await page.getByLabel('Capacity', { exact: true }).fill('2')
  await page.getByRole('button', { name: 'Create draft' }).click()
  await page.getByRole('button', { name: /New shift.*Set up draft/ }).click()
  await page.getByLabel('Role name').fill('Packer')
  await page.getByRole('button', { name: 'Add role' }).click()
  await page.getByRole('button', { name: 'Review publication' }).click()
  assert.equal((await page.evaluate(() => window.fixtureCalls)).filter(call => call.operation === 'publishOccurrence').length, 0)
  await page.getByRole('button', { name: 'Confirm publication' }).click()
  await page.waitForFunction(() => window.fixtureCalls.some(call => call.operation === 'publishOccurrence'))
  await page.getByRole('button', { name: 'Readiness' }).click()
  await page.getByRole('button', { name: /Avery.*Shift/ }).click()
  await checkWidths()
  await page.getByLabel('Review note').fill('Evidence reviewed')
  await page.getByRole('button', { name: 'Review ready decision' }).click()
  assert.equal((await page.evaluate(() => window.fixtureCalls)).filter(call => call.operation === 'decideReadiness').length, 0)
  await page.getByRole('button', { name: 'Confirm decision' }).click()
  await page.waitForFunction(() => window.fixtureCalls.some(call => call.operation === 'decideReadiness'))
  await page.getByRole('button', { name: 'Schedule' }).click()
  await page.getByRole('button', { name: /Shift.*Open roster/ }).click()
  await checkWidths()
  await page.getByRole('button', { name: 'Check in' }).click()
  await page.getByRole('button', { name: 'Check out' }).click()
  await page.waitForFunction(() => window.fixtureCalls.some(call => call.operation === 'checkOut'))
  await page.getByRole('button', { name: 'Coverage' }).click()
  await page.getByText('1/2 assigned', { exact: false }).waitFor()
  await page.getByRole('button', { name: 'Prepare offer' }).click()
  const deadline = new Date(Date.now() + 86400000)
  const local = new Date(deadline.getTime() - deadline.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  await checkWidths()
  await page.getByLabel('Offer deadline').fill(local)
  await page.getByRole('button', { name: 'Review offer' }).click()
  assert.equal((await page.evaluate(() => window.fixtureCalls)).filter(call => call.operation === 'offerWaitlist').length, 0)
  await page.getByRole('button', { name: 'Confirm offer' }).click()
  await page.waitForFunction(() => window.fixtureCalls.some(call => call.operation === 'offerWaitlist'))
  await page.getByRole('button', { name: 'Record acceptance' }).click()
  await page.getByLabel('Acceptance note').fill('Accepted by phone')
  await page.getByRole('button', { name: 'Review acceptance' }).click()
  assert.equal((await page.evaluate(() => window.fixtureCalls)).filter(call => call.operation === 'confirmOffer').length, 0)
  await page.getByRole('button', { name: 'Confirm acceptance' }).click()
  await page.waitForFunction(() => window.fixtureCalls.some(call => call.operation === 'confirmOffer'))
  const acceptance = (await page.evaluate(() => window.fixtureCalls)).find(call => call.operation === 'confirmOffer')
  assert.equal(acceptance.offerId, 'offer'); assert.equal(acceptance.confirmationNote, 'Accepted by phone')
  await page.getByRole('button', { name: 'Hours review' }).click()
  await page.getByRole('button', { name: /Avery.*Shift/ }).click()
  await checkWidths()
  await page.getByRole('button', { name: 'Review approval' }).click()
  assert.equal((await page.evaluate(() => window.fixtureCalls)).filter(call => call.operation === 'reviewHours').length, 0)
  await page.getByRole('button', { name: 'Confirm approval' }).click()
  await page.waitForFunction(() => window.fixtureCalls.some(call => call.operation === 'reviewHours'))
  const decision = (await page.evaluate(() => window.fixtureCalls)).find(call => call.operation === 'reviewHours')
  assert.equal(decision.organizationId, 'org'); assert.equal(decision.approvedMinutes, 60)
  assert.deepEqual(errors, [])
  const unavailable = await browser.newPage()
  await unavailable.addInitScript(() => { window.ovelleWorkflow = { status: async () => { throw Error('No handler') } } })
  await unavailable.goto(process.env.OVELLE_DESKTOP_PREVIEW_URL || 'http://127.0.0.1:5175/', { waitUntil: 'networkidle' })
  await unavailable.getByRole('button', { name: 'Live workspace' }).click()
  await unavailable.getByRole('heading', { name: 'Native connection unavailable' }).waitFor()
  assert.equal(await unavailable.getByRole('button', { name: 'Sign in' }).count(), 0)
  await unavailable.close()
  console.log('Live workflow renderer: scoped fixture data, check-in and explicit approval confirmation passed.')
} finally { await browser.close() }
