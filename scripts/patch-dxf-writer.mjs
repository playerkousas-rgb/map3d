/** Minimal MIT dxf-writer@1.18.4 ownership fix, NOT a replacement serializer.
 * Source/provenance, reproduction and exact scope: docs/cad-conformance.md.
 * Only reviewed original OR exact patched bytes accepted. Never patch drift.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DXF_PATCHES = [
  {
    file: 'src/Drawing.js',
    before: 'fd139502d14fc15e52fb0f625bb5fbacef95ef19377779b1775af5113d9c19a1',
    after: '21defc880e93fcf5926d6349e24b518a82f7daacff9f2fa581541090e51e3c51',
    edits: [['            blockRecordTable.add(r);', `            blockRecordTable.add(r);
            // map3d: BLOCK/ENDBLK and entities belong to BLOCK_RECORD, not BLOCK.
            b.recordHandle = r.handle;
            b.ownerObjectHandle = r.handle;
            b.end.ownerObjectHandle = r.handle;`]],
  },
  {
    file: 'src/Layer.js',
    before: '1075693555ab112a0f6fbc9d5cc05bdc8233d34529276e3887e277f63ea8be09',
    after: '89726d9b55dc7d76093e1a5c1eb5929615b863edc1d9e00b1633c855ee673993',
    edits: [
      ['        manager.push(390, 1);', `        // map3d: null plot-style pointer, never a dangling hardcoded handle.
        manager.push(390, 0);`],
      ['            shape.ownerObjectHandle = space.handle;', '            shape.ownerObjectHandle = space.recordHandle;'],
    ],
  },
];
const sha = text => createHash('sha256').update(text).digest('hex');
const installed = fileURLToPath(new URL('../node_modules/dxf-writer/', import.meta.url));
export async function patchDxfWriter(directory = installed, { check = false } = {}) {
  const pkg = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'));
  if (pkg.name !== 'dxf-writer' || pkg.version !== '1.18.4') throw new Error('Unreviewed dxf-writer version: review ownership patch before upgrading');
  const writes = [];
  // Validate ALL files before writing any, so drift cannot leave a partial patch.
  for (const patch of DXF_PATCHES) {
    const file = path.join(directory, patch.file), original = await fs.readFile(file, 'utf8'), hash = sha(original);
    if (hash === patch.after) continue;
    if (hash !== patch.before) throw new Error(`Unreviewed dxf-writer source: ${patch.file}; refusing to patch drift`);
    if (check) throw new Error('dxf-writer patch missing; run npm run patch:dxf-writer (npm lifecycle scripts may have been disabled)');
    let modified = original;
    for (const [from, to] of patch.edits) {
      if (modified.split(from).length !== 2) throw new Error(`Ambiguous dxf-writer patch: ${patch.file}`);
      modified = modified.replace(from, to);
    }
    if (sha(modified) !== patch.after) throw new Error(`Unexpected dxf-writer patch result: ${patch.file}`);
    writes.push([file, modified]);
  }
  for (const [file, text] of writes) await fs.writeFile(file, text);
  return writes.length;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const check = process.argv.slice(2).includes('--check');
  const changed = await patchDxfWriter(undefined, { check });
  console.log(`✔ dxf-writer 1.18.4 ownership patch ${check ? 'verified' : changed ? 'applied' : 'already applied'}`);
}
