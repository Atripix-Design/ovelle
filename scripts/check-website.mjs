import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
const base = process.env.OVELLE_WEBSITE_URL || 'http://127.0.0.1:5174';
const output = process.env.OVELLE_WEBSITE_OUTPUT || '/tmp/ovelle-website';
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  for (const width of [1440, 1024, 768, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(base); await page.evaluate(() => document.fonts.ready);
    await page.getByRole('heading', { name: 'Better relationships. Less busywork.' }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}`);
    await page.locator('.home img').evaluateAll(async nodes => { await Promise.all(nodes.map(n => { n.loading = 'eager'; return n.decode(); })); });
    assert.equal(await page.locator('.home img').evaluateAll(nodes => nodes.every(n => n.complete && n.naturalWidth > 0)), true, 'Source assets loaded');
    const workflow = page.locator(width < 768 ? '.ov-mobile-workflow' : '.ov-pinned-workflow').first();
    const controls = workflow.locator('[data-workflow-controls]').first();
    await controls.getByRole('button').nth(1).click();
    await workflow.getByText('12 verified service hours', { exact: true }).first().waitFor();
    await controls.getByRole('button').nth(2).click();
    await workflow.getByText('12 volunteers confirmed', { exact: true }).first().waitFor();
    const faq = page.locator('.home .ov-faq-row').first();
    await faq.locator('summary').click(); assert.equal(await faq.getAttribute('open'), '');
    await faq.hover(); assert.equal(await faq.getAttribute('open'), '');
    await faq.locator('summary').click();
    if (width < 768) {
      await page.getByRole('button', { name: 'Menu', exact: true }).click();
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('button', { name: 'Menu', exact: true }).getAttribute('aria-expanded'), 'false');
      let attempts = 0;
      await page.route('**/api/download-email', async route => { attempts++; await new Promise(r => setTimeout(r, 150)); await route.fulfill({ status: attempts === 1 ? 503 : 200, json: attempts === 1 ? {error:'Unavailable'} : {sent:true} }); });
      await page.getByLabel('Email address').fill('invalid');
      await page.getByRole('button', { name:'Email me the link' }).click();
      await page.getByText('Enter a valid email address.', {exact:true}).waitFor();
      assert.equal(attempts, 0);
      await page.getByLabel('Email address').fill('reader@example.com');
      await page.getByRole('button', { name: 'Email me the link' }).click();
      await page.getByRole('alert').filter({hasText:'We couldn’t send the link.'}).waitFor();
      assert.equal(await page.getByLabel('Email address').inputValue(), 'reader@example.com');
      await page.getByRole('button', {name:'Try again'}).evaluate(n => { n.click(); n.click(); });
      await page.getByRole('heading', { name: 'Check your inbox.' }).waitFor();
      assert.equal(attempts, 2, 'Repeated clicks while sending must not send another message');
      await page.locator('.ov-hero-select').click();
      const choice=page.getByRole('dialog').getByRole('button', {name:'Relationships',exact:true});
      await choice.click();
      assert.equal(await page.locator('.ov-hero-workflow-scene').getAttribute('data-stage'), 'enrich');
      assert.equal(await page.getByRole('dialog').isVisible(), false);
      assert.equal(await page.getByLabel('Email address').inputValue(), 'reader@example.com');
    }
    await page.screenshot({ path: `${output}/home-${width}.png`, fullPage: true });
    assert.deepEqual(errors, [], `Runtime errors at ${width}`); await page.close();
  }
  const page = await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'no-preference'});
  await page.goto(base);
  const pinned=page.locator('.ov-pinned-workflow[data-pinned]'); await pinned.waitFor();
  const top=(await pinned.boundingBox()).y;
  for(const [progress,stage] of [[.1,'find'],[.5,'enrich'],[.9,'follow-up'],[.1,'find']]) {
    await page.evaluate(({top,progress}) => scrollTo(0,top+1800*progress), {top,progress});
    await page.waitForTimeout(80); assert.equal(await pinned.getAttribute('data-stage'),stage);
    assert.ok(Math.abs((await page.locator('.ov-pinned-viewport').boundingBox()).y)<1);
  }
  await page.evaluate(top => scrollTo(0,top+2800),top); await page.waitForTimeout(80);
  assert.ok((await page.locator('.ov-pinned-viewport').boundingBox()).y < 0, 'Sticky viewport releases after its runway');
  await page.emulateMedia({reducedMotion:'reduce'}); await page.waitForTimeout(80);
  assert.equal(await page.locator('.ov-pinned-workflow .ov-workflow-section').count(),3);
  await page.close();
  console.log('ovelle website responsive layout, retry/validation/duplicate-send states, sheet focus and reversible natural scroll verified');
} finally { await browser.close(); }
