import * as THREE from "three";
import { buildTerrainIndices } from "../src/utils/terrain";
import { deflateRawSync } from "node:zlib";
import { Buffer } from "node:buffer";
import { readLocalGeoJson, validateGeoJson, geoJsonBounds, GIS_LIMITS } from "../src/utils/gis";
import { parseCourseJson, courseToJson, readCourseFile, COURSE_LIMITS, type Course } from "../src/utils/course";
import { encodeShare, decodeShare, SHARE_LIMITS } from "../src/utils/shareLink";
import { readPlannerDraft, useCourseStore } from "../src/state/courseStore";

export async function verifyInputFlows(ok: (condition: boolean, label: string) => void) {
  console.log("\n[9] Local GIS, bounded course/share inputs and player isolation");
  const reject = async (label: string, work: () => unknown) => {
    let rejected = false;
    try { await work(); } catch { rejected = true; }
    ok(rejected, label);
  };
  const ground = new THREE.BufferGeometry();
  ground.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 0, -1, 1, 0, -1], 3));
  ground.setIndex(buildTerrainIndices(1)); ground.computeVertexNormals();
  ok([0, 1, 2, 3].every(i => ground.getAttribute("normal").getY(i) > 0.99), "south-first ground normals point up, not away from the camera");
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(ground, material);
  ok(new THREE.Raycaster(new THREE.Vector3(.3, 1, -.4), new THREE.Vector3(0, -1, 0)).intersectObject(mesh).length > 0, "front-side ground accepts a real downward raycast for control placement");
  ground.dispose(); material.dispose();
  const fc = { type: "FeatureCollection", features: [
    { type: "Feature", properties: { name: "<img src=x onerror=alert(1)>" }, geometry: { type: "Point", coordinates: [114.1, 22.3] } },
    { type: "Feature", properties: null, geometry: { type: "LineString", coordinates: [[114.2, 22.4], [114.3, 22.5]] } },
  ] };
  const json = JSON.stringify(fc);
  const file = (text = json, name = "clipped.geojson") => Object.assign(new Blob([text]), { name });
  const signal = new AbortController().signal;
  const result = await readLocalGeoJson(file(), signal);
  ok(result.data.features.length === 2 && JSON.stringify(result.bounds) === '[[22.3,114.1],[22.5,114.3]]', "local point/line file validates and computes lon/lat-correct Leaflet bounds");
  ok(geoJsonBounds(validateGeoJson({ type: "FeatureCollection", features: [] })) === null, "empty dataset has no pretend display bounds");
  await reject("local loader rejects empty geometries", () => readLocalGeoJson(file('{"type":"FeatureCollection","features":[]}'), signal));
  await reject("local loader rejects TIFF/ZIP extensions before decoding", () => readLocalGeoJson(file(json, "large.tif"), signal));
  let localRead = false;
  await reject("local loader rejects oversized file before stream access", () => readLocalGeoJson({ size: GIS_LIMITS.maxBytes + 1, name: "large.json", stream: () => { localRead = true; return new Blob([json]).stream(); } }, signal));
  ok(!localRead, "oversized local file is rejected without reading its contents");
  await reject("local loader still enforces streamed budget when advertised size is false", () => readLocalGeoJson({ size: 1, name: "false.json", stream: () => new Blob([new Uint8Array(GIS_LIMITS.maxBytes + 1)]).stream() }, signal));
  await reject("local loader rejects invalid JSON", () => readLocalGeoJson(file("<html>failed</html>"), signal));
  await reject("projected CRS is rejected even when its numeric coordinates look geographic", () => validateGeoJson({ ...fc, crs: { properties: { name: "EPSG:3857" } } }));
  ok(validateGeoJson({ ...fc, crs: { properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" } } }).features.length === 2, "explicit CRS84 metadata remains compatible");
  const invalidBytes = Object.assign(new Blob([new Uint8Array([255, 254])]), { name: "broken.json" });
  await reject("local loader rejects malformed UTF-8", () => readLocalGeoJson(invalidBytes, signal));
  const cancelled = new AbortController(); cancelled.abort();
  await reject("cancelled local load cannot publish geometry", () => readLocalGeoJson(file(), cancelled.signal));
  const pending = new AbortController();
  let streamCancelled = false;
  const stalled = readLocalGeoJson({ name: "stalled.json", size: 1, stream: () => new ReadableStream({ cancel() { streamCancelled = true; } }) }, pending.signal);
  pending.abort();
  await reject("abort cancels an actively stalled local stream", () => stalled);
  ok(streamCancelled, "local stream cancellation releases the reader");

  const course: Course = { name: "Local draft", playMode: "linear", controls: [
    { id: "a", kind: "start", lat: 22.3, lng: 114.16, code: "S", name: "Start", clue: "Gate", note: "PRIVATE PLANNER NOTE", score: 0 },
    { id: "b", kind: "control", lat: 22.301, lng: 114.161, code: "31", name: "Control", clue: "Lamp", note: "do not share", score: 10 },
    { id: "c", kind: "finish", lat: 22.302, lng: 114.162, code: "F", name: "Finish", clue: "Exit", note: "", score: 0 },
  ] };
  ok(parseCourseJson(courseToJson(course)).controls[0].note === "PRIVATE PLANNER NOTE", "JSON backup preserves private planner notes");
  const withControl = (patch: object) => JSON.stringify({ ...course, controls: [{ ...course.controls[0], ...patch }] });
  for (const patch of [{ lat: 91 }, { lng: -181 }, { lat: null }, { lat: "" }, { score: "Infinity" }, { clue: {} }]) {
    await reject(`course rejects invalid field ${JSON.stringify(patch)}`, () => parseCourseJson(withControl(patch)));
  }
  await reject("course rejects duplicate IDs instead of ambiguous edits", () => parseCourseJson(JSON.stringify({ ...course, controls: [course.controls[0], course.controls[0]] })));
  await reject("course rejects excessive control count", () => parseCourseJson(JSON.stringify({ controls: Array(COURSE_LIMITS.maxControls + 1).fill({ lat: 22, lng: 114 }) })));
  await reject("course rejects oversized text before JSON parse", () => parseCourseJson(" ".repeat(COURSE_LIMITS.maxBytes + 1)));
  await reject("course rejects overlong user fields", () => parseCourseJson(withControl({ clue: "a".repeat(COURSE_LIMITS.maxFieldChars + 1) })));
  let courseRead = false;
  await reject("course file size is checked before file.text", () => readCourseFile({ size: COURSE_LIMITS.maxBytes + 1, text: async () => { courseRead = true; return courseToJson(course); } }));
  ok(!courseRead, "oversized course file is rejected without invoking file.text");
  const backup = courseToJson(course);
  ok(await readCourseFile(new Blob([backup])) === backup, "bounded course file reader accepts ordinary backups");

  const area: [{ lat: number; lng: number }, { lat: number; lng: number }] = [{ lat: 22.29, lng: 114.15 }, { lat: 22.31, lng: 114.17 }];
  const token = await encodeShare(area, course);
  const shared = await decodeShare(token);
  ok(shared.course.controls.length === 3 && shared.course.name === course.name, "compressed/plain player link round-trips course and area");
  ok(shared.course.controls.every(c => c.note === "") && course.controls[0].note !== "", "player share strips planner notes without modifying the saved course");
  await reject("share rejects oversized token before base64/decompression", () => decodeShare("j" + "a".repeat(SHARE_LIMITS.maxTokenChars)));
  await reject("share rejects malformed base64url", () => decodeShare("j%%%"));
  const plain = (value: unknown) => "j" + Buffer.from(JSON.stringify(value)).toString("base64url");
  await reject("share rejects out-of-range area", () => decodeShare(plain({ a: [{ lat: 999, lng: 114 }, area[1]], c: course })));
  await reject("share rejects a zero-width area", () => encodeShare([area[0], area[0]], course));
  ok((await decodeShare(plain({ a: area, c: shared.course }))).course.controls.length === 3, "plain fallback player links remain compatible");
  const bomb = "z" + deflateRawSync(JSON.stringify({ a: area, c: shared.course, padding: "x".repeat(SHARE_LIMITS.maxJsonBytes + 1) })).toString("base64url");
  let bombCode = "";
  try { await decodeShare(bomb); } catch (error) { bombCode = (error as Error).message; }
  ok(bombCode === "SHARE_TOO_LARGE", "valid compressed JSON is stopped at the output budget, not merely rejected by JSON parsing");

  const draftReader = (value: unknown) => readPlannerDraft({ getItem: () => JSON.stringify(value) });
  const empty = { ...course, name: "Named empty draft", meet: "Meet retained", controls: [] };
  const emptyDraft = draftReader({ course: empty, scene: { showContours: false, groundLayer: "plain", terrainExaggeration: 2 }, area });
  ok(emptyDraft.storageStatus === "ready" && emptyDraft.course.name === empty.name && emptyDraft.course.meet === empty.meet && emptyDraft.course.controls.length === 0, "reload retains names/metadata on legitimate empty drafts");
  ok(parseCourseJson(courseToJson(empty)).name === empty.name, "own JSON backups also round-trip an empty draft");
  ok(emptyDraft.scene.groundLayer === "plain" && !emptyDraft.scene.showContours && emptyDraft.scene.terrainExaggeration === 2 && JSON.stringify(emptyDraft.area) === JSON.stringify(area), "saved scene and valid area restore with the course");
  const malformed = draftReader({ course, scene: { showGrid: "false", showBuildings: 0, groundLayer: "unknown", terrainExaggeration: "NaN", extra: "ignored" }, area: [{ lat: 999, lng: 114 }, area[1]] });
  ok(malformed.storageStatus === "ready" && malformed.scene.showGrid && malformed.scene.showBuildings && malformed.scene.groundLayer === "hm20c" && malformed.scene.terrainExaggeration === 1 && !("extra" in malformed.scene) && malformed.area === null, "untrusted saved scene/area are sanitized without losing the valid course");
  ok(draftReader({ course, area: [area[0], area[0]] }).area === null && draftReader({ course, area: [null, null] }).area === null, "zero-size and null saved bounds cannot reach the map");
  ok(readPlannerDraft(null).storageStatus === "unavailable" && readPlannerDraft({ getItem: () => { throw new Error("SecurityError"); } }).storageStatus === "unavailable", "missing or blocked storage is reported without crashing startup");
  for (const raw of ["", "{broken", JSON.stringify({ course: { ...course, controls: [{ ...course.controls[0], lat: 999 }] } }), "x".repeat(1_100_001)]) {
    const loaded = readPlannerDraft({ getItem: () => raw });
    ok(loaded.storageStatus === "invalid" && loaded.unreadableDraft === raw, "unreadable draft is preserved byte-for-byte for recovery, not silently discarded");
  }

  const savedDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const memory = new Map<string, string>();
  let failWrites = false;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { if (failWrites) throw new Error("QuotaExceededError"); memory.set(key, value); } } });
  const original = useCourseStore.getState();
  try {
    const store = useCourseStore.getState();
    store.replaceCourse(course); store.setArea(area);
    const before = JSON.stringify([...memory]);
    store.enterPlayMode(shared.course, area);
    const snapshot = JSON.stringify(useCourseStore.getState().course);
    store.setName("mutated"); store.clearControls(); store.newCourse(); store.resetAll(); store.undo(); store.redo(); store.setArea(null); store.importCourse("broken");
    ok(useCourseStore.getState().readOnly && JSON.stringify(useCourseStore.getState().course) === snapshot, "all course mutation entry points fail closed in player mode");
    store.setScene({ showGrid: false });
    ok(JSON.stringify([...memory]) === before, "player display changes never overwrite the planner's localStorage");
    store.exitPlayMode();
    ok(!useCourseStore.getState().readOnly && useCourseStore.getState().course.controls[0].note === "PRIVATE PLANNER NOTE", "leaving player mode restores the saved private draft");

    failWrites = true;
    store.setName("Unsaved RAM draft");
    const unsavedArea: typeof area = [{ lat: 22.25, lng: 114.12 }, { lat: 22.35, lng: 114.22 }];
    store.setArea(unsavedArea); store.setScene({ groundLayer: "plain", showGrid: false });
    const unsaved = structuredClone({ course: useCourseStore.getState().course, scene: useCourseStore.getState().scene, area: useCourseStore.getState().area });
    ok(useCourseStore.getState().storageStatus === "write-error", "quota/permission failure becomes explicit save-error state");
    const diskBefore = JSON.stringify([...memory]);
    store.enterPlayMode(shared.course, area); store.setScene({ groundLayer: "imagery" });
    store.enterPlayMode({ ...shared.course, name: "Second player" }, area);
    store.retrySave();
    ok(JSON.stringify([...memory]) === diskBefore, "retry cannot write a public course while in player mode");
    store.exitPlayMode();
    const restored = useCourseStore.getState();
    ok(JSON.stringify({ course: restored.course, scene: restored.scene, area: restored.area }) === JSON.stringify(unsaved), "leaving multiple player links restores unsaved RAM course, private notes, area and scene exactly");
    ok(restored.storageStatus === "write-error" && restored.plannerSnapshot === null, "player exit retains the save warning and releases the temporary snapshot");
    store.retrySave();
    ok(useCourseStore.getState().storageStatus === "write-error", "unsuccessful retry does not falsely claim a saved draft");
    failWrites = false; store.retrySave();
    ok(useCourseStore.getState().storageStatus === "ready" && JSON.parse(memory.get("map3d.orienteering.v1")!).course.name === "Unsaved RAM draft", "successful retry writes the latest private draft and clears the warning");

    memory.set("map3d.orienteering.v1", "{original unreadable bytes");
    useCourseStore.setState(readPlannerDraft({ getItem: key => memory.get(key) ?? null }));
    store.setName("Temporary replacement"); store.retrySave();
    ok(memory.get("map3d.orienteering.v1") === "{original unreadable bytes" && useCourseStore.getState().storageStatus === "invalid", "editing/retrying cannot silently overwrite an unreadable original");
    failWrites = true; store.replaceUnreadableDraft();
    ok(useCourseStore.getState().storageStatus === "write-error" && useCourseStore.getState().unreadableDraft === "{original unreadable bytes" && memory.get("map3d.orienteering.v1") === "{original unreadable bytes", "failed authorized replacement still retains recoverable original bytes");
    failWrites = false; store.retrySave();
    ok(useCourseStore.getState().storageStatus === "ready" && useCourseStore.getState().unreadableDraft === null && JSON.parse(memory.get("map3d.orienteering.v1")!).course.name === "Temporary replacement", "authorized replacement succeeds only after storage accepts the write");

  } finally {
    useCourseStore.setState(original, true);
    if (savedDescriptor) Object.defineProperty(globalThis, "localStorage", savedDescriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
}
