import { validateGeoJson, geoJsonBounds, readLocalGeoJson, fetchSourceGeoJson, GIS_LIMITS } from '../src/utils/gis';
import { getDataSource } from '../src/config/dataSources';

export async function verifyGeoJsonCollections(ok: (condition: boolean, label: string) => void) {
  const point = { type: 'Point', coordinates: [114.1, 22.1] };
  const ring = [[114,22],[115,22],[115,23],[114,22]];
  const geometries = [point, {type:'MultiPoint',coordinates:[[113,21],[116,24]]},
    {type:'LineString',coordinates:[[112,20],[117,25]]}, {type:'MultiLineString',coordinates:[[[111,19],[118,26]]]},
    {type:'Polygon',coordinates:[ring,[[114.2,22.2],[114.4,22.2],[114.3,22.3],[114.2,22.2]]]},
    {type:'MultiPolygon',coordinates:[[ring]]}];
  const collection = (children: any[]) => ({type:'GeometryCollection',geometries:children});
  const feature = (geometry: any) => ({type:'Feature',properties:{name:'<img src=x onerror=alert(1)>'},geometry});
  const fc = (geometry: any): any => ({type:'FeatureCollection',features:[feature(geometry)]});
  const rejects = (value: unknown) => {try {validateGeoJson(value);return false;}catch{return true;}};
  const nested = (depth: number): any => Array.from({length:depth}).reduce<any>(g=>collection([g]),point);
  for (const g of geometries) ok(!rejects(fc(collection([collection([g])]))), `collection: nested ${g.type} accepted`);
  const mixed=fc(collection(geometries)),snapshot=JSON.stringify(mixed);
  ok(validateGeoJson(mixed)===mixed,'collection: original feature/group structure retained');
  ok(JSON.stringify(mixed)===snapshot,'collection: validation does not mutate properties or holes');
  ok(JSON.stringify(geoJsonBounds(mixed))==='[[19,111],[26,118]]','collection: all primitive/nested bounds in Leaflet lat/lon order');
  ok(JSON.stringify(geoJsonBounds({...mixed,bbox:[0,0,1,1]}))==='[[19,111],[26,118]]','collection: forged bbox ignored');
  ok(!rejects(fc(nested(8))),'collection: exactly8 collection levels accepted');
  ok(rejects(fc(nested(9))),'collection: ninth collection level rejected');
  ok(!rejects(fc(collection([]))),'collection: empty collection structurally valid');
  ok(geoJsonBounds(fc(collection([])))===null,'collection: empty collection has no drawable bounds');
  ok(!rejects(fc(null)),'collection: null feature geometry legal');
  ok(JSON.stringify(geoJsonBounds(fc(collection([collection([]),point]))))==='[[22.1,114.1],[22.1,114.1]]','collection: empty sibling does not lose valid bounds');
  const bad: [string,any][] = [
    ['null child',collection([null])], ['Feature child',collection([feature(point)])],
    ['FeatureCollection child',collection([fc(point)])], ['missing members',{type:'GeometryCollection'}],
    ['nonarray members',{type:'GeometryCollection',geometries:{}}],
    ['ambiguous coordinates',{...collection([]),coordinates:[]}],
    ['ambiguous features',{...collection([]),features:[]}],
    ['primitive with geometries',{...point,geometries:[]}],
    ['primitive with features',{...point,features:[]}],
    ['out of range child',collection([{type:'Point',coordinates:[181,20]}])],
    ['latitude child',collection([{type:'Point',coordinates:[114,91]}])],
    ['nonfinite child',collection([{type:'Point',coordinates:[NaN,22]}])],
    ['bad altitude',collection([{type:'Point',coordinates:[114,22,Infinity]}])],
    ['four dimensional',collection([{type:'Point',coordinates:[114,22,0,0]}])],
    ['short line',collection([{type:'LineString',coordinates:[[114,22]]}])],
    ['open ring',collection([{type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,1]]]}])],
    ['Z not closed',collection([{type:'Polygon',coordinates:[[[0,0,1],[1,0,1],[1,1,1],[0,0,2]]]}])],
    ['mixed dimensions closure',collection([{type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,0,1]]]}])],
    ['unknown child',collection([{type:'Triangle',coordinates:ring}])],
    ['projected nested CRS',collection([{...point,crs:{properties:{name:'EPSG:3857'}}}])],
  ];
  for (const [name,g] of bad) ok(rejects(fc(g)),`collection: ${name} fails atomically`);
  ok(rejects({...fc(point),features:[{...feature(point),crs:{properties:{name:'EPSG:3857'}}}]}),'collection: projected Feature CRS rejected');
  ok(!rejects(fc(collection([{...point,crs:{properties:{name:'OGC:CRS84'}}}]))),'collection: explicit nested compatible CRS accepted');
  const cycle: any=collection([]);cycle.geometries.push(cycle);
  ok(rejects(fc(cycle)),'collection: cyclic raw input bounded by collection depth');
  let boundsRejected=false;try{geoJsonBounds(fc(cycle));}catch{boundsRejected=true;}
  ok(boundsRejected,'collection: raw bounds independently validates cyclic input');
  ok(!rejects(fc(collection(Array(GIS_LIMITS.maxGeometries-1).fill(point)))),'collection: exactly20k total geometry nodes accepted');
  ok(rejects(fc(collection(Array(GIS_LIMITS.maxGeometries).fill(collection([]))))),'collection: empty nodes still count against geometry budget');
  ok(rejects({type:'FeatureCollection',features:[feature(collection(Array(10_000).fill(point))),feature(collection(Array(10_000).fill(point)))]}),'collection: geometry budget shared across Features');
  const positions=Array(GIS_LIMITS.maxPositions).fill([114,22]);
  ok(!rejects(fc(collection([{type:'MultiPoint',coordinates:positions}]))),'collection: exactly150k positions accepted');
  ok(rejects(fc(collection([{type:'MultiPoint',coordinates:positions},point]))),'collection: position budget shared across siblings');
  const bytes=new TextEncoder().encode(JSON.stringify(mixed));
  const local=await readLocalGeoJson({name:'nested.geojson',size:bytes.byteLength,stream:()=>new Blob([bytes]).stream()},new AbortController().signal);
  ok(JSON.stringify(local.bounds)==='[[19,111],[26,118]]','collection: actual bounded local Blob stream preserves mixed bounds');
  let emptyRejected=false;const empty=new Blob([JSON.stringify(fc(collection([])))]);
  try{await readLocalGeoJson({name:'empty.geojson',size:empty.size,stream:()=>empty.stream()},new AbortController().signal);}catch{emptyRejected=true;}
  ok(emptyRejected,'collection: empty-only local stream rejected, not a false success');
  const remote=await fetchSourceGeoJson(getDataSource('ne-countries'),new AbortController().signal,async()=>new Response(bytes));
  ok(JSON.stringify(remote)===snapshot,'collection: mocked remote Response stream uses same bounded validator');
  let remoteRejected=false;try {await fetchSourceGeoJson(getDataSource('ne-countries'),new AbortController().signal,async()=>new Response(JSON.stringify(fc(collection([{type:'Point',coordinates:[999,22]}])))));}catch{remoteRejected=true;}
  ok(remoteRejected,'collection: remote invalid descendant rejects entire streamed response');
}
