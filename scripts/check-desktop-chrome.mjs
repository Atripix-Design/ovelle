// Renderer checks cover the draggable header; native caption controls need OS verification.
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
    await page.addInitScript(() => { window.ovelleWorkflow = { status: async () => ({ signedIn: false }) }; });
    await page.goto(process.env.OVELLE_DESKTOP_PREVIEW_URL || 'http://127.0.0.1:4178/');
    await page.getByRole('heading', { name: 'Sign in to Ovelle' }).waitFor();
    for (const width of [1100, 640]) {
      await page.setViewportSize({ width, height: 760 });
      const state = await page.evaluate(() => {
        const header = document.querySelector('.workflow-topbar');
        const brand = document.querySelector('.workflow-brand');
        const box = node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right }; };
        return { platform: document.documentElement.dataset.desktopPlatform, brand: box(brand), scrollWidth: document.documentElement.scrollWidth, drag: getComputedStyle(header).webkitAppRegion, children: [...header.children].filter(node => getComputedStyle(node).display !== 'none').map(box) };
      });
      assert.equal(state.platform, platform);
      assert.equal(state.drag, 'drag');
      assert.ok(state.scrollWidth <= width, JSON.stringify(state));
      assert.ok(state.brand.left >= (platform === 'macos' ? 90 : 16), JSON.stringify(state));
      assert.ok(state.children.every(child => child.right <= width - (platform === 'windows' ? 150 : 0)), JSON.stringify(state));
    }
    assert.equal(await page.getByRole('button', { name: /live workspace|open preview/i }).count(), 0);
    await context.close();
  }
  console.log('Desktop renderer: Mac and Windows header spacing, drag region and signed-out entry passed. Native OS controls not tested.');
} finally { await browser.close(); }
