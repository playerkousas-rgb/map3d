import * as THREE from 'three';
import DxfParser,{type I3DfaceEntity} from 'dxf-parser';
import {buildingDimensions,buildBuildingSurfaces,resolveBuildingProfile,needsSkillionDirectionFallback} from '../src/utils/builders/buildingBuilder';
import {createProjection} from '../src/utils/projection';
import {mapBuildingShape,mapBuildingGeometry} from '../src/three/mapBuildingGeometry';
import {buildBuildingsGeometry} from '../src/three/orthoGeometry';
import {parseOsmBuildings} from '../src/utils/osmBuildings';
import {fetchBuildings,fetchBuildingElements,type CellProgress} from '../src/utils/sceneData';
import {objectToDxf} from '../src/utils/dxf';

export async function verifyZeroRoofLevels(ok:(condition:boolean,label:string)=>void,close:(actual:number,expected:number,tolerance:number,label:string)=>void){
  const outer=[{x:-10,z:-5},{x:10,z:-5},{x:10,z:5},{x:-10,z:5}],hole=outer.map(p=>({x:p.x/4,z:p.z/4}));
  const area=(values:ArrayLike<number>)=>{let sum=0;for(let i=0;i<values.length;i+=9)sum+=Math.abs((values[i+3]-values[i])*(values[i+8]-values[i+2])-(values[i+6]-values[i])*(values[i+5]-values[i+2]))/2;return sum;};
  for(const shape of ['gabled','skillion']){
    for(const zero of ['0','0.0','000',' 0 '])for(const angle of [undefined,'45']){
      const tags={'roof:shape':shape,'roof:levels':zero,'roof:angle':angle,height:'15'};
      const dimensions=buildingDimensions(tags),built=buildBuildingSurfaces(outer,7,10,tags,[hole]);
      ok(dimensions.roofHeight===0&&dimensions.eavesHeight===15,`zero roof ${shape}/${JSON.stringify(zero)}/${angle}: zero levels never fall through to angle/default`);
      ok(built.roofHeight===0&&built.roofs.length>0&&built.roofs.every((n,i)=>i%3!==1||n===22),`zero roof ${shape}/${JSON.stringify(zero)}/${angle}: actual hole-aware surface stays flat at total+base`);
      ok(!needsSkillionDirectionFallback(tags),`zero roof ${shape}/${JSON.stringify(zero)}/${angle}: no false missing-direction warning for deliberate flat`);
    }
    const tags={building:'yes','roof:shape':shape,'roof:levels':'0','roof:angle':'45','building:levels':'5','building:min_level':'2'};
    const p=resolveBuildingProfile(outer,10,tags)!;
    close(buildingDimensions(tags).totalHeight,11,1e-9,`zero roof ${shape}: building levels do not acquire a fictitious roof storey`);
    close(p?.minHeightM??NaN,4.4,1e-9,`zero roof ${shape}: min_level still uses actual facade ratio`);
    const highBottom=resolveBuildingProfile(outer,10,{...tags,height:'15',min_height:'14'})!;
    ok(!!highBottom&&highBottom.eavesHeight===15&&highBottom.minHeightM===14,`zero roof ${shape}: valid high undercroft is no longer rejected by invented eaves`);
    ok(resolveBuildingProfile(outer,10,{...tags,height:'15',min_height:'15'})===null,`zero roof ${shape}: equal-to-total bottom remains invalid`);
    close(buildingDimensions({...tags,'roof:height':'3'}).roofHeight,3,0,`zero roof ${shape}: explicit positive roof height still wins over zero levels`);
    close(buildingDimensions({...tags,'roof:levels':'2','roof:height':'0'}).roofHeight,0,0,`zero roof ${shape}: explicit zero height still wins over positive levels`);
    close(buildingDimensions({...tags,'roof:height':'bad'}).roofHeight,0,0,`zero roof ${shape}: malformed height may use valid zero levels`);
    for(const levels of [undefined,'','bad','0x0','0;1','-1']){
      const actual=buildingDimensions({'roof:shape':shape,'roof:levels':levels},30,12).roofHeight;
      close(actual,3,0,`zero roof ${shape}/${JSON.stringify(levels)}: absent/malformed levels preserve old default, not false deliberate zero`);
    }
    close(buildingDimensions({'roof:shape':shape,'roof:levels':'999',height:'400'}).roofHeight,398,0,`zero roof ${shape}: existing capped large-level estimate and facade clamp unchanged`);
    const surfaces=buildBuildingSurfaces(outer,0,15,{...tags,height:'15'},[hole]);
    close(area(surfaces.roofs),187.5,1e-8,`zero roof ${shape}: courtyard net area remains open`);
  }
  const projection=createProjection([{lat:22.611,lng:114.181},{lat:22.613,lng:114.183}]);
  const geo=(ring:typeof outer)=>ring.map(p=>{const q=projection.toLatLng(p.x,p.z);return{lat:q.lat,lon:q.lng};});
  const source=['gabled','skillion'].map((shape,i)=>({type:'way',id:8050+i,tags:{building:'yes','roof:shape':shape,'roof:levels':'0','roof:angle':'45','building:levels':'5',min_height:'9',...(i===0?{height:'11'}:{})},geometry:[...geo(outer),geo(outer)[0]]}));
  const parsed=parseOsmBuildings(source,p=>projection.toScene(p.lat,p.lng));
  ok(parsed.buildings.length===2&&!parsed.issues.length,'zero roof: actual OSM parser retains high-bottom components without fictitious eaves/rise');
  for(const raw of parsed.buildings){
    const tags=raw.tags,factor=111320/51000,shape=mapBuildingShape(raw,(lat,lng)=>{const p=projection.toScene(lat,lng);return new THREE.Vector2(p.x/factor,-p.z/factor);});
    const map=new THREE.Mesh(mapBuildingGeometry(shape,51000,11,tags));map.userData.dxfHorizontalScale=factor;
    const merged=buildBuildingsGeometry([{id:raw.id,ring:raw.geometry,holes:raw.holes,heightM:11,tags}],projection,()=>0),group=new THREE.Group();group.add(new THREE.Mesh(merged.roofs!),new THREE.Mesh(merged.walls!));
    for(const [mode,obj] of [['map',map],['UTM',group]] as const){
      const cad=new DxfParser().parseSync(objectToDxf(obj))!,faces=(cad.entities as I3DfaceEntity[]).map(e=>e.vertices.slice(0,3)),up=faces.filter(([a,b,c])=>(b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y)>1e-5);
      ok(cad.header.$INSUNITS===6&&cad.header.$ACADVER==='AC1024'&&up.length===2,`zero roof ${tags['roof:shape']}/${mode}: real adapter/writer/DXF parser reads two metric flat roof triangles`);
      ok(up.every(face=>face.every(p=>Math.abs(p.z-11)<1e-5)),`zero roof ${tags['roof:shape']}/${mode}: CAD has no angle/default ridge above facade or slope below roof`);
      close(Math.min(...faces.flat().map(p=>p.z)),9,1e-5,`zero roof ${tags['roof:shape']}/${mode}: CAD retains valid9m undercroft beneath11m total`);
    }
    map.geometry.dispose();(map.material as THREE.Material).dispose();merged.roofs!.dispose();merged.walls!.dispose();
  }
  const previous=globalThis.fetch,progress:CellProgress[]=[];globalThis.fetch=async()=>new Response(JSON.stringify({elements:source}));
  try{
    const area:[{lat:number;lng:number},{lat:number;lng:number}]=[{lat:22.6111,lng:114.1811},{lat:22.6121,lng:114.1821}];
    const scene=await fetchBuildings(area,(_,p)=>progress.push(p)),legacy=await fetchBuildingElements(area,(_,p)=>progress.push(p));
    ok(scene.length===2&&legacy.length===2&&scene.every(b=>b.heightM===11),'zero roof: both actual collectors preserve correct facade-only total height');
    ok(progress.length>1&&progress.every(p=>p.skippedBuildings===0&&p.flatSkillionRoofs===0),'zero roof: actual collectors/cache do not publish false skip or missing-direction counts');
    ok(legacy.every(b=>b.tags['roof:levels']==='0'&&b.tags['roof:angle']==='45'),'zero roof: source tags remain unchanged rather than rewritten to hide the bug');
  }finally{globalThis.fetch=previous;}
}
