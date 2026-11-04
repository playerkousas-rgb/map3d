import * as THREE from 'three';
import DxfParser, {type I3DfaceEntity} from 'dxf-parser';
import {buildingDimensions, resolveBuildingProfile, buildBuildingSurfaces, buildingSurfaceGeometry} from '../src/utils/builders/buildingBuilder';
import {signedPlanArea, pointInRing, type PlanPoint} from '../src/utils/builders/footprint';
import {parseOsmBuildings} from '../src/utils/osmBuildings';
import {fetchBuildings, fetchBuildingElements, type CellProgress} from '../src/utils/sceneData';
import {createProjection} from '../src/utils/projection';
import {mapBuildingShape, mapBuildingGeometry} from '../src/three/mapBuildingGeometry';
import {buildBuildingsGeometry} from '../src/three/orthoGeometry';
import {objectToDxf} from '../src/utils/dxf';

export async function verifyHipped(ok:(condition:boolean,label:string)=>void,close:(actual:number,expected:number,tolerance:number,label:string)=>void) {
  const rectangle=[{x:-20,z:-10},{x:20,z:-10},{x:20,z:10},{x:-20,z:10}];
  const hole=[{x:-3,z:-2},{x:3,z:-2},{x:3,z:2},{x:-3,z:2}];
  const tags={building:'yes',height:'15','roof:shape':'hipped','roof:height':'3',min_height:'5'};
  const p=resolveBuildingProfile(rectangle,10,tags)!;
  ok(!!p.hip&&!p.flatHippedRoof&&!p.splitRidge&&!p.pyramidApex,'hipped: explicit rectangle uses a two-ended ridge, not a gable/pyramid');
  close(p.hip!.offset,20/3,1e-9,'hipped: offset uses end-cap width/3, not ridge length/3 or equal-pitch width/2');
  close(Math.hypot(p.hip!.ridge[0].x-p.hip!.ridge[1].x,p.hip!.ridge[0].z-p.hip!.ridge[1].z),80/3,1e-8,'hipped: default40x20 rectangle retains26.6667m ridge');
  close(p.roofY(p.hip!.ridge[0]),15,1e-9,'hipped: ridge at total roof-inclusive height');
  close(p.roofY({x:-20,z:0}),12,1e-9,'hipped: end cap starts at eaves, not a gable peak');
  close(p.roofY({x:-20+10/3,z:0}),13.5,1e-9,'hipped: cap midpoint follows its independent slope plane');
  const across=resolveBuildingProfile(rectangle,10,{...tags,'roof:orientation':'across'})!;
  close(across.hip!.offset,8,1e-9,'hipped: across orientation clamps offset to40% of short-axis span');
  close(Math.hypot(across.hip!.ridge[0].x-across.hip!.ridge[1].x,across.hip!.ridge[0].z-across.hip!.ridge[1].z),4,1e-9,'hipped: clamped ridge stays positive, never collapses to guessed apex');
  close(buildingDimensions({...tags,'roof:height':'10 ft'}).roofHeight,3.048,1e-9,'hipped: feet rise accepted');
  close(buildingDimensions({...tags,'roof:height':undefined,'roof:levels':'2'}).roofHeight,4.4,1e-9,'hipped: explicit roof levels use existing2.2m estimate');
  close(buildingDimensions({'roof:shape':'hipped','roof:height':'3','building:levels':'5'}).totalHeight,14,1e-9,'hipped: floor-derived total includes rise exactly once');
  close(buildingDimensions({...tags,height:'4','roof:height':'100'}).roofHeight,2,0,'hipped: existing facade/height clamp preserved');
  for(const t of [{...tags,'roof:height':'0'},{...tags,'roof:height':undefined,'roof:levels':'0'}]){
    const profile=resolveBuildingProfile(rectangle,10,t)!;ok(profile.roofHeight===0&&!profile.flatHippedRoof,'hipped: intentional zero is flat without unsupported warning');
  }
  for(const reverse of [false,true])for(const angle of [0,.7])for(const orient of ['along','across']){
    const plan=(reverse?[...rectangle].reverse():rectangle).map(p=>({x:p.x*Math.cos(angle)-p.z*Math.sin(angle)+1000,z:p.x*Math.sin(angle)+p.z*Math.cos(angle)-500}));
    const before=JSON.stringify(plan),built=buildBuildingSurfaces(plan,7,10,{...tags,'roof:orientation':orient});
    const profile=resolveBuildingProfile(plan,10,{...tags,'roof:orientation':orient})!;
    ok(!!profile.hip&&built.roofs.length===54&&built.walls.length===72,`hipped ${reverse}/${angle}/${orient}: exactly six roof /eight wall triangles`);
    let area=0,inside=true,up=true;
    for(let i=0;i<built.roofs.length;i+=9){const face=[0,3,6].map(j=>({x:built.roofs[i+j],z:built.roofs[i+j+2]}));const a=signedPlanArea(face);area+=Math.abs(a);up&&=a<0;inside&&=pointInRing({x:face.reduce((s,p)=>s+p.x,0)/3,z:face.reduce((s,p)=>s+p.z,0)/3},plan);}
    ok(Math.abs(area-800)<1e-6&&inside&&up,`hipped ${reverse}/${angle}/${orient}: all six faces point up, no spill/overlap/missing footprint area`);
    ok(built.roofs.every((n,i)=>i%3!==1||n===19||n===22)&&built.walls.every((n,i)=>i%3!==1||n===12||n===19),`hipped ${reverse}/${angle}/${orient}: eaves/ridge and raised underside remain separate`);
    const geometry=buildingSurfaceGeometry(built,plan);const points=geometry.getAttribute('position');const edges=new Map<string,number>();
    const key=(i:number)=>[points.getX(i),points.getY(i),points.getZ(i)].map(n=>n.toFixed(3)).join(',');
    for(let i=0;i<points.count;i+=3)for(const [a,b] of [[i,i+1],[i+1,i+2],[i+2,i]]){const k=[key(a),key(b)].sort().join('/');edges.set(k,(edges.get(k)??0)+1);}
    ok([...edges.values()].every(n=>n===2)&&geometry.groups.length===2,`hipped ${reverse}/${angle}/${orient}: closed map mesh shares every geometric edge twice and preserves material slots`);
    ok(JSON.stringify(plan)===before,`hipped ${reverse}/${angle}/${orient}: no footprint mutation or bbox replacement`);geometry.dispose();
  }
  for(const direction of ['N','E','90','180','360'])ok(!!resolveBuildingProfile(rectangle,10,{...tags,'roof:direction':direction})!.hip,`hipped: aligned direction ${direction} accepted`);
  // Ridge bearings are clockwise from north ALONG the ridge, not downhill.
  for(const [bearing,alongX] of [['N',false],['E',true],['S',false],['W',true],['0',false],['90',true],['180',false],['270',true],['360',false],['450',true],[' e ',true]] as const){
    const profile=resolveBuildingProfile(rectangle,10,{...tags,'roof:ridge:direction':bearing})!;
    const ridge=profile.hip?.ridge;
    ok(!!ridge&&!profile.flatHippedRoof,`ridge ${bearing}: valid aligned compass/numeric tag accepted`);
    if(ridge){
      close(Math.abs(ridge[1].x-ridge[0].x),alongX?80/3:0,1e-8,`ridge ${bearing}: correct east-west span, not slope-direction inversion`);
      close(Math.abs(ridge[1].z-ridge[0].z),alongX?0:4,1e-8,`ridge ${bearing}: correct north-south span and inset clamp`);
    }
  }
  for(const reverse of [false,true])for(const degrees of [22.5,45,67.5,123.4]){
    const a=degrees*Math.PI/180,plan=(reverse?[...rectangle].reverse():rectangle).map(p=>({x:p.x*Math.cos(a)-p.z*Math.sin(a)+1000000,z:p.x*Math.sin(a)+p.z*Math.cos(a)-2000000}));
    const bearing=(90+degrees)%360,t={...tags,'roof:ridge:direction':String(bearing)};
    const before=JSON.stringify(plan),profile=resolveBuildingProfile(plan,10,t)!,b=buildBuildingSurfaces(plan,7,10,t);
    ok(!!profile.hip&&b.roofs.length===54&&b.walls.length===72&&!profile.flatHippedRoof,`ridge rotated ${reverse}/${degrees}: six roof/eight wall triangles`);
    if(profile.hip){const [p,q]=profile.hip.ridge;close(Math.abs((q.x-p.x)*Math.sin(a)-(q.z-p.z)*Math.cos(a)),0,1e-7,`ridge rotated ${reverse}/${degrees}: actual ridge parallel to selected bearing`);}
    let area=0;for(let i=0;i<b.roofs.length;i+=9)area-=signedPlanArea([0,3,6].map(j=>({x:b.roofs[i+j],z:b.roofs[i+j+2]})));
    ok(Math.abs(area-800)<1e-6&&JSON.stringify(plan)===before,`ridge rotated ${reverse}/${degrees}: upward net area and immutable input`);
  }
  for(const lower of ['N','45','bad']){
    const profile=resolveBuildingProfile(rectangle,10,{...tags,'roof:direction':'N','roof:ridge:direction':lower,'roof:orientation':'bad'})!;
    ok(!!profile.hip&&Math.abs(profile.hip.ridge[0].z-profile.hip.ridge[1].z)<1e-8,`ridge precedence: valid slope N beats lower ridge ${lower} and bad orientation`);
  }
  for(const orientation of ['along','across','bad']){
    const profile=resolveBuildingProfile(rectangle,10,{...tags,'roof:ridge:direction':'N','roof:orientation':orientation})!;
    ok(!!profile.hip&&Math.abs(profile.hip.ridge[0].x-profile.hip.ridge[1].x)<1e-8,`ridge precedence: explicit ridge N beats orientation ${orientation}`);
  }
  for(const bad of ['', 'bad', '-90', '90deg', 'Infinity', 'NaN', '1e2', '45']){
    const t={...tags,'roof:ridge:direction':bad};
    const profile=resolveBuildingProfile(rectangle,10,t)!;
    ok(profile.flatHippedRoof&&!profile.hip,`ridge ${JSON.stringify(bad)}: malformed/unaligned active tag fails closed`);
    const zero=resolveBuildingProfile(rectangle,10,{...t,'roof:height':'0'},[hole])!;
    ok(!zero.flatHippedRoof&&zero.roofHeight===0,`ridge ${JSON.stringify(bad)}: intentional zero with courtyard stays quiet`);
  }
  ok(resolveBuildingProfile(rectangle,10,{...tags,'roof:direction':'bad','roof:ridge:direction':'E'})!.flatHippedRoof,'ridge: malformed higher-priority slope tag is not silently repaired by valid ridge');
  ok(resolveBuildingProfile(rectangle,10,{...tags,'roof:direction':'45','roof:ridge:direction':'E'})!.flatHippedRoof,'ridge: valid but oblique winning slope does not retry lower aligned ridge');
  for(const shape of ['gabled','skillion','pyramidal']){
    const t={...tags,'roof:shape':shape,'roof:direction':'N'};
    ok(JSON.stringify(buildBuildingSurfaces(rectangle,0,10,t))===JSON.stringify(buildBuildingSurfaces(rectangle,0,10,{...t,'roof:ridge:direction':'E'})),`ridge: existing ${shape} geometry unchanged by new hipped-only tag`);
  }
  const concave=[{x:0,z:0},{x:20,z:0},{x:20,z:5},{x:5,z:5},{x:5,z:20},{x:0,z:20}];
  const trapezoid=[{x:0,z:0},{x:20,z:0},{x:18,z:10},{x:0,z:10}];
  const fallback:[string,PlanPoint[],Record<string,string|undefined>,PlanPoint[][]][]=[
    ['concave',concave,tags,[]],['trapezoid',trapezoid,tags,[]],['courtyard',rectangle,tags,[hole]],
    ['extra dent corner',[rectangle[0],{x:0,z:-9.99},...rectangle.slice(1)],tags,[]],
    ['oblique direction',rectangle,{...tags,'roof:direction':'45'},[]],['bad direction',rectangle,{...tags,'roof:direction':'bad'},[]],
    ['oblique ridge tag',rectangle,{...tags,'roof:ridge:direction':'45'},[]],['unknown orientation',rectangle,{...tags,'roof:orientation':'other'},[]],
    ['invalid angle',rectangle,{...tags,'roof:height':undefined,'roof:angle':'90'},[]],['no rise',rectangle,{...tags,'roof:height':undefined},[]],
    ['invalid roof levels',rectangle,{...tags,'roof:height':undefined,'roof:levels':'999'},[]],
    ['thin oblique bounding ridge', [{x:0,z:0},{x:.000001,z:0},{x:.000001,z:100},{x:0,z:100}],{...tags,'roof:direction':'0.002864789'},[]],
  ];
  for(const [name,plan,t,holes] of fallback){const profile=resolveBuildingProfile(plan,10,t,holes)!,b=buildBuildingSurfaces(plan,0,10,t,holes);let area=0;for(let i=0;i<b.roofs.length;i+=9)area+=Math.abs(signedPlanArea([0,3,6].map(j=>({x:b.roofs[i+j],z:b.roofs[i+j+2]}))));
    ok(profile.flatHippedRoof&&!profile.hip&&b.roofs.every((n,i)=>i%3!==1||n===15),`hipped ${name}: explicit flat fallback at total height, no inferred rise/ridge`);
    ok(Math.abs(area-(Math.abs(signedPlanArea(plan))-holes.reduce((sum,r)=>sum+Math.abs(signedPlanArea(r)),0)))<1e-7,`hipped ${name}: original net area and holes survive fallback`);
  }
  ok(resolveBuildingProfile(rectangle,10,{...tags,min_height:'13'})===null,'hipped: invalid bottom above eaves rejected');
  const projection=createProjection([{lat:22.3,lng:114.16},{lat:22.31,lng:114.17}]);
  const osm=(ring:PlanPoint[])=>{const ps=ring.map(p=>projection.toLatLng(p.x,p.z)).map(p=>({lat:p.lat,lon:p.lng}));return [...ps,ps[0]];};
  const project=(p:{lat:number;lng:number})=>projection.toScene(p.lat,p.lng);
  const way={type:'way',id:7701,tags,geometry:osm(rectangle)};
  const courtyard={type:'relation',id:7702,tags:{...tags,type:'multipolygon'},members:[{type:'way',ref:7710,role:'outer',geometry:osm(rectangle)},{type:'way',ref:7711,role:'inner',geometry:osm(hole)}]};
  const parsed=parseOsmBuildings([way,courtyard],project);
  ok(parsed.buildings.length===2&&!parsed.issues.length&&!parsed.buildings[0].flatHippedRoof&&parsed.buildings[1].flatHippedRoof===true,'hipped: real OSM normalizer separates supported/fallback components without skipping valid courtyard');
  const raw=parsed.buildings[0],merged=buildBuildingsGeometry([{id:raw.id,tags:raw.tags,ring:raw.geometry,holes:[],heightM:15}],projection,()=>0);
  const factor=111320/51000,shape=mapBuildingShape(raw,(lat,lng)=>{const p=project({lat,lng});return new THREE.Vector2(p.x/factor,-p.z/factor);});
  const map=new THREE.Mesh(mapBuildingGeometry(shape,51000,15,tags));map.userData.dxfHorizontalScale=factor;
  for(const [name,obj] of [['legacy',map],['UTM',new THREE.Mesh(merged.roofs!)]] as const){
    const dxf=new DxfParser().parseSync(objectToDxf(obj))!,faces=(dxf.entities as I3DfaceEntity[]).filter(f=>{const[a,b,c]=f.vertices;return(b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y)>1e-5;});
    ok(dxf.header.$INSUNITS===6&&dxf.header.$ACADVER==='AC1024'&&faces.length===6,`hipped ${name}: independent DXF parser reads six metric R2010 roof triangles`);
    const peaks=new Set(faces.flatMap(f=>f.vertices.slice(0,3)).filter(p=>Math.abs(p.z-15)<1e-4).map(p=>`${p.x.toFixed(3)},${p.y.toFixed(3)}`));
    ok(peaks.size===2&&faces.every(f=>f.vertices.slice(0,3).every(p=>Math.abs(p.z-12)<1e-4||Math.abs(p.z-15)<1e-4)),`hipped ${name}: true two-ended ridge and eaves, not gabled walls or pyramid apex`);
    obj.geometry.dispose();(obj.material as THREE.Material).dispose();
  }
  merged.walls!.dispose();
  const ridgeTags={...tags,'roof:ridge:direction':'N','roof:orientation':'along'};
  const ridgeMerged=buildBuildingsGeometry([{id:raw.id,tags:ridgeTags,ring:raw.geometry,holes:[],heightM:15}],projection,()=>0);
  const ridgeMap=new THREE.Mesh(mapBuildingGeometry(shape,51000,15,ridgeTags));ridgeMap.userData.dxfHorizontalScale=factor;
  for(const [name,obj] of [['legacy',ridgeMap],['UTM',new THREE.Mesh(ridgeMerged.roofs!)]] as const){
    const doc=new DxfParser().parseSync(objectToDxf(obj))!;
    const faces=(doc.entities as I3DfaceEntity[]).map(f=>f.vertices.slice(0,3)).filter(([a,b,c])=>(b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y)>1e-5);
    const peaks=[...new Map(faces.flat().filter(p=>Math.abs(p.z-15)<1e-4).map(p=>[`${p.x.toFixed(3)},${p.y.toFixed(3)}`,p])).values()];
    ok(doc.header.$INSUNITS===6&&doc.header.$ACADVER==='AC1024'&&faces.length===6&&peaks.length===2,`ridge ${name}: independent CAD reads six metric R2010 roof faces and two peaks`);
    ok(peaks.length===2&&Math.abs(peaks[1].x-peaks[0].x)<1e-4&&Math.abs(Math.abs(peaks[1].y-peaks[0].y)-4)<1e-4,`ridge ${name}: CAD northward short-axis4m ridge overrides default long axis`);
    obj.geometry.dispose();(obj.material as THREE.Material).dispose();
  }
  ridgeMerged.walls!.dispose();
  const previous=globalThis.fetch,progress:CellProgress[]=[];globalThis.fetch=async()=>new Response(JSON.stringify({elements:[way,courtyard]}));
  try{const area:[{lat:number;lng:number},{lat:number;lng:number}]=[{lat:22.307123,lng:114.167123},{lat:22.308123,lng:114.168123}];
    const scene=await fetchBuildings(area,(_,p)=>progress.push(p)),legacy=await fetchBuildingElements(area,(_,p)=>progress.push(p));
    ok(scene.length===2&&legacy.length===2&&progress.length>=2&&progress[0].flatHippedRoofs===1&&progress[progress.length-1].flatHippedRoofs===2,
      'hipped: strict projected-rectangle gate reports extra legacy fallback after nonconformal projection; no silent skew repair');
    const centre=projection.toLatLng(0,0),dx=20/(111320*Math.cos(centre.lat*Math.PI/180)),dy=10/111320;
    const corners=[{lat:centre.lat-dy,lon:centre.lng-dx},{lat:centre.lat-dy,lon:centre.lng+dx},{lat:centre.lat+dy,lon:centre.lng+dx},{lat:centre.lat+dy,lon:centre.lng-dx}];
    const geoWay={...way,geometry:[...corners,corners[0]]};
    globalThis.fetch=async()=>new Response(JSON.stringify({elements:[geoWay,courtyard]}));progress.length=0;
    const geoArea:[{lat:number;lng:number},{lat:number;lng:number}]=[{lat:22.304461,lng:114.164461},{lat:22.306461,lng:114.166461}];
    const sceneGeo=await fetchBuildings(geoArea,(_,p)=>progress.push(p)),legacyGeo=await fetchBuildingElements(geoArea,(_,p)=>progress.push(p));
    ok(sceneGeo.length===2&&legacyGeo.length===2&&progress.every(p=>p.flatHippedRoofs===1&&p.flatPyramidalRoofs===0&&p.skippedBuildings===0),
      'hipped: both actual collectors/cache agree on native geographical rectangle and separate courtyard fallback');
  }finally{globalThis.fetch=previous;}
}
