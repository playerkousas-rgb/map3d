import { verifyModelCameraUi } from "./verify-model-camera-ui.mjs";
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import DxfParser from 'dxf-parser';

/** Synthetic Overpass responses only. Exercises the real collectors, React scenes and export buttons. */
export async function verifyBuildingHolesUi(page, { base, output, width, pass, islands = false, skillion = false, elevation = false, pyramidal = false, hipped = false, ridge = false, nodes = false }) {
  const prefix = nodes ? "hipped-nodes" : ridge ? "hipped-ridge" : hipped ? "hipped" : pyramidal ? "pyramidal" : elevation ? "elevation" : skillion ? "skillion" : islands ? "island" : "courtyard";
  const angle = hipped && !ridge && !nodes;
  const count = (skillion ? 1 : 0) + (angle ? 1 : 0) + (islands ? 2 : 1) + (skillion ? 1 : 0) + (pyramidal || hipped ? 2 : 0);
  const skipped = elevation ? 3 : 1;
  const title = nodes ? "Collinear nodes fixture" : ridge ? "Ridge direction fixture" : hipped ? "Hipped fixture" : pyramidal ? "Pyramidal fixture" : elevation ? "Elevated fixture" : skillion ? "Skillion fixture" : islands ? "Island fixture" : "Courtyard fixture";
  let fixture;
  const routePattern = /https:\/\/[^/]+\/(?:api\/interpreter|osm\/tools\/overpass\/api\/interpreter)$/;
  const handler = async route => {
    const query = decodeURIComponent(route.request().postData() ?? '');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ elements: query.includes('building') ? fixture?.elements ?? [] : [] }) });
  };
  await page.context().route(routePattern, handler);
  const makeFixture = async (area, mode) => page.evaluate(async ({ area, mode, islands, skillion, elevation, pyramidal, hipped, ridge, nodes, angle }) => {
    const projection = (await import('/src/utils/projection.ts')).createProjection(area);
    const geo = ring => ring.map(([x, z]) => { const p = projection.toLatLng(x, z); return { lat: p.lat, lon: p.lng }; });
    const outer = geo([[-30, -20], [30, -20], [30, 20], [-30, 20]]);
    const inner = geo([[-12, -8], [12, -8], [12, 8], [-12, 8]]);
    const member = (ref, role, geometry) => ({ type: 'way', ref, role, geometry });
    const tags = { building: 'yes', type: 'multipolygon', height: '15', 'roof:shape': hipped ? 'hipped' : pyramidal ? 'pyramidal' : skillion ? 'skillion' : 'gabled', 'roof:height': '3', ...(skillion ? { 'roof:direction': 'E' } : {}) };
    if (elevation) tags.min_height = "5";
    const relation = { type: 'relation', id: 9001, tags, members: [
      member(100, 'outer', [outer[0], outer[1], outer[2]]), member(101, 'outer', [outer[0], outer[3], outer[2]]),
      member(102, 'inner', [inner[0], inner[1], inner[2]]), member(103, 'inner', [inner[0], inner[3], inner[2]]),
    ] };
    const island = geo([[-6, -4], [6, -4], [6, 4], [-6, 4]]);
    const islandHole = geo([[-2, -1], [2, -1], [2, 1], [-2, 1]]);
    if (islands) relation.members.push(member(104, 'outer', [...island, island[0]]), member(105, 'inner', [...islandHole, islandHole[0]]));
    const broken = { ...relation, id: 9002, members: [member(200, 'outer', [...outer, outer[0]]), member(201, 'inner', null)] };
    const refLat = (area[0].lat + area[1].lat) / 2, refLng = (area[0].lng + area[1].lng) / 2;
    const metricArea = ring => Math.abs(ring.reduce((sum, a, i) => {
      const b = ring[(i + 1) % ring.length];
      const x = p => (p.lon - refLng) * 111320 * Math.cos(refLat * Math.PI / 180);
      const z = p => -(p.lat - refLat) * 111320;
      return sum + x(a) * z(b) - x(b) * z(a);
    }, 0)) / 2;
    const metricPoint = p => ({ x: (p.lon - refLng) * 111320 * Math.cos(refLat * Math.PI / 180), y: (p.lat - refLat) * 111320 });
    const samples = [[20, 0, true], [9, 0, false], [4, 0, islands], [0, 0, false]].map(([x, z, hit]) => ({ map: metricPoint(geo([[x, z]])[0]), ortho: { x, y: -z }, hit }));
    const fallbackRing = geo([[46, -4], [54, -4], [54, 4], [46, 4]]);
    const fallback = { type: 'way', id: 9003, tags: { building: 'yes', height: '8', 'roof:shape': 'skillion', 'roof:height': '2', 'roof:direction': 'bad' }, geometry: [...fallbackRing, fallbackRing[0]] };
    if (elevation) Object.assign(fallback.tags, { 'building:levels': '3', 'building:min_level': '2' });
    const zeroRing=geo([[-82,-4],[-74,-4],[-74,4],[-82,4]]);
    const zeroRoof={type:'way',id:9010,tags:{building:'yes',height:'24',min_height:'5','roof:shape':elevation?'gabled':'skillion','roof:levels':'0','roof:angle':'45'},geometry:[...zeroRing,zeroRing[0]]};
    const invalidVertical = elevation ? [
      { type: 'way', id: 300, tags: { building: 'yes' }, geometry: [...fallbackRing, fallbackRing[0]] },
      ...['13', 5].map((min_height, i) => ({ ...relation, id: 9004 + i, tags: { ...tags, min_height },
        members: [member(300, 'outer', [...fallbackRing, fallbackRing[0]])] })),
    ] : [];
    let pyramidRing = geo([[-54,-4],[-46,-4],[-46,4],[-54,4]]);
    if (hipped) {
      // Native longitude/latitude rectangle: do not pretend UTM/equirectangular
      // maps are identical for every rotated footprint.
      const c=geo([[-50,0]])[0],dx=6/(111320*Math.cos(c.lat*Math.PI/180)),dy=4/111320;
      pyramidRing=[{lat:c.lat-dy,lon:c.lon-dx},{lat:c.lat-dy,lon:c.lon+dx},{lat:c.lat+dy,lon:c.lon+dx},{lat:c.lat+dy,lon:c.lon-dx}];
    }
    const angleRing=pyramidRing.map(p=>({...p,lon:p.lon-26/(111320*Math.cos(p.lat*Math.PI/180))}));
    const angled={type:'way',id:9008,tags:{building:'yes',height:'30','roof:shape':'hipped','roof:angle':'30',min_height:'2'},geometry:[...angleRing,angleRing[0]]};
    const anglePlans={map:angleRing.map(metricPoint),ortho:angleRing.map(p=>{const q=projection.toScene(p.lat,p.lon);return{x:q.x,y:-q.z};})};
    const angleEaves=Object.fromEntries(Object.entries(anglePlans).map(([mode,ps])=>{
      const length=Math.hypot(ps[1].x-ps[0].x,ps[1].y-ps[0].y),width=Math.hypot(ps[2].x-ps[1].x,ps[2].y-ps[1].y);
      return[mode,30-Math.tan(Math.PI/6)*Math.hypot(Math.min(width/3,length*.4),width/2)];
    }));
    const hipCorners=pyramidRing;
    if(nodes){
      // Source interpolation on the two long sides only. Short8m sides are
      // now longer than any individual4m long-side segment: axis must come
      // from the full four-corner outline, not the longest source segment.
      pyramidRing=hipCorners.flatMap((a,i)=>{
        const b=hipCorners[(i+1)%4];return(i%2===0?[0,1/3,2/3]:[0]).map(t=>({lat:a.lat+(b.lat-a.lat)*t,lon:a.lon+(b.lon-a.lon)*t}));
      });
    }
    const pyramid = { type:'way', id:9006, tags:{building:'yes',height:'8','roof:shape':hipped?'hipped':'pyramidal','roof:height':'3'}, geometry:[...pyramidRing,pyramidRing[0]] };
    const angleOnly = { type:'way', id:9007, tags:{building:'yes',height:'8','roof:shape':hipped?'hipped':'pyramidal','roof:angle':hipped?'90':'45'}, geometry:[...fallbackRing,fallbackRing[0]] };
    const centroid = ring => {
      const ps=ring.map(metricPoint); let cross=0,x=0,y=0;
      for(let i=0;i<ps.length;i++){const a=ps[i],b=ps[(i+1)%ps.length],f=a.x*b.y-b.x*a.y;cross+=f;x+=(a.x+b.x)*f;y+=(a.y+b.y)*f;}
      return {x:x/(3*cross),y:y/(3*cross)};
    };
    const planes = [outer, ...(islands ? [island] : [])].map(ring => ({
      map: { min: Math.min(...ring.map(p => metricPoint(p).x)), max: Math.max(...ring.map(p => metricPoint(p).x)) },
      ortho: { min: ring === outer ? -30 : -6, max: ring === outer ? 30 : 6 },
    }));
    const hipPlans={map:hipCorners.map(metricPoint),ortho:hipCorners.map(p=>{const q=projection.toScene(p.lat,p.lon);return{x:q.x,y:-q.z};})};
    if (ridge) {
      // Explicit scene-grid bearing of the SHORT edge, computed from source
      // coordinates, not from product roof helpers. Each mode has its own
      // projection; do not call a UTM grid bearing geodetic true north.
      const ps=hipPlans[mode],a=ps[1],b=ps[2];
      pyramid.tags['roof:ridge:direction']=String((Math.atan2(b.x-a.x,b.y-a.y)*180/Math.PI+360)%360);
      pyramid.tags['roof:orientation']='along'; // lower priority deliberately conflicts
      angleOnly.tags['roof:height']='3';
      angleOnly.tags['roof:ridge:direction']='invalid';
    }
    const ridgeOf=ps=>{if(ridge)ps=[...ps.slice(1),ps[0]];const [a,b,c]=ps,length=Math.hypot(b.x-a.x,b.y-a.y),width=Math.hypot(c.x-b.x,c.y-b.y),offset=Math.min(width/3,length*.4),centre={x:ps.reduce((n,p)=>n+p.x,0)/4,y:ps.reduce((n,p)=>n+p.y,0)/4};return[-1,1].map(sign=>({x:centre.x+sign*(b.x-a.x)/length*(length/2-offset),y:centre.y+sign*(b.y-a.y)/length*(length/2-offset)}));};
    const hipArea=ps=>Math.abs(ps.reduce((n,a,i)=>{const b=ps[(i+1)%ps.length];return n+a.x*b.y-b.x*a.y;},0))/2;
    return { elements: [{ type: 'way', id: 100, tags: { building: 'yes' }, geometry: [...outer, outer[0]] }, ...(islands ? [{ type: 'way', id: 104, tags: { building: 'yes' }, geometry: [...island, island[0]] }] : []), ...(skillion ? [fallback,zeroRoof] : []), relation, broken, ...invalidVertical, ...(pyramidal || hipped ? [pyramid,angleOnly] : []),...(angle?[angled]:[])],
      zeroArea:{map:metricArea(zeroRing),ortho:64}, angleEaves, anglePlans, hipNodeCount:pyramidRing.length, hipBoundaries:{map:pyramidRing.map(metricPoint),ortho:pyramidRing.map(p=>{const q=projection.toScene(p.lat,p.lon);return{x:q.x,y:-q.z};})},
      hipRidges:{map:ridgeOf(hipPlans.map),ortho:ridgeOf(hipPlans.ortho)},hipAreas:{map:hipArea(hipPlans.map),ortho:hipArea(hipPlans.ortho)},
      samples, planes, pyramid: { map:centroid(pyramidRing), ortho:{x:-50,y:0} }, pyramidLimit: {map:Math.max(...pyramidRing.map(p=>metricPoint(p).x))+1,ortho:hipped?Math.max(...hipPlans.ortho.map(p=>p.x))+1:-45}, bounds: {
        map: (() => { const ps = [...outer, ...fallbackRing].map(metricPoint); return { minX: Math.min(...ps.map(p=>p.x))-1, maxX: Math.max(...ps.map(p=>p.x))+1, minY: Math.min(...ps.map(p=>p.y))-1, maxY: Math.max(...ps.map(p=>p.y))+1 }; })(),
        ortho: { minX: -31, maxX: 55, minY: -21, maxY: 21 },
      }, fallbackMapArea: metricArea(fallbackRing), mapArea: metricArea(outer) - metricArea(inner) + (islands ? metricArea(island) - metricArea(islandHole) : 0) };
  }, { area, mode, islands, skillion, elevation, pyramidal, hipped, ridge, nodes, angle });
  const select = async (mode = "map") => {
    await page.getByRole('button', { name: 'Select Box', exact: true }).click();
    const map = page.locator('.leaflet-container'); await map.scrollIntoViewIfNeeded();
    const box = await map.boundingBox();
    const draw = async () => {
      await page.mouse.move(box.x + box.width * .45, box.y + box.height * .45);
      await page.mouse.down(); await page.mouse.move(box.x + box.width * .55, box.y + box.height * .55, { steps: 8 }); await page.mouse.up();
    };
    const selection = () => page.evaluate(async () => (await import('/src/state/areaStore.ts')).useAreaStore.getState().center);
    await draw();
    let area = await selection();
    // Prior tests restore small selections at maxZoom18. Keep the 60m fixture
    // inside the selection so its CAD assertions cannot include the real border.
    if (elevation && Math.abs(area[0].lng-area[1].lng)*111320*Math.cos(area[0].lat*Math.PI/180) < 150) {
      for (let i=0; i<3; i++) await page.locator('.leaflet-control-zoom-out').click();
      await draw(); area = await selection();
    }
    fixture = await makeFixture(area, mode);
  };
  const assertDxf = async (expectedArea, label, mode) => {
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'DXF · R2010', exact: true }).click();
    const download = await downloading;
    const contents = await fs.readFile(await download.path(), 'utf8');
    await fs.writeFile(path.join(output, `cad-${prefix}-${mode}-${width}.dxf`), contents);
    const dxf = new DxfParser().parseSync(contents);
    assert.equal(dxf.header.$ACADVER, 'AC1024'); assert.equal(dxf.header.$INSUNITS, 6);
    assert(dxf.entities.length > 0 && dxf.entities.every(e => e.type === '3DFACE'));
    let roofArea = 0;
    const roofTriangles = [];
    let flatArea = 0;
    const elevatedFaces = [];
    for (const face of dxf.entities) {
      const [a, b, c] = face.vertices;
      // Separate fixture buildings spatially from the legacy printable border/base.
      const bounds = fixture.bounds[mode];
      const ground = [a,b,c].every(p => Math.abs(p.z) < 1e-5) && (b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y) > 0;
      if (elevation && !ground && [a,b,c].every(p => p.x >= bounds.minX && p.x <= bounds.maxX && p.y >= bounds.minY && p.y <= bounds.maxY)) elevatedFaces.push([a,b,c]);
      if (skillion && [a, b, c].every(p => Math.abs(p.z - 8) < 1e-4)) {
        flatArea += Math.max(0, ((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2);
      }
      if (Math.min(a.z, b.z, c.z) < 11.99 || Math.max(a.z, b.z, c.z) > 15.01) continue;
      const area = ((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
      if (area > 0) { roofArea += area; roofTriangles.push([a, b, c]); }
    }
    assert(Math.abs(roofArea - expectedArea) < .1, `${label} actual downloaded courtyard roof area ${roofArea} != ${expectedArea}`);
    if (skillion) {
      assert(Math.abs(flatArea - (mode === 'map' ? fixture.fallbackMapArea : 64)) < .1, 'missing-direction component must actually export its explicit flat fallback');
      assert(roofTriangles.every(triangle => fixture.planes.some(planes => {
        const plane = planes[mode];
        return triangle.every(p => Math.abs(p.z - (15 - 3 * (p.x - plane.min) / (plane.max - plane.min))) < 1e-4);
      })), 'each actual downloaded skillion roof triangle must follow one east-down plane, with no central gable ridge');
    }
    if (pyramidal) {
      const pyramidFaces = dxf.entities.map(e=>e.vertices.slice(0,3)).filter(face=>face.every(p=>p.x<fixture.pyramidLimit[mode]&&p.z>=4.99&&p.z<=8.01));
      assert.equal(pyramidFaces.length,4,'actual supported pyramid must have four fan faces, not flat/gabled triangulation');
      const apex=fixture.pyramid[mode];
      assert(pyramidFaces.every(face=>face.filter(p=>Math.abs(p.z-8)<1e-4&&Math.hypot(p.x-apex.x,p.y-apex.y)<.001).length===1&&face.filter(p=>Math.abs(p.z-5)<1e-4).length===2),
        'every actual pyramid face must have the area-centroid apex at8m and two eaves at5m');
      const area=pyramidFaces.reduce((sum,[a,b,c])=>sum+((b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y))/2,0);
      assert(Math.abs(area-(mode==='map'?fixture.fallbackMapArea:64))<.1,'pyramid fan covers exactly its source net area, faces point up');
      const angleArea=dxf.entities.map(e=>e.vertices.slice(0,3)).filter(face=>face.every(p=>p.x>40&&Math.abs(p.z-8)<1e-4))
        .reduce((sum,[a,b,c])=>sum+Math.max(0,((b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y))/2),0);
      assert(Math.abs(angleArea-(mode==='map'?fixture.fallbackMapArea:64))<.1,'angle-only pyramid must actually export its reported flat fallback, never an invented45degree rise');
      assert(roofTriangles.every(face=>face.every(p=>Math.abs(p.z-15)<1e-4)),'courtyard pyramid fallback must remain flat at total height with its hole retained');
      pass(`${width}px: pyramidal/${label} downloaded DXF has four centroid-to-eaves planes and real courtyard/angle flat fallbacks`);
    }
    if (hipped) {
      const hipFaces=dxf.entities.map(e=>e.vertices.slice(0,3)).filter(face=>face.every(p=>p.x<fixture.pyramidLimit[mode]&&p.z>=4.99&&p.z<=8.01));
      assert.equal(hipFaces.length,nodes?fixture.hipNodeCount+2:6,'supported rectangle must retain source boundary nodes in its four roof facets');
      if(nodes){const eaves=hipFaces.flat().filter(p=>Math.abs(p.z-5)<1e-4);assert(fixture.hipBoundaries[mode].every(p=>eaves.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<.002)),'every source collinear node survives in actual CAD eaves');}
      const expected=fixture.hipRidges[mode],peaks=hipFaces.flat().filter(p=>Math.abs(p.z-8)<1e-4);
      assert(expected.every(r=>peaks.some(p=>Math.hypot(p.x-r.x,p.y-r.y)<.002))&&peaks.every(p=>expected.some(r=>Math.hypot(p.x-r.x,p.y-r.y)<.002)),
        'actual CAD ridge must have two endpoints at source end-cap-width/3 offsets, not a centroid apex');
      const area=hipFaces.reduce((n,[a,b,c])=>n+((b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y))/2,0);
      assert(Math.abs(area-fixture.hipAreas[mode])<.1&&hipFaces.every(face=>face.every(p=>Math.abs(p.z-5)<1e-4||Math.abs(p.z-8)<1e-4)),
        'hipped CAD roof covers the actual projected rectangle at eaves5/ridge8 without bbox spill');
      const flatArea=dxf.entities.map(e=>e.vertices.slice(0,3)).filter(face=>face.every(p=>p.x>40&&Math.abs(p.z-8)<1e-4))
        .reduce((n,[a,b,c])=>n+Math.max(0,((b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y))/2),0);
      assert(Math.abs(flatArea-(mode==='map'?fixture.fallbackMapArea:64))<.1&&roofTriangles.every(face=>face.every(p=>Math.abs(p.z-15)<1e-4)),
        'invalid-angle/direction and courtyard hipped fallbacks actually stay flat and retain courtyard hole');
      pass(`${width}px: ${prefix}/${label} downloaded CAD has ${nodes?fixture.hipNodeCount+2:6} roof triangles/two source-offset ridge ends and real hole/${ridge?'invalid-ridge':'angle'} flat fallbacks`);
    }
    if(angle){
      const roofs=dxf.entities.map(e=>e.vertices.slice(0,3)).filter(([a,b,c])=>Math.min(a.z,b.z,c.z)>20&&Math.max(a.z,b.z,c.z)<=30.001&&((b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y))>1e-6);
      assert.equal(roofs.length,6,'angle-only rectangle must export six sloped roof triangles, not flat fallback');
      const eaves=fixture.angleEaves[mode];
      assert(roofs.flat().every(p=>Math.abs(p.z-30)<1e-4||Math.abs(p.z-eaves)<.001),'angle CAD must use finite-ridge corner distance, not just width/2');
      assert(fixture.anglePlans[mode].every(p=>roofs.flat().some(q=>Math.hypot(q.x-p.x,q.y-p.y)<.002&&Math.abs(q.z-eaves)<.001)),'angle roof must retain every real source corner at independently computed eaves');
      assert.equal(new Set(roofs.flat().filter(p=>Math.abs(p.z-30)<1e-4).map(p=>`${p.x.toFixed(3)},${p.y.toFixed(3)}`)).size,2);
      pass(`${width}px: angle/${label} actual metric CAD has six roofs/two ridge ends and source-derived30degree finite-segment rise`);
    }
    if(skillion){
      const roofs=dxf.entities.map(e=>e.vertices.slice(0,3)).filter(face=>face.every(p=>Math.abs(p.z-24)<1e-4)).filter(([a,b,c])=>((b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y))>1e-6);
      assert.equal(roofs.length,2,'roof:levels=0 must export two actually flat triangles, not an angle/default roof');
      const area=roofs.reduce((sum,[a,b,c])=>sum+((b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y))/2,0);
      assert(Math.abs(area-fixture.zeroArea[mode])<.1,'deliberate zero roof must retain the true source footprint area');
      pass(`${width}px: zero-level ${elevation?'gabled':'skillion'}/${label} actual CAD remains24m flat despite45degree tag, without extra fallback warning`);
    }
    if (elevation) {
      assert(elevatedFaces.length > 0 && elevatedFaces.flat().every(p => p.z >= 4 - 1e-4), 'no exported wall or bottom cap may fill the undercroft below either validated bottom');
      assert(Math.abs(Math.min(...elevatedFaces.flat().map(p => p.z)) - 4) < 1e-4, 'actual level-derived fallback bottom is (8-2)/3*2=4m, not a fixed storey guess');
      const main = elevatedFaces.filter(face => face.every(p => p.x < fixture.planes[0][mode].max + 5));
      assert(main.length && main.flat().every(p => p.z >= 5 - 1e-4) && Math.abs(Math.min(...main.flat().map(p => p.z)) - 5) < 1e-4,
        'every explicit-height courtyard face must stay at or above its own 5m underside');
      const downward = elevatedFaces.filter(([a,b,c]) => (b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y) < -1e-5);
      assert(mode === 'map' ? downward.length > 0 && downward.every(face => face.every(p => Math.abs(p.z - 4) < 1e-4 || Math.abs(p.z - 5) < 1e-4)) : !downward.length,
        'map underside caps must rise to 5/4m; merged UTM retains its documented open underside');
      const vertical = elevatedFaces.filter(([a,b,c]) => Math.abs((b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y)) < 1e-5);
      assert(vertical.some(face => Math.abs(Math.min(...face.map(p=>p.z)) - 5) < 1e-4), 'main courtyard walls must start at explicit min_height5, not the 4m neighbouring component or ground');
      pass(`${width}px: elevation/${label} downloaded DXF preserves 5m explicit / 4m level-derived bottoms, empty undercroft and original cap policy`);
    }
    for (const sample of fixture.samples) {
      const p = sample[mode];
      const hit = roofTriangles.some(triangle => triangle.every((a, i) => {
        const b = triangle[(i + 1) % 3];
        return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) >= -1e-5;
      }));
      assert.equal(hit, sample.hit, `${prefix}/${label}: CAD occupancy at ${JSON.stringify(p)} must match filled/empty ring hierarchy`);
    }
    pass(`${width}px: ${prefix}/${label} actual DXF net area, sampled occupancy and applicable slope planes match; no duplicate tagged outers`);
  };
  try {
    await page.goto(base);
    await select();
    await page.getByRole('button', { name: 'Next Step', exact: true }).click();
    await page.getByRole('button', { name: 'Next Step', exact: true }).click();
    const warning = page.getByRole('status').filter({ hasText: `${skipped} OSM building objects skipped:` });
    await warning.waitFor();
    if (hipped) await page.getByText('2 hipped building components shown flat:', { exact: false }).waitFor();
    if (pyramidal) await page.getByText('2 pyramidal building components shown flat:', { exact: false }).waitFor();
    if (skillion) await page.getByText('1 skillion building components shown flat:', { exact: false }).waitFor();
    const raw = await page.evaluate(async () => (await import('/src/state/areaStore.ts')).useAreaStore.getState().areas);
    assert.equal(raw.length, count); assert(raw.filter(b => b.tags.height === "15").every(b => b.holes.length === 1));
    assert.equal(new Set(raw.map(b => b.key)).size, count);
    await page.screenshot({ path: path.join(output, `${prefix}-map-status-${width}.png`) });
    pass(`${width}px: ${prefix}/map actual fetch preserves ${count} components with applicable holes, unique keys and visible rejection warning`);
    await page.getByRole('button', { name: 'Next Step', exact: true }).click();
    await page.locator('canvas').waitFor();
    if(prefix === "courtyard") await verifyModelCameraUi(page,{output,width,pass,mode:"map"});
    // The existing export dialog is opened through its visible button.
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await assertDxf(fixture.mapArea, 'legacy map', 'map');

    await page.goto(base);
    await page.getByRole('button', { name: '3D Orienteering', exact: true }).click();
    await page.locator('input[type=file][accept="application/json,.json"]').setInputFiles({ name: 'courtyard.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ app: 'map3d-orienteering', version: 1, exportedAt: '2026-11-03T00:00:00.000Z', course: { name: title, playMode: 'linear', controls: [] } })) });
    await page.waitForFunction(title => globalThis.document.querySelector('input[aria-label="Course name"]')?.value === title, title);
    await select('ortho');
    await page.getByRole('button', { name: 'Get 3D scene', exact: true }).click();
    await page.getByText(`${skipped} OSM building objects skipped:`, { exact: false }).waitFor();
    if (hipped) await page.getByText('2 hipped building components shown flat:', { exact: false }).waitFor();
    if (pyramidal) await page.getByText('2 pyramidal building components shown flat:', { exact: false }).waitFor();
    if (skillion) await page.getByText('1 skillion building components shown flat:', { exact: false }).waitFor();
    // Terrain is deliberately unavailable; no claim of live provider coverage.
    await page.getByRole('button', { name: 'Next Step', exact: true }).click();
    await page.locator('canvas[aria-label="3D Orienteering Course"]').waitFor();
    if (width < 900) await page.getByRole('button', { name: 'Resize course panel', exact: true }).press('End');
    await page.getByRole('button', { name: 'Scene', exact: true }).click();
    const terrain = page.getByRole('button', { name: 'Terrain', exact: true });
    if (await terrain.getAttribute('aria-pressed') === 'true') await terrain.click();
    await page.waitForFunction(async ({count, skipped}) => {
      const state = (await import('/src/state/sceneStore.ts')).useSceneStore.getState();
      return state.drawnBuildings === count && state.buildingData.length === count && state.buildingData.filter(b => b.tags.height === "15").every(b => b.holes?.length === 1) && state.buildingCells.skippedBuildings === skipped;
    }, {count, skipped});
    await page.getByRole('status').filter({ hasText: `${skipped} OSM building objects skipped:` }).waitFor();
    if (hipped) await page.getByRole('status').filter({ hasText: '2 hipped building components shown flat:' }).waitFor();
    if (pyramidal) await page.getByRole('status').filter({ hasText: '2 pyramidal building components shown flat:' }).waitFor();
    if (skillion) await page.getByRole('status').filter({ hasText: '1 skillion building components shown flat:' }).waitFor();
    pass(`${width}px: ${prefix}/orienteering actual fetch/store/merged scene draws ${count} components with applicable immediate holes and visible rejection warning`);
    if (width < 900) await page.getByRole('button', { name: 'Resize course panel', exact: true }).press('Home');
    await page.getByRole('button', { name: 'Camera controls', exact: true }).click();
    await page.getByRole('button', { name: skillion || pyramidal || hipped ? 'Tilt view' : 'Top view', exact: true }).click();
    await page.evaluate(() => new Promise(resolve => globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve))));
    await page.screenshot({ path: path.join(output, `${prefix}-ortho-${width}.png`) });
    if (width < 900) await page.getByRole('button', { name: 'Resize course panel', exact: true }).press('End');
    await page.getByRole('button', { name: 'Controls', exact: true }).click();
    await assertDxf(islands ? 2104 : 2016, 'orienteering', 'ortho');
  } finally {
    await page.context().unroute(routePattern, handler);
  }
}
