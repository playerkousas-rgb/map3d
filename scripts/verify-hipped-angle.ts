import * as THREE from 'three';
import DxfParser, {type I3DfaceEntity} from 'dxf-parser';
import {buildingDimensions, resolveBuildingProfile, buildBuildingSurfaces} from '../src/utils/builders/buildingBuilder';
import {signedPlanArea, type PlanPoint} from '../src/utils/builders/footprint';
import {parseOsmBuildings} from '../src/utils/osmBuildings';
import {fetchBuildings, fetchBuildingElements, type CellProgress} from '../src/utils/sceneData';
import {createProjection} from '../src/utils/projection';
import {mapBuildingShape, mapBuildingGeometry} from '../src/three/mapBuildingGeometry';
import {buildBuildingsGeometry} from '../src/three/orthoGeometry';
import {objectToDxf} from '../src/utils/dxf';

export async function verifyHippedAngle(ok:(condition:boolean,label:string)=>void,close:(actual:number,expected:number,tolerance:number,label:string)=>void){
  const rectangle=[{x:-20,z:-10},{x:20,z:-10},{x:20,z:10},{x:-20,z:10}];
  const tags={building:'yes',height:'30','roof:shape':'hipped','roof:angle':'45',min_height:'5'};
  const expected=Math.hypot(20/3,10); // finite ridge END, not distance to infinite line (10m)
  const profile=resolveBuildingProfile(rectangle,10,tags)!;
  close(profile.hip!.maxDistanceToRidge,expected,1e-9,'hip angle: upstream finite-segment corner distance includes width/3 inset');
  close(profile.roofHeight,expected,1e-9,'hip angle:45 degrees uses max vertex-to-segment distance, not guessed width/2');
  close(profile.totalHeight,30,0,'hip angle: explicit total is roof-inclusive');
  close(profile.eavesHeight,30-expected,1e-9,'hip angle: eaves derived once, without raising ridge above total');
  close(profile.roofY(profile.hip!.ridge[1]),30,1e-9,'hip angle: both ridge ends at total');
  close(buildingDimensions(tags).roofHeight,0,0,'hip angle: tag-only helper never invents default span/distance');
  for(const reverse of [false,true])for(const rotation of [0,.7])for(const across of [false,true])for(const angle of [30,60]){
    const plan=(reverse?[...rectangle].reverse():rectangle).map(p=>({x:p.x*Math.cos(rotation)-p.z*Math.sin(rotation)+10000,z:p.x*Math.sin(rotation)+p.z*Math.cos(rotation)-20000}));
    const t={...tags,min_height:'1','roof:angle':String(angle),'roof:orientation':across?'across':'along'},p=resolveBuildingProfile(plan,10,t)!,built=buildBuildingSurfaces(plan,7,10,t),before=JSON.stringify(plan);
    const distance=across?Math.hypot(8,20):expected,rise=Math.min(Math.tan(angle*Math.PI/180)*distance,28);
    close(p.roofHeight,rise,1e-7,`hip angle ${reverse}/${rotation}/${across}/${angle}: rotated/reversed finite-ridge rise and existing clamp`);
    ok(!!p.hip&&!p.flatHippedRoof&&built.roofs.length===54&&built.walls.length===72,`hip angle ${reverse}/${rotation}/${across}/${angle}: six roof/eight wall triangles without fallback`);
    const levels=built.roofs.filter((_,i)=>i%3===1);ok(levels.every(y=>Math.abs(y-37)<1e-7||Math.abs(y-(37-rise))<1e-7),`hip angle ${reverse}/${rotation}/${across}/${angle}: metric ground7 applied exactly once`);
    const area=Array.from({length:6},(_,i)=>-signedPlanArea([0,3,6].map(j=>({x:built.roofs[i*9+j],z:built.roofs[i*9+j+2]})))).reduce((a,b)=>a+b,0);
    ok(Math.abs(area-800)<1e-6&&JSON.stringify(plan)===before,`hip angle ${reverse}/${rotation}/${across}/${angle}: upward exact area and source unchanged`);
  }
  const nodes=rectangle.flatMap((a,i)=>{const b=rectangle[(i+1)%4];return [0,.25,.5,.75].map(t=>({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t}));});
  const nodeProfile=resolveBuildingProfile(nodes,10,tags)!;
  close(nodeProfile.roofHeight,expected,1e-9,'hip angle: collinear nodes cannot change corner-to-finite-ridge maximum');
  ok(buildBuildingSurfaces(nodes,0,10,tags).roofs.length/9===nodes.length+2,'hip angle: all source boundary nodes survive roof fan');
  for(const override of [{'roof:height':'3'},{'roof:height':'0'},{'roof:levels':'2'},{'roof:levels':'0'},{'roof:height':'bad','roof:levels':'2'}]){
    const t={...tags,...override},p=resolveBuildingProfile(rectangle,10,t)!,rise=buildingDimensions(t).roofHeight;
    close(p.roofHeight,rise,0,`hip angle: explicit height/levels (including zero) retain existing priority ${JSON.stringify(override)}`);
    ok(!p.flatHippedRoof,`hip angle: explicit valid override does not become unsupported ${JSON.stringify(override)}`);
  }
  const floor=resolveBuildingProfile(rectangle,10,{'roof:shape':'hipped','roof:angle':'45','building:levels':'5','building:min_level':'2'})!;
  close(floor.totalHeight,11+expected,1e-9,'hip angle: level-derived total adds actual rise once');
  close(floor.minHeightM,4.4,1e-9,'hip angle: building:min_level uses facade ratio, not roof-inclusive total');
  ok(resolveBuildingProfile(rectangle,10,{...tags,min_height:'20'})===null,'hip angle: angle-lowered eaves cannot conceal invalid undercroft');
  for(const angle of ['','bad','45x','NaN','Infinity','-1','90','100','1e2','45 deg']){
    const p=resolveBuildingProfile(rectangle,10,{...tags,'roof:angle':angle})!;
    ok(p.flatHippedRoof&&!p.hip&&p.roofY(rectangle[0])===30,`hip angle ${JSON.stringify(angle)}: malformed/out-of-range angle has explicit total-height flat fallback`);
  }
  const hole=rectangle.map(p=>({x:p.x/4,z:p.z/4}));
  for(const [name,plan,t,holes] of [
    ['holes',rectangle,tags,[hole]],['trapezoid',[rectangle[0],rectangle[1],{x:18,z:10},rectangle[3]],tags,[]],
    ['oblique',rectangle,{...tags,'roof:direction':'45'},[]],['invalid ridge',rectangle,{...tags,'roof:ridge:direction':'bad'},[]],
  ] as [string,PlanPoint[],typeof tags,PlanPoint[][]][]){
    const p=resolveBuildingProfile(plan,10,t,holes)!;
    ok(p.flatHippedRoof&&!p.hip&&p.roofHeight===0,`hip angle ${name}: no speculative ridge/span for unsupported geometry/direction`);
  }
  const zero=resolveBuildingProfile(rectangle,10,{...tags,'roof:angle':'0','roof:direction':'bad'},[hole])!;
  ok(!zero.flatHippedRoof&&!zero.hip&&zero.roofHeight===0,'hip angle: deliberate zero stays quiet even with unsupported geometry/direction');
  const steep=resolveBuildingProfile(rectangle,10,{...tags,min_height:'1','roof:angle':'89.999999'})!;
  ok(steep.roofHeight===28&&steep.eavesHeight===2&&!!steep.hip,'hip angle: source-valid steep angle respects existing two-metre facade clamp');
  for(const shape of ['gabled','skillion','pyramidal']){
    const t={...tags,'roof:shape':shape,'roof:direction':'N'};
    const a=resolveBuildingProfile(rectangle,10,t)!,b=buildingDimensions(t,10,20);
    close(a.roofHeight,b.roofHeight,1e-9,`hip angle: existing ${shape} interpretation not expanded or altered`);
  }
  const projection=createProjection([{lat:22.51,lng:114.18},{lat:22.512,lng:114.182}]),centre=projection.toLatLng(0,0);
  const dx=20/(111320*Math.cos(centre.lat*Math.PI/180)),dy=10/111320;
  const geo=[{lat:centre.lat-dy,lon:centre.lng-dx},{lat:centre.lat-dy,lon:centre.lng+dx},{lat:centre.lat+dy,lon:centre.lng+dx},{lat:centre.lat+dy,lon:centre.lng-dx}];
  const levelTags={building:'yes','roof:shape':'hipped','roof:angle':'30','building:levels':'5'},way={type:'way',id:7911,tags:levelTags,geometry:[...geo,geo[0]]};
  const project=(p:{lat:number;lng:number})=>projection.toScene(p.lat,p.lng),parsed=parseOsmBuildings([way],project),raw=parsed.buildings[0];
  ok(parsed.buildings.length===1&&!parsed.issues.length&&!raw.flatHippedRoof,'hip angle: actual OSM parser accepts native geographic rectangle');
  const resolved=resolveBuildingProfile(raw.geometry.map(project),10,levelTags)!;
  close(raw.resolvedHeightM!,resolved.totalHeight,1e-8,'hip angle: parser carries geometry-resolved roof-inclusive total without changing tags');
  ok(JSON.stringify(raw.tags)===JSON.stringify(levelTags)&&!('height' in raw.tags),'hip angle: no synthetic height/roof:height written into original OSM tags');
  const factor=111320/51000,shape=mapBuildingShape(raw,(lat,lng)=>{const p=project({lat,lng});return new THREE.Vector2(p.x/factor,-p.z/factor);});
  const map=new THREE.Mesh(mapBuildingGeometry(shape,51000,10,tags));map.userData.dxfHorizontalScale=factor;
  const merged=buildBuildingsGeometry([{id:1,ring:raw.geometry,heightM:30,tags}],projection,()=>0);
  for(const [name,obj] of [['map',map],['UTM',new THREE.Mesh(merged.roofs!)]] as const){
    const cad=new DxfParser().parseSync(objectToDxf(obj))!,faces=(cad.entities as I3DfaceEntity[]).map(f=>f.vertices.slice(0,3)).filter(([a,b,c])=>(b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y)>1e-5);
    const p=resolveBuildingProfile(raw.geometry.map(project),10,tags)!;
    ok(cad.header.$INSUNITS===6&&cad.header.$ACADVER==='AC1024'&&faces.length===6,`hip angle ${name}: independent DXF parser reads six actual metric roof faces`);
    const ps=raw.geometry.map(project),length=Math.hypot(ps[1].x-ps[0].x,ps[1].z-ps[0].z),width=Math.hypot(ps[2].x-ps[1].x,ps[2].z-ps[1].z);
    const projectedRise=Math.hypot(Math.min(width/3,length*.4),width/2);
    ok(faces.flat().every(p=>Math.abs(p.z-30)<1e-4||Math.abs(p.z-(30-projectedRise))<.001),`hip angle ${name}: CAD eaves/ridge reflect finite-segment angle rise`);
    if(name==='UTM')close(Math.min(...faces.flat().map(p=>p.z)),p.eavesHeight,1e-4,'hip angle UTM: actual CAD matches projected profile, not default12m helper span');
    obj.geometry.dispose();(obj.material as THREE.Material).dispose();
  }
  merged.walls!.dispose();
  const previous=globalThis.fetch,progress:CellProgress[]=[];globalThis.fetch=async()=>new Response(JSON.stringify({elements:[way]}));
  try{
    const area:[{lat:number;lng:number},{lat:number;lng:number}]=[{lat:22.51071,lng:114.18071},{lat:22.51171,lng:114.18171}];
    const scene=await fetchBuildings(area,(_,p)=>progress.push(p)),legacy=await fetchBuildingElements(area,(_,p)=>progress.push(p));
    ok(scene.length===1&&legacy.length===1&&progress.every(p=>p.flatHippedRoofs===0&&p.skippedBuildings===0),'hip angle: both actual collectors/cache retain supported component without fallback');
    close(scene[0].heightM,scene[0].ring.length?resolveBuildingProfile(scene[0].ring.map(p=>createProjection(area).toScene(p.lat,p.lng)),10,levelTags)!.totalHeight:NaN,1e-8,'hip angle: collector height metadata includes geometry-derived rise once');
  }finally{globalThis.fetch=previous;}
}
