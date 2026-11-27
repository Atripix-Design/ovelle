import assert from 'node:assert/strict';
import { loadChromium } from './browser-tooling.mjs';

const browser = await (await loadChromium()).launch();
const url = process.env.OVELLE_WEB_URL || 'http://127.0.0.1:4388/';
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  // Release content is owned by the worker. The footer must render while that
  // independent request is still pending as well as after its normal response.
  let releaseResponse;
  const allowRelease = new Promise(resolve => { releaseResponse = resolve; });
  const releaseFinished = page.waitForResponse(response => response.url().endsWith('/api/releases'));
  await page.route('**/api/releases', async route => {
    await allowRelease;
    await route.fulfill({ json: { releases: [] } });
  });
  assert.equal((await page.goto(url, { waitUntil: 'domcontentloaded' })).status(), 200);
  const footer = page.getByRole('contentinfo');
  const motion = footer.getByRole('switch', { name: 'Wave motion' });
  await footer.getByRole('navigation', { name: 'Footer' }).waitFor();
  assert.equal(await footer.getByRole('link').count(), 7);
  assert.ok((await footer.boundingBox()).height >= 540);
  const canvas = footer.locator('canvas');
  assert.equal(await canvas.getAttribute('aria-hidden'), 'true');
  assert.equal(await canvas.evaluate(node => getComputedStyle(node).pointerEvents), 'none');
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  const frame = () => canvas.evaluate(node => node.toDataURL());
  const untilChanged = async previous => {
    for (let index = 0; index < 25; index++) {
      if (await frame() !== previous) return;
      await page.waitForTimeout(24);
    }
    assert.fail('Visible motion did not advance');
  };
  await untilChanged(await frame());
  const how = footer.getByRole('link', { name: 'How it works' });
  await how.focus();
  assert.equal(await how.evaluate(node => getComputedStyle(node).outlineStyle), 'solid');
  const section = page.locator('#workflow');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.activeElement?.id === 'workflow');
  assert.ok(Math.abs((await section.boundingBox()).y) < 2);
  assert.ok(await footer.getByRole('link', { name: 'Desktop download' }).getAttribute('href') === '#download');
  assert.equal(await footer.getByRole('link', { name: 'Account sign-in' }).getAttribute('href'), '/account/sign-in');
  releaseResponse();
  await releaseFinished;
  assert.equal(await footer.getByRole('link').count(), 7);
  await motion.focus();
  await page.keyboard.press('Space');
  assert.equal(await motion.isChecked(), false);
  await page.waitForTimeout(100);
  const pausedFrame = await frame();
  await canvas.dispatchEvent('pointermove', { pointerType: 'mouse', clientX: 600, clientY: 800, bubbles: true });
  await page.waitForTimeout(140);
  assert.equal(await frame(), pausedFrame);
  await page.reload();
  assert.equal(await motion.isChecked(), false, 'pause survives a reload');
  await motion.click();
  await untilChanged(await frame());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await footer.getByText('Wave motion off', { exact: false }).waitFor();
  assert.equal(await motion.count(), 0);
  await page.waitForTimeout(100);
  const still = await frame();
  await how.hover();
  await page.waitForTimeout(150);
  assert.equal(await frame(), still, 'system reduced motion suppresses link wakes');
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await footer.scrollIntoViewIfNeeded();
    const dimensions = await footer.evaluate(node => ({
      width: node.clientWidth,
      scrollWidth: node.scrollWidth,
      links: Array.from(node.querySelectorAll('nav a')).map(link => link.getBoundingClientRect().height),
    }));
    assert.equal(dimensions.scrollWidth, dimensions.width, `Footer overflowed at ${width}px`);
    assert.ok(dimensions.links.every(height => height >= 44));
  }
  console.info('Footer passed independent release loading, keyboard focus and navigation, pause persistence, system reduced motion, and 320/390/768px reflow.');
} finally {
  await browser.close();
}
