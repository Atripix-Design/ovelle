import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const output = new URL('../docs/design-system/migration/github-stars-2026-10-11/', import.meta.url).pathname;
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const api = 'https://api.github.com/repos/Atripix-Design/ovelle';
const audit = [];
try {
  for (const [consumer, base] of [['web', process.env.OVELLE_WEBSITE_URL || 'http://127.0.0.1:5174'], ['desktop', process.env.OVELLE_DESKTOP_WEBSITE_URL || 'http://127.0.0.1:5175']]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    let calls = 0, release;
    const ready = new Promise(resolve => { release = resolve; });
    await page.route(api, async route => { calls++; await ready; await route.fulfill({ json: { stargazers_count: 1337 } }); });
    await page.goto(base);
    const link = page.locator('.home .ov-site-navigation-desktop .ov-github-link');
    await link.locator('.ov-skeleton-map rect').first().waitFor();
    const badge = await link.locator('.ov-github-stars').elementHandle();
    const before = await link.boundingBox();
    assert.equal(before.width, 152);
    assert.equal(await link.getAttribute('aria-disabled'), null);
    assert.equal(await link.locator('.ov-skeleton').evaluate(n => n.inert), true);
    await link.screenshot({ path: `${output}/${consumer}-loading.png` });
    release();
    await link.getByText('1.3k', { exact: true }).waitFor();
    assert.equal(await badge.evaluate(n => n.isConnected), true);
    assert.equal((await link.boundingBox()).width, before.width);
    assert.equal(await link.locator('.ov-skeleton').evaluate(n => n.inert), false);
    assert.equal(calls, 1, 'StrictMode must share the API request');
    await page.locator('.home .ov-site-navigation-desktop').screenshot({ path: `${output}/${consumer}-header.png` });
    assert.equal(await link.locator('.ov-github-stars').getAttribute('title'), '1,337 GitHub stars');
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const mobile = page.locator('.home .ov-site-navigation-mobile');
      await mobile.getByRole('button', { name: 'Menu', exact: true }).click();
      const mobileLink = mobile.locator('.ov-github-link');
      await mobileLink.getByText('1.3k', { exact: true }).waitFor();
      assert.ok((await mobileLink.boundingBox()).width <= width);
      const positions = await mobileLink.locator('.ov-mobile-link-content, .ov-github-stars-boundary').evaluateAll(ns => ns.map(n => n.getBoundingClientRect().toJSON()));
      assert.ok(positions[0].right <= positions[1].left, 'Count must not overlap menu text');
      await mobile.screenshot({ path: `${output}/${consumer}-menu-${width}.png` });
      await page.keyboard.press('End'); assert.equal(await mobileLink.evaluate(n => n === document.activeElement), true);
      await page.keyboard.press('Escape');
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload();
    await page.locator('.home .ov-site-navigation-desktop .ov-github-stars').getByText('1.3k', { exact: true }).waitFor();
    assert.equal(calls, 1, 'Fresh cached count must avoid another request');
    assert.deepEqual(errors, []); await page.close();
    for (const [name, status, body, text] of [['zero', 200, { stargazers_count: 0 }, '0'], ['large', 200, { stargazers_count: 987654 }, '990k'], ['failure', 503, {}, '—'], ['invalid', 200, { stargazers_count: -1 }, '—']]) {
      const scenario = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
      await scenario.route(api, route => route.fulfill({ status, json: body }));
      await scenario.goto(base);
      const count = scenario.locator('.home .ov-site-navigation-desktop .ov-github-stars');
      await count.getByText(text, { exact: true }).waitFor();
      await scenario.locator('.home .ov-site-navigation-desktop .ov-skeleton[data-loading="false"]').waitFor();
      assert.equal((await count.boundingBox()).width, 40);
      assert.equal((await count.boundingBox()).height, 24);
      const fits = await count.evaluate(n => { const outer = n.getBoundingClientRect(), inner = n.querySelector('[aria-hidden]').getBoundingClientRect(); return inner.left >= outer.left && inner.right <= outer.right; });
      assert.ok(fits, 'Compact count must fit inside its badge');
      await count.screenshot({ path: `${output}/${consumer}-${name}.png` });
      await scenario.close();
    }
    audit.push({ consumer, validZero: true, compactCount: '1.3k', singleRequest: true, cache: true, failureAndInvalid: '—', retainedBadge: true, stableWidth: 152, mobileWidths: [390, 320] });
  }
  await writeFile(`${output}/audit.json`, JSON.stringify(audit, null, 2) + '\n');
  console.log('GitHub stars passed: loading, mounted retention, zero, large count, failure, invalid response, cache, keyboard and mobile layouts in both consumers.');
} finally { await browser.close(); }
