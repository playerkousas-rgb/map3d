import * as THREE from 'three';
import { modelBounds, modelCameraFrame, applyModelCamera } from '../src/utils/modelCamera';
import { collectExportGroup } from '../src/utils/exporters';

type Check = (condition: boolean, label: string) => void;
export function verifyModelCamera(check: Check) {
  const boxes = [
    new THREE.Box3(new THREE.Vector3(-900, -2, -20), new THREE.Vector3(900, 180, 20)),
    new THREE.Box3(new THREE.Vector3(100, -10, 500), new THREE.Vector3(110, 400, 510)),
    new THREE.Box3(new THREE.Vector3(-80, 0, -50), new THREE.Vector3(80, 25, 50)),
    new THREE.Box3(new THREE.Vector3(5, 6, 7), new THREE.Vector3(5, 6, 7)),
  ];
  for (const [index, box] of boxes.entries()) for (const aspect of [320 / 900, 768 / 900, 1440 / 390]) for (const top of [false, true]) {
    const original = box.clone(), frame = modelCameraFrame(box, 55, aspect, top)!;
    const camera = new THREE.PerspectiveCamera(55, aspect, frame.near, frame.far);
    camera.position.copy(frame.position); camera.lookAt(frame.center); camera.updateMatrixWorld(true);
    const corners: THREE.Vector3[] = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x,y,z).project(camera));
    check(corners.every(p => [p.x,p.y,p.z].every(Number.isFinite) && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && p.z > -1 && p.z < 1), `model frame ${index}/${aspect}/${top}: all eight actual corners lie inside BOTH FOVs and clipping planes`);
    check(box.equals(original), `model frame ${index}/${aspect}/${top}: input bounds unchanged`);
  }
  for (const [box, fov, aspect] of [
    [new THREE.Box3(),55,1], [boxes[0],0,1], [boxes[0],180,1], [boxes[0],NaN,1], [boxes[0],55,0], [boxes[0],55,-1], [boxes[0],55,Infinity],
    [new THREE.Box3(new THREE.Vector3(NaN,0,0),new THREE.Vector3(1,1,1)),55,1],
  ] as const) check(modelCameraFrame(box,fov,aspect) === undefined,'invalid/empty model camera input is rejected, never a NaN pose');

  const scene = new THREE.Scene(); scene.position.set(100,0,0);
  const group = new THREE.Group(); group.userData.exportable = true; group.position.x = -5;
  const child = new THREE.Mesh(new THREE.BoxGeometry(2,2,2)); child.position.set(2,3,4); group.add(child); scene.add(group);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2,2,2)); mesh.position.x = 10; mesh.userData.exportable = true; scene.add(mesh);
  const sky = new THREE.Mesh(new THREE.BoxGeometry(1e6,1e6,1e6)); scene.add(sky);
  const hidden = mesh.clone(); hidden.position.x = -1e6; hidden.visible = false; scene.add(hidden);
  const hiddenParent = new THREE.Group(); hiddenParent.visible = false; hiddenParent.add(mesh.clone()); scene.add(hiddenParent);
  const bounds = modelBounds(scene);
  check(bounds.min.equals(new THREE.Vector3(96,-1,-1)) && bounds.max.equals(new THREE.Vector3(111,4,5)), 'camera frames visible marked hierarchies in world coordinates, excluding sky and hidden ancestors');
  let recomputed = 0;
  const computeBox = child.geometry.computeBoundingBox;
  child.geometry.computeBoundingBox = () => { recomputed++; computeBox.call(child.geometry); };
  for (let i=0;i<10;i++)modelBounds(scene);
  check(recomputed===0,'repeated view commands reuse immutable builder bounding boxes, not rescan every vertex');
  const exportBefore = new THREE.Box3().setFromObject(collectExportGroup(scene));
  const vertices = Array.from(child.geometry.getAttribute('position').array);
  const camera = new THREE.PerspectiveCamera(55,1); camera.zoom = 3;
  let pending = true, updates = 0;
  const orbit = { target:new THREE.Vector3(999,0,0),enableDamping:true,minDistance:0,maxDistance:Infinity,
    update:()=>{ updates++; if(pending){ camera.position.x += 999; pending=false; } } };
  applyModelCamera(camera,orbit,bounds,1,'reset');
  const reset = camera.position.clone(), frame = modelCameraFrame(bounds,55,1)!;
  check(reset.distanceTo(frame.position)<1e-9 && orbit.target.equals(frame.center) && camera.zoom===1, 'fit clears pending pan/damping before restoring the complete-model centre/pose/zoom');
  check(updates===2 && orbit.enableDamping && orbit.maxDistance===frame.distance*20 && orbit.minDistance===frame.distance*.02,'fit retains damping and bounded native orbit distances');
  for (const kind of ['zoomIn','zoomIn','zoomOut','top','reset','reset'] as const) {
    const previous = camera.position.distanceTo(orbit.target);
    applyModelCamera(camera,orbit,bounds,1,kind);
    check(kind==='zoomIn' ? camera.position.distanceTo(orbit.target)<previous : kind==='zoomOut' ? camera.position.distanceTo(orbit.target)>previous : kind==='top' ? camera.position.y>orbit.target.y && Math.abs(camera.position.x-orbit.target.x)<1e-9 : camera.position.distanceTo(reset)<1e-9,`camera ${kind}: repeated commands act without mutating model`);
  }
  for(let i=0;i<100;i++)applyModelCamera(camera,orbit,bounds,1,'zoomIn');
  check(Math.abs(camera.position.distanceTo(orbit.target)-frame.distance*.02)<1e-9,'repeated zoom-in cannot pass the native minimum');
  for(let i=0;i<100;i++)applyModelCamera(camera,orbit,bounds,1,'zoomOut');
  check(Math.abs(camera.position.distanceTo(orbit.target)-frame.distance*20)<1e-7,'repeated zoom-out remains within a finite far-plane-safe maximum');
  const exportAfter = new THREE.Box3().setFromObject(collectExportGroup(scene));
  check(exportBefore.equals(exportAfter) && vertices.every((value,index)=>value===child.geometry.getAttribute('position').array[index]), 'camera operations leave world export bounds, geometry vertices and model transforms unchanged');
  const beforeInvalid = camera.position.clone();applyModelCamera(camera,orbit,new THREE.Box3(),1,'reset');
  check(camera.position.equals(beforeInvalid),'invalid/empty model leaves the last usable camera untouched');
  for(const object of [child,mesh,sky])object.geometry.dispose();
}
