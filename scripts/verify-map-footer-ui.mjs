/** Real Leaflet/native picker regression. External provider responses are mocked by caller. */
import assert from 'node:assert/strict';
import path from 'node:path';

export const collectionFixture={type:'FeatureCollection',features:[{type:'Feature',properties:{name:'<img src=x onerror=alert(1)>',marker:'COLLECTION_NEVER_UPLOAD'},geometry:{type:'GeometryCollection',geometries:[
  {type:'Point',coordinates:[114.13,22.29]},
  {type:'LineString',coordinates:[[114.14,22.30],[114.20,22.34]]},
  {type:'GeometryCollection',geometries:[
    {type:'Polygon',coordinates:[[[114.16,22.31],[114.18,22.31],[114.18,22.33],[114.16,22.33],[114.16,22.31]],[[114.165,22.315],[114.175,22.315],[114.175,22.325],[114.165,22.325],[114.165,22.315]]]},
    {type:'MultiPoint',coordinates:[[114.21,22.35],[114.19,22.34]]},
  ]},
]}}]};
const frames=page=>page.evaluate(()=>new Promise(resolve=>globalThis.requestAnimationFrame(()=>globalThis.requestAnimationFrame(resolve))));

/** Scroll the footer into the unobscured viewport, then test its actual DOM.
 * No style injection, private Leaflet access or fabricated layout budgets.
 */
export async function assertMapFooter(page) {
  const hint=page.locator('[data-selection-hint]');
  await frames(page);await hint.evaluate(el=>el.scrollIntoView({block:'center'}));await frames(page);
  await hint.evaluate(el=>{
    const scale=el.parentElement.querySelector('.leaflet-control-scale');
    const top=globalThis.document.querySelector('[data-topnav]')?.getBoundingClientRect().bottom??0;
    const nav=[...globalThis.document.querySelectorAll('button')].find(b=>b.getClientRects().length>0&&(b.textContent.trim()==='Next Step'||b.textContent.trim()==='下一步'));
    const bottom=nav?Math.min(globalThis.innerHeight,nav.getBoundingClientRect().top):globalThis.innerHeight;
    const delta=(scale.getBoundingClientRect().top+el.getBoundingClientRect().bottom)/2-(top+bottom)/2;
    let parent=el.parentElement;
    while(parent&& !/(auto|scroll)/.test(globalThis.getComputedStyle(parent).overflowY))parent=parent.parentElement;
    if(parent)parent.scrollTop+=delta;
  });
  await frames(page);
  const r=await hint.evaluate(el=>{
    const map=el.parentElement.querySelector('.leaflet-container'),credit=map.querySelector('.leaflet-control-attribution'),scale=map.querySelector('.leaflet-control-scale');
    const h=el.getBoundingClientRect(),m=map.getBoundingClientRect(),a=credit.getBoundingClientRect(),s=scale.getBoundingClientRect();
    const inside=rect=>rect.left>=m.left-1&&rect.right<=m.right+1&&rect.top>=m.top-1&&rect.bottom<=m.bottom+1;
    const linkHits=[...credit.querySelectorAll('a')].flatMap(link=>[...link.getClientRects()].filter(rect=>rect.width&&rect.height).map(rect=>link.contains(globalThis.document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2))));
    const scaleHit=scale.contains(globalThis.document.elementFromPoint(s.x+s.width/2,s.y+s.height/2));
    const button=el.parentElement.querySelector('button[aria-describedby]');
    return {rects:{scale:{top:s.top,bottom:s.bottom},credit:{top:a.top,bottom:a.bottom},hint:{top:h.top,bottom:h.bottom}},scaleTarget:globalThis.document.elementFromPoint(s.x+s.width/2,s.y+s.height/2)?.outerHTML.slice(0,250),sameCorner:scale.parentElement===credit.parentElement,scaleAbove:s.bottom<=a.top-4,
      scaleInside:inside(s),creditInside:inside(a),gap:a.top-s.bottom,scaleHit,
      creditLinks:linkHits.length>0&&linkHits.every(Boolean),guideGap:h.top-m.bottom,
      flow:globalThis.getComputedStyle(el).position==='static',described:!!el.id&&button?.getAttribute('aria-describedby')===el.id,
      noOverflow:globalThis.document.documentElement.scrollWidth<=globalThis.innerWidth,
      text:scale.textContent,creditHeight:a.height};
  });
  assert(r.sameCorner&&r.scaleAbove,'native scale must stack above attribution in the same corner: '+JSON.stringify(r));
  assert(r.scaleInside&&r.creditInside,'both complete native controls remain inside map: '+JSON.stringify(r));
  assert(r.scaleHit&&r.creditLinks,'scale and each source-link line must be unobscured: '+JSON.stringify(r));
  assert(r.flow&&r.guideGap>=7&&r.described&&r.noOverflow,'guidance stays in normal flow below map, described and without overflow: '+JSON.stringify(r));
  assert(/\d.*(?:m|km)/.test(r.text),'native scale retains a metric value');
  return r;
}

