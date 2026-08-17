/**
 * 3D model export service (merged from building3d)
 *
 * - GLTFExporter: glTF 2.0 / GLB (modern WebGL standard)
 * - OBJExporter:  Wavefront OBJ (universal)
 * - STLExporter:  STL (3D printing standard)
 */

import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";
import { STLExporter } from "three/addons/exporters/STLExporter.js";

export type ExportFormat = "glb" | "gltf" | "obj" | "stl";

/**
 * Collect every object marked with userData.exportable === true
 * into a fresh group ready for export.
 */
export function collectExportGroup(scene: THREE.Scene): THREE.Group {
  const root = new THREE.Group();
  scene.traverse((child) => {
    if (child.userData?.exportable === true) {
      root.add(child.clone(true));
    }
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
  URL.revokeObjectURL(link.href);
  document.body.removeChild(link);
}

export async function exportObject(
  object: THREE.Object3D,
  format: ExportFormat,
  filename = "map3d"
): Promise<void> {
  switch (format) {
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
