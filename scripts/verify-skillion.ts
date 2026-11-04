import * as THREE from "three";
import DxfParser, { type I3DfaceEntity } from "dxf-parser";
import { buildingDimensions, buildBuildingSurfaces, buildingSurfaceGeometry, parseRoofDirection, needsSkillionDirectionFallback } from "../src/utils/builders/buildingBuilder";
import { buildBuildingsGeometry } from "../src/three/orthoGeometry";
import { mapBuildingShape, mapBuildingGeometry } from "../src/three/mapBuildingGeometry";
import { createProjection } from "../src/utils/projection";
import { parseOsmBuildings } from "../src/utils/osmBuildings";
import { fetchBuildings, fetchBuildingElements, type CellProgress } from "../src/utils/sceneData";
import { objectToDxf } from "../src/utils/dxf";

export async function verifySkillion(ok: (condition: boolean, label: string) => void,
  close: (actual: number, expected: number, tolerance: number, label: string) => void) {
  console.log("\n[Skillion] downhill plane, source semantics, courtyards and metric CAD");
  const tags = { building: "yes", height: "15", "roof:shape": "skillion", "roof:height": "3", "roof:direction": "E" };
  const outer = [{ x: -20, z: -10 }, { x: 20, z: -10 }, { x: 20, z: 10 }, { x: -20, z: 10 }];
  const hole = [{ x: -4, z: -3 }, { x: 4, z: -3 }, { x: 4, z: 3 }, { x: -4, z: 3 }];
  const compass = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  ok(compass.every((name, i) => parseRoofDirection(name) === i * 22.5), "all 16 cardinal directions resolve clockwise from north");
  ok(parseRoofDirection("  e ") === 90 && parseRoofDirection("360") === 0 && parseRoofDirection("765.5") === 45.5,
    "trimmed compass aliases and finite numeric degrees normalize consistently");
  ok([undefined, "", "-1", "NaN", "Infinity", "90;180", "0x5a", "1e2", "90°", "9".repeat(400)].every(s => parseRoofDirection(s) === undefined),
    "ambiguous/non-finite/malformed directions never become NaN geometry or fabricated slopes");
  close(buildingDimensions(tags).roofHeight, 3, 0, "skillion uses explicit roof height");
  close(buildingDimensions({ ...tags, "roof:height": "6 ft" }).roofHeight, 1.8288, 1e-8, "skillion roof rise respects explicit feet");
  close(buildingDimensions({ "roof:shape": "skillion", "roof:angle": "45" }, 30, 10).roofHeight, 10, 1e-9,
    "skillion angle uses FULL slope run, matching inspected OSM2World test semantics");
  close(buildingDimensions({ "roof:shape": "gabled", "roof:angle": "45" }, 30, 10).roofHeight, 5, 1e-9,
    "gabled angle still uses HALF span");
  close(buildingDimensions({ ...tags, "roof:levels": "2", "roof:height": undefined }).roofHeight, 4.4, 1e-9,
    "roof levels remain the explicit project storey-height estimate");
  close(buildingDimensions({ "roof:shape": "skillion", "roof:direction": "E", "building:levels": "2", "roof:height": "3" }).totalHeight, 7.4, 1e-9,
    "building levels exclude single-pitch roof rise; explicit height remains roof-inclusive");
  close(buildingDimensions({ ...tags, height: "4", "roof:height": "100" }).roofHeight, 2, 0, "roof clamp retains at least two metres of facade");
  for (const zero of [{ "roof:height": "0" }, { "roof:height": "0 ft" }, { "roof:height": undefined, "roof:angle": "0" }]) {
    const built = buildBuildingSurfaces(outer, 0, 15, { ...tags, ...zero });
    ok(built.roofHeight === 0 && built.roofs.every((v, i) => i % 3 !== 1 || v === 15), "explicit zero roof rise/angle remains genuinely flat, not a guessed nonzero slope");
  }
  ok(!needsSkillionDirectionFallback({ "roof:shape": "skillion", "roof:height": "0" }) &&
    !needsSkillionDirectionFallback({ "roof:shape": "skillion", "roof:angle": "0" }),
    "intentionally zero-rise roofs do not get a false missing-direction warning");
  const areaOf = (vertices: ArrayLike<number>) => {
    let area = 0;
    for (let i = 0; i < vertices.length; i += 9) area += Math.abs((vertices[i + 3] - vertices[i]) * (vertices[i + 8] - vertices[i + 2]) -
      (vertices[i + 6] - vertices[i]) * (vertices[i + 5] - vertices[i + 2])) / 2;
    return area;
  };
  for (const degrees of [0, 45, 90, 135, 180, 225, 270, 315]) {
    const radians = degrees * Math.PI / 180, down = { x: Math.sin(radians), z: -Math.cos(radians) };
    const distance = (p: { x: number; z: number }) => p.x * down.x + p.z * down.z;
    const ds = outer.map(distance), min = Math.min(...ds), max = Math.max(...ds);
    const expectedY = (x: number, z: number) => 20 - 3 * (distance({ x, z }) - min) / (max - min);
    let allPlanes = true, allNormals = true, allWalls = true, allRays = true, area = 0;
    for (const reverseOuter of [false, true]) for (const reverseHole of [false, true]) {
      const ring = reverseOuter ? [...outer].reverse() : outer, holes = [reverseHole ? [...hole].reverse() : hole];
      const before = JSON.stringify({ ring, holes });
      const built = buildBuildingSurfaces(ring, 5, 15, { ...tags, "roof:direction": String(degrees) }, holes);
      area += areaOf(built.roofs);
      const geometry = buildingSurfaceGeometry(built, ring, 5);
      const positions = geometry.getAttribute("position"), normals = geometry.getAttribute("normal");
      for (let i = 0; i < built.roofs.length / 3; i++) {
        allPlanes &&= Math.abs(positions.getY(i) - expectedY(positions.getX(i), positions.getZ(i))) < 1e-5;
        allNormals &&= normals.getY(i) > 0 && normals.getX(i) * down.x + normals.getZ(i) * down.z > 0;
      }
      for (let i = geometry.groups[1].start; i < positions.count; i++) {
        const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
        const inner = Math.abs(x) <= 4.00001 && Math.abs(z) <= 3.00001;
        allWalls &&= (inner ? -1 : 1) * (x * normals.getX(i) + z * normals.getZ(i)) > 0;
        if (y !== 5) allWalls &&= Math.abs(y - expectedY(x, z)) < 1e-5;
      }
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()); mesh.updateMatrixWorld(true);
      const ray = new THREE.Raycaster(new THREE.Vector3(0, 100, 0), new THREE.Vector3(0, -1, 0));
      allRays &&= ray.intersectObject(mesh).length === 0;
      ray.set(new THREE.Vector3(10, 100, 0), new THREE.Vector3(0, -1, 0));
      allRays &&= Math.abs(ray.intersectObject(mesh)[0].point.y - expectedY(10, 0)) < 1e-5;
      allPlanes &&= before === JSON.stringify({ ring, holes });
      geometry.dispose(); (mesh.material as THREE.Material).dispose();
    }
    close(area, 4 * 752, 1e-6, `${degrees}°: all four winding combinations preserve net roof area`);
    ok(allPlanes && allNormals, `${degrees}°: one downhill plane with upward, downhill-facing normals; inputs unchanged`);
    ok(allWalls && allRays, `${degrees}°: inner/outer walls meet plane and actual courtyard/roof ray hits retain correct elevations`);
  }
  // Coordinate Z sign adapted from inspected upstream trapezoid test (+Z north there).
  const trapezoid = [{ x: 5, z: 5 }, { x: 10, z: -5 }, { x: -10, z: -5 }, { x: -5, z: 5 }];
  const trapezoidBuilt = buildBuildingSurfaces(trapezoid, 0, 10, { ...tags, height: "10", "roof:height": "1", "roof:direction": "S" });
  ok(trapezoidBuilt.roofs.every((v, i, a) => i % 3 !== 1 || Math.abs(v - (9.5 - a[i + 1] / 10)) < 1e-9),
    "source-referenced trapezoid slopes south with no phantom central ridge");
  const concave = [{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 5 }, { x: 5, z: 5 }, { x: 5, z: 15 }, { x: 0, z: 15 }];
  close(areaOf(buildBuildingSurfaces(concave, 0, 15, tags).roofs), 150, 1e-9, "concave skillion follows actual footprint, not its bounding rectangle");
  for (const direction of [undefined, "", "bad", "9".repeat(400)]) {
    const fallback = buildBuildingSurfaces(outer, 0, 15, { ...tags, "roof:direction": direction });
    ok(needsSkillionDirectionFallback({ ...tags, "roof:direction": direction }) && fallback.roofs.every((v, i) => i % 3 !== 1 || v === 15),
      "missing/invalid downhill direction retains a finite total-height flat fallback and a reportable reason");
  }
  ok(!needsSkillionDirectionFallback(tags) && !needsSkillionDirectionFallback({ "roof:shape": "gabled" }), "flat-skillion diagnostic does not mislabel supported skillion or heuristic gabled roofs");

  const projection = createProjection([{ lat: 22.3, lng: 114.16 }, { lat: 22.31, lng: 114.17 }]);
  const geo = (ring: typeof outer) => ring.map(p => projection.toLatLng(p.x, p.z));
  const raw = { id: 701, tags, geometry: geo(outer), holes: [geo(hole)] };
  const merged = buildBuildingsGeometry([{ id: raw.id, tags, ring: raw.geometry, holes: raw.holes, heightM: 15 }], projection, () => 0);
  close(areaOf(merged.roofs!.getAttribute("position").array), 752, .02, "shared skillion tags reach real merged UTM roofs");
  const factor = 111320 / 51000;
  const shape = mapBuildingShape(raw, (lat, lng) => { const p = projection.toScene(lat, lng); return new THREE.Vector2(p.x / factor, -p.z / factor); });
  const map = new THREE.Mesh(mapBuildingGeometry(shape, 51000, 15, tags)); map.userData.dxfHorizontalScale = factor;
  for (const [name, object] of [["map", map], ["orienteering", new THREE.Mesh(merged.roofs!)]] as const) {
    const parsed = new DxfParser().parseSync(objectToDxf(object))!;
    const faces = parsed.entities as I3DfaceEntity[];
    const roofs = faces.filter(f => { const [a, b, c] = f.vertices; return (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y) > 1e-7; });
    ok(parsed.header.$ACADVER === "AC1024" && parsed.header.$INSUNITS === 6, `${name}: skillion CAD remains metric R2010`);
    ok(roofs.every(f => f.vertices.slice(0, 3).every(p => Math.abs(p.z - (13.5 - p.x * 3 / 40)) < 1e-4)), `${name}: independent CAD reader confirms east-down slope and roof-inclusive height after axis/unit conversion`);
    object.geometry.dispose(); (object.material as THREE.Material).dispose();
  }
  merged.walls?.dispose();
  const osmRing = [...raw.geometry, raw.geometry[0]].map(p => ({ lat: p.lat, lon: p.lng }));
  const elements = [{ type: "way", id: 701, tags, geometry: osmRing }, { type: "way", id: 702, tags: { ...tags, "roof:direction": "bad" }, geometry: osmRing }];
  ok(parseOsmBuildings(elements).buildings.length === 2, "missing roof direction does not discard otherwise valid building footprints");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ elements }), { headers: { "content-type": "application/json" } });
  try {
    const area: [{ lat: number; lng: number }, { lat: number; lng: number }] = [{ lat: 22.301234, lng: 114.161234 }, { lat: 22.302234, lng: 114.162234 }];
    const progress: CellProgress[] = [];
    const scene = await fetchBuildings(area, (_, p) => progress.push(p));
    const buildings = await fetchBuildingElements(area, (_, p) => progress.push(p));
    ok(scene.length === 2 && buildings.length === 2 && scene[0].tags["roof:direction"] === "E", "actual shared fetch collectors preserve skillion/direction tags");
    ok(progress.length >= 2 && progress.every(p => p.flatSkillionRoofs === 1 && p.skippedBuildings === 0), "both fetch progress paths, including cache hits, report flat skillion components separately from rejected geometry");
  } finally { globalThis.fetch = originalFetch; }
}
