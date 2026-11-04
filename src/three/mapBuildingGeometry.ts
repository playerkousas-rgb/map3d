import * as THREE from "three";
import type { LatLng } from "@/utils/course";
import { buildBuildingSurfaces, buildingSurfaceGeometry, type BuildingTags } from "@/utils/builders/buildingBuilder";

/** Legacy map projection, supplied by Space so all layers retain the same origin. */
export function mapBuildingShape(
  building: { geometry: LatLng[]; holes?: LatLng[][] },
  project: (lat: number, lng: number) => THREE.Vector2,
): THREE.Shape {
  const points = (ring: LatLng[]) => ring.map(p => project(p.lat, p.lng));
  const shape = new THREE.Shape(points(building.geometry));
  shape.closePath();
  shape.holes = (building.holes ?? []).map(ring => {
    const path = new THREE.Path(points(ring));
    path.closePath();
    return path;
  });
  return shape;
}

/** Resolve roofs in real metres; only horizontal display coordinates are compressed. */
export function mapBuildingGeometry(shape: THREE.Shape, scale: number, height: number, tags: BuildingTags): THREE.BufferGeometry {
  const factor = 111320 / scale;
  const plan = (path: THREE.Path) => path.getPoints().map(p => ({ x: p.x * factor, z: -p.y * factor }));
  const outer = plan(shape), holes = shape.holes.map(plan);
  return buildingSurfaceGeometry(buildBuildingSurfaces(outer, 0, height, tags, holes), outer).scale(1 / factor, 1, 1 / factor);
}
