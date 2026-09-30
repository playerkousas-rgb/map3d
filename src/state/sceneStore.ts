/**
 * Load status *and* data of the orienteering 3D scene.
 *
 * The scene needs three things — buildings, roads and terrain — and any of
 * them may fail (the public Overpass and elevation APIs are best-effort).
 * They are fetched here, in a step of their own *before* the 3D view opens,
 * so a planner sees the city arrive (with counts and a retry for anything
 * that failed) and only starts placing controls once the scene is really
 * there. The 3D components just read the result.
 *
 * Buildings and roads arrive **progressively**: the area is cut into cells
 * (see `utils/sceneData`) and every cell that answers is published straight
 * away, so a large area fills the counter as it loads and a cell that fails
 * never cancels the ones that worked.
 */

import { create } from "zustand";
import type { LatLng } from "@/utils/course";
import {
  CellProgress,
  fetchBuildings,
  fetchRoads,
  SceneBuilding,
  SceneRoad,
} from "@/utils/sceneData";
import { fieldRange, fetchHeightField, HeightField } from "@/utils/terrain";

export type LoadState = "idle" | "loading" | "ready" | "error";
export type ScenePart = "buildings" | "roads" | "terrain";

export interface SceneStatus {
  buildings: LoadState;
  roads: LoadState;
  terrain: LoadState;
  buildingCount: number;
  roadCount: number;
  terrainMin: number;
  terrainMax: number;
  terrainSource: string;
  /** true once the official map layer has been turned into a ground texture */
  groundTextured: boolean;
  /** true when the official layer exists but could not be textured */
  groundFailed: boolean;

  /** how the two multi-cell Overpass fetches are getting on */
  buildingCells: CellProgress;
  roadCells: CellProgress;
  /**
   * How many items the 3D view actually built, when that is fewer than what
   * was fetched. Only set when a safety ceiling was hit — a normal load never
   * fills this in, because nothing is dropped.
   */
  drawnBuildings: number | null;
  drawnRoads: number | null;

  /** the area the data below belongs to (null = nothing loaded) */
  dataArea: [LatLng, LatLng] | null;
  buildingData: SceneBuilding[];
  roadData: SceneRoad[];
  field: HeightField | null;

  set: (patch: Partial<SceneStatus>) => void;
  reset: () => void;
  /** Start (or restart) loading everything for an area. */
  load: (area: [LatLng, LatLng]) => void;
  /** Re-fetch one part that failed, keeping the rest. */
  retry: (part: ScenePart) => void;
  /** Report how much of the data the 3D view could actually draw. */
  setDrawn: (part: "buildings" | "roads", count: number) => void;
}

const IDLE_CELLS: CellProgress = { total: 0, done: 0, failed: 0 };

const INITIAL = {
  buildings: "idle" as LoadState,
  roads: "idle" as LoadState,
  terrain: "idle" as LoadState,
  buildingCount: 0,
  roadCount: 0,
  terrainMin: 0,
  terrainMax: 0,
  terrainSource: "",
  groundTextured: false,
  groundFailed: false,
  buildingCells: IDLE_CELLS,
  roadCells: IDLE_CELLS,
  drawnBuildings: null as number | null,
  drawnRoads: null as number | null,
  dataArea: null as [LatLng, LatLng] | null,
  buildingData: [] as SceneBuilding[],
  roadData: [] as SceneRoad[],
  field: null as HeightField | null,
};

/** True when every part has either arrived or given up. */
export function isSceneSettled(status: Pick<SceneStatus, ScenePart>): boolean {
  const done = (state: LoadState) => state === "ready" || state === "error";
  return done(status.buildings) && done(status.roads) && done(status.terrain);
}

export function sameArea(a: [LatLng, LatLng] | null, b: [LatLng, LatLng] | null): boolean {
  if (!a || !b) return false;
  return (
    a[0].lat === b[0].lat && a[0].lng === b[0].lng && a[1].lat === b[1].lat && a[1].lng === b[1].lng
  );
}

/** Bumped on every load() so a slow response for an old area is dropped. */
let generation = 0;

export const useSceneStore = create<SceneStatus>((set, get) => {
  const run = (part: ScenePart, area: [LatLng, LatLng]) => {
    const gen = generation;
    const fresh = () => gen === generation && sameArea(get().dataArea, area);
    set({ [part]: "loading" } as Partial<SceneStatus>);

    if (part === "buildings") {
      set({ buildingCells: { total: 0, done: 0, failed: 0 }, buildingData: [], buildingCount: 0 });
      fetchBuildings(area, (partial, cells) => {
        if (!fresh()) return;
        set({
          buildingData: partial,
          buildingCount: partial.length,
          buildingCells: cells,
        });
      })
        .then((result) => {
          if (!fresh()) return;
          set({ buildings: "ready", buildingCount: result.length, buildingData: result });
        })
        .catch((err) => {
          if (!fresh()) return;
          console.error("[map3d] buildings failed:", err);
          set({ buildings: "error" });
        });
    } else if (part === "roads") {
      set({ roadCells: { total: 0, done: 0, failed: 0 }, roadData: [], roadCount: 0 });
      fetchRoads(area, (partial, cells) => {
        if (!fresh()) return;
        set({ roadData: partial, roadCount: partial.length, roadCells: cells });
      })
        .then((result) => {
          if (!fresh()) return;
          set({ roads: "ready", roadCount: result.length, roadData: result });
        })
        .catch((err) => {
          if (!fresh()) return;
          console.error("[map3d] roads failed:", err);
          set({ roads: "error" });
        });
    } else {
      fetchHeightField(area)
        .then((result) => {
          if (!fresh()) return;
          const range = fieldRange(result);
          set({
            terrain: "ready",
            terrainMin: Math.round(range.min),
            terrainMax: Math.round(range.max),
            terrainSource: result.source,
            field: result,
          });
        })
        .catch((err) => {
          if (!fresh()) return;
          console.warn("[map3d] terrain failed:", err);
          set({ terrain: "error" });
        });
    }
  };

  return {
    ...INITIAL,
    set: (patch) => set(patch),
    reset: () => {
      generation++;
      set(INITIAL);
    },
    load: (area) => {
      generation++;
      set({ ...INITIAL, dataArea: area });
      run("buildings", area);
      run("roads", area);
      run("terrain", area);
    },
    retry: (part) => {
      const area = get().dataArea;
      if (!area || get()[part] === "loading") return;
      run(part, area);
    },
    setDrawn: (part, count) => {
      if (part === "buildings") set({ drawnBuildings: count });
      else set({ drawnRoads: count });
    },
  };
});