export async function verifyMapFooterUi(page,{output,width,pass}) {
  const local=page.locator('.gis-local'),input=local.getByLabel('Import GeoJSON',{exact:true});
  const paths=page.locator('.leaflet-overlay-pane path[stroke="#9b2da8"]'),hint=page.locator('[data-selection-hint]');
  const initialViewport=page.viewportSize();
  const previousBase=await page.getByRole('radio',{checked:true}).locator('..').innerText();
  const countries=page.getByRole('checkbox',{name:'Natural Earth · countries',exact:true}),previousCountries=await countries.isChecked();
  const upload=async(data,name)=>{await input.setInputFiles({name,mimeType:'application/geo+json',buffer:Buffer.from(JSON.stringify(data))});await local.getByRole('status').filter({hasText:name}).waitFor();};
  const line=coordinates=>({type:'FeatureCollection',features:[{type:'Feature',properties:null,geometry:{type:'LineString',coordinates}}]});
  let uploaded=false;const observe=request=>{if(request.method()!=='GET'&&request.postData()?.includes('COLLECTION_NEVER_UPLOAD'))uploaded=true;};page.on('request',observe);
  try {
    const before=await page.locator('.leaflet-map-pane').getAttribute('style');
    await upload(collectionFixture,'mixed-collection.geojson');
    assert.equal(await paths.count(),5);assert.equal(await page.locator('.leaflet-map-pane').getAttribute('style'),before);
    assert(await paths.evaluateAll(nodes=>nodes.some(el=>(el.getAttribute('d')?.match(/M/g)??[]).length===2&&el.getAttribute('fill-rule')==='evenodd')));
    assert.equal(await page.locator('.leaflet-popup, canvas').count(),0);assert.equal(await local.locator('img').count(),0);
    pass(`${width}px: restored mixed/nested collection renders five children and a polygon hole, no property HTML/hidden3D or automatic fit`);

    const bad=structuredClone(collectionFixture);bad.features[0].geometry.geometries[0].coordinates=[999,22];
    const deep={type:'FeatureCollection',features:[{type:'Feature',properties:null,geometry:Array.from({length:9}).reduce(g=>({type:'GeometryCollection',geometries:[g]}),{type:'Point',coordinates:[114,22]})}]};
    const empty={type:'FeatureCollection',features:[{type:'Feature',properties:null,geometry:{type:'GeometryCollection',geometries:[]}}]};
    for(const [i,data] of [bad,deep,empty].entries()){
      await upload(collectionFixture,`retained-${i}.geojson`);assert.equal(await local.getByRole('alert').count(),0);
      await input.setInputFiles({name:`bad-${i}.geojson`,mimeType:'application/geo+json',buffer:Buffer.from(JSON.stringify(data))});
      await local.getByRole('alert').waitFor();assert.equal(await paths.count(),5);assert((await local.getByRole('status').innerText()).includes(`retained-${i}.geojson`));
    }
    pass(`${width}px: malformed nested, depth9 and empty-only replacements reject atomically with fresh alerts`);

    await local.getByRole('button',{name:'Zoom to local layer',exact:true}).click();
    const map=page.locator('.leaflet-container');await map.scrollIntoViewIfNeeded();const m=await map.boundingBox();
    for(const node of await paths.all()){const r=await node.boundingBox();assert(r&&r.x>=m.x-2&&r.y>=m.y-2&&r.x+r.width<=m.x+m.width+2&&r.y+r.height<=m.y+m.height+2);}
    pass(`${width}px: native fit includes every nested child extent`);

    await page.getByRole('radio',{name:'OpenStreetMap',exact:true}).check();
    const first=await assertMapFooter(page);if(width===390)assert(first.creditHeight>25,'real local attribution wraps on phone');
    await page.screenshot({path:path.join(output,`map-footer-local-${width}.png`)});
    pass(`${width}px: real metric scale stacks above multiline OSM/local credit, all source links hit-test and guidance stays below map`);

    const originalScale=await page.locator('.leaflet-control-scale').innerText();
    await page.getByRole('button',{name:'Zoom in',exact:true}).click();
    await page.waitForFunction(text=>globalThis.document.querySelector('.leaflet-control-scale')?.textContent!==text,originalScale);
    await page.getByRole('button',{name:'Zoom out',exact:true}).click();await assertMapFooter(page);
    pass(`${width}px: native zoom updates metric scale without recreating controls or covering credits`);

    await countries.check();
    await page.waitForFunction(()=>[...globalThis.document.querySelectorAll('.gis-source')].some(el=>el.textContent.includes('Natural Earth · countries')&&el.textContent.includes('Loaded')));
    await page.getByRole('radio',{name:'NASA MODIS · 2013-11-04',exact:true}).check();
    await page.waitForFunction(()=>[...globalThis.document.querySelectorAll('.gis-source')].some(el=>el.textContent.includes('NASA MODIS')&&el.textContent.includes('Loaded')));
    await assertMapFooter(page);const credit=await page.locator('.leaflet-control-attribution').innerText();assert(credit.includes('NASA')&&credit.includes('Natural Earth')&&credit.includes('Local GeoJSON'));
    await page.screenshot({path:path.join(output,`map-footer-sources-${width}.png`)});
    pass(`${width}px: live Leaflet attribution lifecycle stacks NASA/remote/local credits without truncating text or measured offsets`);

    await page.locator('[data-topnav] button').click();assert((await hint.innerText()).includes('框選區域'));await assertMapFooter(page);
    await page.setViewportSize({width,height:320});await assertMapFooter(page);
    await page.screenshot({path:path.join(output,`map-footer-short-zh-${width}.png`)});
    await page.setViewportSize(initialViewport);await page.locator('[data-topnav] button').click();
    pass(`${width}px: Chinese help and actual320px-height resize retain both complete controls and hit-testable source links`);

    await upload(line([[114.17,22.32],[114.172,22.322]]),'small-view.geojson');
    await local.getByRole('button',{name:'Zoom to local layer',exact:true}).click();
    await page.getByRole('button',{name:'Select Box',exact:true}).click();
    await map.scrollIntoViewIfNeeded();const b=await map.boundingBox();
    await page.mouse.move(b.x+b.width*.4,b.y+b.height*.4);await page.mouse.down();await page.mouse.move(b.x+b.width*.6,b.y+b.height*.6,{steps:8});await page.mouse.up();
    assert((await hint.innerText()).includes('Area selected'));await assertMapFooter(page);
    await page.screenshot({path:path.join(output,`map-footer-selected-${width}.png`)});
    await page.getByRole('button',{name:'Remove Box',exact:true}).click();
    pass(`${width}px: native drawing/measurement and removal preserve footer layout and linked selection guidance`);

    await upload(collectionFixture,'replacement-collection.geojson');assert.equal(await paths.count(),5);
    await local.getByRole('button',{name:'Remove local layer',exact:true}).click();assert.equal(await paths.count(),0);
    assert(!(await page.locator('.leaflet-control-attribution').innerText()).includes('Local GeoJSON'));assert(!uploaded);await assertMapFooter(page);
    pass(`${width}px: collection replacement/removal clears all children and attribution without uploading the file`);

    await countries.setChecked(previousCountries);await page.getByRole('radio',{name:previousBase.trim(),exact:true}).check();
    // Restore view through real UI so a wide collection fit cannot pollute later area tests.
    await upload(line([[114.16,22.31],[114.18,22.33]]),'restore-footer-view.geojson');
    await local.getByRole('button',{name:'Zoom to local layer',exact:true}).click();await local.getByRole('button',{name:'Remove local layer',exact:true}).click();
    await assertMapFooter(page);assert.equal(await page.locator('.leaflet-control-scale').count(),1);assert.equal(await page.locator('.leaflet-control-attribution').count(),1);
    pass(`${width}px: source choices/view restored, exactly one scale/attribution after all native lifecycle changes`);
  } finally {page.off('request',observe);}
}
