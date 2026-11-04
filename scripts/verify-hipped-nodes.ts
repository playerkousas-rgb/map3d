import * as THREE from 'three';
import DxfParser, {type I3DfaceEntity} from 'dxf-parser';
import {buildBuildingSurfaces, buildingSurfaceGeometry, resolveBuildingProfile} from '../src/utils/builders/buildingBuilder';
import {hippedOutline} from '../src/utils/builders/hippedRoof';
import {signedPlanArea, type PlanPoint} from '../src/utils/builders/footprint';
import {parseOsmBuildings} from '../src/utils/osmBuildings';
import {createProjection} from '../src/utils/projection';
import {mapBuildingShape, mapBuildingGeometry} from '../src/three/mapBuildingGeometry';
import {buildBuildingsGeometry} from '../src/three/orthoGeometry';
import {objectToDxf} from '../src/utils/dxf';

export function verifyHippedNodes(ok:(condition:boolean,label:string)=>void,close:(actual:number,expected:number,tolerance:number,label:string)=>void){
  const corners=[{x:-20,z:-10},{x:20,z:-10},{x:20,z:10},{x:-20,z:10}];
  const tags={building:'yes',height:'15','roof:shape':'hipped','roof:height':'3',min_height:'5'};
  const split=(ring:PlanPoint[],fractions:number[])=>ring.flatMap((a,i)=>{const b=ring[(i+1)%ring.length];return [0,...fractions].map(t=>({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t}));});
  const nodes=split(corners,[.25,.5,.75]);
  // Long sides split into10m segments while short sides remain20m: longest
  // individual edge would choose the WRONG roof axis.
  const asymmetric=[...nodes.slice(0,4),corners[1],...nodes.slice(8,12),corners[3]];
  close(resolveBuildingProfile(asymmetric,10,tags)!.hip!.length,40,1e-9,'hip nodes: default axis uses whole corner-to-corner side, not longest individual segment');
  for(const reverse of [false,true])for(const angle of [0,.7])for(const orientation of ['along','across']){
    let plan=nodes.map(p=>({x:p.x*Math.cos(angle)-p.z*Math.sin(angle)+1000,z:p.x*Math.sin(angle)+p.z*Math.cos(angle)-500}));
    if(reverse)plan=plan.reverse();plan=[...plan.slice(2),...plan.slice(0,2)]; // start mid-side, not corner
    const before=JSON.stringify(plan),t={...tags,'roof:orientation':orientation},profile=resolveBuildingProfile(plan,10,t)!,built=buildBuildingSurfaces(plan,7,10,t);
    ok(hippedOutline(plan)?.length===4&&!!profile.hip&&!profile.flatHippedRoof,`hip nodes ${reverse}/${angle}/${orientation}: retain all16 nodes but recognize four corners`);
    ok(built.roofs.length/9===plan.length+2&&built.walls.length/9===plan.length*2,`hip nodes ${reverse}/${angle}/${orientation}: n+2 roof and2n wall triangles`);
    let area=0;for(let i=0;i<built.roofs.length;i+=9)area-=signedPlanArea([0,3,6].map(j=>({x:built.roofs[i+j],z:built.roofs[i+j+2]})));
    close(area,800,1e-7,`hip nodes ${reverse}/${angle}/${orientation}: exact upward roof net area`);
    ok(built.roofs.every((n,i)=>i%3!==1||n===19||n===22)&&built.walls.every((n,i)=>i%3!==1||n===12||n===19),`hip nodes ${reverse}/${angle}/${orientation}: eaves/ridge and raised wall bottom preserved`);
    const geometry=buildingSurfaceGeometry(built,plan),positions=geometry.getAttribute('position'),edges=new Map<string,number>();
    const key=(i:number)=>[positions.getX(i),positions.getY(i),positions.getZ(i)].map(n=>n.toFixed(3)).join(',');
    for(let i=0;i<positions.count;i+=3)for(const [a,b] of [[i,i+1],[i+1,i+2],[i+2,i]]){const k=[key(a),key(b)].sort().join('/');edges.set(k,(edges.get(k)??0)+1);}
    ok([...edges.values()].every(n=>n===2),`hip nodes ${reverse}/${angle}/${orientation}: roof/wall/projected-bottom edges share exactly twice, no collinear cap T-junction`);
    ok(geometry.groups.length===2&&JSON.stringify(plan)===before&&built.footprint?.outer.length===plan.length,`hip nodes ${reverse}/${angle}/${orientation}: material slots, source nodes and coordinates unchanged`);
    const normals=geometry.getAttribute('normal');ok([...normals.array].every(Number.isFinite),`hip nodes ${reverse}/${angle}/${orientation}: all normals finite`);geometry.dispose();
  }
  for(const fraction of [.1,.49,.5,.51,.9]){
    const plan=split(corners,[fraction]),p=resolveBuildingProfile(plan,10,tags)!;
    ok(!!p.hip&&buildBuildingSurfaces(plan,0,10,tags).roofs.length/9===plan.length+2,`hip nodes ${fraction}: asymmetric fan subdivisions cover near-ridge/midpoint boundary`);
    close(p.hip!.offset,20/3,1e-9,`hip nodes ${fraction}: extra nodes do not shorten source cap width/inset`);
  }
  for(const [label,plan] of [
    ['dent',[corners[0],{x:0,z:-9.99},...corners.slice(1)]],
    ['outward bend',[corners[0],{x:0,z:-10.01},...corners.slice(1)]],
    ['backtracking',[corners[0],{x:10,z:-10},{x:0,z:-10},...corners.slice(1)]],
    ['trapezoid nodes',split([{x:0,z:0},{x:40,z:0},{x:38,z:20},{x:0,z:20}],[.5])],
    ['nonfinite',[...nodes.slice(0,-1),{x:NaN,z:0}]],
  ] as [string,PlanPoint[]][]){
    const profile=resolveBuildingProfile(plan,10,tags);
    ok(!profile?.hip,`hip nodes ${label}: do not simplify invalid/nonrectangular geometry into a box`);
  }
  const curved=[corners[0],...Array.from({length:99},(_,i)=>{const t=(i+1)/100;return{x:-20+40*t,z:-10+.0001*4*t*(1-t)};}),...corners.slice(1)];
  ok(!hippedOutline(curved)&&resolveBuildingProfile(curved,10,tags)!.flatHippedRoof,'hip nodes: many locally tiny turns cannot hide cumulative curvature beyond full-chord tolerance');
  const noisy=nodes.map(p=>({...p}));noisy[1].z+=1e-6;
  ok(!!resolveBuildingProfile(noisy,10,tags)?.hip,'hip nodes: tiny projected interpolation noise tolerated without moving source point');
  const hole=split(corners.map(p=>({x:p.x/4,z:p.z/4})),[.5]);
  const fallback=resolveBuildingProfile(nodes,10,tags,[hole])!,flat=buildBuildingSurfaces(nodes,0,10,tags,[hole]);
  ok(fallback.flatHippedRoof&&!fallback.hip&&flat.roofs.every((n,i)=>i%3!==1||n===15)&&!flat.capFromRoof,'hip nodes: courtyard stays flat with original hole-aware cap, never projects across hole');
  const zero=resolveBuildingProfile(nodes,10,{...tags,'roof:height':'0'})!;
  ok(!zero.hip&&!zero.flatHippedRoof,'hip nodes: intentionalzero still quiet');
  const ridge=resolveBuildingProfile(nodes,10,{...tags,'roof:ridge:direction':'N','roof:orientation':'along'})!;
  close(ridge.hip!.length,20,1e-9,'hip nodes: explicit ridge direction still beats default whole-side axis');

  const projection=createProjection([{lat:22.3,lng:114.16},{lat:22.31,lng:114.17}]);
  const geo=nodes.map(p=>{const q=projection.toLatLng(p.x,p.z);return{lat:q.lat,lon:q.lng};});
  const source={type:'way',id:7810,tags,geometry:[...geo,geo[0]]},project=(p:{lat:number;lng:number})=>projection.toScene(p.lat,p.lng);
  const parsed=parseOsmBuildings([source],project),raw=parsed.buildings[0];
  ok(parsed.buildings.length===1&&!parsed.issues.length&&!raw.flatHippedRoof&&raw.geometry.length===nodes.length,'hip nodes: real OSM normalizer retains every source node without unsupported warning');
  const merged=buildBuildingsGeometry([{id:raw.id,tags,ring:raw.geometry,holes:[],heightM:15}],projection,()=>0),factor=111320/51000;
  const shape=mapBuildingShape(raw,(lat,lng)=>{const p=project({lat,lng});return new THREE.Vector2(p.x/factor,-p.z/factor);});
  const map=new THREE.Mesh(mapBuildingGeometry(shape,51000,15,tags));map.userData.dxfHorizontalScale=factor;
  for(const [name,obj] of [['legacy',map],['UTM',new THREE.Mesh(merged.roofs!)]] as const){
    const dxf=new DxfParser().parseSync(objectToDxf(obj))!;
    const roof=(dxf.entities as I3DfaceEntity[]).map(f=>f.vertices.slice(0,3)).filter(([a,b,c])=>(b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y)>1e-5);
    const peaks=new Set(roof.flat().filter(p=>Math.abs(p.z-15)<1e-4).map(p=>`${p.x.toFixed(3)},${p.y.toFixed(3)}`));
    ok(dxf.header.$INSUNITS===6&&dxf.header.$ACADVER==='AC1024'&&roof.length===nodes.length+2&&peaks.size===2,`hip nodes ${name}: independent metric R2010 CAD has n+2 roofs and true two-end ridge`);
    const boundary=new Set(roof.flat().filter(p=>Math.abs(p.z-12)<1e-4).map(p=>`${p.x.toFixed(3)},${p.y.toFixed(3)}`));
    ok(boundary.size===nodes.length,`hip nodes ${name}: CAD eaves retain all original boundary nodes`);
    obj.geometry.dispose();(obj.material as THREE.Material).dispose();
  }
  merged.walls!.dispose();
}
