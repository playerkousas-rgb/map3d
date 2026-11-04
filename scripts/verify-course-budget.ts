import { isDeepStrictEqual } from "node:util";
import { COURSE_LIMITS, courseToJson, parseCourseJson, type Course, type CourseControl } from "../src/utils/course";
import { readPlannerDraft, useCourseStore, ORTHO_STORAGE_KEY } from "../src/state/courseStore";

const encoder = new TextEncoder();
const bytes = (text: string) => encoder.encode(text).length;
const compact = (course: Course) => JSON.stringify({ app: "map3d-orienteering", version: 1, exportedAt: "2026-11-03T00:00:00.000Z", course });
// JSON intentionally omits undefined optional fields; property insertion order is not data.
const same = (a: unknown, b: unknown) => isDeepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
const control = (i: number): CourseControl => ({ id: `point-${i}`, kind: i === 0 ? "start" : "control", lat: 22.3, lng: 114.1, code: i === 0 ? "S" : String(i), name: "", clue: "", note: "", score: 0 });

/** Independent byte accounting; the timestamp length matches an ordinary ISO export. */
function sizedCourse(target: number): Course {
  const course: Course = { name: "Budget draft", playMode: "linear", controls: Array.from({ length: 80 }, (_, i) => ({ ...control(i), note: "界".repeat(4000) })) };
  let remaining = target - bytes(compact(course));
  for (const c of course.controls) {
    const size = Math.min(remaining, 4000);
    c.clue = "a".repeat(size);
    remaining -= size;
  }
  if (remaining !== 0 || bytes(compact(course)) !== target) throw new Error("Invalid test fixture size");
  return course;
}

