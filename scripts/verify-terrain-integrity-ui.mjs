import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import DxfParser from 'dxf-parser';

/** Mocked providers; native file/select/fetch/retry/scene/download paths, not live DEM acceptance. */
export async function verifyTerrainIntegrityUi(page,{base,output,width,pass}){
  let mode='fallback',seen=[];
  const pattern=/https:\/\/[^/]+\/(?:v1\/(?:elevation|srtm30m)|api\/interpreter|osm\/tools\/overpass\/api\/interpreter)(?:\?.*)?$/;
  const handler=async route=>{
    const url=new URL(route.request().url()),headers={'access-control-allow-origin':'*'};
    let body;
    if(url.pathname.includes('interpreter'))body={elements:[]};
    else if(url.hostname==='api.open-meteo.com'){
      seen.push('primary');const n=url.searchParams.get('latitude').split(',').length;
      body={elevation:Array(n).fill(mode==='zero'?0:null)};
    }else if(url.hostname==='api.opentopodata.org'){
      seen.push('backup');const n=url.searchParams.get('locations').split('|').length;
      body={status:'OK',results:Array.from({length:mode==='invalid'?n-1:n},()=>({elevation:50}))};
    }else return route.fallback();
    await route.fulfill({status:200,contentType:'application/json',headers,body:JSON.stringify(body)});
  };
  await page.context().route(pattern,handler);
  const hint=()=>page.getByText('Terrain elevations unavailable or incomplete.',{exact:false}).filter({visible:true});
  const state=()=>page.evaluate(async()=>{
    const s=(await import('/src/state/sceneStore.ts')).useSceneStore.getState();
    return {terrain:s.terrain,source:s.terrainSource,min:s.terrainMin,max:s.terrainMax,heights:s.field?.heights??null};
  });
  const start=async()=>{
    seen=[];await page.goto(base);await page.getByRole('button',{name:'3D Orienteering',exact:true}).click();
    await page.locator('input[type=file][accept="application/json,.json"]').setInputFiles({name:'dem.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'map3d-orienteering',version:1,exportedAt:'2026-11-03T00:00:00.000Z',course:{name:'DEM integrity fixture',playMode:'linear',controls:[]}}))});
    await page.waitForFunction(()=>globalThis.document.querySelector('input[aria-label="Course name"]')?.value==='DEM integrity fixture');
    await page.getByRole('button',{name:'Select Box',exact:true}).click();
    const map=page.locator('.leaflet-container');await map.scrollIntoViewIfNeeded();const box=await map.boundingBox();
    await page.mouse.move(box.x+box.width*.4,box.y+box.height*.4);await page.mouse.down();await page.mouse.move(box.x+box.width*.6,box.y+box.height*.6,{steps:8});await page.mouse.up();
    await page.getByRole('button',{name:'Get 3D scene',exact:true}).click();
  };
  const scene=async()=>{
    await page.getByRole('button',{name:'Next Step',exact:true}).click();
    await page.locator('canvas[aria-label="3D Orienteering Course"]').waitFor();
    if(width<900)await page.getByRole('button',{name:'Resize course panel',exact:true}).press('End');
    await page.getByRole('button',{name:'Scene',exact:true}).click();
    const terrain=page.getByRole('button',{name:'Terrain',exact:true});if(await terrain.getAttribute('aria-pressed')!=='true')await terrain.click();
    const slider=page.locator('input[type=range]');await slider.press('Home');for(let i=0;i<5;i++)await slider.press('ArrowRight');
    assert.equal(await slider.inputValue(),'1');
    await page.getByRole('button',{name:'Plain',exact:true}).click();
    await page.evaluate(()=>new Promise(resolve=>globalThis.requestAnimationFrame(()=>globalThis.requestAnimationFrame(resolve))));
  };
  const download=async(name,expected)=>{
    await page.getByRole('button',{name:'Controls',exact:true}).click();
    const event=page.waitForEvent('download');await page.getByRole('button',{name:'DXF · R2010',exact:true}).click();
    const file=await event;const saved=path.join(output,`terrain-${name}-${width}.dxf`);await file.saveAs(saved);
    const dxf=new DxfParser().parseSync(await fs.readFile(saved,'utf8'));
    assert.equal(dxf.header.$INSUNITS,6);assert(dxf.entities.length>0);
    assert(dxf.entities.every(e=>e.type==='3DFACE'&&e.vertices.slice(0,3).every(p=>Number.isFinite(p.z)&&Math.abs(p.z-expected)<1e-4)),`actual DEM ${name} download must contain ground at${expected}m, not mixed or stale heights`);
    await page.getByRole('button',{name:'Dismiss',exact:true}).click();
  };
  try{
    await start();await page.getByText('50–50 m · OpenTopoData (SRTM)',{exact:false}).waitFor();
    let s=await state();assert.equal(s.terrain,'ready');assert(s.heights.every(h=>h===50));assert.deepEqual(seen,['primary','backup']);
    pass(`${width}px: null primary DEM → entire valid backup grid/source/range, no fabricated0m cells`);
    await scene();await page.getByText('Terrain 50–50 m · OpenTopoData (SRTM)',{exact:true}).waitFor();
    await page.screenshot({path:path.join(output,`terrain-fallback-${width}.png`)});await download('fallback',50);
    pass(`${width}px: backup DEM → native scene → actual metric DXF ground at50m, readback not a store-only assertion`);

    mode='invalid';await start();await hint().waitFor();s=await state();
    assert.equal(s.terrain,'error');assert.equal(s.heights,null);assert.equal(s.source,'');assert.deepEqual(seen,['primary','backup']);
    await page.screenshot({path:path.join(output,`terrain-unavailable-${width}.png`)});
    pass(`${width}px: null primary + short backup → visible unavailable/flat-not-measured warning, null field and no successful source`);
    mode='zero';await page.getByRole('button',{name:'Retry',exact:true}).click();
    await page.getByText('0–0 m · Open-Meteo (Copernicus DEM)',{exact:false}).waitFor();s=await state();assert.equal(s.terrain,'ready');assert(s.heights.every(h=>h===0));assert.equal(await hint().count(),0);
    assert.deepEqual(seen,['primary','backup','primary']);
    await page.screenshot({path:path.join(output,`terrain-retry-zero-${width}.png`)});
    pass(`${width}px: native Retry accepts complete true0m DEM, restores source and removes unavailable warning`);

    mode='invalid';await start();await hint().waitFor();await scene();await hint().waitFor();
    await page.screenshot({path:path.join(output,`terrain-flat-reference-${width}.png`)});await download('flat-reference',0);
    pass(`${width}px: both sources fail → explicit flat reference scene/DXF remains usable without labelling it successful sea-level terrain`);
  }finally{await page.context().unroute(pattern,handler);}
}
