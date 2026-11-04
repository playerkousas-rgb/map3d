/**
 * Orienteering course store.
 *
 * Holds the course being designed, which control is selected, the active tool
 * and how the 3D scene should be drawn. Planner changes attempt to save
 * into localStorage (same "no account, survives a refresh" behaviour as the
 * HKMAP planner), and undo/redo keeps a 50-step history of course snapshots.
 */

import { create } from "zustand";
import {
  Course,
  CourseControl,
  ControlKind,
  LatLng,
  createControl,
  emptyCourse,
  parseCourseJson,
  courseToJson,
  courseIssue,
  type CourseIssue,
} from "@/utils/course";

export type OrthoTool = "view" | "move" | "delete" | ControlKind;
export type GroundLayer = "hm20c" | "imagery" | "countryside" | "plain";
/** Which stop the mobile bottom sheet is resting at. */
export type PanelSnap = "peek" | "half" | "full";

const STORAGE_KEY = "map3d.orienteering.v1";
const HISTORY_LIMIT = 50;

export interface OrthoSceneOptions {
  groundLayer: GroundLayer;
  showBuildings: boolean;
  showRoads: boolean;
  showTerrain: boolean;
  /** vertical exaggeration applied to the terrain mesh */
  terrainExaggeration: number;
  showGrid: boolean;
  showContours: boolean;
  showHillshade: boolean;
  showRoute: boolean;
}

interface Persisted {
  course: Course;
  scene: OrthoSceneOptions;
  area: [LatLng, LatLng] | null;
}

const DEFAULT_SCENE: OrthoSceneOptions = {
  groundLayer: "hm20c",
  showBuildings: true,
  showRoads: true,
  showTerrain: true,
  terrainExaggeration: 1,
  showGrid: true,
  showContours: true,
  showHillshade: true,
  showRoute: true,
};

export type DraftStorageStatus = "ready" | "saving" | "unavailable" | "invalid" | "write-error" | "conflict";
interface LoadedDraft extends Persisted {
  storageStatus: DraftStorageStatus;
  unreadableDraft: string | null;
  /** Exact baseline; undefined means storage was never successfully read. */
  storageBase: string | null | undefined;
}

function normalizeScene(value: unknown): OrthoSceneOptions {
  const input = value as Partial<OrthoSceneOptions> | null;
  const scene = { ...DEFAULT_SCENE };
  for (const key of ["showBuildings", "showRoads", "showTerrain", "showGrid", "showContours", "showHillshade", "showRoute"] as const) {
    if (typeof input?.[key] === "boolean") scene[key] = input[key];
  }
  if (["hm20c", "imagery", "countryside", "plain"].includes(input?.groundLayer ?? "")) scene.groundLayer = input!.groundLayer!;
  if (typeof input?.terrainExaggeration === "number" && Number.isFinite(input.terrainExaggeration) && input.terrainExaggeration >= .5 && input.terrainExaggeration <= 3) scene.terrainExaggeration = input.terrainExaggeration;
  return scene;
}

function normalizeArea(value: unknown): [LatLng, LatLng] | null {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(p => Number.isFinite(p?.lat) && Number.isFinite(p?.lng) && Math.abs(p.lat) <= 85 && Math.abs(p.lng) <= 180) || value[0].lat === value[1].lat || value[0].lng === value[1].lng) return null;
  return [{ lat: value[0].lat, lng: value[0].lng }, { lat: value[1].lat, lng: value[1].lng }];
}

/** Pure reader for testable recovery: never writes/deletes an unreadable draft. */
export function readPlannerDraft(storage: Pick<Storage, "getItem"> | null): LoadedDraft {
  const fallback = (): LoadedDraft => ({ course: emptyCourse(), scene: { ...DEFAULT_SCENE }, area: null, storageStatus: "ready", unreadableDraft: null, storageBase: null });
  let raw: string | null = null;
  try {
    if (!storage) return { ...fallback(), storageStatus: "unavailable", storageBase: undefined };
    raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return fallback();
    if (raw.length > 1_100_000) throw new Error("DRAFT_TOO_LARGE");
    const data = JSON.parse(raw);
    return { course: parseCourseJson(JSON.stringify(data?.course), { allowEmpty: true }),
      scene: normalizeScene(data?.scene), area: normalizeArea(data?.area), storageStatus: "ready", unreadableDraft: null, storageBase: raw };
  } catch {
    return { ...fallback(), storageStatus: raw !== null ? "invalid" : "unavailable", unreadableDraft: raw, storageBase: raw === null ? undefined : raw };
  }
}

