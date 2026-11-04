import * as THREE from "three";

/** Fit a conservative world AABB sphere within BOTH perspective fields of view.
 * Three r173 Box3.getBoundingSphere uses half the diagonal; no guessed extent.
 * Does not mutate the box, camera, geometry or export transforms. */
export function modelCameraFrame(bounds: THREE.Box3, fov: number, aspect: number, top = false) {
  if (bounds.isEmpty() || ![...bounds.min, ...bounds.max, fov, aspect].every(Number.isFinite) ||
      fov <= 0 || fov >= 180 || aspect <= 0) return undefined;
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(sphere.radius, 0.01);
  const vertical = THREE.MathUtils.degToRad(fov);
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
  const distance = radius / Math.sin(Math.min(vertical, horizontal) / 2) * 1.15;
  if (!Number.isFinite(distance)) return undefined;
  const direction = top ? new THREE.Vector3(0, 1, 0.001) : new THREE.Vector3(1, 0.8, 1);
  return {
    center: sphere.center,
    position: direction.normalize().multiplyScalar(distance).add(sphere.center),
    distance,
    near: Math.max(0.001, distance / 10000),
    far: Math.max(5000, distance * 50 + radius),
  };
}

/** Match visible exportable meshes, not the sky, selection guides or DOM labels.
 * Inspect only: world matrices/bounding-box caches can update, vertices cannot. */
export function modelBounds(scene: THREE.Object3D) {
  const bounds = new THREE.Box3();
  scene.updateWorldMatrix(true, true);
  scene.traverseVisible(object => {
    if (!(object instanceof THREE.Mesh)) return;
    let marked = object.userData.exportable === true;
    for (let parent = object.parent; parent && !marked; parent = parent.parent) marked = parent.userData.exportable === true;
    if (!marked) return;
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    if (object.geometry.boundingBox) bounds.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
  });
  return bounds;
}

export type ModelOrbit = {
  target: THREE.Vector3;
  update: () => void;
  enableDamping: boolean;
  minDistance: number;
  maxDistance: number;
};

/** Imperative Three/OrbitControls adapter, invoked only from committed effects.
 * Kept outside React so its mutable engine objects are never confused with UI state. */
export function applyModelCamera(camera: THREE.PerspectiveCamera, controls: ModelOrbit | undefined, bounds: THREE.Box3, aspect: number, kind: "reset" | "top" | "tilt" | "zoomIn" | "zoomOut") {
    const frame = modelCameraFrame(bounds, camera.fov, aspect, kind === "top");
    if (!frame) return;
    const orbit = controls;
    const damping = orbit?.enableDamping;
    // Clear outstanding orbit/pan deltas BEFORE placing the requested view.
    if (orbit) { orbit.enableDamping = false; orbit.update(); }
    if (kind === "zoomIn" || kind === "zoomOut") {
      const target = orbit?.target ?? frame.center;
      const offset = camera.position.clone().sub(target);
      const distance = THREE.MathUtils.clamp(offset.length() * (kind === "zoomIn" ? 0.7 : 1.4), frame.distance * 0.02, frame.distance * 20);
      if (offset.lengthSq() === 0) offset.copy(frame.position).sub(frame.center);
      camera.position.copy(offset.setLength(distance).add(target));
      camera.lookAt(target);
    } else {
      camera.position.copy(frame.position);
      camera.up.set(0, 1, 0);
      camera.zoom = 1;
      orbit?.target.copy(frame.center);
      camera.lookAt(frame.center);
    }
    camera.near = frame.near;
    camera.far = frame.far;
    camera.updateProjectionMatrix();
    if (orbit) {
      orbit.minDistance = frame.distance * 0.02;
      orbit.maxDistance = frame.distance * 20;
      orbit.update();
      orbit.enableDamping = damping ?? true;
    }
}
