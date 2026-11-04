import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DXF_PATCHES, patchDxfWriter } from './patch-dxf-writer.mjs';

let checks = 0;
const pass = label => { checks++; console.log(`✓ ${label}`); };
const sha = text => createHash('sha256').update(text).digest('hex');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'map3d-dxf-patch-'));
try {
  await patchDxfWriter(undefined, { check: true }); pass('installed writer has both exact reviewed patches');
  const original = new Map();
  for (const p of DXF_PATCHES) {
    let text = await fs.readFile(new URL(`../node_modules/dxf-writer/${p.file}`, import.meta.url), 'utf8');
    for (const [from, to] of [...p.edits].reverse()) text = text.replace(to, from);
    assert.equal(sha(text), p.before); original.set(p.file, text);
  }
  pass('reverse fixture matches exact original package hashes, not an invented baseline');
  const reset = async () => {
    await fs.mkdir(path.join(root, 'src'), { recursive: true });
    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'dxf-writer', version: '1.18.4' }));
    for (const [file, text] of original) await fs.writeFile(path.join(root, file), text);
  };
  await reset();
  await assert.rejects(patchDxfWriter(root, { check: true }), /patch missing/); pass('check mode rejects unpatched installs');
  assert.equal(await patchDxfWriter(root), 2); pass('fresh original patches exactly two files');
  for (const p of DXF_PATCHES) assert.equal(sha(await fs.readFile(path.join(root, p.file), 'utf8')), p.after);
  pass('patched files match exact output hashes');
  assert.equal(await patchDxfWriter(root), 0); pass('second patch is idempotent');
  await patchDxfWriter(root, { check: true }); pass('check mode accepts patched bytes without writes');
  await fs.writeFile(path.join(root, DXF_PATCHES[0].file), original.get(DXF_PATCHES[0].file));
  assert.equal(await patchDxfWriter(root), 1); pass('mixed original/patched state completes only missing file');
  await reset(); await fs.appendFile(path.join(root, DXF_PATCHES[1].file), '\n// unexpected drift\n');
  await assert.rejects(patchDxfWriter(root), /refusing to patch drift/);
  assert.equal(await fs.readFile(path.join(root, DXF_PATCHES[0].file), 'utf8'), original.get(DXF_PATCHES[0].file));
  pass('drift in second file aborts before writing first');
  await reset(); await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'dxf-writer', version: '1.18.5' }));
  await assert.rejects(patchDxfWriter(root), /Unreviewed/); pass('new package version fails closed');
  await reset(); await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'other-writer', version: '1.18.4' }));
  await assert.rejects(patchDxfWriter(root), /Unreviewed/); pass('wrong package identity fails closed');
  await reset(); await fs.unlink(path.join(root, DXF_PATCHES[1].file));
  await assert.rejects(patchDxfWriter(root), /ENOENT/); pass('missing source file fails closed');
  await reset(); await patchDxfWriter(root); await fs.appendFile(path.join(root, DXF_PATCHES[0].file), '\n');
  await assert.rejects(patchDxfWriter(root, { check: true }), /Unreviewed/); pass('check rejects drift even after a successful patch');
} finally { await fs.rm(root, { recursive: true, force: true }); }
console.log(`${checks} dxf-writer patch contracts passed`);
