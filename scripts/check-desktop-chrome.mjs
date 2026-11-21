// Renderer-level checks use platform user agents; native caption controls require OS verification.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
try {
  for (const [platform, userAgent] of [
    ['macos', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36'],
    ['windows', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36'],
  ]) {
    const context = await browser.newContext({ userAgent, viewport: { width: 1100, height: 760 } });
    const page = await context.newPage();
    await page.goto(process.env.OVELLE_DESKTOP_PREVIEW_URL || 'http://127.0.0.1:4178/');
    for (const width of [1100, 640]) {
      await page.setViewportSize({ width, height: 760 });
      const state = await page.evaluate(() => {
        const header = document.querySelector('.workflow-topbar');
        const brand = document.querySelector('.workflow-brand');
        const action = document.querySelector('.workflow-live-link');
        const box = node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right }; };
        return { platform: document.documentElement.dataset.desktopPlatform, brand: box(brand), action: box(action), scrollWidth: document.documentElement.scrollWidth, drag: getComputedStyle(header).webkitAppRegion, actionDrag: getComputedStyle(action).webkitAppRegion, children: [...header.children].filter(node => getComputedStyle(node).display !== 'none').map(box), icons: [...document.querySelectorAll('.workflow-rail-icon')].map(icon => icon.complete && icon.naturalWidth > 0 && icon.getBoundingClientRect().width === 20) };
      });
      assert.equal(state.platform, platform);
      assert.equal(state.drag, 'drag');
      assert.equal(state.actionDrag, 'no-drag');
      assert.equal(state.icons.length, 5);
      assert.ok(state.icons.every(Boolean));
      assert.ok(state.scrollWidth <= width, JSON.stringify(state));
      assert.ok(state.brand.left >= (platform === 'macos' ? 90 : 16), JSON.stringify(state));
      assert.ok(state.children.every(child => child.right <= width - (platform === 'windows' ? 150 : 0)), JSON.stringify(state));
    }
    await page.getByRole('button', { name: 'Readiness', exact: true }).click();
    assert.equal(await page.getByRole('heading', { name: 'Readiness', exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Live workspace', exact: true }).click();
    assert.equal(await page.getByRole('heading', { name: 'Live workspace', exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Open preview', exact: true }).click();
    assert.equal(await page.getByRole('heading', { name: 'Readiness', exact: true }).count(), 1);
    await context.close();
  }
  console.log('Desktop renderer: Mac and Windows layout, icon loading, drag regions and navigation passed. Native OS controls not tested.');
} finally { await browser.close(); }
