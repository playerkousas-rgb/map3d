import * as THREE from "three";

/** Object3D hierarchy visibility, not camera/frustum/material/occlusion filtering. */
export function isEffectivelyVisible(object: THREE.Object3D): boolean {
  for (let at: THREE.Object3D | null = object; at; at = at.parent) {
    if (!at.visible) return false;
  }
  return true;
}

/**
 * Detach a visible hierarchy at its current world transform. Prune hidden
 * descendants, because OBJ/STL do not implement GLTFExporter's onlyVisible.
 * Geometry/materials remain shared: never dispose them through this snapshot.
 */
export function visibleExportSnapshot(object: THREE.Object3D): THREE.Object3D {
  if (!isEffectivelyVisible(object)) return new THREE.Group();
  object.updateWorldMatrix(true, true);
  const copyVisible = (source: THREE.Object3D): THREE.Object3D => {
    const copy = source.clone(false);
    for (const child of source.children) {
      if (child.visible) copy.add(copyVisible(child));
    }
    return copy;
  };
  const snapshot = copyVisible(object);
  snapshot.matrix.copy(object.matrixWorld);
  snapshot.matrixAutoUpdate = false;
  snapshot.updateMatrixWorld(true);
  return snapshot;
}
