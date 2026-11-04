import * as THREE from "three";
import Drawing from "dxf-writer";
import { isEffectivelyVisible } from "./exportVisibility";

/** R2010 surface mesh in local metres: CAD X=east, Y=north, Z=up.
 * Entity serialization belongs to dxf-writer, not a hand-written DXF encoder.
 * Its reviewed ownership patch is enforced at install/build: docs/cad-conformance.md.
 * No CRS/georeferencing or watertight-solid guarantee is implied.
 */
export function objectToDxf(object: THREE.Object3D): string {
  const drawing = new Drawing();
  // Upstream HeaderValue mistakenly permits only numeric values, although the
  // implementation accepts strings and uses AC1021 itself in this same API.
  // @ts-expect-error dxf-writer's header value type omits strings
  drawing.header("ACADVER", [[1, "AC1024"]]);
  drawing.setUnits("Meters");
  object.updateWorldMatrix(true, true);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  if (!isEffectivelyVisible(object)) return drawing.toDxfString();
  object.traverseVisible(child => {
    if (!(child instanceof THREE.Mesh)) return;
    if (child instanceof THREE.SkinnedMesh) throw new Error("DXF does not support skinned meshes");
    const geometry = child.geometry;
    const positions = geometry.getAttribute("position");
    if (!positions) return;
    const indices = geometry.getIndex();
    const count = indices?.count ?? positions.count;
    const start = geometry.drawRange.start;
    const end = Math.min(count, start + geometry.drawRange.count);
    const horizontalScale = Number(child.userData.dxfHorizontalScale ?? 1);
    const unitScale = Number(child.userData.dxfUnitScale ?? 1);
    if (!Number.isFinite(unitScale) || unitScale <= 0) throw new Error("Invalid DXF unit scale");
    if (!Number.isFinite(horizontalScale) || horizontalScale <= 0) throw new Error("Invalid DXF scale");
    const instances = child instanceof THREE.InstancedMesh ? child.count : 1;
    for (let instance = 0; instance < instances; instance++) {
      const matrix = child.matrixWorld.clone();
      if (child instanceof THREE.InstancedMesh) {
        const local = new THREE.Matrix4();
        child.getMatrixAt(instance, local);
        matrix.multiply(local);
      }
      const vertex = (target: THREE.Vector3, i: number) => {
        target.fromBufferAttribute(positions, indices ? indices.getX(i) : i).applyMatrix4(matrix);
        // Legacy map mode uses compressed horizontal units; correct only X/Z.
        target.set(target.x * horizontalScale * unitScale, -target.z * horizontalScale * unitScale, target.y * unitScale);
        if (![target.x, target.y, target.z].every(Number.isFinite)) throw new Error("Non-finite DXF vertex");
      };
      for (let i = start; i + 2 < end; i += 3) {
        vertex(a, i); vertex(b, i + 1); vertex(c, i + 2);
        if (new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).lengthSq() < 1e-16) continue;
        // Triangular 3DFACE repeats the third point as the fourth vertex.
        drawing.drawFace(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, c.x, c.y, c.z);
      }
    }
  });
  return drawing.toDxfString();
}
