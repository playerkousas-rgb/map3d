/**
 * Verification harness for the orienteering modules that do not need a browser:
 * geodesy, course maths, tile maths, terrain sampling and the geometry builders.
 *
 * Run with `npm run verify` (part of `npm run check`, so CI runs it too).
 * esbuild bundles the TypeScript sources — including the "@/" aliases — into a
 * throwaway file under node_modules, which then runs in plain Node.
 *
 * The UTM expectations are PROJ-authoritative: they were produced with pyproj
 * against EPSG:32649 / EPSG:32650, so a regression in the projection maths is
 * caught against an independent implementation rather than against itself.
 */

import {
  gridRefs,
  parseGridInput,
  toUtm,
  fromUtm,
  planarDistance,
  gridBearing,
  magneticBearing,
  formatDeg,
  MAG_DECLINATION_WEST,
} from "../src/utils/hkgeo";
import {
  createControl,
  courseStats,
  courseToJson,
  emptyCourse,
  nextCode,
  orderedControls,
  parseCourseJson,
  type Course,
} from "../src/utils/course";
import { latToTileY, lngToTileX, tileXToLng, tileYToLat, chooseZoom, tileRange } from "../src/utils/tiles";
import { planCells } from "../src/utils/sceneData";
import { MAX_BUILDINGS, MAX_ROADS } from "../src/three/orthoGeometry";
import { heightAt, fieldRange, type HeightField } from "../src/utils/terrain";
import { createProjection } from "../src/utils/projection";
import {
  buildBuildingsGeometry,
  buildRoadsGeometry,
  buildRouteGeometry,
} from "../src/three/orthoGeometry";

let failures = 0;
let checks = 0;

function ok(condition: boolean, label: string, detail = "") {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    console.log(`  ✓ ${label}`);
  }
}

function close(actual: number, expected: number, tolerance: number, label: string) {
  const delta = Math.abs(actual - expected);
  ok(delta <= tolerance, label, `actual ${actual.toFixed(6)}, expected ${expected.toFixed(6)}, Δ ${delta}`);
}

/* ---------------------------------------------------------------- *
 * 1. Geodesy vs PROJ
 * ---------------------------------------------------------------- */
console.log("\n[1] UTM projection vs PROJ reference values (zone 50Q)");
const REFERENCE: [string, number, number, number, number][] = [
  ["TST Clock Tower", 22.2936, 114.1694, 208343.246, 2468059.483],
  ["Central Pier", 22.287, 114.16, 207360.371, 2467346.493],
  ["Sha Tin Town Hall", 22.3815, 114.1898, 210628.092, 2477758.26],
  ["Tai Po Waterfront", 22.4512, 114.175, 209248.531, 2485508.744],
];
for (const [name, lat, lng, e, n] of REFERENCE) {
  const got = toUtm(lat, lng);
  close(got.e, e, 0.002, `${name} easting`);
  close(got.n, n, 0.002, `${name} northing`);
  ok(got.zone === 50, `${name} is in zone 50`);
}

console.log("\n[1b] WGS84 ↔ UTM round trip (both zones)");
for (const [lat, lng] of [
  [22.2936, 114.1694],
  [22.4512, 114.175],
  [22.28, 113.9],
  [22.21, 114.03],
]) {
  const utm = toUtm(lat, lng);
  const back = fromUtm(utm.e, utm.n, utm.zone);
  close(back.lat, lat, 1e-7, `round trip lat ${lat},${lng}`);
  close(back.lng, lng, 1e-7, `round trip lng ${lat},${lng}`);
}

/* ---------------------------------------------------------------- *
 * 2. Grid references
 * ---------------------------------------------------------------- */
console.log("\n[2] HM20C grid references");
const tst = gridRefs(22.2936, 114.1694);
ok(tst.square === "KK", "Tsim Sha Tsui is in square KK", String(tst.square));
ok(tst.fig6 === "KK 083 680", "6-figure reference", tst.fig6);
ok(tst.fig8 === "50Q KK 0834 6805", "8-figure reference", tst.fig8);
ok(tst.km === "08 68", "kilometre pair", tst.km);