function loadPersisted(): LoadedDraft {
  try { return readPlannerDraft(typeof localStorage === "undefined" ? null : localStorage); }
  catch { return readPlannerDraft(null); }
}

interface CourseStore extends LoadedDraft {
  externalDraft: string | null | undefined;
  externalInvalid: boolean;
  draftDirty: boolean;
  saveRequest: number;
  draftRevision: number;
  checkStorage: () => void;
  loadExternalDraft: (observed: string | null) => void;
  overwriteExternalDraft: (observed: string | null) => void;
  courseError: CourseIssue | null;
  dismissCourseError: () => void;
  exportCourseJson: () => string | null;
  /** In-memory fallback preserves unsaved work while a player link is open. */
  plannerSnapshot: Persisted | null;
  retrySave: () => void;
  replaceUnreadableDraft: () => void;
  /**
   * Player mode: the course arrived through a share link and is only viewed.
   * Nothing is editable and nothing is written to localStorage, so opening a
   * player link never overwrites the course a planner has on the same phone.
   */
  readOnly: boolean;
  selectedId: string | null;
  tool: OrthoTool;
  panelSnap: PanelSnap;
  past: Course[];
  future: Course[];

  setName: (name: string) => void;
  setTool: (tool: OrthoTool) => void;
  setPanelSnap: (snap: PanelSnap) => void;
  setScene: (patch: Partial<OrthoSceneOptions>) => void;
  /** set (or clear) the area the 3D scene covers */
  setArea: (area: [LatLng, LatLng] | null) => void;

  select: (id: string | null) => void;
  addControl: (kind: ControlKind, at: LatLng) => void;
  updateControl: (id: string, patch: Partial<CourseControl>) => void;
  moveControl: (id: string, at: LatLng) => void;
  removeControl: (id: string) => void;
  clearControls: () => void;

  replaceCourse: (course: Course) => void;
  importCourse: (text: string) => void;
  newCourse: () => void;
  resetAll: () => void;

  undo: () => void;
  redo: () => void;

  /** Show a shared course read-only (player link). */
  enterPlayMode: (course: Course, area: [LatLng, LatLng]) => void;
  /** Leave player mode and bring back the planner's own saved course. */
  exitPlayMode: () => void;
}

export function hasDraftWriteLock(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.locks?.request === "function";
}

let queuedSave: AbortController | null = null;
function cancelQueuedSave() { queuedSave?.abort(); queuedSave = null; }

/** A cooperative origin-scoped lock + exact baseline check, never last-writer-wins. */
function persist(state: CourseStore, replacement?: { observed: string | null }) {
  if (state.readOnly) return;
  if (!replacement && (state.storageStatus === "invalid" || state.storageStatus === "conflict" || (state.unreadableDraft !== null && !["write-error", "saving"].includes(state.storageStatus)))) {
    useCourseStore.setState({ draftDirty: true });
    return;
  }
  if (!acceptCourse(state.course, courseError => useCourseStore.setState({ courseError }))) return;
  const request = state.saveRequest + 1;
  const revision = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  // Capture private data now, never read a public course after awaiting the lock.
  const payload = JSON.stringify({ course: state.course, scene: state.scene, area: state.area, revision });
  useCourseStore.setState({ saveRequest: request, draftDirty: true, storageStatus: "saving" });
  const fail = () => {
    if (useCourseStore.getState().saveRequest === request) useCourseStore.setState({ storageStatus: "write-error" });
  };
  const write = () => {
    const current = useCourseStore.getState();
    if (current.saveRequest !== request || current.readOnly) return;
    try {
      if (typeof localStorage === "undefined") throw new Error("STORAGE_UNAVAILABLE");
      const actual = localStorage.getItem(STORAGE_KEY);
      const expected = replacement ? replacement.observed : current.storageBase ?? null;
      if (actual !== expected) {
        useCourseStore.setState({ storageStatus: "conflict", externalDraft: actual, externalInvalid: false, draftDirty: true });
        return;
      }
      localStorage.setItem(STORAGE_KEY, payload);
      useCourseStore.setState({ storageBase: payload, storageStatus: "ready", unreadableDraft: null, externalDraft: undefined, externalInvalid: false, draftDirty: false });
    } catch { fail(); }
  };
  if (hasDraftWriteLock()) {
    cancelQueuedSave();
    const controller = new AbortController();
    queuedSave = controller;
    try {
      void navigator.locks.request(STORAGE_KEY, { mode: "exclusive", signal: controller.signal }, write)
        .catch(() => { if (!controller.signal.aborted) fail(); })
        .finally(() => { if (queuedSave === controller) queuedSave = null; });
    } catch {
      if (queuedSave === controller) queuedSave = null;
      fail();
    }
  } else {
    // No atomic compare-and-set exists in localStorage. UI warns to edit in one tab.
    write();
  }
}

