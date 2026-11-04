import * as THREE from "three";
import DxfParser, { type I3DfaceEntity } from "dxf-parser";
import { normalizeMultipolygon, signedPlanArea, MAX_FOOTPRINT_RINGS, MAX_FOOTPRINT_VERTICES, type PlanPoint } from "../src/utils/builders/footprint";
import { buildBuildingSurfaces, buildingSurfaceGeometry } from "../src/utils/builders/buildingBuilder";
import { parseOsmBuildings } from "../src/utils/osmBuildings";
import { createProjection } from "../src/utils/projection";
import { buildBuildingsGeometry } from "../src/three/orthoGeometry";
import { mapBuildingShape, mapBuildingGeometry } from "../src/three/mapBuildingGeometry";
import { objectToDxf } from "../src/utils/dxf";

export function verifyBuildingIslands(ok: (condition: boolean, label: string) => void,
  close: (actual: number, expected: number, tolerance: number, label: string) => void) {
  console.log("\n[Islands] strict alternating containment → independent component meshes → CAD");
  const rect = (x: number, z: number, dx = 0): PlanPoint[] => [{ x: dx - x, z: -z }, { x: dx + x, z: -z }, { x: dx + x, z }, { x: dx - x, z }];
  const outer = rect(20, 15), hole = rect(12, 8), island = rect(6, 4), islandHole = rect(2, 1);
  const clone = <T,>(value: T): T => structuredClone(value);
  const closed = <T,>(ring: T[]) => [...ring, ring[0]];
  const netArea = (ps: NonNullable<ReturnType<typeof normalizeMultipolygon>>) => ps.reduce((sum, p) =>
    sum + Math.abs(signedPlanArea(p.outer)) - p.holes.reduce((n, h) => n + Math.abs(signedPlanArea(h)), 0), 0);
  const forest = normalizeMultipolygon([outer, island], [hole, islandHole])!;
  ok(forest.length === 2 && forest.every(p => p.holes.length === 1), "island and its own courtyard become two footprints, each with its immediate hole only");
  close(netArea(forest), 904, 1e-9, "alternating filled/empty regions have correct total occupied area");
  close(Math.abs(signedPlanArea(forest[1].holes[0])), 8, 0, "island courtyard belongs to the nearest outer, not the first enclosing outer");
  const reordered = normalizeMultipolygon([island, outer], [islandHole, hole])!;
  close(netArea(reordered), 904, 1e-9, "containment does not depend on source outer/inner member order");
  ok(reordered[0].holes[0][0].x === -2 && reordered[1].holes[0][0].x === -12, "source order changes component order, not courtyard ownership");
  const deep = normalizeMultipolygon([outer, island, rect(.5, .4)], [hole, islandHole, rect(.2, .1)])!;
  ok(deep.length === 3 && deep.every(p => p.holes.length === 1), "six alternating levels are handled iteratively, without relation recursion");
  close(netArea(deep), 904.72, 1e-9, "deeper island contribution adds only its own occupied area");
  const separate = normalizeMultipolygon([outer, rect(4, 3, 60), island], [islandHole, hole])!;
  ok(separate.length === 3 && separate[1].holes.length === 0, "disjoint components coexist with a nested island tree");
  close(netArea(separate), 952, 1e-9, "disconnected components neither steal nor duplicate nested holes");

  const invalid: [string, PlanPoint[][], PlanPoint[][]][] = [
    ["outer directly inside outer", [outer, island], []],
    ["inner directly inside inner", [outer], [hole, islandHole]],
    ["orphan inner", [island], [hole]],
    ["outer touches courtyard edge", [outer, rect(6, 4, 6)], [hole]],
    ["outer crosses courtyard edge", [outer, rect(7, 4, 6)], [hole]],
    ["intersecting sibling islands", [outer, rect(3, 2, -1), rect(3, 2, 1)], [hole]],
    ["invalid island ring", [outer, [island[0], island[2], island[1], island[3]]], [hole]],
    ["non-finite island", [outer, [{ x: NaN, z: 0 }, ...island]], [hole]],
    ["inner only", [], [hole]],
    ["empty multipolygon", [], []],
    ["assembled-ring budget", Array.from({ length: MAX_FOOTPRINT_RINGS + 1 }, (_, i) => rect(1, 1, i * 4)), []],
    ["aggregate coordinate budget", [Array.from({ length: MAX_FOOTPRINT_VERTICES + 1 }, () => outer[0])], []],
  ];
  for (const [label, os, hs] of invalid) ok(normalizeMultipolygon(os, hs) === null, `${label}: reject whole topology, not a partial filled outline`);

  const tags = { building: "yes", type: "multipolygon", height: "15", "roof:shape": "gabled", "roof:height": "3" };
  const projection = createProjection([{ lat: 22.3, lng: 114.16 }, { lat: 22.31, lng: 114.17 }]);
  const osm = (ring: PlanPoint[]) => ring.map(p => { const geo = projection.toLatLng(p.x, p.z); return { lat: geo.lat, lon: geo.lng }; });
  const member = (ref: number, role: string, ring: PlanPoint[]) => ({ type: "way", ref, role, geometry: closed(osm(ring)) });
  const o = osm(outer), i = osm(island);
  const relation = { type: "relation", id: 80, tags, members: [
    { type: "way", ref: 1, role: "outer", geometry: [o[2], o[1], o[0]] },
    { type: "way", ref: 2, role: "outer", geometry: [o[2], o[3], o[0]] },
    member(3, "inner", [...hole].reverse()),
    { type: "way", ref: 4, role: "outer", geometry: [i[0], i[1], i[2]] },
    { type: "way", ref: 5, role: "outer", geometry: [i[0], i[3], i[2]] },
    member(6, "inner", islandHole),
  ] };
  const snapshot = JSON.stringify(relation);
  const parsed = parseOsmBuildings([relation]);
  ok(parsed.issues.length === 0 && parsed.buildings.length === 2 && parsed.buildings.every(b => b.holes.length === 1), "actual fragmented Overpass members preserve outer, courtyard, island and island courtyard");
  ok(parsed.buildings.every(b => b.id === -80) && new Set(parsed.buildings.map(b => b.key)).size === 2,
    "multiple components retain one OSM relation identity and collision-free React keys");
  ok(JSON.stringify(relation) === snapshot, "containment classification never mutates raw provider arrays");
  const duplicates = parseOsmBuildings([relation, { type: "way", id: 1, tags: { building: "yes" }, geometry: closed(o) },
    { type: "way", id: 4, tags: { building: "yes" }, geometry: closed(i) }]);
  ok(duplicates.buildings.length === 2 && !duplicates.issues.length, "tagged enclosing AND island outer ways are suppressed, not drawn over either courtyard");
  const invalidRelation = { ...relation, members: [...relation.members, member(7, "outer", rect(1, 1, 15))] };
  const rejected = parseOsmBuildings([invalidRelation]);
  ok(!rejected.buildings.length && rejected.issues.length === 1, "a single invalid nested component rejects the whole relation with one diagnostic");
  const nestedRelation = { ...relation, members: [{ type: "relation", ref: 90, role: "outer" }] };
  ok(parseOsmBuildings([nestedRelation]).issues.length === 1, "geometric ring nesting does not accidentally enable unsupported nested OSM relation members");
  const repeated = Array.from({ length: 1100 }, () => o[0]);
  const sourceBudget = { ...relation, members: [{ type: "way", ref: 1, role: "outer", geometry: [...repeated, ...o, o[0]] },
    { type: "way", ref: 2, role: "inner", geometry: [...Array.from({ length: 1100 }, () => osm(hole)[0]), ...osm(hole), osm(hole)[0]] }] };
  ok(parseOsmBuildings([sourceBudget]).issues.length === 1, "source coordinate budget counts repeated provider entries BEFORE deduplication across members");
  const atBudget = { ...relation, members: [{ type: "way", ref: 1, role: "outer", geometry: [...Array.from({ length: 2043 }, () => o[0]), ...o, o[0]] }] };
  ok(parseOsmBuildings([atBudget]).buildings.length === 1, "exact 2,048 source entries are accepted if deduplicated topology is valid");
  atBudget.members[0].geometry.push(o[0]);
  ok(parseOsmBuildings([atBudget]).issues.length === 1, "2,049 source entries reject instead of bypassing the documented budget");

  const projectedArea = (positions: ArrayLike<number>) => {
    let sum = 0;
    for (let j = 0; j < positions.length; j += 9) sum += Math.abs((positions[j + 3] - positions[j]) * (positions[j + 8] - positions[j + 2]) -
      (positions[j + 6] - positions[j]) * (positions[j + 5] - positions[j + 2])) / 2;
    return sum;
  };
  for (let mask = 0; mask < 16; mask++) {
    const rings = [outer, hole, island, islandHole].map((r, j) => mask & (1 << j) ? [...r].reverse() : clone(r));
    const before = JSON.stringify(rings);
    const footprints = normalizeMultipolygon([rings[0], rings[2]], [rings[1], rings[3]])!;
    for (const gabled of [false, true]) {
      const group = new THREE.Group();
      let roofArea = 0, bottomArea = 0, normalsCorrect = true;
      for (const p of footprints) {
        const surfaces = buildBuildingSurfaces(p.outer, 0, 15, gabled ? tags : { height: "15" }, p.holes);
        const geometry = buildingSurfaceGeometry(surfaces, p.outer);
        roofArea += projectedArea(surfaces.roofs);
        const positions = geometry.getAttribute("position"), normals = geometry.getAttribute("normal");
        bottomArea += projectedArea(Array.from(positions.array).slice(surfaces.roofs.length, geometry.groups[1].start * 3));
        for (let j = 0; j < surfaces.roofs.length / 3; j++) normalsCorrect &&= normals.getY(j) > 0;
        for (let j = surfaces.roofs.length / 3; j < geometry.groups[1].start; j++) normalsCorrect &&= normals.getY(j) === -1;
        group.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
      }
      close(roofArea, 904, 1e-6, `four independently wound rings (${mask}, gabled=${gabled}): roofs cover occupied area only`);
      close(bottomArea, 904, 1e-5, "component bottom caps preserve both empty regions");
      const ray = new THREE.Raycaster(); group.updateMatrixWorld(true);
      const hit = (x: number, z: number) => { ray.set(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0)); return ray.intersectObject(group, true).length > 0; };
      ok(normalsCorrect && hit(15, 0) && !hit(9, 0) && hit(4, 0) && !hit(0, 0), "up/down normals and actual rays distinguish building, courtyard, island and island courtyard");
      group.children.forEach(child => { const mesh = child as THREE.Mesh; mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); });
    }
    ok(before === JSON.stringify(rings), `winding combination ${mask}: source contours unchanged`);
  }

  const sceneBuildings = parsed.buildings.map(b => ({ id: b.id, ring: b.geometry, holes: b.holes, heightM: 15, tags: b.tags }));
  const merged = buildBuildingsGeometry(sceneBuildings, projection, () => 0);
  ok(merged.count === 2, "real merged builder counts enclosing building and island as separate drawn components");
  close(projectedArea(merged.roofs!.getAttribute("position").array), 904, .02, "OSM → UTM merged roof area excludes both courtyard levels");
  const ortho = new THREE.Group(); ortho.add(new THREE.Mesh(merged.roofs!), new THREE.Mesh(merged.walls!));
  const map = new THREE.Group(), factor = 111320 / 51000;
  for (const b of parsed.buildings) {
    const shape = mapBuildingShape(b, (lat, lng) => { const p = projection.toScene(lat, lng); return new THREE.Vector2(p.x / factor, -p.z / factor); });
    const mesh = new THREE.Mesh(mapBuildingGeometry(shape, 51000, 15, b.tags));
    mesh.userData.dxfHorizontalScale = factor; map.add(mesh);
  }
  for (const [label, object, cap] of [["map", map, 904], ["orienteering", ortho, 0]] as const) {
    const dxf = new DxfParser().parseSync(objectToDxf(object))!;
    let up = 0, down = 0;
    for (const face of dxf.entities as I3DfaceEntity[]) {
      const [a, b, c] = face.vertices;
      const area = ((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
      if (area > 0) up += area; else down -= area;
    }
    ok(dxf.header.$ACADVER === "AC1024" && dxf.header.$INSUNITS === 6 && dxf.entities.every(e => e.type === "3DFACE"), `${label}: nested-island export still uses metric R2010 3DFACE`);
    close(up, 904, .02, `${label}: independent CAD reader confirms both occupied components, with neither courtyard filled`);
    close(down, cap, .02, `${label}: CAD cap preserves both voids or original open-bottom policy`);
    object.children.forEach(child => { const mesh = child as THREE.Mesh; mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); });
  }
}