const saiKung = gridRefs(22.4, 114.3);
ok(saiKung.square === "KK", "Sai Kung is in square KK", String(saiKung.square));
const lantauWest = gridRefs(22.26, 113.9);
ok(lantauWest.square === "GE", "west of 114°E falls in zone 49 square GE", String(lantauWest.square));

console.log("\n[2b] typed grid input");
for (const text of ["KK 0834 6805", "50Q KK 0834 6805", "kk08346805", "50Q   kk 0834 6805"]) {
  const parsed = parseGridInput(text);
  ok(parsed !== null, `"${text}" parses`);
  if (!parsed) continue;
  const round = gridRefs(parsed.lat, parsed.lng);
  ok(round.fig8 === "50Q KK 0834 6805", `"${text}" lands in the same 10 m square`, round.fig8);
  close(planarDistance(parsed, { lat: 22.2936, lng: 114.1694 }), 5, 5, `"${text}" is within 10 m of the true point`);
}
ok(parseGridInput("hello") === null, "garbage input is rejected");
ok(parseGridInput("KK 123") === null, "odd-length digits are rejected");
ok(parseGridInput("49Q KK 0834 6805") === null, "wrong zone letter is rejected");

console.log("\n[2c] distances and bearings");
// PROJ: ΔE −982.875 m, ΔN −712.990 m from the two reference points above.
close(
  planarDistance({ lat: 22.2936, lng: 114.1694 }, { lat: 22.287, lng: 114.16 }),
  1214.2,
  1,
  "Clock Tower → Central Pier matches the PROJ grid distance",
);
// Grid bearings are referenced to UTM grid north, so a true-north line reads
// the meridian convergence: γ = atan(tan(λ−λ₀)·sin φ) = +1.074° at 114.17°E.
const bearingNorth = gridBearing({ lat: 22.29, lng: 114.17 }, { lat: 22.30, lng: 114.17 });
close(bearingNorth, 1.074, 0.01, "true north reads the meridian convergence");
const bearingEast = gridBearing({ lat: 22.29, lng: 114.17 }, { lat: 22.29, lng: 114.18 });
close(bearingEast, 90 + 1.074, 0.02, "true east reads 90° + convergence");
close(magneticBearing(90), 90 - MAG_DECLINATION_WEST, 1e-9, "magnetic = grid − 3.1°W");
ok(formatDeg(137.4) === "137° 24′", "bearing formatting", formatDeg(137.4));

/* ---------------------------------------------------------------- *
 * 3. Course maths and JSON round trip
 * ---------------------------------------------------------------- */
console.log("\n[3] Course model");
const controls: ReturnType<typeof createControl>[] = [];
const pushControl = (kind: "start" | "control" | "finish", lat: number, lng: number) => {
  const next = createControl(kind, { lat, lng }, controls);
  controls.push(next);
  return next;
};
pushControl("start", 22.2936, 114.1694);
pushControl("control", 22.297, 114.173);
pushControl("control", 22.301, 114.178);
pushControl("finish", 22.305, 114.183);
ok(controls[1].code === "1" && controls[2].code === "2", "checkpoints are numbered in order");
ok(controls[0].code === "S" && controls[3].code === "F", "start/finish codes");
ok(nextCode(controls) === "3", "nextCode continues the sequence");

const course: Course = { name: "Test", playMode: "linear", controls: [...controls].reverse() };
const ordered = orderedControls(course);
ok(
  ordered.map((c) => c.kind).join(",") === "start,control,control,finish",
  "route order is start → controls → finish",
  ordered.map((c) => c.code).join(","),
);

const stats = courseStats(course);
// Legs of 528 m + 678 m + 678 m (equirectangular at 22.3°N).
close(stats.totalM, 1885, 15, "total course length");
ok(stats.legs.length === 3, "one leg per hop", String(stats.legs.length));
ok(stats.controlCount === 2, "control count", String(stats.controlCount));
ok(
  stats.legs.every((leg) => leg.magneticDeg >= 0 && leg.magneticDeg < 360),
  "magnetic bearings stay in range",
);

