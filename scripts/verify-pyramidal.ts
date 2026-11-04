import * as THREE from "three";
import DxfParser, { type I3DfaceEntity } from "dxf-parser";
import { buildingDimensions, buildBuildingSurfaces, buildingSurfaceGeometry, resolveBuildingProfile } from "../src/utils/builders/buildingBuilder";
import { signedPlanArea, pointInRing, type PlanPoint } from "../src/utils/builders/footprint";
import { mapBuildingShape, mapBuildingGeometry } from "../src/three/mapBuildingGeometry";
import { buildBuildingsGeometry } from "../src/three/orthoGeometry";
import { createProjection } from "../src/utils/projection";
import { parseOsmBuildings } from "../src/utils/osmBuildings";
import { fetchBuildingElements, fetchBuildings, type CellProgress } from "../src/utils/sceneData";
import { objectToDxf } from "../src/utils/dxf";

export async function verifyPyramidal(ok: (condition: boolean, label: string) => void,
  close: (actual: number, expected: number, tolerance: number, label: string) => void) {
  console.log("\n[Pyramidal] source centroid, bounded fan, explicit fallback and CAD");
  const rectangle = [{x:-20,z:-10},{x:20,z:-10},{x:20,z:10},{x:-20,z:10}];
  const trapezoid = [{x:0,z:0},{x:20,z:0},{x:12,z:10},{x:0,z:10}];
  const concave = [{x:0,z:0},{x:20,z:0},{x:20,z:5},{x:5,z:5},{x:5,z:20},{x:0,z:20}];
  const hole = [{x:-4,z:-3},{x:4,z:-3},{x:4,z:3},{x:-4,z:3}];
  const tags = { building:"yes", height:"15", "roof:shape":"pyramidal", "roof:height":"3", min_height:"5" };
  close(buildingDimensions(tags).roofHeight,3,0,"explicit pyramidal rise is distinct from total roof-inclusive height");
  close(buildingDimensions({...tags,"roof:height":"10 ft"}).roofHeight,3.048,1e-9,"pyramidal rise preserves explicit feet");
  close(buildingDimensions({...tags,"roof:height":undefined,"roof:levels":"2"}).roofHeight,4.4,1e-9,"roof levels use existing map3d storey estimate, not an upstream standard");
  close(buildingDimensions({"building:levels":"5","roof:shape":"pyramidal","roof:height":"3"}).totalHeight,14,1e-9,"level-derived total includes pyramidal rise exactly once");
  close(buildingDimensions({...tags,height:"4","roof:height":"100"}).roofHeight,2,0,"existing roof clamp and minimum facade are retained");
  for (const ring of [rectangle,trapezoid]) for (const reverse of [false,true]) for (const rotation of [0,.7]) {
    const plan = (reverse?[...ring].reverse():ring).map(p=>({x:p.x*Math.cos(rotation)-p.z*Math.sin(rotation)+1000,z:p.x*Math.sin(rotation)+p.z*Math.cos(rotation)-500}));
    const before = JSON.stringify(plan), profile = resolveBuildingProfile(plan,10,tags)!;
    const built = buildBuildingSurfaces(plan,7,10,tags), geometry = buildingSurfaceGeometry(built,plan);
    const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
    ok(!!profile.pyramidApex && !profile.flatPyramidalRoof && built.roofs.length===plan.length*9 && built.walls.length===plan.length*18,
      `${ring===rectangle?'rectangle':'trapezoid'}/${reverse}/${rotation}: one fan face per edge and eaves-only walls, no central gabled ridge`);
    let area=0,inside=true;
    for(let i=0;i<built.roofs.length;i+=9){
      const [a,b,c]=[0,3,6].map(j=>({x:built.roofs[i+j],z:built.roofs[i+j+2]}));
      area+=Math.abs(signedPlanArea([a,b,c]));
      inside&&=pointInRing({x:(a.x+b.x+c.x)/3,z:(a.z+b.z+c.z)/3},plan);
    }
    close(area,Math.abs(signedPlanArea(plan)),1e-7,"fan net area covers exactly the source footprint, no overlapping/outside roof triangles");
    ok(inside && Array.from({length:built.roofs.length/3},(_,i)=>normals.getY(i)).every(y=>y>0&&y<1) && JSON.stringify(plan)===before,
      "actual roof normals face up; triangles stay inside; inputs are unchanged");
    geometry.computeBoundingBox();
    close(geometry.boundingBox!.min.y,12,1e-5,"raised walls/map cap remain ground7+min_height5");
    close(geometry.boundingBox!.max.y,22,1e-5,"apex remains ground7+total15, not total plus clearance or roof rise");
    const apex = profile.pyramidApex!;
    close(profile.roofY(apex),15,1e-8,"shared profile evaluates total height at the centroid apex");
    close(profile.roofY({x:(apex.x+plan[0].x)/2,z:(apex.z+plan[0].z)/2}),13.5,1e-8,"shared heightfield interpolates halfway along an apex-to-vertex segment");
    ok(Array.from({length:built.walls.length/3},(_,i)=>built.walls[i*3+1]).every(y=>y===12||y===19),"walls terminate uniformly at eaves, never fill up to the apex");
    const mesh = new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());mesh.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(apex.x,40,apex.z),new THREE.Vector3(0,-1,0));
    close(ray.intersectObject(mesh)[0]?.point.y??NaN,22,.002,"actual mesh downward ray hits the apex, not a flat fallback");
    geometry.dispose();(mesh.material as THREE.Material).dispose();
    ok(positions.count>0,"generated roof/wall/cap mesh remains populated after all winding combinations");
  }
  const translated = trapezoid.map(p=>({x:p.x+1e8,z:p.z-1e8}));
  const translatedProfile=resolveBuildingProfile(translated,10,tags)!;
  close(translatedProfile.pyramidApex!.x-1e8,49/6,1e-7,"origin-relative centroid remains stable at large local offsets");
  close(translatedProfile.pyramidApex!.z+1e8,55/12,1e-7,"large offsets do not shift centroid from cancellation");
  const collinear=[rectangle[0],{x:0,z:-10},...rectangle.slice(1)];
  const collinearProfile=resolveBuildingProfile(collinear,10,tags)!;
  ok(!!collinearProfile.pyramidApex&&!collinearProfile.flatPyramidalRoof&&buildBuildingSurfaces(collinear,0,10,tags).roofs.length===45,
    "valid collinear boundary vertex retains a finite five-triangle fan without discarding source geometry");
  for(const reverseOuter of [false,true])for(const reverseHole of [false,true]){
    const ring=reverseOuter?[...rectangle].reverse():rectangle,h=reverseHole?[...hole].reverse():hole;
    const profile=resolveBuildingProfile(ring,10,tags,[h])!,built=buildBuildingSurfaces(ring,0,10,tags,[h]);
    let area=0;for(let i=0;i<built.roofs.length;i+=9)area+=Math.abs(signedPlanArea([0,3,6].map(j=>({x:built.roofs[i+j],z:built.roofs[i+j+2]}))));
    ok(profile.flatPyramidalRoof&&Math.abs(area-752)<1e-7&&built.roofs.every((v,i)=>i%3!==1||v===15),
      `fallback winding${reverseOuter}/${reverseHole}: exact hole net area and total-height flat plane`);
  }
  const asymmetric = resolveBuildingProfile(trapezoid,10,tags)!;
  close(asymmetric.pyramidApex!.x,49/6,1e-9,"source area-centroid formula on asymmetric trapezoid, not vertex mean8/bbox10");
  close(asymmetric.pyramidApex!.z,55/12,1e-9,"asymmetric apex Z follows polygon area centroid");
  const plain = buildBuildingSurfaces(rectangle,0,10,tags);
  const irrelevant = buildBuildingSurfaces(rectangle,0,10,{...tags,"roof:direction":"NE","roof:orientation":"across"});
  ok(JSON.stringify(plain)===JSON.stringify(irrelevant),"pyramidal roof is not rotated into a directional gable/skillion by irrelevant direction tags");
  for (const [label,plan,holes,t] of [
    ["concave",concave,[],tags], ["courtyard",rectangle,[hole],tags],
    ["missing-rise",rectangle,[],{...tags,"roof:height":undefined}],
    ["angle-only",rectangle,[],{...tags,"roof:height":undefined,"roof:angle":"45"}],
    ["bad-rise",rectangle,[],{...tags,"roof:height":"bad"}],
    ["overflow-levels",rectangle,[],{...tags,"roof:height":undefined,"roof:levels":"9".repeat(400)}],
  ] as [string,PlanPoint[],PlanPoint[][],typeof tags][]) {
    const profile=resolveBuildingProfile(plan,10,t,holes)!,built=buildBuildingSurfaces(plan,0,10,t,holes);
    ok(profile.flatPyramidalRoof && !profile.pyramidApex && built.roofs.every((v,i)=>i%3!==1||v===15),`${label}: unsupported pyramid is explicitly flat at total height, not an outside fan or guessed angle`);
    if(holes.length){
      const geo=buildingSurfaceGeometry(built,plan),m=new THREE.Mesh(geo,new THREE.MeshBasicMaterial());m.updateMatrixWorld(true);
      ok(new THREE.Raycaster(new THREE.Vector3(0,30,0),new THREE.Vector3(0,-1,0)).intersectObject(m).length===0,"pyramidal fallback preserves courtyard through both roof and bottom cap");
      geo.dispose();(m.material as THREE.Material).dispose();
    }
  }
  for(const t of [{...tags,"roof:height":"0"},{...tags,"roof:height":"0 ft"},{...tags,"roof:height":undefined,"roof:levels":"0"}]){
    const profile=resolveBuildingProfile(concave,10,t)!;
    ok(!profile.flatPyramidalRoof && profile.roofHeight===0,"intentional zero rise stays flat without a false unsupported-pyramid warning");
  }
  ok(resolveBuildingProfile(rectangle,10,{...tags,min_height:"13"})===null,"min_height above pyramid eaves is rejected, not repaired into intersecting roof volume");
  close(resolveBuildingProfile(rectangle,10,{...tags,min_height:undefined,"building:levels":"5","building:min_level":"2"})!.minHeightM,4.8,1e-9,"pyramidal level offset uses facade height excluding roof rise");

  const projection=createProjection([{lat:22.3,lng:114.16},{lat:22.31,lng:114.17}]);
  const geo=(r:PlanPoint[])=>r.map(p=>projection.toLatLng(p.x,p.z));
  const osm=(r:PlanPoint[])=>{const ps=geo(r).map(p=>({lat:p.lat,lon:p.lng}));return [...ps,ps[0]];};
  const project=(p:{lat:number;lng:number})=>projection.toScene(p.lat,p.lng);
  const way={type:"way",id:701,tags,geometry:osm(rectangle)};
  const courtyard={type:"relation",id:702,tags:{...tags,type:"multipolygon"},members:[{type:"way",ref:710,role:"outer",geometry:osm(rectangle)},{type:"way",ref:711,role:"inner",geometry:osm(hole)}]};
  const parsed=parseOsmBuildings([way,courtyard],project);
  ok(parsed.buildings.length===2&&!parsed.issues.length&&!parsed.buildings[0].flatPyramidalRoof&&parsed.buildings[1].flatPyramidalRoof===true,"actual parser distinguishes supported roof vs hole-aware flat fallback without rejecting valid footprint");
  const raw=parsed.buildings[0],merged=buildBuildingsGeometry([{id:raw.id,tags:raw.tags,ring:raw.geometry,holes:[],heightM:15}],projection,()=>0);
  const factor=111320/51000,shape=mapBuildingShape(raw,(lat,lng)=>{const p=project({lat,lng});return new THREE.Vector2(p.x/factor,-p.z/factor);});
  const map=new THREE.Mesh(mapBuildingGeometry(shape,51000,15,tags));map.userData.dxfHorizontalScale=factor;
  for(const [name,obj] of [["map",map],["UTM",new THREE.Mesh(merged.roofs!)]] as const){
    const dxf=new DxfParser().parseSync(objectToDxf(obj))!,faces=dxf.entities as I3DfaceEntity[];
    const roofs=faces.filter(f=>{const[a,b,c]=f.vertices;return(b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y)>1e-5;});
    ok(dxf.header.$ACADVER==="AC1024"&&dxf.header.$INSUNITS===6&&roofs.length===4,`${name}: independent CAD reader confirms metric R2010 four-sided pyramid, not two gabled planes`);
    ok(roofs.every(f=>f.vertices.slice(0,3).filter(p=>Math.abs(p.z-15)<1e-4).length===1&&f.vertices.slice(0,3).filter(p=>Math.abs(p.z-12)<1e-4).length===2),`${name}: each CAD roof triangle has one top/apex and two eaves vertices`);
    obj.geometry.dispose();(obj.material as THREE.Material).dispose();
  }
  merged.walls!.dispose();
  const originalFetch=globalThis.fetch,progress:CellProgress[]=[];
  globalThis.fetch=async()=>new Response(JSON.stringify({elements:[way,courtyard]}),{headers:{"content-type":"application/json"}});
  try{
    const area:[{lat:number;lng:number},{lat:number;lng:number}]=[{lat:22.305678,lng:114.165678},{lat:22.306678,lng:114.166678}];
    const scene=await fetchBuildings(area,(_,p)=>progress.push(p)),legacy=await fetchBuildingElements(area,(_,p)=>progress.push(p));
    ok(scene.length===2&&legacy.length===2&&progress.length>=2&&progress.every(p=>p.flatPyramidalRoofs===1&&p.flatSkillionRoofs===0&&p.skippedBuildings===0),"both actual collectors/cache publish pyramidal fallback count separately from skipped objects and skillion warnings");
  }finally{globalThis.fetch=originalFetch;}
}