/** Wrap a course mutation so it lands in history first and is persisted after. */
function commit(
  set: (fn: (state: CourseStore) => Partial<CourseStore>) => void,
  get: () => CourseStore,
  mutate: (course: Course, state: CourseStore) => Partial<CourseStore>,
) {
  const state = get();
  if (state.readOnly) return;
  const patch = mutate(state.course, state);
  if (!acceptCourse(patch.course ?? state.course, error => set(() => ({ courseError: error })))) return;
  const snapshot = structuredClone(state.course);
  set(() => ({ ...patch, courseError: null, past: [...state.past, snapshot].slice(-HISTORY_LIMIT), future: [] }));
  persist(get());
}

/** Validate before changing course, selection, history or durable storage. */
function acceptCourse(course: Course, reject: (error: CourseIssue) => void): boolean {
  try { courseToJson(course); return true; }
  catch (error) { reject(courseIssue(error)); return false; }
}

const initial = loadPersisted();

export const useCourseStore = create<CourseStore>((set, get) => ({
  ...initial,
  externalDraft: undefined,
  externalInvalid: false,
  draftDirty: false,
  saveRequest: 0,
  draftRevision: 0,
  checkStorage: () => {
    try {
      if (typeof localStorage === "undefined") throw new Error("STORAGE_UNAVAILABLE");
      const actual = localStorage.getItem(STORAGE_KEY);
      const state = get();
      if (actual !== (state.storageBase ?? null)) set({ storageStatus: "conflict", externalDraft: actual, externalInvalid: false, draftDirty: true, saveRequest: state.saveRequest + 1 });
    } catch {
      if (!["invalid", "conflict"].includes(get().storageStatus)) set({ storageStatus: "unavailable" });
    }
  },
  loadExternalDraft: (observed) => {
    if (get().readOnly || get().storageStatus !== "conflict") return;
    try {
      const actual = localStorage.getItem(STORAGE_KEY);
      if (actual !== observed) { set({ externalDraft: actual, externalInvalid: false }); return; }
      const loaded = readPlannerDraft({ getItem: () => actual });
      if (loaded.storageStatus === "invalid") { set({ externalInvalid: true, externalDraft: actual }); return; }
      set(state => ({ ...loaded, externalDraft: undefined, externalInvalid: false, draftDirty: false, saveRequest: state.saveRequest + 1, draftRevision: state.draftRevision + 1,
        selectedId: null, tool: "view", past: [], future: [], courseError: null }));
    } catch { set({ storageStatus: "unavailable" }); }
  },
  overwriteExternalDraft: (observed) => {
    if (get().readOnly || get().storageStatus !== "conflict") return;
    persist(get(), { observed });
  },
  courseError: null,
  dismissCourseError: () => set({ courseError: null }),
  exportCourseJson: () => {
    try { return courseToJson(get().course); }
    catch (error) { set({ courseError: courseIssue(error) }); return null; }
  },
  plannerSnapshot: null,
  retrySave: () => persist(get()),
  replaceUnreadableDraft: () => {
    if (get().readOnly || get().storageStatus !== "invalid") return;
    persist(get(), { observed: get().storageBase ?? null });
  },
  readOnly: false,
  selectedId: null,
  tool: "view",
  panelSnap: "peek",
  past: [],
  future: [],

  setName: (name) => {
    if (get().readOnly) return;
    const course = { ...get().course, name };
    if (!acceptCourse(course, courseError => set({ courseError }))) return;
    set({ course, courseError: null });
    persist(get());
  },

  setTool: (tool) => {
    if (get().readOnly) return;
    // Placing controls needs the list visible, so opening a placing tool lifts
    // the sheet out of its collapsed state.
    set(tool === "view" ? { tool } : { tool, panelSnap: "half" });
  },

  setPanelSnap: (panelSnap) => set({ panelSnap }),

  setScene: (patch) => {
    set((state) => ({ scene: { ...state.scene, ...patch } }));
    persist(get());
  },

  setArea: (area) => {
    if (get().readOnly) return;
    set({ area });
    persist(get());
  },

  select: (id) =>
    // Selecting a control is a request to see its details, so the sheet opens.
    set(id ? { selectedId: id, panelSnap: "half" } : { selectedId: null }),

  addControl: (kind, at) =>
    commit(set, get, (course) => {
      // Only one start and one finish per course — a second tap moves the first.
      const existing = course.controls.find((c) => c.kind === kind && kind !== "control");
      if (existing) {
        return {
          selectedId: existing.id,
          course: {
            ...course,
            controls: course.controls.map((c) =>
              c.id === existing.id ? { ...c, lat: at.lat, lng: at.lng } : c,
            ),
          },
        };
      }
      const control = createControl(kind, at, course.controls);
      return {
        selectedId: control.id,
        course: { ...course, controls: [...course.controls, control] },
      };
    }),

  updateControl: (id, patch) =>
    commit(set, get, (course) => ({
      course: {
        ...course,
        controls: course.controls.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      },
    })),

  moveControl: (id, at) =>
    commit(set, get, (course) => ({
      course: {
        ...course,
        controls: course.controls.map((c) =>
          c.id === id ? { ...c, lat: at.lat, lng: at.lng } : c,
        ),
      },
    })),

  removeControl: (id) =>
    commit(set, get, (course, state) => ({
      selectedId: state.selectedId === id ? null : state.selectedId,
      course: { ...course, controls: course.controls.filter((c) => c.id !== id) },
    })),

  clearControls: () =>
    commit(set, get, (course) => ({
      selectedId: null,
      course: { ...course, controls: [] },
    })),

  replaceCourse: (course) => {
    if (get().readOnly) return;
    if (!acceptCourse(course, courseError => set({ courseError }))) return;
    const snapshot = structuredClone(get().course);
    set((state) => ({
      course,
      courseError: null,
      selectedId: null,
      past: [...state.past, snapshot].slice(-HISTORY_LIMIT),
      future: [],
    }));
    persist(get());
  },

  importCourse: (text) => {
    if (get().readOnly) return;
    const course = parseCourseJson(text);
    get().replaceCourse(course);
  },

  newCourse: () => {
    if (get().readOnly) return;
    const snapshot = structuredClone(get().course);
    set((state) => ({
      course: emptyCourse(""),
      courseError: null,
      selectedId: null,
      tool: "view",
      past: [...state.past, snapshot].slice(-HISTORY_LIMIT),
      future: [],
    }));
    persist(get());
  },

  resetAll: () => {
    if (get().readOnly) return;
    set({
      course: emptyCourse(""),
      courseError: null,
      selectedId: null,
      tool: "view",
      past: [],
      future: [],
      area: null,
    });
    persist(get());
  },

  undo: () => {
    if (get().readOnly) return;
    const { past, course, future } = get();
    const previous = past[past.length - 1];
    if (!previous || !acceptCourse(previous, courseError => set({ courseError }))) return;
    set({
      courseError: null,
      course: previous,
      past: past.slice(0, -1),
      future: [structuredClone(course), ...future].slice(0, HISTORY_LIMIT),
      selectedId: null,
    });
    persist(get());
  },

  enterPlayMode: (course, area) => {
    cancelQueuedSave();
    set(state => ({
      saveRequest: state.saveRequest + 1,
      storageStatus: state.storageStatus === "saving" ? "write-error" : state.storageStatus,
      plannerSnapshot: state.readOnly ? state.plannerSnapshot : structuredClone({ course: state.course, scene: state.scene, area: state.area }),
      readOnly: true,
      course,
      area,
      selectedId: null,
      tool: "view",
      panelSnap: "peek",
      past: [],
      future: [],
    }));
  },

  exitPlayMode: () => {
    if (!get().readOnly) return;
    const saved = get().plannerSnapshot ?? loadPersisted();
    set({
      readOnly: false,
      plannerSnapshot: null,
      course: saved.course,
      area: saved.area,
      scene: saved.scene,
      selectedId: null,
      tool: "view",
      past: [],
      future: [],
    });
  },

  redo: () => {
    if (get().readOnly) return;
    const { past, course, future } = get();
    const next = future[0];
    if (!next || !acceptCourse(next, courseError => set({ courseError }))) return;
    set({
      courseError: null,
      course: next,
      past: [...past, structuredClone(course)].slice(-HISTORY_LIMIT),
      future: future.slice(1),
      selectedId: null,
    });
    persist(get());
  },

}) as CourseStore);

/** Selector helpers so components don't re-render on every store change. */
export const selectSelectedControl = (state: CourseStore): CourseControl | null =>
  state.course.controls.find((c) => c.id === state.selectedId) ?? null;

export const ORTHO_STORAGE_KEY = STORAGE_KEY;