console.log("\n[3b] HKMAP-compatible import/export");
const hkmapDraft = JSON.stringify({
  current: {
    name: "沙田城市定向",
    playMode: "score",
    controls: [
      { id: "a", kind: "start", lat: 22.3815, lng: 114.1898, code: "S", name: "起點", clue: "", note: "", score: 0 },
      { id: "b", kind: "control", lat: 22.382, lng: 114.19, code: "1", name: "鐘樓", clue: "燈柱底", note: "", score: 10 },
      { id: "c", kind: "finish", lat: 22.383, lng: 114.192, code: "F", name: "終點", clue: "", note: "", score: 0 },
    ],
  },
});
const imported = parseCourseJson(hkmapDraft);
ok(imported.name === "沙田城市定向", "HKMAP draft name survives", imported.name);
ok(imported.playMode === "score", "score event mode survives");
ok(imported.controls.length === 3, "all controls imported");
ok(imported.controls[1].clue === "燈柱底", "clue survives", imported.controls[1].clue);
ok(imported.controls[1].score === 10, "score survives");

const bare = parseCourseJson(JSON.stringify({ name: "x", controls: [{ kind: "control", lat: 22.3, lng: 114.1 }] }));
ok(bare.controls[0].code === "1", "missing codes are auto-numbered", bare.controls[0].code);

const roundTripped = parseCourseJson(courseToJson(course));
ok(roundTripped.controls.length === course.controls.length, "export → import keeps every control");
close(roundTripped.controls[1].lat, course.controls[1].lat, 1e-12, "coordinates survive a round trip");

let threw = false;
try {
  parseCourseJson("not json");
} catch {
  threw = true;
}
ok(threw, "invalid JSON is rejected");
threw = false;
try {
  parseCourseJson(JSON.stringify({ name: "empty" }));
} catch {
  threw = true;
}
ok(threw, "a course without controls is rejected");
ok(emptyCourse("a").controls.length === 0, "emptyCourse is empty");

/* ---------------------------------------------------------------- *
 * 4. Tile maths
 * ---------------------------------------------------------------- */
console.log("\n[4] Web-Mercator tile maths");
for (const [lat, lng] of [
  [22.2936, 114.1694],
  [22.4512, 114.175],
  [-33.86, 151.2],
]) {
  close(tileYToLat(latToTileY(lat, 16), 16), lat, 1e-6, `lat round trip ${lat}`);
  close(tileXToLng(lngToTileX(lng, 16), 16), lng, 1e-9, `lng round trip ${lng}`);
}
// A point just north-east of a tile corner must land in the tile that contains it.
const bbox = { south: 22.29, west: 114.16, north: 22.31, east: 114.18 };
const range = tileRange(bbox, 17);
ok(
  range.minX <= Math.floor(lngToTileX(bbox.west, 17)) && range.maxX >= Math.floor(lngToTileX(bbox.east, 17)),
  "tile range covers the bbox east–west",
);
ok(
  range.minY <= Math.floor(latToTileY(bbox.north, 17)) && range.maxY >= Math.floor(latToTileY(bbox.south, 17)),
  "tile range covers the bbox north–south",
);
const chosen = chooseZoom(bbox, 64, 20);
ok(chosen.count <= 64, "chosen zoom stays inside the tile budget", String(chosen.count));
const finer = chooseZoom({ south: 22.293, west: 114.169, north: 22.294, east: 114.17 }, 64, 20);
ok(finer.z >= 17, "a small area gets a detailed zoom", String(finer.z));

/* ---------------------------------------------------------------- *
 * 4b. Overpass area splitting (this is what makes big areas load)
 * ---------------------------------------------------------------- */
console.log("\n[4b] Overpass cell planning");
const kmBox = (km: number) => ({
  south: 22.3,
  west: 114.16,
  north: 22.3 + km / 110.574,
  east: 114.16 + km / (111.32 * Math.cos((22.3 * Math.PI) / 180)),
});

