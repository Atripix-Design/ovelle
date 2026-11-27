import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const script = path.resolve('scripts/optimize-website-images.mjs');
test('converts build images and updates cache-safe bundle and HTML references', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ovelle-images-'));
  try {
    await mkdir(path.join(dir, 'assets'));
    await sharp({ create: { width: 10, height: 10, channels: 4, background: '#f08080' } }).png().toFile(path.join(dir, 'assets/photo-abc.png'));
    await writeFile(path.join(dir, 'assets/index-old.js'), 'const photo="/assets/photo-abc.png";');
    await writeFile(path.join(dir, 'index.html'), '<script src="/assets/index-old.js"></script>');
    execFileSync(process.execPath, [script, dir]);
    const assets = await readdir(path.join(dir, 'assets'));
    assert.ok(assets.includes('photo-abc.webp'));
    assert.ok(!assets.includes('photo-abc.png'));
    const bundle = assets.find(name => /^index-[a-f0-9]{16}\.js$/.test(name));
    assert.ok(bundle);
    assert.match(await readFile(path.join(dir, 'index.html'), 'utf8'), new RegExp(bundle.replace('.', '\\.')));
    assert.match(await readFile(path.join(dir, 'assets', bundle), 'utf8'), /photo-abc\.webp/);
    assert.equal((await sharp(path.join(dir, 'assets/photo-abc.webp')).metadata()).format, 'webp');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('rejects unsupported animation instead of silently discarding frames', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ovelle-images-'));
  try {
    await writeFile(path.join(dir, 'animated.gif'), 'fixture');
    assert.throws(() => execFileSync(process.execPath, [script, dir], { stdio: 'pipe' }));
    assert.equal(await readFile(path.join(dir, 'animated.gif'), 'utf8'), 'fixture');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
