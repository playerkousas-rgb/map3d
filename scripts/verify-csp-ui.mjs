import { verifyModelCameraUi } from "./verify-model-camera-ui.mjs";
import { verifySceneRecoveryUi } from "./verify-scene-recovery-ui.mjs";
import { verifyPlaceSearchMatrix } from "./verify-place-search-matrix.mjs";
import { collectionFixture, assertMapFooter } from './verify-map-footer-ui.mjs';
/** Production-only browser gate: actual dist assets + actual hosting CSP via Vite preview.
 * External providers/analytics are synthetic, never a live-provider certification.
 */
import { preview } from 'vite';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import DxfParser from 'dxf-parser';

export async function verifyProductionCsp() {
  const port=Number(process.env.CSP_TEST_PORT??5176);
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('CSP_TEST_PORT must be an integer between1024 and65535');
  const output=path.resolve(process.env.UI_ARTIFACT_DIR??'node_modules/.cache/ui-artifacts','csp');
  await fs.mkdir(output,{recursive:true});
  await fs.access('dist/index.html'); // Caller must build first; never test a dev transform as production.
  const hosting=JSON.parse(await fs.readFile('vercel.json','utf8'));
  const expected=hosting.headers.find(r=>r.source==='/(.*)').headers.find(h=>h.key==='Content-Security-Policy').value;
  const server=await preview({preview:{host:'0.0.0.0',port,strictPort:true}}),base=`http://127.0.0.1:${port}`;
  let browser,checks=0;
  const pass=label=>{checks++;console.log(`✓ CSP ${label}`);};
  const tile=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGN4+uYpAAVwArfgOL+2AAAAAElFTkSuQmCC','base64');
  try{
    await verifyPlaceSearchMatrix({base,output,pass,production:true,expectedCsp:expected});
    for(const width of [390,768,1440]){
      browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:JSON.parse(process.env.CHROMIUM_ARGS??'[]'),headless:true});

      const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',bypassCSP:false}),page=await context.newPage();
      const errors=[],seen=new Set();let forbiddenRequests=0,terrainFallback=false;
      page.on('pageerror',error=>{errors.push(error.message);console.error('[CSP pageerror]',error.stack??error.message);});
      await context.addInitScript(()=>{
        globalThis.__cspViolations=[];
        globalThis.document.addEventListener('securitypolicyviolation',event=>globalThis.__cspViolations.push({directive:event.effectiveDirective,blocked:event.blockedURI}));
      });
      await context.route('**/*',async route=>{
        const url=new URL(route.request().url());
        if(url.hostname==='blocked.invalid'){forbiddenRequests++;return route.fulfill({status:200,contentType:'text/javascript',body:'globalThis.__unexpectedScript=true;'});}
        if(url.origin===base){
          if(url.pathname.startsWith('/_vercel/insights/'))return route.fulfill({status:200,contentType:'text/javascript',body:'/* optional analytics stub, no live telemetry */'});
          if(url.pathname==='/__csp-eval-probe.js')return route.fulfill({status:200,contentType:'text/javascript',body:'try { new Function("globalThis.__cspEvalRan=true")(); } catch(error) { globalThis.__cspEvalBlocked=error instanceof EvalError; } globalThis.__cspProbeDone=true;'});
          return route.continue();
        }
        seen.add(url.hostname);
        const headers={'access-control-allow-origin':'*'};
        if(url.hostname==='raw.githubusercontent.com')return route.fulfill({status:200,contentType:'application/geo+json',headers,body:JSON.stringify({type:'FeatureCollection',features:[{type:'Feature',properties:{name:'CSP fixture'},geometry:{type:'Polygon',coordinates:[[[114.16,22.31],[114.18,22.31],[114.18,22.33],[114.16,22.31]]]}}]})});
        if(url.hostname==='nominatim.openstreetmap.org')return route.fulfill({status:200,contentType:'application/json',headers,body:JSON.stringify([{display_name:'CSP test place',lat:'22.32',lon:'114.17',boundingbox:['22.31','22.33','114.16','114.18']},{display_name:'CSP other place',lat:'22.33',lon:'114.18'}])});
        if(url.pathname.includes('interpreter')){
          const query=decodeURIComponent(route.request().postData()??'');
          return route.fulfill({status:200,contentType:'application/json',headers,body:JSON.stringify({elements:query.includes('building')?[{type:'way',id:8123,tags:{building:'yes',height:'12','roof:shape':'pyramidal','roof:height':'3',min_height:'2'},geometry:[{lat:22.3199,lon:114.1699},{lat:22.3199,lon:114.1701},{lat:22.3201,lon:114.1701},{lat:22.3201,lon:114.1699},{lat:22.3199,lon:114.1699}]},{type:'way',id:8124,tags:{building:'yes',height:'10','roof:shape':'hipped','roof:height':'2',min_height:'2'},geometry:[{lat:22.31995,lon:114.1703},{lat:22.31995,lon:114.1705},{lat:22.32005,lon:114.1705},{lat:22.32005,lon:114.1703},{lat:22.31995,lon:114.1703}]},{type:'way',id:8125,tags:{building:'yes',height:'13','roof:shape':'hipped','roof:height':'3',min_height:'2','roof:ridge:direction':'N','roof:orientation':'along'},geometry:[{lat:22.31995,lon:114.1706},{lat:22.31995,lon:114.1708},{lat:22.32005,lon:114.1708},{lat:22.32005,lon:114.1706},{lat:22.31995,lon:114.1706}]},{type:'way',id:8126,tags:{building:'yes',height:'16','roof:shape':'hipped','roof:height':'2',min_height:'5'},geometry:[{lat:22.31995,lon:114.1709},{lat:22.31995,lon:114.17096},{lat:22.31995,lon:114.17104},{lat:22.31995,lon:114.1711},{lat:22.32005,lon:114.1711},{lat:22.32005,lon:114.17104},{lat:22.32005,lon:114.17096},{lat:22.32005,lon:114.1709},{lat:22.31995,lon:114.1709}]},{type:'way',id:8127,tags:{building:'yes',height:'30','roof:shape':'hipped','roof:angle':'30',min_height:'2'},geometry:[{lat:22.31995,lon:114.1713},{lat:22.31995,lon:114.1715},{lat:22.32005,lon:114.1715},{lat:22.32005,lon:114.1713},{lat:22.31995,lon:114.1713}]},...['gabled','skillion'].map((shape,i)=>({type:'way',id:8128+i,tags:{building:'yes',height:String(24+2*i),min_height:'5','roof:shape':shape,'roof:levels':'0','roof:angle':'45'},geometry:[{lat:22.31995,lon:114.1717+.0003*i},{lat:22.31995,lon:114.1719+.0003*i},{lat:22.32005,lon:114.1719+.0003*i},{lat:22.32005,lon:114.1717+.0003*i},{lat:22.31995,lon:114.1717+.0003*i}]}))]:[]})});
        }
        if(url.hostname==='api.open-meteo.com'){
          const count=(url.searchParams.get('latitude')??'').split(',').length;
          return route.fulfill({status:200,contentType:'application/json',headers,body:JSON.stringify({elevation:Array.from({length:count},(_,i)=>terrainFallback?null:20+i%5)})});
        }
        if(url.hostname==='api.opentopodata.org'){
          const count=(url.searchParams.get('locations')??'').split('|').length;
          return route.fulfill({status:200,contentType:'application/json',headers,body:JSON.stringify({status:'OK',results:Array.from({length:count},()=>({elevation:50}))})});
        }
        if(url.pathname.endsWith('.png')||url.hostname==='gibs.earthdata.nasa.gov')return route.fulfill({status:200,contentType:'image/png',headers,body:tile});
        return route.abort();
      });
      const response=await page.goto(base);
      assert.equal(response.headers()['content-security-policy'],expected);
      const denied=await context.request.get(base,{headers:{host:'attacker.invalid'}});assert.equal(denied.status(),403);
      const arena=await context.request.get(base,{headers:{host:'map3d-smoke.e2b.app'}});assert(arena.ok());assert.equal(arena.headers()['content-security-policy'],expected);
      await page.getByRole('heading',{name:'Generate 3D Map',level:1}).waitFor();
      assert.equal(await page.locator('canvas').count(),0);
      pass(`${width}px: built entry/chunks load under exact enforced hosting header, no dev server/preamble`);
      await page.getByRole('searchbox',{name:'Search',exact:true}).fill('CSP place');
      await page.getByRole('searchbox',{name:'Search',exact:true}).press('Enter');
      await page.getByRole('button',{name:'CSP test place',exact:true}).click();
      assert(seen.has('nominatim.openstreetmap.org'));
      pass(`${width}px: actual geocoder form/fetch remains browser-direct under form-action and connect-src`);
      await page.locator('.gis-controls summary').click();
      await page.getByRole('checkbox',{name:'Natural Earth · countries',exact:true}).check();
      await page.waitForFunction(()=>globalThis.document.querySelectorAll('.leaflet-overlay-pane path').length>0);
      await page.getByRole('radio',{name:'NASA MODIS · 2013-11-04',exact:true}).check();
      await page.waitForFunction(()=>[...globalThis.document.querySelectorAll('.gis-source')].some(el=>el.textContent.includes('NASA MODIS')&&el.textContent.includes('Loaded')));
      assert(seen.has('raw.githubusercontent.com')&&seen.has('gibs.earthdata.nasa.gov'));
      pass(`${width}px: direct GeoJSON and historical WMS image succeed with real Leaflet/Emotion styling`);
      await page.screenshot({path:path.join(output,`production-gis-${width}.png`)});
      const local=page.locator('.gis-local'),localInput=local.getByLabel('Import GeoJSON',{exact:true});
      const localPaths=page.locator('.leaflet-overlay-pane path[stroke="#9b2da8"]');
      await localInput.setInputFiles({name:'csp-collection.geojson',mimeType:'application/geo+json',buffer:Buffer.from(JSON.stringify(collectionFixture))});
      await local.getByRole('status').filter({hasText:'csp-collection.geojson'}).waitFor();
      assert.equal(await localPaths.count(),5);
      assert(await localPaths.evaluateAll(nodes=>nodes.some(el=>(el.getAttribute('d')?.match(/M/g)??[]).length===2&&el.getAttribute('fill-rule')==='evenodd')));
      await local.getByRole('button',{name:'Zoom to local layer',exact:true}).click();
      const badCollection=structuredClone(collectionFixture);badCollection.features[0].geometry.geometries[0].coordinates=[999,22];
      await localInput.setInputFiles({name:'bad-collection.geojson',mimeType:'application/geo+json',buffer:Buffer.from(JSON.stringify(badCollection))});
      await local.getByRole('alert').waitFor();assert.equal(await localPaths.count(),5);
      pass(`${width}px: native mixed/nested local collection preserves holes/fit and rejects malformed replacement under CSP`);
      await assertMapFooter(page);
      await page.screenshot({path:path.join(output,`production-map-footer-${width}.png`)});
      pass(`${width}px: real metric scale above multiline credits, source links hit-test and normal-flow guidance under exact CSP`);
      // Isolate the deliberately wide collection fit from the following legacy selection.
      const restore={type:'FeatureCollection',features:[{type:'Feature',properties:null,geometry:{type:'LineString',coordinates:[[114.16,22.31],[114.18,22.33]]}}]};
      await localInput.setInputFiles({name:'restore-view.geojson',mimeType:'application/geo+json',buffer:Buffer.from(JSON.stringify(restore))});
      await local.getByRole('status').filter({hasText:'restore-view.geojson'}).waitFor();
      await local.getByRole('button',{name:'Zoom to local layer',exact:true}).click();
      await local.getByRole('button',{name:'Remove local layer',exact:true}).click();assert.equal(await localPaths.count(),0);
      assert(!(await page.locator('.leaflet-control-attribution').innerText()).includes('Local GeoJSON'));
      await page.getByRole('button',{name:'Select Box',exact:true}).click();
      const legacyMap=page.locator('.leaflet-container');await legacyMap.scrollIntoViewIfNeeded();const legacyBox=await legacyMap.boundingBox();
      await page.mouse.move(legacyBox.x+legacyBox.width*.4,legacyBox.y+legacyBox.height*.4);await page.mouse.down();await page.mouse.move(legacyBox.x+legacyBox.width*.6,legacyBox.y+legacyBox.height*.6,{steps:8});await page.mouse.up();
      await page.getByRole('button',{name:'Next Step',exact:true}).click();
      await page.getByRole('button',{name:'Next Step',exact:true}).click();
      await page.getByText('Buildings loaded:',{exact:false}).waitFor();
      await page.getByRole('button',{name:'Next Step',exact:true}).click();
      await page.locator('canvas').waitFor();
      await verifyModelCameraUi(page,{output,width,pass,mode:"map"});
      await page.getByRole('button',{name:'Export',exact:true}).click();
      const legacyEvent=page.waitForEvent('download');await page.getByRole('button',{name:'DXF · R2010',exact:true}).click();
      const legacyText=await fs.readFile(await(await legacyEvent).path(),'utf8');
      await fs.writeFile(path.join(output,`cad-native-legacy-${width}.dxf`),legacyText);
      const legacyCad=new DxfParser().parseSync(legacyText);
      assert.equal(legacyCad.header.$INSUNITS,6);assert(legacyCad.entities.some(e=>e.vertices.slice(0,3).some(p=>Math.abs(p.z-12)<1e-4)));
      const hipFaces=legacyCad.entities.map(e=>e.vertices.slice(0,3)).filter(v=>v.every(p=>p.z>=7.99&&p.z<=10.01)&&((v[1].x-v[0].x)*(v[2].y-v[0].y)-(v[2].x-v[0].x)*(v[1].y-v[0].y))>1e-6);
      assert.equal(hipFaces.length,6);assert.equal(new Set(hipFaces.flat().filter(p=>Math.abs(p.z-10)<1e-4).map(p=>`${p.x.toFixed(3)},${p.y.toFixed(3)}`)).size,2);
      const directedFaces=legacyCad.entities.map(e=>e.vertices.slice(0,3)).filter(v=>v.every(p=>p.z>=9.99&&p.z<=13.01)&&((v[1].x-v[0].x)*(v[2].y-v[0].y)-(v[2].x-v[0].x)*(v[1].y-v[0].y))>1e-6);
      const directedPeaks=[...new Map(directedFaces.flat().filter(p=>Math.abs(p.z-13)<1e-4).map(p=>[`${p.x.toFixed(3)},${p.y.toFixed(3)}`,p])).values()];
      assert.equal(directedFaces.length,6);assert.equal(directedPeaks.length,2);
      assert(Math.abs(directedPeaks[0].x-directedPeaks[1].x)<1e-3);
      assert(Math.abs(Math.abs(directedPeaks[0].y-directedPeaks[1].y)-2.2264)<1e-3,'ridge N must override along on the short north-south axis, not silently use the default east-west roof');
      const nodeFaces=legacyCad.entities.map(e=>e.vertices.slice(0,3)).filter(v=>v.every(p=>p.z>=13.99&&p.z<=16.01)&&((v[1].x-v[0].x)*(v[2].y-v[0].y)-(v[2].x-v[0].x)*(v[1].y-v[0].y))>1e-6);
      const nodePeaks=[...new Map(nodeFaces.flat().filter(p=>Math.abs(p.z-16)<1e-4).map(p=>[`${p.x.toFixed(3)},${p.y.toFixed(3)}`,p])).values()];
      assert.equal(nodeFaces.length,10);assert.equal(nodePeaks.length,2);
      assert(Math.abs(nodePeaks[0].y-nodePeaks[1].y)<1e-3&&Math.abs(nodePeaks[0].x-nodePeaks[1].x)>10,'split long sides must not change default roof to short north-south axis');
      assert.equal(new Set(nodeFaces.flat().filter(p=>Math.abs(p.z-14)<1e-4).map(p=>`${p.x.toFixed(3)},${p.y.toFixed(3)}`)).size,8);
      const angleRoofs=legacyCad.entities.map(e=>e.vertices.slice(0,3)).filter(([a,b,c])=>Math.min(a.z,b.z,c.z)>20&&Math.max(a.z,b.z,c.z)<=30.001&&[a,b,c].some(p=>Math.abs(p.z-30)<1e-4)&&((b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y))>1e-6);
      assert.equal(angleRoofs.length,6);
      const anglePeaks=angleRoofs.flat().filter(p=>Math.abs(p.z-30)<1e-4),angleEaves=angleRoofs.flat().filter(p=>Math.abs(p.z-30)>=1e-4);
      assert.equal(new Set(anglePeaks.map(p=>`${p.x.toFixed(3)},${p.y.toFixed(3)}`)).size,2);
      assert.equal(new Set(angleEaves.map(p=>`${p.x.toFixed(3)},${p.y.toFixed(3)}`)).size,4);
      const length=Math.max(...angleEaves.map(p=>p.x))-Math.min(...angleEaves.map(p=>p.x)),span=Math.max(...angleEaves.map(p=>p.y))-Math.min(...angleEaves.map(p=>p.y));
      const expectedAngleEaves=30-Math.tan(Math.PI/6)*Math.hypot(Math.min(span/3,length*.4),span/2);
      assert(angleEaves.every(p=>Math.abs(p.z-expectedAngleEaves)<.001));
      assert(Math.abs(span-11.132)<.001&&Math.abs(length-2*.0001*111320*Math.cos(22.32*Math.PI/180))<.01,'angle source footprint remains in true metres');
      for(const height of [24,26]){
        const flatRoofs=legacyCad.entities.map(e=>e.vertices.slice(0,3)).filter(face=>face.every(p=>Math.abs(p.z-height)<1e-4)).filter(([a,b,c])=>((b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y))>1e-6);
        assert.equal(flatRoofs.length,2,`zero-level roof at${height}m must stay flat despite45degree tag`);
        const area=flatRoofs.reduce((sum,[a,b,c])=>sum+((b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y))/2,0);
        assert(Math.abs(area-(.0002*111320*Math.cos(22.32*Math.PI/180))*(.0001*111320))<.1);
      }
      pass(`${width}px: native zero-level gabled/skillion roofs export two flat24/26m faces each, no invented angle/default rise under exact CSP`);
      pass(`${width}px: native angle-only hipped roof exports30degree finite-ridge rise/six faces under exact production CSP`);
      pass(`${width}px: native hipped collinear-node CAD retains eight eaves vertices/ten roofs and whole-side default axis under CSP`);
      pass(`${width}px: native hipped ridge-direction N overrides along in actual metric CAD under unchanged CSP`);
      pass(`${width}px: native hipped Overpass → WebGL → metric CAD has six roof triangles/two ridge ends under unchanged CSP`);
      pass(`${width}px: actual legacy map → Overpass → pyramidal/raised building → metric DXF under enforced CSP`);
      await page.goto(base);
      await page.getByRole('button',{name:'GPX → 3D Print Model',exact:true}).click();
      await page.locator('input[type=file][accept*=gpx]').setInputFiles({name:'csp.gpx',mimeType:'application/gpx+xml',buffer:Buffer.from('<gpx version="1.1"><trk><name>CSP track</name><trkseg><trkpt lat="22.30" lon="114.16"><ele>20</ele></trkpt><trkpt lat="22.301" lon="114.161"><ele>40</ele></trkpt><trkpt lat="22.302" lon="114.162"><ele>25</ele></trkpt></trkseg></trk></gpx>')});
      await page.locator('canvas').waitFor();
      await verifyModelCameraUi(page,{output,width,pass,mode:"gpx"});
      for(const format of ['DXF · R2010','GLB','STL']){
        await page.getByRole('button',{name:'Export',exact:true}).click();
        const event=page.waitForEvent('download');await page.getByRole('button',{name:format,exact:true}).click();
        const download=await event,buffer=await fs.readFile(await download.path());
        if(format.startsWith('DXF')){
          const dxf=new DxfParser().parseSync(buffer.toString('utf8'));assert.equal(dxf.header.$ACADVER,'AC1024');assert.equal(dxf.header.$INSUNITS,6);assert(dxf.entities.length>0);
        }else if(format==='GLB'){assert.equal(buffer.readUInt32LE(0),0x46546c67);assert.equal(buffer.readUInt32LE(8),buffer.length);}
        else assert.equal(buffer.length,84+buffer.readUInt32LE(80)*50);
        await page.getByRole('button',{name:'Dismiss',exact:true}).click();
      }
      const gpxHelp=page.locator('#gpx-scene-help');
      await gpxHelp.scrollIntoViewIfNeeded();
      assert(await gpxHelp.evaluate(el=>{const panel=el.closest('[data-gpx-panel]'),r=el.getBoundingClientRect(),p=panel.getBoundingClientRect();return r.top>=p.top&&r.bottom<=p.bottom&&globalThis.getComputedStyle(el).position==='static';}));
      assert.equal(await page.getByRole('region',{name:'Model Settings',exact:true}).getByRole('slider').count(),3);
      pass(`${width}px: native GPX → WebGL → DXF/GLB/STL Blob downloads and in-flow settings help work without unsafe-eval or blob scripts`);
      await page.screenshot({path:path.join(output,`production-gpx-${width}.png`)});
      await page.getByRole('button',{name:'Back',exact:true}).click();
      await page.locator('input[type=file][accept*=gpx]').setInputFiles({name:'partial.gpx',mimeType:'application/gpx+xml',buffer:Buffer.from('<gpx version="1.1"><trk><name>CSP partial elevations</name><trkseg><trkpt lat="22.30" lon="114.16"><ele>200</ele></trkpt><trkpt lat="22.301" lon="114.161"/></trkseg></trk></gpx>')});
      await page.getByText(/Some points have no elevation/).waitFor();
      const flatEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Export STL (3D Print)',exact:true}).click();
      const flatBuffer=await fs.readFile(await(await flatEvent).path());
      assert.equal(flatBuffer.length,84+flatBuffer.readUInt32LE(80)*50);let flatMax=-Infinity;
      for(let i=0;i<flatBuffer.readUInt32LE(80);i++)for(let v=0;v<3;v++)flatMax=Math.max(flatMax,flatBuffer.readFloatLE(84+i*50+12+v*12+4));
      assert(Math.abs(flatMax-9)<1e-4);
      await page.getByRole('button',{name:'Dismiss',exact:true}).click();
      await page.getByText(/Some points have no elevation/).scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(output,`production-gpx-partial-${width}.png`)});
      pass(`${width}px: native partial-elevation GPX → explicit flat fallback → actual 9mm-max STL works under unchanged production CSP`);
      await page.goto(base);
      await page.getByRole('button',{name:'3D Orienteering',exact:true}).click();
      terrainFallback=true; // Native built terrain flow, unlike the earlier valid GPX request.
      const course={app:'map3d-orienteering',version:1,exportedAt:'2026-11-03T00:00:00.000Z',course:{name:'CSP course',playMode:'linear',controls:[{id:'start',kind:'start',lat:22.32,lng:114.17,code:'S',name:'Start',clue:'',note:'PRIVATE_CSP_NOTE',score:0}]}};
      await page.locator('input[type=file][accept="application/json,.json"]').setInputFiles({name:'csp.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(course))});
      await page.getByRole('textbox',{name:'Course name',exact:true}).waitFor();
      await page.getByRole('button',{name:'Select Box',exact:true}).click();
      const map=page.locator('.leaflet-container');await map.scrollIntoViewIfNeeded();const box=await map.boundingBox();
      await page.mouse.move(box.x+box.width*.4,box.y+box.height*.4);await page.mouse.down();await page.mouse.move(box.x+box.width*.6,box.y+box.height*.6,{steps:8});await page.mouse.up();
      await page.getByRole('button',{name:'Get 3D scene',exact:true}).click();
      await page.getByRole('button',{name:'Next Step',exact:true}).click();
      await page.locator('canvas[aria-label="3D Orienteering Course"]').waitFor();
      if(width<900)await page.getByRole('button',{name:'Resize course panel',exact:true}).press('End');
      assert(seen.has('overpass-api.de')&&seen.has('api.open-meteo.com')&&seen.has('api.opentopodata.org'));
      const cadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'DXF · R2010',exact:true}).click();
      const cad=new DxfParser().parseSync(await fs.readFile(await(await cadEvent).path(),'utf8'));
      assert.equal(cad.header.$INSUNITS,6);assert(cad.entities.length>0&&cad.entities.some(e=>e.vertices.slice(0,3).some(p=>p.z>20)));
      await page.getByRole('button',{name:'Dismiss',exact:true}).click();
      pass(`${width}px: actual Overpass/elevation → terrain/course scene → CAD works under production CSP`);
      await page.getByRole('button',{name:'Scene',exact:true}).click();
      await page.getByText('Terrain 50–50 m · OpenTopoData (SRTM)',{exact:true}).waitFor();
      await page.screenshot({path:path.join(output,`production-terrain-fallback-${width}.png`)});
      pass(`${width}px: native built null-primary → complete backup DEM/source/range succeeds under unchanged CSP, no dev imports`);
      await page.getByRole('button',{name:'Controls',exact:true}).click();
      await context.grantPermissions(['clipboard-read','clipboard-write']);
      await page.getByRole('button',{name:'Share with players',exact:true}).click();
      await page.getByText('Link copied — send it to the players.',{exact:true}).waitFor();
      const share=await page.evaluate(()=>globalThis.navigator.clipboard.readText());assert(new URL(share).hash.startsWith('#play='));
      await page.goto(share);await page.getByText('Player view · read only',{exact:true}).waitFor();
      // The read-only panel can mount before the lazy WebGL chunk. Do not
      // capture a white Suspense frame as production player-scene evidence.
      await page.locator('canvas[aria-label="3D Orienteering Course"]').waitFor();
      await page.evaluate(()=>new Promise(resolve=>globalThis.requestAnimationFrame(()=>globalThis.requestAnimationFrame(resolve))));
      assert.equal(await page.getByRole('textbox',{name:'Course name',exact:true}).count(),0);
      assert((await page.evaluate(()=>globalThis.localStorage.getItem('map3d.orienteering.v1'))).includes('PRIVATE_CSP_NOTE'));
      pass(`${width}px: native clipboard/player fragment navigation works, private draft remains local`);
      await page.screenshot({path:path.join(output,`production-player-${width}.png`)});
      assert.deepEqual(await page.evaluate(()=>globalThis.__cspViolations),[]);
      await verifySceneRecoveryUi(page,{base,output,width,pass,production:true});
      assert.deepEqual(await page.evaluate(()=>globalThis.__cspViolations),[]);
      assert.deepEqual(errors,[]);
      pass(`${width}px: positive production flows emit zero CSP violations and uncaught pageerrors`);
      // Separate explicit attack phase. Use a real allowed same-origin external
      // probe for eval: DevTools evaluation alone can bypass CSP eval checks.
      await page.evaluate(()=>{
        const inline=globalThis.document.createElement('script');inline.textContent='globalThis.__cspInlineRan=true';globalThis.document.head.append(inline);
        const handler=globalThis.document.createElement('button');handler.setAttribute('onclick','globalThis.__cspHandlerRan=true');globalThis.document.body.append(handler);handler.click();
        const remote=globalThis.document.createElement('script');remote.src='https://blocked.invalid/csp.js';globalThis.document.head.append(remote);
        const base=globalThis.document.createElement('base');base.href='https://blocked.invalid/';globalThis.document.head.append(base);
        const probe=globalThis.document.createElement('script');probe.src=new URL('/__csp-eval-probe.js',globalThis.location.href).href;globalThis.document.head.append(probe);
      });
      await page.waitForFunction(()=>globalThis.__cspProbeDone===true);
      await page.evaluate(()=>fetch('https://blocked.invalid/collect').catch(()=>null));
      await page.waitForFunction(()=>globalThis.__cspViolations.some(v=>v.directive==='connect-src')&&globalThis.__cspViolations.some(v=>v.blocked==='eval'));
      const attacks=await page.evaluate(()=>({inline:globalThis.__cspInlineRan,handler:globalThis.__cspHandlerRan,eval:globalThis.__cspEvalRan,evalBlocked:globalThis.__cspEvalBlocked,remote:globalThis.__unexpectedScript,base:globalThis.document.baseURI,violations:globalThis.__cspViolations}));
      assert(!attacks.inline&&!attacks.handler&&!attacks.eval&&!attacks.remote&&attacks.evalBlocked&&attacks.base===page.url());
      assert(attacks.violations.some(v=>v.blocked==='inline')&&attacks.violations.some(v=>v.directive==='script-src-attr')&&attacks.violations.some(v=>v.directive==='base-uri')&&attacks.violations.some(v=>v.directive==='script-src-elem'&&v.blocked==='https://blocked.invalid/csp.js'));
      assert.equal(forbiddenRequests,0);assert.deepEqual(errors,[]);
      pass(`${width}px: native inline/remote/eval/base injection and unlisted fetch blocked before network/execution`);
      await context.close();
      await browser.close();browser=undefined;
    }
    console.log(`\n${checks} production-CSP browser checks passed. Mocked-network screenshots: ${output}`);
  }finally{await browser?.close();await server.close();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await verifyProductionCsp();
