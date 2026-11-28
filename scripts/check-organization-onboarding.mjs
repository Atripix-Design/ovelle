import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'

const url = process.env.OVELLE_DESKTOP_PREVIEW_URL || 'http://127.0.0.1:5175/'
const artifacts = process.env.OVELLE_ONBOARDING_CAPTURES
const browser = await chromium.launch()
try {
  // The real renderer runs against a controlled bridge. No accounts or data are written.
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, timezoneId: 'America/New_York' })
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.addInitScript(() => {
    let created = false, readsAfterCreation = 0
    window.setupAttempts = []
    window.releaseCreate = null
    window.ovelleWorkflow = {
      status: async () => ({ signedIn: true }),
      signOut: async () => ({ revoked: true, localCleared: true }),
      request: async input => {
        if (input.operation === 'organizations') {
          if (created && ++readsAfterCreation === 1) throw new Error('List temporarily unavailable')
          return { organizations: created ? [{ id: 'test-org', name: 'Harbor Community Center' }] : [], nextCursor: null }
        }
        if (input.operation !== 'createOrganization') throw Error('Unexpected operation ' + input.operation)
        window.setupAttempts.push(input)
        if (window.setupAttempts.length === 1) {
          await new Promise(resolve => { window.releaseCreate = resolve })
          throw new Error('Response lost')
        }
        created = true
        return { id: 'test-org' }
      },
    }
  })
  let providerUnavailable = false
  const expectedAddress = '350 5th Avenue, New York, NY 10118, United States'
  await page.route('https://photon.komoot.io/api/**', async route => {
    const query = new URL(route.request().url()).searchParams.get('q')
    assert.ok(query === '350 5th' || query === '78 Manual Avenue', query)
    if (providerUnavailable) return route.fulfill({ status: 503 })
    const properties = { housenumber: '350', street: '5th Avenue', city: 'New York', state: 'NY', postcode: '10118', country: 'United States' }
    await route.fulfill({ json: { features: [{properties}, {properties}, {properties:{city:'New York'}}] } })
  })
  await page.goto(url)
  const heading = name => page.getByRole('heading', { name, exact: true })
  const field = name => page.getByLabel(name, { exact: true })
  const button = name => page.getByRole('button', { name, exact: true })
  const attempts = () => page.evaluate(() => window.setupAttempts)
  async function capture(name) {
    if (!artifacts) return
    await mkdir(artifacts, { recursive: true })
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: join(artifacts, name + '.png') })
  }

  await heading('Create your organization').waitFor()
  await page.getByText('Choose an address from the list or enter it manually.', { exact: true }).waitFor()
  assert.equal(await page.getByRole('navigation', { name: 'Live workflow' }).count(), 0)
  assert.equal(await field('Time zone').count(), 0)
  assert.equal(await page.locator('.organization-setup__art img').evaluate(img => img.complete && img.naturalWidth === 960), true)
  await capture('implemented-organization')
  await button('Continue').click()
  await page.waitForFunction(() => document.activeElement?.id === 'setup-name')
  assert.equal(await field('Organization name').getAttribute('aria-invalid'), 'true')
  assert.notEqual(await field('Organization name').getAttribute('aria-describedby'), null)
  const art = page.locator('.organization-setup__art')
  for (const width of [320, 390, 721, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1080 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'Overflow at ' + width)
    assert.equal(await art.isVisible(), width > 720)
  }
  await field('Organization name').fill('Harbor Community Center ')
  await field('Organization contact email').fill('team@example.org')
  const address = page.getByRole('combobox', { name: 'First location address' })
  await address.fill('350 5th')
  const option = page.getByRole('option', { name: expectedAddress, exact: true })
  await option.waitFor()
  assert.equal(await page.getByRole('listbox').getByRole('option').count(), 1)
  await capture('implemented-address-suggestions')
  await address.press('ArrowDown')
  assert.equal(await option.getAttribute('aria-selected'), 'true')
  await address.press('Enter')
  assert.equal(await address.inputValue(), expectedAddress)
  assert.equal(await page.getByRole('listbox').count(), 0)
  assert.equal(await button('Continue').locator('path').getAttribute('stroke'), 'white')
  const action = await button('Continue').boundingBox()
  const form = await page.locator('.organization-setup form').boundingBox()
  assert.ok(Math.abs((form.x + form.width) - (action.x + action.width)) < 1)
  await button('Continue').click()
  await heading('Build your experience').waitFor()
  assert.equal(await heading('Build your experience').evaluate(el => el === document.activeElement), true)
  await page.keyboard.press('Tab')
  assert.equal(await field('First program').evaluate(el => el === document.activeElement), true)
  await capture('implemented-experience')
  const long = 'Community'.repeat(12)
  await field('First program').fill(long)
  await button('Review details').click()
  await heading('Review your workspace').waitFor()
  assert.deepEqual(await attempts(), [])
  await page.setViewportSize({ width: 320, height: 700 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await button('Back').click()
  assert.equal(await field('First program').inputValue(), long)
  await field('First program').fill('Community Pantry')
  await button('Back').click()
  assert.equal(await field('Organization name').inputValue(), 'Harbor Community Center ')
  assert.equal(await address.inputValue(), expectedAddress)
  providerUnavailable = true
  await address.fill('78 Manual Avenue')
  await page.getByText('Suggestions unavailable. You can still enter the address manually.').waitFor()
  await address.fill(expectedAddress)
  await button('Continue').click()
  await button('Review details').click()
  await page.getByText('America/New_York', { exact: true }).waitFor()
  await capture('implemented-review')
  await button('Create organization').click()
  await button('Creating organization…').waitFor()
  assert.equal(await button('Creating organization…').isDisabled(), true)
  assert.equal(await button('Sign out').isDisabled(), true)
  assert.equal((await attempts()).length, 1)
  await page.evaluate(() => window.releaseCreate())
  const alert = page.getByRole('alert')
  await alert.waitFor()
  assert.equal(await alert.evaluate(el => el === document.activeElement), true)
  assert.equal(await button('Back').count(), 0)
  await capture('implemented-retry')
  await button('Retry setup').click()
  await heading('Organization created').waitFor()
  await button('Refresh organizations').click()
  await page.getByRole('combobox', { name: 'Organization', exact: true }).waitFor()
  const calls = await attempts()
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[0], calls[1])
  assert.deepEqual({ ...calls[0], idempotencyKey: '<key>' }, {
    operation: 'createOrganization', name: 'Harbor Community Center', contactEmail: 'team@example.org', timeZone: 'America/New_York',
    firstProgram: 'Community Pantry', firstLocation: expectedAddress, idempotencyKey: '<key>',
  })
  assert.deepEqual(pageErrors, [])
  console.log('Verified setup validation, focus order, reflow, retained values, explicit creation, safe retry and workspace readback.')
} finally {
  await browser.close()
}
