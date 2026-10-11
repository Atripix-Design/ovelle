import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const output = new URL('../docs/design-system/migration/github-navigation-2026-10-11/', import.meta.url).pathname;
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const audit = [];
try {
  for (const [consumer, url] of [['web', 'http://100.114.150.83:5174/components'], ['desktop', 'http://100.114.150.83:5175/?components']]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(url); await page.evaluate(() => document.fonts.ready);
    const desktop = page.locator('[data-specimen="Site navigation / Desktop"] .preview-live nav');
    const github = desktop.getByRole('link', { name: /^GitHub/ });
    assert.equal(await github.getAttribute('href'), 'https://github.com/Atripix-Design/ovelle');
    assert.equal(await github.getAttribute('target'), '_blank');
    assert.match(await github.getAttribute('rel'), /noopener/);
    assert.equal(await desktop.getByRole('link', { name: 'Download', exact: true }).count(), 0);
    assert.equal(await desktop.getByRole('button', { name: 'Get Ovelle' }).count(), 1);
    const skeleton = page.locator('[data-specimen="GitHub link"] .ov-skeleton');
    assert.equal(await skeleton.evaluate(n => n.inert), true);
    for (const dark of [false, true]) for (const glass of [false, true]) {
      await page.getByRole('switch', { name: 'Dark theme', exact: true }).setChecked(dark);
      await page.getByRole('switch', { name: 'Liquid Glass', exact: true }).setChecked(glass);
      for (const frost of ['0', '35', '100']) {
        await page.locator('input[type="range"]').fill(frost);
        const mark = github.locator(`img.ov-asset-${dark ? 'dark' : 'light'}`);
        await mark.evaluate(n => n.decode());
        const geometry = await mark.evaluate(n => ({ width: n.getBoundingClientRect().width, height: n.getBoundingClientRect().height, naturalWidth: n.naturalWidth, naturalHeight: n.naturalHeight }));
        assert.deepEqual(geometry, { width: 16, height: 16, naturalWidth: 16, naturalHeight: 16 });
      }
      await github.hover(); await page.keyboard.press('Tab'); await github.focus();
      assert.equal(await github.evaluate(n => n.matches(':focus-visible')), true);
      await github.blur(); await page.mouse.move(0, 0);
      await desktop.screenshot({ path: `${output}/${consumer}-desktop-${dark ? 'dark' : 'light'}-${glass ? 'glass' : 'solid'}.png` });
    }
    await page.getByRole('switch', { name: 'Dark theme', exact: true }).uncheck();
    await page.getByRole('switch', { name: 'Liquid Glass', exact: true }).uncheck();
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const mobile = page.locator('[data-specimen="Site navigation / Mobile"] .preview-live nav');
      const trigger = mobile.getByRole('button', { name: 'Menu', exact: true });
      assert.equal(await mobile.locator('.ov-github-link').count(), 0);
      await trigger.click();
      const link = mobile.getByRole('link', { name: /GitHub/ });
      await mobile.press('End'); assert.equal(await link.evaluate(n => n === document.activeElement), true);
      assert.ok((await mobile.boundingBox()).width <= width);
      await mobile.screenshot({ path: `${output}/${consumer}-mobile-${width}.png` });
      await page.keyboard.press('Escape');
      assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
      assert.equal(await trigger.evaluate(n => n === document.activeElement), true);
      await trigger.click();
      await link.evaluate(n => { n.addEventListener('click', e => e.preventDefault()); n.click(); });
      assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    }
    assert.deepEqual(errors, []); audit.push({ consumer, keyboard: true, externalLink: true, nativeMark: true, themes: 2, materials: 2, frostLevels: 3, mobileWidths: [390, 320], skeletonInert: true });
    await page.close();
  }
  await writeFile(`${output}/audit.json`, JSON.stringify(audit, null, 2) + '\n');
  console.log('GitHub navigation passed in website and desktop renderer.');
} finally { await browser.close(); }
