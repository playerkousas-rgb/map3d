import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import DxfParser from 'dxf-parser';
import { Matrix4, Quaternion, Vector3 } from 'three';

function gltfVertices(json, binary) {
  const positions = []; let triangles = 0;
  const buffers = (json.buffers ?? []).map(b => b.uri ? Buffer.from(b.uri.split(',')[1], 'base64') : binary);
  const walk = (id, parent) => {
    const node = json.nodes[id];
    const local = node.matrix ? new Matrix4().fromArray(node.matrix) : new Matrix4().compose(
      new Vector3(...(node.translation ?? [0,0,0])), new Quaternion(...(node.rotation ?? [0,0,0,1])), new Vector3(...(node.scale ?? [1,1,1])));
    const world = parent.clone().multiply(local);
    if (node.mesh !== undefined) for (const primitive of json.meshes[node.mesh].primitives) {
      const accessor = json.accessors[primitive.attributes.POSITION], view = json.bufferViews[accessor.bufferView];
      assert.equal(accessor.componentType, 5126); assert.equal(accessor.type, 'VEC3');
      for (let i=0; i<accessor.count; i++) {
        const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + i*(view.byteStride ?? 12);
        const buffer = buffers[view.buffer];
        positions.push(new Vector3(buffer.readFloatLE(offset), buffer.readFloatLE(offset+4), buffer.readFloatLE(offset+8)).applyMatrix4(world));
      }
      triangles += (primitive.indices === undefined ? accessor.count : json.accessors[primitive.indices].count)/3;
    }
    for (const child of node.children ?? []) walk(child, world);
  };
  for (const root of json.scenes[json.scene ?? 0].nodes ?? []) walk(root, new Matrix4());
  return { positions, triangles };
}

function readMesh(buffer, format) {
  if (format === 'dxf') {
    const dxf = new DxfParser().parseSync(buffer.toString('utf8'));
    assert.equal(dxf.header.$ACADVER, 'AC1024'); assert.equal(dxf.header.$INSUNITS, 6);
    assert(dxf.entities.every(e => e.type === '3DFACE'));
    return { positions: dxf.entities.flatMap(e => e.vertices.slice(0,3)), triangles: dxf.entities.length };
  }
  if (format === 'obj') {
    const text = buffer.toString('utf8');
    return { positions: [...text.matchAll(/^v ([^\n]+)$/gm)].map(m => { const [x,y,z] = m[1].trim().split(/\s+/).map(Number); return {x,y,z}; }), triangles: (text.match(/^f /gm) ?? []).length };
  }
  if (format === 'stl') {
    const triangles = buffer.readUInt32LE(80), positions = [];
    assert.equal(buffer.length, 84+triangles*50);
    for (let i=0;i<triangles;i++) for(let v=0;v<3;v++) {
      const at = 84+i*50+12+v*12;
      positions.push({x:buffer.readFloatLE(at),y:buffer.readFloatLE(at+4),z:buffer.readFloatLE(at+8)});
    }
    return { positions, triangles };
  }
  if (format === 'gltf') return gltfVertices(JSON.parse(buffer.toString('utf8')));
  assert.equal(buffer.readUInt32LE(0), 0x46546c67); assert.equal(buffer.readUInt32LE(4), 2); assert.equal(buffer.readUInt32LE(8), buffer.length);
  const jsonLength = buffer.readUInt32LE(12); assert.equal(buffer.readUInt32LE(16), 0x4e4f534a);
  const json = JSON.parse(buffer.subarray(20,20+jsonLength).toString('utf8'));
  const binOffset = 20+jsonLength; assert.equal(buffer.readUInt32LE(binOffset+4), 0x004e4942);
  return gltfVertices(json, buffer.subarray(binOffset+8));
}

/** Called after the elevation fixture: actual scene has two buildings, no controls/roads, flat ground. */
export async function verifyExportVisibilityUi(page, { output, width, pass }) {
  const settle = () => page.evaluate(() => new Promise(resolve => globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve))));
  const sceneTab = async () => { await page.getByRole('button', {name:'Scene',exact:true}).click(); };
  const downloadDxf = async () => {
    await page.getByRole('button', {name:'Controls',exact:true}).click();
    const event = page.waitForEvent('download');
    await page.getByRole('button', {name:'DXF · R2010',exact:true}).click();
    return new DxfParser().parseSync(await fs.readFile(await (await event).path(), 'utf8'));
  };
  await sceneTab();
  await page.getByText('Turning Terrain off flattens the ground;', {exact:false}).waitFor();
  const buildings = page.getByRole('button', {name:'Buildings',exact:true});
  assert.equal(await buildings.getAttribute('aria-pressed'), 'true');
  await buildings.click(); await settle();
  const plain = await downloadDxf();
  assert(plain.entities.length > 0 && plain.entities.every(e => e.vertices.slice(0,3).every(p => Math.abs(p.z)<1e-5)), 'Buildings off removes the actual model, but Terrain off retains its intended flat exportable ground');
  pass(`${width}px: real scene toggle → DXF omits disabled buildings and retains documented flat ground`);
  await sceneTab(); await buildings.click(); await settle();
  const restored = await downloadDxf();
  assert(restored.entities.some(e=>e.vertices.slice(0,3).some(p=>Math.abs(p.z-15)<1e-4)), 'Buildings on must reappear in a subsequent actual download');
  pass(`${width}px: re-enabled building layer reappears in next actual DXF without stale export snapshot`);
  await page.getByRole('button', {name:'Dismiss',exact:true}).click();
  await sceneTab();
  await page.screenshot({path:path.join(output, `export-scope-${width}.png`)});
  for (const collected of [false, true]) for (const format of ['dxf','obj','stl','gltf','glb']) {
    const event = page.waitForEvent('download');
    await page.evaluate(async ({format,collected}) => (await import('/scripts/export-visibility-fixture.ts')).exportVisibilityFixture(format,collected), {format,collected});
    const download = await event; assert.equal(download.suggestedFilename(), `visibility-${collected?'collected':'direct'}.${format}`);
    const {positions,triangles} = readMesh(await fs.readFile(await download.path()), format);
    assert.equal(triangles, 12); assert(positions.length>0);
    for (const [axis,min,max] of [['x',14,16],['y',-1,1],['z',-1,1]]) {
      assert(Math.abs(Math.min(...positions.map(p=>p[axis]))-min)<1e-5 && Math.abs(Math.max(...positions.map(p=>p[axis]))-max)<1e-5, `${format} must contain only the enabled world-space cube, not hidden descendants or later scene changes`);
    }
    pass(`${width}px: ${collected?'collected':'direct'} ${format.toUpperCase()} actual browser download/readback keeps one visible cube and world transforms`);
  }
}