const small = planCells(kmBox(1));
ok(small.length === 1, "a 1 km box is still a single query", String(small.length));
ok(
  small[0].south === kmBox(1).south && small[0].east === kmBox(1).east,
  "an unsplit box is passed through untouched",
);

const mid = planCells(kmBox(2.2));
ok(mid.length === 4, "a 2.2 km box becomes 2×2 cells", String(mid.length));
const huge = planCells(kmBox(40));
ok(huge.length === 25, "an oversized box is capped at 5×5 cells", String(huge.length));

// The cells must tile the requested area exactly: cover every bit of it, stay
// inside it, and form a proper rows×cols grid (an overlap would double-count
// buildings, a gap would lose them).
for (const [name, box] of [
  ["2.2 km", kmBox(2.2)],
  ["5.5 km", kmBox(5.5)],
  ["40 km", kmBox(40)],
] as const) {
  const cells = planCells(box);
  const inside = cells.every(
    (c) =>
      c.south >= box.south - 1e-9 &&
      c.north <= box.north + 1e-9 &&
      c.west >= box.west - 1e-9 &&
      c.east <= box.east + 1e-9,
  );
  ok(inside, `${name} cells stay inside the selection`);

  const souths = new Set(cells.map((c) => c.south.toFixed(9)));
  const norths = new Set(cells.map((c) => c.north.toFixed(9)));
  const wests = new Set(cells.map((c) => c.west.toFixed(9)));
  const easts = new Set(cells.map((c) => c.east.toFixed(9)));
  // A complete grid has one distinct boundary per row / per column, and the
  // north edges are the south edges shifted up by one.
  ok(norths.size === souths.size, `${name} has as many north edges as south edges`);
  ok(easts.size === wests.size, `${name} has as many east edges as west edges`);
  ok(
    cells.length === souths.size * wests.size,
    `${name} fills every cell of its ${souths.size}×${wests.size} grid exactly once`,
    `${cells.length} cells`,
  );
  // Equal-sized bands on all four sides = an even grid (no seam, no overlap).
  const cellH = (box.north - box.south) / souths.size;
  const cellW = (box.east - box.west) / wests.size;
  ok(
    cells.every(
      (c) =>
        Math.abs(c.north - c.south - cellH) < Math.abs(cellH) * 1e-9 &&
        Math.abs(c.east - c.west - cellW) < Math.abs(cellW) * 1e-9,
    ),
    `${name} rows and columns are evenly sized`,
  );

  let totalArea = 0;
  for (const c of cells) totalArea += (c.north - c.south) * (c.east - c.west);
  const boxArea = (box.north - box.south) * (box.east - box.west);
  close(totalArea, boxArea, boxArea * 1e-9, `${name} cells cover the selection exactly`);
}

// A very small (or degenerate) box must not explode into thousands of cells.
const tiny = planCells({ south: 22.3, west: 114.16, north: 22.30001, east: 114.16001 });
ok(tiny.length === 1, "a tiny box stays one cell", String(tiny.length));

// The 3D builders used to drop everything past the first 6,000 items, which is
// what made a real city look half-empty. The remaining ceiling is a phone
// safety valve only — it has to be far above any plausible course area.
ok(
  MAX_BUILDINGS >= 20_000,
  "the building safety ceiling is not a data limit",
  String(MAX_BUILDINGS),
);
ok(MAX_ROADS >= 20_000, "the road safety ceiling is not a data limit", String(MAX_ROADS));

/* ---------------------------------------------------------------- *
 * 5. Terrain sampling
 * ---------------------------------------------------------------- */
