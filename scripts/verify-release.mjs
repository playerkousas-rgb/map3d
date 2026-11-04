/** Release/icon contracts derived from readme G11/W/V; zero dependencies. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const config = read('src/config/app.ts');
const html = read('index.html');
const manifest = JSON.parse(read('public/manifest.webmanifest'));
assert.equal(lock.version, pkg.version);
assert.equal(lock.packages[''].version, pkg.version);
assert(config.includes(`APP_VERSION = "${pkg.version}"`));
assert(html.includes(`name="application-version" content="${pkg.version}"`));
assert(html.includes(`v${pkg.version}</title>`));
assert.equal(manifest.version, pkg.version);
assert(config.includes('© SCOUT SYSTEM') && html.includes('© SCOUT SYSTEM'));
const origin = config.match(/APP_ORIGIN = "([^"]+)"/)[1];
const image = html.match(/property="og:image" content="([^"]+)"/)[1];
assert.equal(new URL(image).origin, origin);
assert.equal(manifest.icons.length, 4);
assert.equal(manifest.theme_color, manifest.background_color);
assert(html.includes(`name="theme-color" content="${manifest.theme_color}"`));
const sizes = {
  'favicon-16.png': [16, 16], 'favicon-32.png': [32, 32],
  'apple-touch-icon.png': [180, 180], 'icon-192.png': [192, 192], 'icon-512.png': [512, 512],
  'icon-maskable-192.png': [192, 192], 'icon-maskable-512.png': [512, 512], 'og-image.png': [1200, 630],
};
const base = `public/icons/v${pkg.version}`;
assert.equal(fs.readdirSync(path.join(root, base)).length, 9);
let total = 0;
for (const [file, [width, height]] of Object.entries(sizes)) {
  const buffer = fs.readFileSync(path.join(root, base, file));
  assert.equal(buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${file}: PNG signature`);
  assert.equal(buffer.readUInt32BE(16), width, `${file}: width`);
  assert.equal(buffer.readUInt32BE(20), height, `${file}: height`);
  assert.equal(buffer[25], 3, `${file}: palette-compressed PNG`);
  assert(buffer.includes(Buffer.from('SCOUT SYSTEM')), `${file}: copyright metadata`);
  total += buffer.length;
}
const ico = fs.readFileSync(path.join(root, base, 'favicon.ico'));
assert.equal(ico.readUInt16LE(2), 1);
assert.equal(ico.readUInt16LE(4), 3);
assert.deepEqual(Array.from({ length: 3 }, (_, i) => ico[6 + i * 16]), [16, 32, 48]);
total += ico.length;
assert(total <= 260_000, `Icon budget exceeded: ${total}`);
for (const icon of manifest.icons) {
  assert(icon.src.startsWith(`/icons/v${pkg.version}/`), 'Cache-safe versioned icon path');
  assert(fs.existsSync(path.join(root, 'public', icon.src)), `Missing manifest icon: ${icon.src}`);
  const size = Number(icon.sizes.split('x')[0]);
  assert([192, 512].includes(size) && ['any', 'maskable'].includes(icon.purpose));
}
assert.equal(new Set(manifest.icons.map(i => `${i.purpose}:${i.sizes}`)).size, 4);
for (const href of html.matchAll(/<link[^>]+href="([^"]+)"/g)) {
  if (href[1].startsWith('/')) assert(fs.existsSync(path.join(root, 'public', href[1])), `Missing HTML asset: ${href[1]}`);
}
assert(fs.existsSync(path.join(root, 'public', new URL(image).pathname)), 'OG image exists locally');
const headers = JSON.parse(read('vercel.json')).headers;
assert(headers.some(rule => rule.source === '/icons/(.*)' && rule.headers.some(h => h.key === 'Cache-Control' && h.value.includes('immutable'))));
console.log(`✓ release v${pkg.version}: metadata aligned; 9 PNG/ICO assets, ${total.toLocaleString()} bytes; manifest/OG paths and cache policy valid`);
