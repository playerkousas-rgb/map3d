import * as THREE from "three";
import DxfParser from "dxf-parser";
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";
import { STLExporter } from "three/addons/exporters/STLExporter.js";
import { collectExportGroup, exportObject } from "../src/utils/exporters";
import { isEffectivelyVisible, visibleExportSnapshot } from "../src/utils/exportVisibility";
import { objectToDxf } from "../src/utils/dxf";

export async function verifyExportVisibility(ok: (condition: boolean, label: string) => void,
  close: (actual: number, expected: number, tolerance: number, label: string) => void) {
  console.log("\n[Export visibility] one hierarchy policy for all mesh encoders");
  const geometry = new THREE.BoxGeometry(2, 2, 2), material = new THREE.MeshBasicMaterial();
  let disposals = 0;
  geometry.addEventListener("dispose", () => disposals++);
  const mesh = (name: string, exported = true) => {
    const m = new THREE.Mesh(geometry, material); m.name = name; m.userData.exportable = exported; return m;
  };
  const names = (root: THREE.Object3D) => { const result: string[] = []; root.traverse(child => { if (child instanceof THREE.Mesh) result.push(child.name); }); return result.sort().join(","); };
  const faceCount = (object: THREE.Object3D) => new DxfParser().parseSync(objectToDxf(object))!.entities.length;
  const scene = new THREE.Scene(), parent = new THREE.Group(), root = new THREE.Group();
  parent.position.set(10, 4, -6); parent.rotation.y = Math.PI / 2; parent.scale.set(2, 3, 4);
  root.position.set(3, 2, -1); root.userData.exportable = true;
  const kept = mesh("kept"), hidden = mesh("hidden"), concealed = new THREE.Group(), nested = mesh("nested");
  kept.position.set(2, 0, 1); hidden.visible = false; concealed.visible = false;
  concealed.add(nested); root.add(kept, hidden, concealed); parent.add(root); scene.add(parent);
  const helper = mesh("unmarked-helper", false); scene.add(helper);
  const sourceChildren = root.children.slice();
  const collected = collectExportGroup(scene);
  ok(collected.children.length === 1 && names(collected) === "kept", "exportable group deduplicates marked descendants and prunes own/ancestor-hidden meshes; unmarked helper stays out");
  const originalBox = new THREE.Box3().setFromObject(kept), copiedBox = new THREE.Box3().setFromObject(collected);
  close(copiedBox.min.distanceTo(originalBox.min), 0, 1e-8, "visibility pruning preserves nested world translation/rotation/nonuniform scale, minimum");
  close(copiedBox.max.distanceTo(originalBox.max), 0, 1e-8, "visibility pruning preserves nested world translation/rotation/nonuniform scale, maximum");
  ok(faceCount(collected) === 12 && faceCount(root) === 12, "both collected and direct DXF APIs omit hidden descendants, not just the glTF default");
  const copiedMesh = collected.getObjectByName("kept") as THREE.Mesh;
  ok(copiedMesh.geometry === geometry && copiedMesh.material === material && copiedMesh !== kept && kept.parent === root && root.children.every((c,i) => c === sourceChildren[i]) && disposals === 0,
    "snapshot detaches hierarchy without modifying, cloning or disposing shared scene geometry/materials");
  hidden.visible = true;
  ok(names(collected) === "kept" && names(collectExportGroup(scene)) === "hidden,kept", "a layer re-enabled later affects the next export, never mutates the previous hierarchy snapshot");
  parent.visible = false;
  ok(!collectExportGroup(scene).children.length && !names(visibleExportSnapshot(kept)) && !faceCount(kept), "hidden ancestor outside the directly exported root is respected by collector, direct snapshot and DXF");
  parent.visible = true; scene.visible = false;
  ok(!collectExportGroup(scene).children.length && !isEffectivelyVisible(kept), "hidden scene cannot leak meshes when descendants are individually visible");
  scene.visible = true;
  const outerParent = new THREE.Group(); outerParent.add(scene); outerParent.visible = false;
  ok(!collectExportGroup(scene).children.length, "visibility of an ancestor above the scene boundary is not discarded during collection");
  outerParent.visible = true;
  // All 32 combinations: scene → group → mesh, plus a sibling and a hidden subtree.
  for (let bits = 0; bits < 32; bits++) {
    const s = new THREE.Scene(), g = new THREE.Group(), a = mesh("a"), b = mesh("b"), c = mesh("c");
    s.visible = !!(bits & 1); g.visible = !!(bits & 2); a.visible = !!(bits & 4); b.visible = !!(bits & 8); c.visible = !!(bits & 16);
    g.userData.exportable = true; g.add(a, c); s.add(g, b);
    const expected = [s.visible && g.visible && a.visible ? "a" : "", s.visible && b.visible ? "b" : "", s.visible && g.visible && c.visible ? "c" : ""].filter(Boolean).sort().join(",");
    const result = collectExportGroup(s);
    ok(names(result) === expected && faceCount(result) === (expected ? expected.split(",").length * 12 : 0),
      `visibility flags${bits}: actual collector + CAD entities exactly match enabled hierarchy without duplicates`);
  }
  const entire = new THREE.Scene(); entire.userData.exportable = true;
  const deeper = new THREE.Group(); deeper.userData.exportable = true; deeper.add(mesh("once")); entire.add(deeper);
  ok(collectExportGroup(entire).children.length === 1 && faceCount(collectExportGroup(entire)) === 12, "exportable scene root also owns its descendants exactly once");
  const snapshot = visibleExportSnapshot(root);
  const obj = new OBJExporter().parse(snapshot);
  const stl = new STLExporter().parse(snapshot, { binary: true });
  ok((obj.match(/^f /gm)?.length ?? 0) === 24 && stl.getUint32(80, true) === 24, "OBJ and binary STL serialize the same two visible boxes, not the concealed third one");
  const invisible = mesh("none"); invisible.visible = false;
  for (const format of ["dxf", "obj", "stl", "gltf", "glb"] as const) {
    let rejected = false;
    try { await exportObject(invisible, format); } catch (error) { rejected = error instanceof Error && error.message === "There is no model to export"; }
    ok(rejected, `${format}: hidden-only input fails before touching browser download/encoder APIs instead of a false-success empty file`);
  }
  const noTriangles = new THREE.Group(); noTriangles.add(new THREE.Line(geometry, new THREE.LineBasicMaterial()));
  let rejected = false;
  try { await exportObject(noTriangles, "dxf"); } catch (error) { rejected = error instanceof Error && error.message === "There is no model to export"; }
  ok(rejected, "non-mesh decorations alone do not satisfy the existing model preflight");
  ok(disposals === 0, "rejection and hierarchy snapshots never dispose active scene resources");
  (noTriangles.children[0] as THREE.Line).material.dispose(); geometry.dispose(); material.dispose();
}
