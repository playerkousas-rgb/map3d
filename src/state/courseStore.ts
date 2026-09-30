/**
 * Orienteering course store.
 *
 * Holds the course being designed, which control is selected, the active tool
 * and how the 3D scene should be drawn. Everything a planner types is mirrored
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
  showRoute: true,
};

function loadPersisted(): Persisted {
  if (typeof localStorage === "undefined") {
    return { course: emptyCourse(), scene: DEFAULT_SCENE, area: null };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { course: emptyCourse(), scene: DEFAULT_SCENE, area: null };
    const data = JSON.parse(raw);
    const stored = data?.course;
    const course =
      stored?.controls?.length > 0
        ? parseCourseJson(JSON.stringify(stored))
        : emptyCourse(typeof stored?.name === "string" ? stored.name : "");
    return {
      course,
      scene: { ...DEFAULT_SCENE, ...(data?.scene ?? {}) },
      area: Array.isArray(data?.area) && data.area.length === 2 ? data.area : null,
    };
  } catch {
    return { course: emptyCourse(), scene: DEFAULT_SCENE, area: null };
  }
}

interface CourseStore extends Persisted {
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
}

function persist(state: CourseStore) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ course: state.course, scene: state.scene, area: state.area }),
    );
  } catch {
    /* storage full or blocked — the app keeps working, it just stops remembering */
  }
}

/** Wrap a course mutation so it lands in history first and is persisted after. */
function commit(
  set: (fn: (state: CourseStore) => Partial<CourseStore>) => void,
  get: () => CourseStore,
  mutate: (course: Course, state: CourseStore) => Partial<CourseStore>,
) {
  const state = get();
  const snapshot = structuredClone(state.course);
  set((current) => {
    const patch = mutate(current.course, current);
    const next: Partial<CourseStore> = {
      ...patch,
      past: [...current.past, snapshot].slice(-HISTORY_LIMIT),
      future: [],
    };
    return next;
  });
  persist(get());
}

const initial = loadPersisted();

export const useCourseStore = create<CourseStore>((set, get) => ({
  ...initial,
  selectedId: null,
  tool: "view",
  panelSnap: "peek",
  past: [],
  future: [],

  setName: (name) => {
    set((state) => ({ course: { ...state.course, name } }));
    persist(get());
  },

  setTool: (tool) => {
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
    const snapshot = structuredClone(get().course);
    set((state) => ({
      course,
      selectedId: null,
      past: [...state.past, snapshot].slice(-HISTORY_LIMIT),
      future: [],
    }));
    persist(get());
  },

  importCourse: (text) => {
    const course = parseCourseJson(text);
    get().replaceCourse(course);
  },

  newCourse: () => {
    const snapshot = structuredClone(get().course);
    set((state) => ({
      course: emptyCourse(""),
      selectedId: null,
      tool: "view",
      past: [...state.past, snapshot].slice(-HISTORY_LIMIT),
      future: [],
    }));
    persist(get());
  },

  resetAll: () => {
    set({
      course: emptyCourse(""),
      selectedId: null,
      tool: "view",
      past: [],
      future: [],
      area: null,
    });
    persist(get());
  },

  undo: () => {
    const { past, course, future } = get();
    const previous = past[past.length - 1];
    if (!previous) return;
    set({
      course: previous,
      past: past.slice(0, -1),
      future: [structuredClone(course), ...future].slice(0, HISTORY_LIMIT),
      selectedId: null,
    });
    persist(get());
  },

  redo: () => {
    const { past, course, future } = get();
    const next = future[0];
    if (!next) return;
    set({
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