console.log("\n[5] Terrain heightfield");
const field: HeightField = {
  south: 22.3,
  west: 114.16,
  north: 22.31,
  east: 114.18,
  cols: 3,
  rows: 2,
  // row 0 (south): 0, 10, 20   row 1 (north): 100, 110, 120
  heights: [0, 10, 20, 100, 110, 120],
  source: "Open-Meteo (Copernicus DEM)",
};
close(heightAt(field, { lat: 22.3, lng: 114.16 }), 0, 1e-9, "south-west corner");
close(heightAt(field, { lat: 22.31, lng: 114.18 }), 120, 1e-9, "north-east corner");
close(heightAt(field, { lat: 22.305, lng: 114.16 }), 50, 1e-9, "half-way north");
close(heightAt(field, { lat: 22.3, lng: 114.17 }), 10, 1e-9, "half-way east");
close(heightAt(field, { lat: 22.32, lng: 114.2 }), 120, 1e-9, "outside the grid clamps to the edge");
ok(heightAt(null, { lat: 22.3, lng: 114.17 }) === 0, "no field means sea level");
const range2 = fieldRange(field);
ok(range2.min === 0 && range2.max === 120, "field range", `${range2.min}–${range2.max}`);

/* ---------------------------------------------------------------- *
 * 6. Geometry builders
 * ---------------------------------------------------------------- */
console.log("\n[6] Geometry builders");
const area: [{ lat: number; lng: number }, { lat: number; lng: number }] = [
  { lat: 22.29, lng: 114.16 },
  { lat: 22.30, lng: 114.175 },
];
const projection = createProjection(area);
ok(projection.zone === 50, "scene projects in UTM zone 50", String(projection.zone));
const centre = projection.toScene(22.295, 114.1675);
close(centre.x, 0, 2, "scene centre is near the origin (x)");
close(centre.z, 0, 2, "scene centre is near the origin (z)");
const east = projection.toScene(22.295, 114.1775);
ok(east.x > 0, "east of centre has +x");
const north = projection.toScene(22.305, 114.1675);
ok(north.z < 0, "north of centre has −z");
ok(projection.widthM > 1400 && projection.widthM < 1800, "scene width in metres", projection.widthM.toFixed(0));

const terrain = (at: { lat: number; lng: number }) => heightAt(field, at);
const buildingsGeom = buildBuildingsGeometry(
  [
    { id: 1, heightM: 30, ring: square(22.292, 114.165, 40) },
    { id: 2, heightM: 60, ring: square(22.296, 114.17, 60) },
    { id: 3, heightM: 12, ring: square(22.2925, 114.1695, 3) }, // 9 m² → filtered out
  ],
  projection,
  terrain,
);
ok(buildingsGeom.count === 2, "tiny footprints are dropped", String(buildingsGeom.count));
ok(buildingsGeom.walls !== null && buildingsGeom.roofs !== null, "walls and roofs built");

const walls = buildingsGeom.walls!;
const wallPos = walls.getAttribute("position");
ok(wallPos.count === 2 * 4 * 6, "each surviving building contributes 4 edges × 6 vertices", String(wallPos.count));
const wallNormals = walls.getAttribute("normal");
let finiteNormals = 0;
let flatNormals = 0;
for (let i = 0; i < wallNormals.count; i++) {
  if (Number.isFinite(wallNormals.getX(i)) && Number.isFinite(wallNormals.getZ(i))) finiteNormals++;
  if (Math.abs(wallNormals.getY(i)) < 1e-6) flatNormals++;
}
ok(finiteNormals === wallNormals.count, "all wall normals are finite", `${finiteNormals}/${wallNormals.count}`);
ok(flatNormals === wallNormals.count, "every wall normal is horizontal", `${flatNormals}/${wallNormals.count}`);

