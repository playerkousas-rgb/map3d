/**
 * 3D model export service (merged from building3d)
 *
 * - GLTFExporter: glTF 2.0 / GLB (modern WebGL standard)
 * - OBJExporter:  Wavefront OBJ (universal)
 * - STLExporter:  STL (3D printing standard)
 */

import * as THREE from "three";
import { isEffectivelyVisible, visibleExportSnapshot } from "./exportVisibility";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";
import { STLExporter } from "three/addons/exporters/STLExporter.js";

export type ExportFormat = "glb" | "gltf" | "obj" | "stl" | "dxf";

/**
 * Collect enabled Object3D hierarchies marked with userData.exportable === true
 * into a fresh group ready for export.
 */
export function collectExportGroup(scene: THREE.Scene): THREE.Group {
  const root = new THREE.Group();
  if (!isEffectivelyVisible(scene)) return root;
  scene.updateWorldMatrix(true, true);
  scene.traverseVisible((child) => {
    if (child.userData?.exportable !== true) return;
    // An exported group already carries its descendants. Do not export them twice.
    for (let parent = child === scene ? null : child.parent; parent; parent = parent.parent) {
      if (parent.userData?.exportable === true) return;
      if (parent === scene) break;
    }
    root.add(visibleExportSnapshot(child));
  });
  root.updateMatrixWorld(true);
  return root;
}

export function downloadBlob(blob: Blob, filename: string) {
  const link = document.createElement("a");
  link.style.display = "none";
  document.body.appendChild(link);
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  // Safari may not consume the blob until after this click's event turn.
  const url = link.href;
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  document.body.removeChild(link);
}

export async function exportObject(
  object: THREE.Object3D,
  format: ExportFormat,
  filename = "map3d"
): Promise<void> {
  // All encoders see the same detached, pruned hierarchy, including direct
  // callers that did not go through collectExportGroup. Do not mutate the scene.
  object = visibleExportSnapshot(object);
  let meshes = 0;
  object.traverse(child => {
    if (child instanceof THREE.Mesh && child.geometry.getAttribute("position")?.count >= 3) meshes++;
  });
  if (!meshes) throw new Error("There is no model to export");
  switch (format) {
    case "dxf": {
      const { objectToDxf } = await import("./dxf");
      downloadBlob(new Blob([objectToDxf(object)], { type: "application/dxf" }), `${filename}.dxf`);
      return;
    }
    case "glb":
    case "gltf": {
      const exporter = new GLTFExporter();
      const binary = format === "glb";
      const result = await exporter.parseAsync(object, {
        binary,
        embedImages: true,
      });
      if (result instanceof ArrayBuffer) {
        downloadBlob(
          new Blob([result], { type: "model/gltf-binary" }),
          `${filename}.glb`
        );
      } else {
        downloadBlob(
          new Blob([JSON.stringify(result, null, 2)], {
            type: "model/gltf+json",
          }),
          `${filename}.gltf`
        );
      }
      return;
    }
    case "obj": {
      const exporter = new OBJExporter();
      const result = exporter.parse(object);
      downloadBlob(new Blob([result], { type: "text/plain" }), `${filename}.obj`);
      return;
    }
    case "stl": {
      const exporter = new STLExporter();
      const result = exporter.parse(object, { binary: true });
      downloadBlob(
        new Blob([result as unknown as BlobPart], {
          type: "application/octet-stream",
        }),
        `${filename}.stl`
      );
      return;
    }
  }
}