export function verifyCourseBudgets(ok: (condition: boolean, label: string) => void) {
  console.log("\n[10] Lossless bounded course editing and backup round-trips");
  const rejects = (work: () => unknown, code: string) => {
    try { work(); return false; } catch (error) { return error instanceof Error && error.message === code; }
  };
  const ordinary: Course = { name: "Course 界😃", playMode: "score", meet: "", cutoff: "", sos: "", controls: [{ ...control(1), code: "", note: "PRIVATE", clue: "\"\n\\界😃" }] };
  const backup = courseToJson(ordinary);
  ok(backup.includes("\n  ") && same(parseCourseJson(backup), ordinary), "ordinary pretty backups preserve blank codes, empty metadata, escaped text, CJK/emoji and private notes exactly");
  ok(parseCourseJson(JSON.stringify({ controls: [{ lat: 22.3, lng: 114.1 }] })).controls[0].code === "1", "legacy missing codes still auto-number, without changing explicit blank codes");
  const exact = sizedCourse(COURSE_LIMITS.maxBytes);
  const exactBackup = courseToJson(exact);
  ok(bytes(exactBackup) === COURSE_LIMITS.maxBytes && !exactBackup.includes("\n"), "exact 1,000,000 UTF-8 bytes use compact JSON instead of rejecting whitespace overhead");
  ok(same(parseCourseJson(exactBackup), exact), "exact-limit multibyte backup reimports every field without truncation");
  const over = sizedCourse(COURSE_LIMITS.maxBytes + 1);
  ok(rejects(() => courseToJson(over), "COURSE_TOO_LARGE"), "one UTF-8 byte over the compact backup budget is rejected");
  ok(bytes(JSON.stringify(over)) < COURSE_LIMITS.maxBytes && rejects(() => parseCourseJson(JSON.stringify(over)), "COURSE_TOO_LARGE"), "import rejects normalized courses whose input fits but backup envelope cannot fit");
  const escaped = { ...ordinary, controls: [{ ...ordinary.controls[0], note: "\n".repeat(4000), clue: "😃".repeat(2000) }] };
  ok(same(parseCourseJson(courseToJson(escaped)), escaped), "4,000 UTF-16-unit boundary includes JSON escaping and surrogate pairs correctly");
  for (const key of ["id", "code", "name", "clue", "note"] as const) {
    ok(rejects(() => courseToJson({ ...ordinary, controls: [{ ...ordinary.controls[0], [key]: "a".repeat(4001) }] }), "TEXT_TOO_LONG"), `export rejects overlong control ${key}`);
  }
  for (const key of ["name", "meet", "cutoff", "sos"] as const) {
    ok(rejects(() => courseToJson({ ...ordinary, [key]: "a".repeat(4001) }), "TEXT_TOO_LONG"), `export rejects overlong course ${key}`);
  }
  const maximum: Course = { name: "Maximum controls", playMode: "linear", controls: Array.from({ length: 2000 }, (_, i) => control(i)) };
  ok(parseCourseJson(courseToJson(maximum)).controls.length === 2000, "all 2,000 controls round-trip at the allowed count boundary");
  ok(rejects(() => courseToJson({ ...maximum, controls: [...maximum.controls, control(2000)] }), "TOO_MANY_CONTROLS"), "export rejects 2,001 controls even below the byte budget");
  for (const patch of [{ lat: NaN }, { lng: 181 }, { score: Infinity }, { id: "" }, { name: 1 }, { unexpected: "do not silently discard" }]) {
    ok(rejects(() => courseToJson({ ...ordinary, controls: [{ ...ordinary.controls[0], ...patch } as CourseControl] }), "INVALID_COURSE"), `export fails closed on invalid schema ${Object.keys(patch)[0]}`);
  }
  ok(rejects(() => courseToJson({ ...ordinary, controls: [ordinary.controls[0], ordinary.controls[0]] }), "INVALID_COURSE"), "export refuses duplicate IDs without dropping a control");
  ok(readPlannerDraft({ getItem: () => JSON.stringify({ course: exact }) }).storageStatus === "ready", "exact-limit saved course restores as editable rather than unreadable");

  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const original = useCourseStore.getState();
  const memory = new Map<string, string>();
  let writes = 0;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { writes++; memory.set(key, value); } } });
  const snapshot = () => {
    const s = useCourseStore.getState();
    return { course: s.course, past: s.past, future: s.future, selectedId: s.selectedId, tool: s.tool, disk: [...memory], writes };
  };
  try {
    useCourseStore.setState({ readOnly: false, storageStatus: "ready", unreadableDraft: null, courseError: null });
    const store = useCourseStore.getState();
    store.replaceCourse(ordinary); store.select(ordinary.controls[0].id);
    let before = snapshot();
    store.setName("a".repeat(4001));
    ok(same(snapshot(), before) && useCourseStore.getState().courseError === "TEXT_TOO_LONG", "rejected name leaves course, undo/redo, selection and localStorage byte-for-byte unchanged");
    store.dismissCourseError();
    ok(useCourseStore.getState().courseError === null && same(snapshot(), before), "dismissing a limit warning changes no draft/history/storage data");
    for (const patch of [{ clue: "界".repeat(4001) }, { lat: 91 }, { lng: NaN }, { score: Infinity }]) {
      store.updateControl(ordinary.controls[0].id, patch);
      ok(same(snapshot(), before) && useCourseStore.getState().courseError !== null, `invalid manual update is atomic: ${Object.keys(patch)[0]}`);
    }
    store.moveControl(ordinary.controls[0].id, { lat: 22, lng: 181 });
    ok(same(snapshot(), before), "invalid move cannot enter history or storage");
    store.replaceCourse(over);
    ok(same(snapshot(), before) && useCourseStore.getState().courseError === "COURSE_TOO_LARGE", "oversized replacement cannot replace the current draft or add undo history");
    ok(rejects(() => store.importCourse(JSON.stringify(over)), "COURSE_TOO_LARGE") && same(snapshot(), before), "oversized normalized import leaves all existing draft data untouched");
    store.replaceCourse(maximum); store.select(maximum.controls[0].id);
    before = snapshot();
    store.addControl("control", { lat: 22.31, lng: 114.11 });
    ok(same(snapshot(), before) && useCourseStore.getState().courseError === "TOO_MANY_CONTROLS", "2,001st manual control is rejected before selection, history or storage changes");
    store.addControl("start", { lat: 22.31, lng: 114.11 });
    ok(useCourseStore.getState().course.controls.length === 2000 && useCourseStore.getState().course.controls[0].lat === 22.31 && useCourseStore.getState().courseError === null, "at count limit, moving the existing start still succeeds and clears the warning");
    store.replaceCourse(exact);
    before = snapshot();
    store.setName(exact.name + "a");
    ok(same(snapshot(), before) && useCourseStore.getState().courseError === "COURSE_TOO_LARGE", "one-byte manual growth at the total UTF-8 limit is atomic");
    store.addControl("control", { lat: 22.31, lng: 114.11 });
    ok(same(snapshot(), before), "manual point creation also observes total serialized bytes, not just count");
    const exported = store.exportCourseJson();
    ok(exported !== null && bytes(exported) === COURSE_LIMITS.maxBytes && same(parseCourseJson(exported), exact) && same(snapshot(), before), "safe export returns every exact-limit field without changing history/storage");
    store.removeControl(exact.controls.at(-1)!.id);
    ok(useCourseStore.getState().course.controls.length === 79 && useCourseStore.getState().courseError === null, "removing a control frees capacity and clears the limit error");
    store.undo();
    ok(same(useCourseStore.getState().course, exact), "undo returns to the exact valid boundary, not a rejected attempted edit");
    store.redo();
    ok(useCourseStore.getState().course.controls.length === 79 && parseCourseJson(store.exportCourseJson()!).controls.length === 79, "redo remains safely exportable and reimportable");
    const disk = memory.get(ORTHO_STORAGE_KEY);
    useCourseStore.setState({ course: over });
    ok(store.exportCourseJson() === null && useCourseStore.getState().courseError === "COURSE_TOO_LARGE" && memory.get(ORTHO_STORAGE_KEY) === disk, "defensive export returns no file for invalid external state and preserves the last saved draft");
  } finally {
    useCourseStore.setState(original, true);
    if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
}
