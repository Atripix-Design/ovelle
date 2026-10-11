// Source baselines are Figma exports. Update them only after retrieving fresh design context.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const { chromium } = await import(process.env.OVELLE_PLAYWRIGHT_MODULE || 'playwright');
const sources = JSON.parse(await readFile(new URL('../docs/design-system/migration/sources.json', import.meta.url)));
const assets = JSON.parse(await readFile(new URL('../docs/design-system/migration/assets.json', import.meta.url)));
const websiteAssets = JSON.parse(await readFile(new URL('../docs/design-system/migration/website-2026-10-11/assets.json', import.meta.url)));
for (const metadata of Object.values(websiteAssets)) {
  const file = await readFile(new URL(`../${metadata.path}`, import.meta.url));
  assert.ok(file.length > 50, `Empty website source asset ${metadata.path}`);
  assert.equal(createHash('sha256').update(file).digest('hex'), metadata.sha256, `Changed website source asset ${metadata.path}`);
}
const manifest = JSON.parse(await readFile(new URL('../packages/ui/figma-manifest.json', import.meta.url)));
assert.deepEqual(sources.map(s=>s.id).sort(), manifest.components.map(s=>s.id).sort(), 'Every public family needs an independent source baseline');
for (const source of sources) assert.ok((await readFile(new URL(`../docs/design-system/migration/${source.reference}`, import.meta.url))).length > 100, `Missing reference ${source.name}`);
for (const [name, metadata] of Object.entries(assets)) {
  const file = await readFile(new URL(`../packages/ui/assets/${name}`, import.meta.url));
  assert.equal(createHash('sha256').update(file).digest('hex'), metadata.sha256, `Changed original SVG ${name}: retrieve fresh source evidence before updating its fingerprint`);
  assert.ok(file.length > 50, `Empty source asset ${name}`);
  const root = file.toString('utf8', 0, Math.min(file.length, 500)).match(/<svg\b[^>]*>/)?.[0];
  assert.ok(root, `SVG root ${name}`);
  assert.equal(root.match(/\bwidth="([^"]+)"/)?.[1], metadata.width, `${name} width`);
  assert.equal(root.match(/\bheight="([^"]+)"/)?.[1], metadata.height, `${name} height`);
}
const output = process.env.OVELLE_FIDELITY_OUTPUT || '/tmp/ovelle-fidelity';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(process.env.OVELLE_PREVIEW_URL || 'http://100.114.150.83:5174/components');
  await page.evaluate(() => document.fonts.ready);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.mouse.move(0, 0);
  for (const source of sources) {
    const name = source.name.replace('Ovelle / ', '');
    const node = page.locator(`[data-specimen="${name}"] .preview-live > *`);
    const box = await node.boundingBox();
    assert.ok(box, `Missing ${name}`);
    assert.ok(Math.abs(box.width - source.width) < 1, `${name} width: ${box.width} vs Figma ${source.width}`);
    assert.ok(Math.abs(box.height - source.height) < 1, `${name} height: ${box.height} vs Figma ${source.height}`);
    // Scrollable comparisons must not clip a source capture. This changes the fixture container only.
    await node.evaluate(n => { const pair=n.closest('.preview-pair'); if(pair){ pair.scrollLeft=0; pair.style.overflow='visible'; pair.style.contain='none'; } });
    await node.screenshot({ path: path.join(output, `${source.id.replace(':', '-')}.png`) });
  }
  const websiteVariants = JSON.parse(await readFile(new URL('../docs/design-system/migration/website-2026-10-11/variant-sizes.json', import.meta.url)));
  for (const variant of websiteVariants.email) {
    const node = page.locator(`[data-website-state="${variant.state}"] .ov-email-download-link`);
    const box = await node.boundingBox();
    assert.equal(box.width, variant.width, `Email ${variant.state} source width`);
    assert.equal(box.height, variant.height, `Email ${variant.state} source height`);
    await node.screenshot({ path:path.join(output, `${variant.id.replace(':','-')}.png`) });
  }
  for (const variant of websiteVariants.workflow) {
    const node = page.locator(`[data-website-stage="${variant.stage}"] .ov-mobile-workflow`);
    assert.equal((await node.boundingBox()).height, variant.height, `Mobile ${variant.stage} source height`);
    const section = page.locator(`[data-website-stage="${variant.stage}"] .ov-workflow-section`);
    assert.equal((await section.boundingBox()).height, variant.sectionHeight, `Section ${variant.stage} source height`);
    await node.screenshot({ path:path.join(output, `${variant.id.replace(':','-')}.png`) });
  }
  assert.match(await page.locator('[data-specimen="Date picker"] .preview-live').textContent(), /Oct 8, 2026/);
  const button = page.locator('[data-specimen="Button"] .preview-live .ov-button');
  const surface = button.locator('.ov-action-surface');
  const font = await surface.evaluate(node => { const s = getComputedStyle(node); return [s.fontFamily, s.fontSize, s.fontWeight, s.lineHeight, s.borderRadius]; });
  assert.deepEqual(font, ['Inter, sans-serif', '14px', '500', '20px', '999px']);
  assert.equal((await surface.boundingBox()).height, 44);
  assert.equal((await surface.boundingBox()).width, 152);
  await button.hover(); await page.waitForTimeout(150); assert.equal(await surface.evaluate(n=>getComputedStyle(n).backgroundColor), 'rgb(0, 77, 120)');
  await page.mouse.down(); assert.equal((await surface.boundingBox()).height, 42); assert.equal((await button.boundingBox()).width, 158); await page.mouse.up();
  await page.keyboard.press('Tab'); await button.focus(); assert.equal((await surface.boundingBox()).width, 148); await button.blur();
  const action = page.locator('[data-specimen="Download action"] .preview-live .ov-download-action');
  const geometry = await action.evaluate(node => { const root = node.getBoundingClientRect(), inner = node.querySelector('.ov-action-surface').getBoundingClientRect(), icon = node.querySelector('img.ov-asset-light').getBoundingClientRect(); return { innerWidth: inner.width, innerHeight: inner.height, inset: inner.x-root.x, iconX: icon.x-root.x, iconY: icon.y-root.y, iconWidth: icon.width, iconHeight: icon.height }; });
  assert.deepEqual(geometry, { innerWidth: 324, innerHeight: 64, inset: 4, iconX: 28, iconY: 26, iconWidth: 20, iconHeight: 20 });
  const select = page.locator('[data-specimen="Select"] .preview-live').getByRole('combobox');
  await select.focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  assert.match(await select.textContent(), /Active/);
  await select.click(); await page.keyboard.press('Escape'); assert.equal(await select.getAttribute('aria-expanded'), 'false');
  const dialogComposition = page.locator('[data-variant-case="Confirmation dialog"] .ov-confirmation-composition');
  const launcher = dialogComposition.locator('.ov-confirmation-launcher');
  await launcher.click(); assert.equal(await dialogComposition.locator('dialog').evaluate(n=>n.open), true);
  assert.equal((await dialogComposition.locator('dialog').boundingBox()).height, 222);
  await page.keyboard.press('Escape'); assert.equal(await launcher.evaluate(n=>n===document.activeElement), true);
  const mobile = page.locator('[data-variant-case="Site navigation / Mobile"] .ov-site-navigation-mobile');
  if ((await mobile.boundingBox()).height === 64) await mobile.getByRole('button', {name: /Menu/}).click();
  assert.equal((await mobile.boundingBox()).height, 408);
  for (const theme of [false, true]) for (const glass of [false, true]) {
    await page.getByRole('switch', { name: 'Dark theme', exact: true }).setChecked(theme);
    await page.getByRole('switch', { name: 'Liquid Glass', exact: true }).setChecked(glass);
    for (const frost of ['0', '35', '100']) {
      await page.locator('input[type="range"]').fill(frost);
      const results = await page.locator('.preview-live img, .preview-variants img, .website-variants img').evaluateAll(images => images.filter(img=>img.getBoundingClientRect().width && img.getBoundingClientRect().height).map(img=>({src:img.currentSrc, naturalWidth:img.naturalWidth, naturalHeight:img.naturalHeight, width:img.getBoundingClientRect().width, height:img.getBoundingClientRect().height})));
      assert.ok(results.length > 20);
      for (const result of results) {
        assert.ok(result.naturalWidth > 0, `Failed asset: ${result.src}`);
        if (!/\.svg(?:[?#]|$)|^data:image\/svg\+xml/.test(result.src)) continue;
        assert.equal(result.width, result.naturalWidth, `Resized SVG: ${result.src}`);
        assert.equal(result.height, result.naturalHeight, `Resized SVG: ${result.src}`);
      }
    }
  }
  assert.deepEqual(errors, []);
  console.log(`FIGMA_FIDELITY_PASS: ${sources.length} source dimensions; action geometry/typography/states; select and dialog keyboard/focus; ${Object.keys(assets).length} exact SVG files; visible SVG native geometry across 12 theme/material/frost settings. Captures: ${output}`);
} finally { await browser.close(); }
