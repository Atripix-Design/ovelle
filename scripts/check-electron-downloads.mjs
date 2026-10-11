import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright';
const require = createRequire(import.meta.url);
const application = await _electron.launch({ executablePath: require('electron'), args: ['--disable-gpu', fileURLToPath(new URL('../apps/desktop/out/main/index.js', import.meta.url))] });
try {
  const page = await application.firstWindow();
  await page.getByRole('heading', { name: 'Better relationships. Less busywork.' }).waitFor();
  const releases = await page.evaluate(() => window.ovelleDownloads.loadReleases());
  assert.equal(releases.length, 3);
  assert.ok(releases.every(release => release.available && release.href.startsWith('https://cdn.dev.ovelle.org/releases/desktop/')));
  await application.evaluate(({ shell }) => {
    globalThis.ovelleTestRequests = [];
    globalThis.ovelleTestExternal = [];
    globalThis.fetch = async (url, init) => { globalThis.ovelleTestRequests.push({ url, ...init }); return Response.json({ sent:true }); };
    shell.openExternal = async url => { globalThis.ovelleTestExternal.push(url); };
  });
  await page.evaluate(() => window.ovelleDownloads.emailLink('reader@example.com'));
  const requests = await application.evaluate(() => globalThis.ovelleTestRequests);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://dev.ovelle.org/api/download-email');
  assert.equal(requests[0].method, 'POST');
  assert.deepEqual(JSON.parse(requests[0].body), { email:'reader@example.com' });
  await page.getByRole('link', { name:'Download for Apple silicon', exact:true }).click();
  await page.waitForTimeout(100);
  assert.equal((await application.evaluate(() => globalThis.ovelleTestExternal))[0], releases[0].href);
  assert.match(page.url(), /renderer\/index.html$/);
  console.log('Electron packaged Home, live dev release catalog, restricted native email IPC and external download handoff verified');
} finally { await application.close(); }
