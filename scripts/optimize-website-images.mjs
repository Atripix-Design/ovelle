import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Operate on the disposable Vite output, leaving design source assets untouched.
const root = path.resolve(process.argv[2] || 'apps/web/dist');
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory()
    ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]))).flat();
}
const all = await files(root);
const images = all.filter(file => /\.(png|jpe?g)$/i.test(file));
const unsupported = all.filter(file => /\.(gif|tiff?|bmp)$/i.test(file));
if (unsupported.length) throw new Error(`Unsupported images require review: ${unsupported.join(', ')}`);
const replacements = new Map();
let before = 0, after = 0;
for (const file of images) {
  const metadata = await sharp(file, { animated: true }).metadata();
  if ((metadata.pages || 1) > 1) throw new Error(`Animated image requires review: ${file}`);
  if (replacements.has(path.basename(file))) throw new Error(`Duplicate image filename requires review: ${file}`);
  const target = file.replace(/\.(png|jpe?g)$/i, '.webp');
  if (all.includes(target)) throw new Error(`Image output already exists: ${target}`);
  const original = await readFile(file);
  const output = await sharp(original).rotate().webp({ quality: 85, alphaQuality: 100, effort: 5 }).toBuffer();
  await writeFile(target, output, { flag: 'wx' });
  replacements.set(path.basename(file), path.basename(target));
  before += original.length; after += output.length;
}
const textFiles = all.filter(file => /\.(html|js|css)$/i.test(file));
const changed = new Map();
for (const file of textFiles) {
  let content = await readFile(file, 'utf8');
  const original = content;
  for (const [from, to] of replacements) content = content.split(from).join(to);
  if (content !== original) changed.set(file, content);
}
// Changed hashed bundles must get new names so a CDN cannot serve stale code.
const bundleNames = new Map();
for (const [file, content] of changed) {
  if (!/\.(js|css)$/i.test(file)) continue;
  const name = path.basename(file);
  const match = name.match(/^(.*)-[A-Za-z0-9_-]+(\.(?:js|css))$/);
  if (!match) throw new Error(`Cannot safely rename changed bundle: ${file}`);
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);
  bundleNames.set(name, `${match[1]}-${hash}${match[2]}`);
}
// Cross-bundle references need a proper dependency-aware rehash, so fail closed.
for (const file of textFiles.filter(file => /\.(js|css)$/i.test(file))) {
  const content = changed.get(file) ?? await readFile(file, 'utf8');
  for (const oldName of bundleNames.keys()) {
    if (content.includes(oldName)) throw new Error(`Cross-bundle reference needs review: ${file} -> ${oldName}`);
  }
}
for (const file of textFiles) {
  let content = changed.get(file) ?? await readFile(file, 'utf8');
  for (const [from, to] of bundleNames) content = content.split(from).join(to);
  const renamed = bundleNames.get(path.basename(file));
  if (renamed) {
    await writeFile(path.join(path.dirname(file), renamed), content, { flag: 'wx' });
    await unlink(file);
  } else if (content !== await readFile(file, 'utf8')) await writeFile(file, content);
}
for (const file of images) await unlink(file);
console.log(`Optimized ${images.length} website images: ${(before / 1048576).toFixed(2)} MiB -> ${(after / 1048576).toFixed(2)} MiB (WebP quality 85).`);
