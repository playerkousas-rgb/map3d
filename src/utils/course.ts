/**
 * Orienteering course model — the data a city-orienteering planner works with:
 * a start triangle, numbered checkpoints and a finish double circle, each with
 * a clue, a score (for score events) and a grid reference.
 *
 * The shape is deliberately compatible with the Scout System / HKMAP planner
 * (`{ name, playMode, controls: [{ id, kind, lat, lng, code, name, clue, note, score }] }`)
 * so a course drafted on the desktop planner imports straight into the 3D view,
 * and vice versa — see {@link parseCourseJson}.
 */

import { gridBearing, planarDistance } from "./hkgeo";

export interface LatLng {
  lat: number;
  lng: number;
}

export type ControlKind = "start" | "control" | "finish";

export interface CourseControl extends LatLng {
  id: string;
  kind: ControlKind;
  /** printed code — "S" for the start, "F" for the finish, otherwise 1, 2, 3… */
  code: string;
  name: string;
  /** the clue shown to competitors, e.g. "燈柱底部" */
  clue: string;
  /** planner-only note, never printed */
  note: string;
  /** score-event points */
  score: number;
}

export type PlayMode = "linear" | "score";

export interface Course {
  name: string;
  playMode: PlayMode;
  controls: CourseControl[];
  /** assembly / meeting point, printed on the sheet */
  meet?: string;
  /** latest finishing time, printed on the sheet */
  cutoff?: string;
  /** emergency contact, printed on the sheet */
  sos?: string;
}

export interface CourseLeg {
  from: CourseControl;
  to: CourseControl;
  /** planar distance in metres */
  distanceM: number;
  /** grid bearing, 0 = north clockwise */
  bearingDeg: number;
  /** bearing corrected for magnetic declination */
  magneticDeg: number;
}

export interface CourseStats {
  /** total planar distance of the ordered route, metres */
  totalM: number;
  legs: CourseLeg[];
  controlCount: number;
  /** score-event total */
  totalScore: number;
}

export const CONTROL_KIND_ORDER: ControlKind[] = ["start", "control", "finish"];

/** Human label for a control kind. */
export function controlKindLabel(kind: ControlKind, zh: boolean): string {
  if (kind === "start") return zh ? "起點" : "Start";
  if (kind === "finish") return zh ? "終點" : "Finish";
  return zh ? "檢查點" : "Control";
}

/** The symbol used on the printed sheet: △ start, ○ control, ◎ finish. */
export function controlSymbol(kind: ControlKind): string {
  if (kind === "start") return "△";
  if (kind === "finish") return "◎";
  return "○";
}

/**
 * Route order: the start first, then checkpoints in code order, then the finish.
 * Score events are free-order, so their checkpoints keep the planner's order.
 */
export function orderedControls(course: Course): CourseControl[] {
  const rank = (c: CourseControl) => {
    if (c.kind === "start") return 0;
    if (c.kind === "finish") return 2;
    return 1;
  };
  return [...course.controls].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (course.playMode === "linear") {
      const na = Number(a.code);
      const nb = Number(b.code);
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    }
    return 0;
  });
}

/** Distance, bearing and elevation of every leg, plus the event totals. */
export function courseStats(course: Course): CourseStats {
  const list = orderedControls(course);
  const legs: CourseLeg[] = [];
  let totalM = 0;
  for (let i = 1; i < list.length; i++) {
    const from = list[i - 1];
    const to = list[i];
    const distanceM = planarDistance(from, to);
    const bearingDeg = gridBearing(from, to);
    const magneticDeg = (bearingDeg - 3.1 + 360) % 360;
    totalM += distanceM;
    legs.push({ from, to, distanceM, bearingDeg, magneticDeg });
  }
  return {
    totalM,
    legs,
    controlCount: list.filter((c) => c.kind === "control").length,
    totalScore: list.reduce((sum, c) => sum + (c.score || 0), 0),
  };
}

/** Next free checkpoint number — highest existing code + 1, so codes never collide. */
export function nextCode(controls: CourseControl[]): string {
  let max = 0;
  for (const c of controls) {
    if (c.kind !== "control") continue;
    const n = Number(c.code);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1);
}