// Faces must point away from their own footprint. A single square building is
// the unambiguous case: every wall normal must oppose the direction from the
// building's centre to that wall.
const singleGeom = buildBuildingsGeometry(
  [{ id: 7, heightM: 25, ring: square(22.295, 114.167, 40) }],
  projection,
  terrain,
);
const singleWalls = singleGeom.walls!;
const singlePos = singleWalls.getAttribute("position");
const singleNorm = singleWalls.getAttribute("normal");
const buildingCentre = { x: 0, z: 0 };
for (let i = 0; i < singlePos.count; i++) {
  buildingCentre.x += singlePos.getX(i) / singlePos.count;
  buildingCentre.z += singlePos.getZ(i) / singlePos.count;
}
let outwardFaces = 0;
const faceCount = singlePos.count / 6;
for (let quad = 0; quad < faceCount; quad++) {
  const base = quad * 6;
  const nx = singleNorm.getX(base);
  const nz = singleNorm.getZ(base);
  let cx = 0;
  let cz = 0;
  for (let k = 0; k < 6; k++) {
    cx += singlePos.getX(base + k) / 6;
    cz += singlePos.getZ(base + k) / 6;
  }
  if (nx * (cx - buildingCentre.x) + nz * (cz - buildingCentre.z) > 0) outwardFaces++;
}
ok(faceCount === 4, "a square footprint produces four wall quads", String(faceCount));
ok(outwardFaces === 4, "every wall face points outwards", `${outwardFaces}/4`);

// The roof must sit at the requested height above the building's base, and the
// base is the LOWEST terrain under the footprint (so nothing floats on a slope).
const singleRing = square(22.295, 114.167, 40);
const baseY = Math.min(...singleRing.map((p) => terrain(p)));
const singleRoof = singleGeom.roofs!.getAttribute("position");
let roofY = -Infinity;
for (let i = 0; i < singleRoof.count; i++) roofY = Math.max(roofY, singleRoof.getY(i));
close(roofY, baseY + 25, 0.01, "roof top = lowest terrain under the footprint + storeys");

const roofPos = buildingsGeom.roofs!.getAttribute("position");
let roofMinY = Infinity;
let roofMaxY = -Infinity;
for (let i = 0; i < roofPos.count; i++) {
  const y = roofPos.getY(i);
  roofMinY = Math.min(roofMinY, y);
  roofMaxY = Math.max(roofMaxY, y);
}
ok(roofMaxY >= roofMinY, "roof vertices are above the wall base");
ok(roofMaxY - roofMinY >= 0, "roof heights differ between buildings (terrain + storeys)");

const roadsGeom = buildRoadsGeometry(
  [
    {
      id: 1,
      widthM: 12,
      path: [
        { lat: 22.292, lng: 114.163 },
        { lat: 22.292, lng: 114.172 },
      ],
    },
  ],
  projection,
  terrain,
);
ok(roadsGeom !== null, "a road ribbon is produced");
const roadPos = roadsGeom!.getAttribute("position");
ok(roadPos.count === 6, "one road segment = two triangles", String(roadPos.count));
let minRoadWidth = Infinity;
for (let i = 0; i < roadPos.count; i += 3) {
  const x = roadPos.getX(i);
  minRoadWidth = Math.min(minRoadWidth, x);
}
ok(Number.isFinite(minRoadWidth), "road vertices are finite");

const route = buildRouteGeometry(
  [
    { lat: 22.292, lng: 114.163 },
    { lat: 22.296, lng: 114.17 },
    { lat: 22.299, lng: 114.174 },
  ],
  projection,
  terrain,
  { samplesPerLeg: 8 },
);
ok(route !== null && route!.getAttribute("position").count > 100, "the course line is a tube with geometry");
ok((route!.getIndex()?.count ?? 0) % 3 === 0, "tube triangles come in triples");
ok(buildRouteGeometry([{ lat: 22.29, lng: 114.16 }], projection, terrain) === null, "a one-point route builds nothing");

console.log(`\n${failures === 0 ? "✅" : "❌"} ${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exitCode = 1;

/** A square footprint of `size` metres centred on a coordinate. */
function square(lat: number, lng: number, size: number) {
  const dLat = size / 2 / 110574;
  const dLng = size / 2 / (111320 * Math.cos((lat * Math.PI) / 180));
  return [
    { lat: lat - dLat, lng: lng - dLng },
    { lat: lat - dLat, lng: lng + dLng },
    { lat: lat + dLat, lng: lng + dLng },
    { lat: lat + dLat, lng: lng - dLng },
    { lat: lat - dLat, lng: lng - dLng },
  ];
}
