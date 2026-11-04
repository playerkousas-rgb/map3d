/** Browser-only synthetic fixture. Never imported by application/build entrypoints. */
import * as THREE from "three";
import { collectExportGroup, exportObject, type ExportFormat } from "../src/utils/exporters";

export async function exportVisibilityFixture(format: ExportFormat, collect: boolean) {
  const scene = new THREE.Scene(), ancestor = new THREE.Group(), root = new THREE.Group();
  ancestor.position.x = 10; root.position.x = 3; root.userData.exportable = true;
  const geometry = new THREE.BoxGeometry(2, 2, 2), material = new THREE.MeshStandardMaterial();
  const make = (name: string, x: number) => { const m = new THREE.Mesh(geometry, material); m.name = name; m.position.x = x; m.userData.exportable = true; return m; };
  const visible = make("visible", 2), hidden = make("hidden", 100), hiddenParent = new THREE.Group();
  hidden.visible = false; hiddenParent.visible = false; hiddenParent.add(make("hidden-child", 200));
  root.add(visible, hidden, hiddenParent); ancestor.add(root); scene.add(ancestor);
  const helper = make("unmarked-helper", 300); helper.userData.exportable = false; scene.add(helper);
  try {
    const pending = exportObject(collect ? collectExportGroup(scene) : root, format, `visibility-${collect ? 'collected' : 'direct'}`);
    // Async glTF/DXF imports must not let later hierarchy changes leak into this export.
    visible.visible = false; hidden.visible = true; ancestor.position.x = 1000;
    await pending;
  } finally { geometry.dispose(); material.dispose(); }
}
