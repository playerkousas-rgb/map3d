/** Independent CAD gate inputs: real application adapters/encoder, no DXF fixtures vendored. */
import * as THREE from 'three';
import fs from 'node:fs/promises';
import path from 'node:path';
import {objectToDxf} from '../src/utils/dxf';
import {buildBuildingSurfaces, buildingSurfaceGeometry} from '../src/utils/builders/buildingBuilder';
import {mapBuildingShape, mapBuildingGeometry} from '../src/three/mapBuildingGeometry';
import {buildBuildingsGeometry} from '../src/three/orthoGeometry';
import {createProjection} from '../src/utils/projection';

const output=process.argv[2];
if(!output)throw new Error('CAD fixture output directory required');
await fs.mkdir(output,{recursive:true});
type Expect={faces?:number;bounds?:number[][];span?:number[];zBounds?:number[];vertices?:number[][];roofArea?:number;roofFaces?:number;peak?:number;peaks?:number;eaves?:number;eavesNodes?:number};
const manifest:{file:string;expect:Expect}[]=[];
const save=async(name:string,object:THREE.Object3D,expect:Expect)=>{
  const file=`${name}.dxf`;await fs.writeFile(path.join(output,file),objectToDxf(object));manifest.push({file,expect});
};
const triangle=()=>new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,2,0,0,0,3,0],3));
const indexed=triangle();indexed.setIndex([0,1,2]);
await save('indexed',new THREE.Mesh(indexed),{faces:1,vertices:[[0,0,0],[2,0,0],[0,0,3]],bounds:[[0,0,0],[2,0,3]]});
const parent=new THREE.Group();parent.position.set(10,20,30);parent.scale.set(2,3,4);
const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,2,0,0,0,3,1],3));
const child=new THREE.Mesh(geometry);child.position.set(1,2,3);parent.add(child);
await save('nested-transforms',parent,{faces:1,vertices:[[12,-42,26],[16,-42,26],[12,-46,35]],bounds:[[12,-46,26],[16,-42,35]]});
const instances=new THREE.InstancedMesh(triangle(),new THREE.MeshBasicMaterial(),3);
for(let i=0;i<3;i++)instances.setMatrixAt(i,new THREE.Matrix4().makeTranslation(i*10,0,-5));
await save('instances',instances,{faces:3,bounds:[[0,5,0],[22,5,3]],vertices:[[0,5,0],[2,5,0],[0,5,3],[10,5,0],[12,5,0],[10,5,3],[20,5,0],[22,5,0],[20,5,3]]});
const miniature=new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,160,0,0,0,9,-20],3)));miniature.userData.dxfUnitScale=.001;
await save('miniature-mm-to-m',miniature,{faces:1,bounds:[[0,0,0],[.16,.02,.009]],vertices:[[0,0,0],[.16,0,0],[0,.02,.009]]});
const rectangle=[{x:-10,z:-5},{x:10,z:-5},{x:10,z:5},{x:-10,z:5}],hole=[{x:-2,z:-1},{x:2,z:-1},{x:2,z:1},{x:-2,z:1}];
const flat=buildBuildingSurfaces(rectangle,0,15,{height:'15',min_height:'3'},[hole]);
await save('raised-courtyard',new THREE.Mesh(buildingSurfaceGeometry(flat,rectangle)),{faces:32,bounds:[[-10,-5,3],[10,5,15]],roofArea:192});
const gabled=buildBuildingSurfaces(rectangle,0,12,{height:'12','roof:shape':'gabled','roof:height':'3',min_height:'2'});
await save('gabled',new THREE.Mesh(buildingSurfaceGeometry(gabled,rectangle)),{bounds:[[-10,-5,2],[10,5,12]],roofArea:200});
const pyramid=buildBuildingSurfaces(rectangle,0,12,{height:'12','roof:shape':'pyramidal','roof:height':'3',min_height:'2'});
await save('pyramidal',new THREE.Mesh(buildingSurfaceGeometry(pyramid,rectangle)),{faces:14,bounds:[[-10,-5,2],[10,5,12]],roofArea:200,roofFaces:4,peak:12,peaks:1});
const skillion=buildBuildingSurfaces(rectangle,0,15,{height:'15','roof:shape':'skillion','roof:height':'3','roof:direction':'E',min_height:'3'},[hole]);
await save('skillion-courtyard',new THREE.Mesh(buildingSurfaceGeometry(skillion,rectangle)),{bounds:[[-10,-5,3],[10,5,15]],roofArea:192});
const nodes=[{x:-20,z:-10},{x:-10,z:-10},{x:0,z:-10},{x:20,z:-10},{x:20,z:10},{x:0,z:10},{x:-10,z:10},{x:-20,z:10}];
const tags={height:'15','roof:shape':'hipped','roof:height':'3',min_height:'5'};
const projection=createProjection([{lat:22.3,lng:114.16},{lat:22.31,lng:114.17}]);
const ring=nodes.map(p=>projection.toLatLng(p.x,p.z)),factor=111320/51000;
const shape=mapBuildingShape({geometry:ring},(lat,lng)=>{const p=projection.toScene(lat,lng);return new THREE.Vector2(p.x/factor,-p.z/factor);});
const map=new THREE.Mesh(mapBuildingGeometry(shape,51000,15,tags));map.userData.dxfHorizontalScale=factor;
// Projection inverse/forward has a small common XY datum offset. Test spans
// and absolute vertical levels, not pretend its local origin is exact geodesy.
const hipExpect={span:[40,20,10],zBounds:[5,15],roofArea:800,roofFaces:10,peak:15,peaks:2,eaves:12,eavesNodes:8};
await save('hip-nodes-map',map,{...hipExpect,faces:36});
const merged=buildBuildingsGeometry([{id:1,tags,ring,heightM:15}],projection,()=>0),utm=new THREE.Group();utm.add(new THREE.Mesh(merged.walls!),new THREE.Mesh(merged.roofs!));
await save('hip-nodes-utm',utm,{...hipExpect,faces:26});
const angleTags={height:'30','roof:shape':'hipped','roof:angle':'45',min_height:'5'};
const angleHip=buildBuildingSurfaces(rectangle,0,30,angleTags);
await save('hip-angle',new THREE.Mesh(buildingSurfaceGeometry(angleHip,rectangle)),{
  faces:16,bounds:[[-10,-5,5],[10,5,30]],roofArea:200,roofFaces:6,peak:30,peaks:2,eaves:30-Math.hypot(10/3,5),eavesNodes:4
});
for(const shape of ['gabled','skillion']){
  const holes=shape==='skillion'?[hole]:[],zeroTags={height:'15',min_height:'3','roof:shape':shape,'roof:levels':'0','roof:angle':'45'};
  const flatZero=buildBuildingSurfaces(rectangle,0,15,zeroTags,holes);
  await save(`zero-level-${shape}`,new THREE.Mesh(buildingSurfaceGeometry(flatZero,rectangle)),{
    faces:holes.length?32:12,bounds:[[-10,-5,3],[10,5,15]],roofArea:holes.length?192:200,roofFaces:holes.length?8:2,peak:15,peaks:holes.length?8:4,eaves:15,eavesNodes:holes.length?8:4
  });
}
const visible=new THREE.Group(),hidden=new THREE.Mesh(new THREE.BoxGeometry(1000,1000,1000));hidden.visible=false;visible.add(new THREE.Mesh(triangle()),hidden);
await save('visibility',visible,{faces:1,bounds:[[0,0,0],[2,0,3]]});
const allHidden=new THREE.Group();allHidden.visible=false;allHidden.add(new THREE.Mesh(triangle()));
await save('hidden-only',allHidden,{faces:0});
const range=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([99,99,99,100,99,99,99,100,99,0,0,0,2,0,0,0,3,0],3));range.setDrawRange(3,3);
await save('draw-range',new THREE.Mesh(range),{faces:1,bounds:[[0,0,0],[2,0,3]]});
await save('consecutive-export',new THREE.Mesh(triangle()),{faces:1,bounds:[[0,0,0],[2,0,3]]});
await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify({schema:1,fixtures:manifest},null,2)+'\n');
console.log(`Generated ${manifest.length} application DXF fixtures in ${output}`);
