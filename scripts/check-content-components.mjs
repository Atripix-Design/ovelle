// Run against a built/dev web or desktop renderer preview.
// OVELLE_PLAYWRIGHT_MODULE may point to an already installed Playwright module.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const manifest = JSON.parse(await readFile(new URL('../packages/ui/figma-manifest.json', import.meta.url)));
const expectedPairs = manifest.skeletonCounterparts.length;
const { chromium } = await import(process.env.OVELLE_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(process.env.OVELLE_PREVIEW_URL || 'http://100.114.150.83:5174/components');
  const interactive = page.locator('.preview-interactive');
  const trigger = interactive.getByRole('button', { name: /Report date/ });
  await trigger.click();
  assert.equal(await interactive.getByRole('dialog').count(), 1);
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
  assert.equal(await interactive.locator('output').first().textContent(), '2026-10-09');
  await trigger.click(); await page.keyboard.press('Home');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.date), '2026-10-04');
  await page.keyboard.press('ArrowUp');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.date), '2026-10-03');
  await page.keyboard.press('PageDown'); await page.keyboard.press('PageDown');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.date), '2026-11-20');
  await page.keyboard.press('Escape');
  assert.equal(await trigger.evaluate(node => node === document.activeElement), true);
  await trigger.click(); await page.keyboard.press('Tab');
  // Tab continues normally through calendar controls; leaving the field closes it.
  await interactive.locator('h2').click(); assert.equal(await interactive.getByRole('dialog').count(), 0);
  await interactive.getByRole('button', { name: 'Next page', exact: true }).click();
  assert.equal(await interactive.locator('output').last().textContent(), '5');
  await interactive.getByRole('button', { name: 'Page 1', exact: true }).click();
  assert.equal(await interactive.getByRole('button', { name: 'Previous page', exact: true }).isDisabled(), true);
  await interactive.getByRole('button', { name: 'Page 12', exact: true }).click();
  assert.equal(await interactive.getByRole('button', { name: 'Next page', exact: true }).isDisabled(), true);
  async function checkSkeletons() {
    await page.waitForFunction(() => [...document.querySelectorAll('[data-specimen]')].every(n => n.querySelectorAll('.ov-skeleton-map rect').length));
    const geometry = await page.locator('[data-specimen]').evaluateAll(items => items.map(item => {
      const source = item.querySelector('.preview-live > *');
      const hidden = item.querySelector('.ov-skeleton-content > *');
      const a = source.getBoundingClientRect(), b = hidden.getBoundingClientRect();
      const skeleton = item.querySelector('.ov-skeleton');
      hidden.querySelector('button,input,a,select')?.focus();
      return { name: item.dataset.specimen, width: Math.abs(a.width - b.width), height: Math.abs(a.height - b.height), inert: skeleton.inert && skeleton.getAttribute('aria-hidden') === 'true', focus: skeleton.contains(document.activeElement), count: item.querySelectorAll('.preview-pair > :last-child > [role="status"]').length };
    }));
    assert.equal(geometry.length, expectedPairs);
    for (const result of geometry) {
      assert.ok(result.width < 1 && result.height < 1, JSON.stringify(result));
      assert.ok(result.inert && !result.focus, JSON.stringify(result));
      assert.equal(result.count, 1, JSON.stringify(result));
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  await checkSkeletons();
  for (const dark of [false, true]) for (const glass of [false, true]) {
    await page.getByRole('switch', { name: 'Dark theme' }).setChecked(dark);
    await page.getByRole('switch', { name: 'Liquid Glass' }).setChecked(glass);
    for (const frost of ['0', '35', '100']) {
      await page.locator('input[type="range"]').fill(frost);
      await checkSkeletons();
    }
  }
  await page.getByRole('switch', { name: 'Reduce transparency' }).check();
  assert.equal(await page.locator('.preview-interactive .ov-date-picker').evaluate(n => getComputedStyle(n).backdropFilter), 'none');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.ov-skeleton-map').first().evaluate(n => getComputedStyle(n).animationName), 'none');
  await page.setViewportSize({ width: 390, height: 844 }); await checkSkeletons();
  assert.equal(await interactive.locator('.ov-pagination-pages').isVisible(), false);
  assert.deepEqual(errors, []);
  console.log(`Passed: calendar keyboard/bounds/focus, pagination boundaries, all ${expectedPairs} loaded/skeleton pairs, 12 theme/material/frost combinations, transparency, motion and mobile layout.`);
} finally { await browser.close(); }
