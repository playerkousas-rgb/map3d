import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import DxfParser from 'dxf-parser';

/** Real native planner flow with mocked providers. No store actions injected. */
export async function verifySceneRecoveryUi(page,{base,output,width,pass,production=false}){
  let badBuilding='',buildingMode='partial',roadMode='error',terrainMode='error';
  const calls={buildings:0,roads:0,terrain:0};
  let roadRelease,terrainRelease;
  const roadGate=new Promise(resolve=>{roadRelease=resolve;}),terrainGate=new Promise(resolve=>{terrainRelease=resolve;});
  const building={type:'way',id:98001,tags:{building:'yes',height:'12'},geometry:[{lat:22.3199,lon:114.1699},{lat:22.3199,lon:114.1701},{lat:22.3201,lon:114.1701},{lat:22.3201,lon:114.1699},{lat:22.3199,lon:114.1699}]};
  const road={type:'way',id:98002,tags:{highway:'footway'},geometry:[{lat:22.3198,lon:114.1698},{lat:22.3202,lon:114.1702}]};
  const pattern=/https:\/\/[^/]+\/(?:v1\/(?:elevation|srtm30m)|api\/interpreter|osm\/tools\/overpass\/api\/interpreter)(?:\?.*)?$/;
  const handler=async route=>{
    const url=new URL(route.request().url()),headers={'access-control-allow-origin':'*'};let body;
    if(url.pathname.includes('interpreter')){
      const q=decodeURIComponent(route.request().postData()??'');
      if(q.includes('"building"')){
        calls.buildings++;badBuilding ||= q;
        if(buildingMode==='partial'&&q===badBuilding)return route.fulfill({status:503,headers,body:''});
        body={elements:[building]};
      }else{
        calls.roads++;
        if(roadMode==='error')return route.fulfill({status:503,headers,body:''});
        if(roadMode==='pending')await roadGate;
        body={elements:[road]};
      }
    }else if(url.hostname==='api.open-meteo.com'){
      calls.terrain++;if(terrainMode==='pending')await terrainGate;
      const n=url.searchParams.get('latitude').split(',').length;
      body={elevation:Array(n).fill(terrainMode==='error'?null:50)};
    }else if(url.hostname==='api.opentopodata.org')body={status:'OK',results:[]};
    else return route.fallback();
    return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(body)});
  };
  const geocode='https://nominatim.openstreetmap.org/**';
  const search=route=>route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify([{display_name:'Recovery extent fixture',lat:'22.32',lon:'114.17',boundingbox:['22.30','22.34','114.14','114.20']},{display_name:'Other recovery result',lat:'22.33',lon:'114.18'}])});
  await page.context().route(pattern,handler);await page.context().route(geocode,search);
  const snapshot=()=>production?page.evaluate(()=>{
    const data=JSON.parse(globalThis.localStorage.getItem('map3d.orienteering.v1'));
    return JSON.stringify({course:data.course,scene:data.scene,area:data.area});
  }):page.evaluate(async()=>{
    const c=(await import('/src/state/courseStore.ts')).useCourseStore.getState();return JSON.stringify({course:c.course,scene:c.scene,area:c.area,readOnly:c.readOnly});
  });
  const settled=part=>production?
    page.getByRole('region',{name:'Scene data',exact:true}).getByRole('button',{name:`Retry ${part==='buildings'?'Buildings':part==='roads'?'Roads':'Terrain'}`,exact:true}).waitFor({state:'detached'}):
    page.waitForFunction(async part=>{
    const s=(await import('/src/state/sceneStore.ts')).useSceneStore.getState();return s[part]==='ready';
  },part);
  try{
    await page.goto(base);await page.getByRole('button',{name:'3D Orienteering',exact:true}).click();
    const course={app:'map3d-orienteering',version:1,exportedAt:'2026-11-03T00:00:00.000Z',course:{name:'Scene recovery fixture',playMode:'linear',controls:[{id:'recovery-start',kind:'start',lat:22.32,lng:114.17,code:'S',name:'Private start',clue:'Gate',note:'PRIVATE_RECOVERY_NOTE',score:0}]}};
    await page.locator('input[type=file][accept="application/json,.json"]').setInputFiles({name:'recovery.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(course))});
    await page.waitForFunction(()=>globalThis.document.querySelector('input[aria-label="Course name"]')?.value==='Scene recovery fixture');
    const input=page.getByRole('searchbox',{name:'Search',exact:true});await input.fill('Recovery extent');await input.press('Enter');
    await page.getByRole('button',{name:'Recovery extent fixture',exact:true}).click();
    // Stop any geocoder flight and ensure even a zoom19 saved extent spans
    // multiple cells. All operations are native controls, not store injection.
    for(let i=0;i<5;i++)await page.getByRole('button',{name:'Zoom out',exact:true}).click();
    await page.getByRole('button',{name:'Select Box',exact:true}).click();
    const map=page.locator('.leaflet-container');await map.scrollIntoViewIfNeeded();const box=await map.boundingBox();
    await page.mouse.move(box.x+box.width*.2,box.y+box.height*.45);await page.mouse.down();await page.mouse.move(box.x+box.width*.8,box.y+box.height*.85,{steps:8});await page.mouse.up();
    await page.getByRole('button',{name:'Get 3D scene',exact:true}).click();
    await page.getByRole('button',{name:'Next Step',exact:true}).click();
    await page.locator('canvas[aria-label="3D Orienteering Course"]').waitFor();
    if(width<900)await page.getByRole('button',{name:'Resize course panel',exact:true}).press('End');
    await page.getByRole('button',{name:'Scene',exact:true}).click();
    const region=page.getByRole('region',{name:'Scene data',exact:true});
    await region.getByText(/area cells unavailable/).waitFor();
    await region.getByRole('button',{name:'Retry Buildings',exact:true}).waitFor();
    await region.getByRole('button',{name:'Retry Roads',exact:true}).waitFor();await region.getByRole('button',{name:'Retry Terrain',exact:true}).waitFor();
    if(production){
      await region.getByText(/1\/[2-9]\d* area cells unavailable|1\/1\d+ area cells unavailable/).waitFor();
      await region.getByText('Roads · unavailable',{exact:true}).waitFor();
      await region.getByText('Terrain · unavailable',{exact:true}).waitFor();
    }else assert(await page.evaluate(async()=>{const s=(await import('/src/state/sceneStore.ts')).useSceneStore.getState();return s.buildings==='ready'&&s.buildingCells.failed===1&&s.buildingCells.total>1&&s.roads==='error'&&s.terrain==='error';}));
    await region.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,`${production?'production-':''}scene-recovery-errors-${width}.png`)});
    pass(`${width}px: native partial building cells + unavailable roads/DEM retain distinct in-scene status and three recovery actions`);
    for(const name of ['Retry Buildings','Retry Roads','Retry Terrain']){
      const target=region.getByRole('button',{name,exact:true});await target.scrollIntoViewIfNeeded();const b=await target.boundingBox();assert(b.width>=44&&b.height>=44);
      assert(await target.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(globalThis.document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}));
    }
    await page.getByRole('button',{name:'中文 / ZH',exact:true}).click();
    for(const name of ['重試 建築物','重試 道路','重試 地形'])await page.getByRole('button',{name,exact:true}).waitFor();
    await page.getByRole('region',{name:'場景資料',exact:true}).getByText(/個區塊未能載入/).waitFor();
    await page.getByRole('button',{name:'EN',exact:true}).click();
    pass(`${width}px: recovery actions have native44px hit targets, layer-specific accessible names and live bilingual partial/error text`);
    const baseline=await snapshot(),bc=calls.buildings,tc=calls.terrain;
    roadMode='pending';const roads=region.getByRole('button',{name:'Retry Roads',exact:true});await roads.focus();await roads.press('Enter');
    await page.waitForFunction(()=>globalThis.document.querySelector('button[aria-label="Retry Roads"]')?.getAttribute('aria-busy')==='true');
    const heldRoadCalls=calls.roads;await roads.press('Enter');await roads.press('Space');assert.equal(calls.roads,heldRoadCalls);assert.equal(await roads.getAttribute('aria-disabled'),'true');
    roadMode='good';roadRelease();await settled('roads');assert.equal(calls.buildings,bc);assert.equal(calls.terrain,tc);assert.equal(await snapshot(),baseline);
    await region.getByRole('button',{name:'Retry Roads',exact:true}).waitFor({state:'detached'});
    await region.getByText('Roads 1',{exact:true}).waitFor();
    pass(`${width}px: keyboard road retry gates duplicate loading activation, recovers geometry and preserves course/settings/other requests`);
    const rc=calls.roads;buildingMode='good';await region.getByRole('button',{name:'Retry Buildings',exact:true}).click();await settled('buildings');
    assert.equal(calls.roads,rc);assert.equal(calls.terrain,tc);assert.equal(await snapshot(),baseline);
    await region.getByRole('button',{name:'Retry Buildings',exact:true}).waitFor({state:'detached'});assert.equal(await region.getByText(/area cells unavailable/).count(),0);
    pass(`${width}px: partial building retry recovers missing cells/deduplicates cached successes without resetting roads, terrain or private edits`);
    terrainMode='pending';const terrain=region.getByRole('button',{name:'Retry Terrain',exact:true});await terrain.click();
    await page.waitForFunction(()=>globalThis.document.querySelector('button[aria-label="Retry Terrain"]')?.getAttribute('aria-busy')==='true');
    const currentBuildings=calls.buildings,currentRoads=calls.roads,heldTerrain=calls.terrain;
    await terrain.press('Enter');await terrain.press('Space');assert.equal(calls.terrain,heldTerrain);
    terrainMode='good';terrainRelease();await settled('terrain');assert.equal(calls.buildings,currentBuildings);assert.equal(calls.roads,currentRoads);assert.equal(await snapshot(),baseline);
    await region.getByText('Terrain 50–50 m · Open-Meteo (Copernicus DEM)',{exact:true}).waitFor();
    assert.equal(await region.getByText('Terrain elevations unavailable or incomplete.',{exact:false}).count(),0);
    pass(`${width}px: in-scene DEM retry replaces explicit flat fallback with complete50m grid, no navigation or private-course mutation`);
    const toggle=page.getByRole('button',{name:'Terrain',exact:true});if(await toggle.getAttribute('aria-pressed')!=='true')await toggle.click();
    const slider=page.getByRole('slider',{name:'Terrain height',exact:true});await slider.press('Home');for(let i=0;i<5;i++)await slider.press('ArrowRight');assert.equal(await slider.getAttribute('aria-valuetext'),'× 1.0');assert((await slider.boundingBox()).height>=44);
    await page.getByRole('button',{name:'Plain',exact:true}).click();await region.scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,`${production?'production-':''}scene-recovery-recovered-${width}.png`)});
    assert(await page.evaluate(()=>globalThis.document.documentElement.scrollWidth<=globalThis.innerWidth));
    await page.getByRole('button',{name:'Controls',exact:true}).click();
    const event=page.waitForEvent('download');await page.getByRole('button',{name:'DXF · R2010',exact:true}).click();const file=await event;
    const saved=path.join(output,`${production?'production-':''}scene-recovered-${width}.dxf`);await file.saveAs(saved);const dxf=new DxfParser().parseSync(await fs.readFile(saved,'utf8'));
    assert.equal(dxf.header.$INSUNITS,6);const heights=dxf.entities.flatMap(e=>e.vertices.slice(0,3).map(p=>p.z));assert(heights.length>0&&heights.every(Number.isFinite));
    assert(Math.abs(Math.min(...heights)-50)<1e-3&&heights.some(z=>Math.abs(z-62)<1e-3), `expected ground50/roof62, got Z${Math.min(...heights)}..${Math.max(...heights)}; control markers may rise above roof`);
    await page.getByRole('button',{name:'Dismiss',exact:true}).click();
    pass(`${width}px: recovered live scene → actual metric DXF has50m ground/62m building roof; named44px terrain slider and narrow layout remain usable`);
  }finally{roadRelease();terrainRelease();await page.context().unroute(pattern,handler);await page.context().unroute(geocode,search);}
}