let idCounter = 0;

/** Stable-enough unique id for a control (no crypto dependency, keeps export small). */
export function newControlId(): string {
  idCounter += 1;
  return `cp-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

export function createControl(
  kind: ControlKind,
  at: LatLng,
  controls: CourseControl[],
): CourseControl {
  return {
    id: newControlId(),
    kind,
    lat: at.lat,
    lng: at.lng,
    code: kind === "control" ? nextCode(controls) : kind === "start" ? "S" : "F",
    name: "",
    clue: "",
    note: "",
    score: 0,
  };
}

export function emptyCourse(name = ""): Course {
  return { name, playMode: "linear", controls: [] };
}

/** A course is only printable/usable when it has a start, at least one control and a finish. */
export function courseIsComplete(course: Course): boolean {
  return (
    course.controls.some((c) => c.kind === "start") &&
    course.controls.some((c) => c.kind === "control") &&
    course.controls.some((c) => c.kind === "finish")
  );
}

/* ------------------------------------------------------------------ *
 * JSON import / export (HKMAP-compatible)
 * ------------------------------------------------------------------ */

function coerceControl(raw: any): CourseControl | null {
  const lat = Number(raw?.lat);
  const lng = Number(raw?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const kindRaw = String(raw?.kind ?? "control");
  const kind: ControlKind =
    kindRaw === "start" || kindRaw === "finish" ? (kindRaw as ControlKind) : "control";
  return {
    id: typeof raw?.id === "string" && raw.id ? raw.id : newControlId(),
    kind,
    lat,
    lng,
    code: String(raw?.code ?? (kind === "control" ? "" : kind === "start" ? "S" : "F")),
    name: String(raw?.name ?? ""),
    clue: String(raw?.clue ?? ""),
    note: String(raw?.note ?? ""),
    score: Number(raw?.score) || 0,
  };
}

/**
 * Read a course from JSON text. Accepts, in order of preference:
 *   1. the HKMAP local draft  `{ current: { name, controls: [...] } }`
 *   2. a course object        `{ name, playMode, controls: [...] }`
 *   3. a bare control array   `[{ kind, lat, lng, code }, …]`
 * Throws a readable error when nothing usable is found.
 */
export function parseCourseJson(text: string): Course {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("INVALID_JSON");
  }
  const source = data?.current ?? data?.course ?? data;
  const rawControls = Array.isArray(source) ? source : source?.controls;
  if (!Array.isArray(rawControls)) throw new Error("NO_CONTROLS");

  const controls = rawControls.map(coerceControl).filter((c): c is CourseControl => c !== null);
  if (controls.length === 0) throw new Error("NO_CONTROLS");

  // Re-number checkpoints when the source did not carry codes.
  let auto = 1;
  for (const c of controls) {
    if (c.kind === "control" && !c.code) c.code = String(auto++);
  }

  return {
    name: String(source?.name ?? ""),
    playMode: source?.playMode === "score" ? "score" : "linear",
    controls,
    meet: source?.meet ? String(source.meet) : undefined,
    cutoff: source?.cutoff ? String(source.cutoff) : undefined,
    sos: source?.sos ? String(source.sos) : undefined,
  };
}

/** Serialise a course — the same shape HKMAP writes, so files round-trip between the two. */
export function courseToJson(course: Course): string {
  return JSON.stringify(
    {
      app: "map3d-orienteering",
      version: 1,
      exportedAt: new Date().toISOString(),
      course,
    },
    null,
    2,
  );
}

/** Bounding box of the course [south, west, north, east], or null when empty. */
export function courseBounds(course: Course): [number, number, number, number] | null {
  if (course.controls.length === 0) return null;
  let south = 90;
  let west = 180;
  let north = -90;
  let east = -180;
  for (const c of course.controls) {
    south = Math.min(south, c.lat);
    north = Math.max(north, c.lat);
    west = Math.min(west, c.lng);
    east = Math.max(east, c.lng);
  }
  return [south, west, north, east];
}
