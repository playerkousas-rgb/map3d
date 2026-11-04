/** Optional/CI independent Python CAD gate. Never installs tools implicitly. */
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { patchDxfWriter } from './patch-dxf-writer.mjs';

await patchDxfWriter(undefined, { check: true });
const root = path.resolve('node_modules/.cache');
await fs.mkdir(root, { recursive: true });
const bundle = path.join(root, 'cad-fixtures.mjs');
const output = path.resolve(process.env.CAD_ARTIFACT_DIR ?? path.join(root, 'cad-fixtures'));
await build({ entryPoints: ['scripts/cad-fixtures.ts'], bundle: true, format: 'esm', platform: 'node', alias: { '@': path.resolve('src') }, outfile: bundle, logLevel: 'warning' });
const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} CAD gate failed (${result.signal ?? result.status}); install pinned scripts/cad-requirements.txt in a venv and retry`);
};
run(process.execPath, [bundle, output]);
const args = ['scripts/verify-cad.py', output];
if (process.env.CAD_BROWSER_DIR) args.push('--browser-dir', process.env.CAD_BROWSER_DIR);
run(process.env.CAD_PYTHON ?? 'python3', args);
