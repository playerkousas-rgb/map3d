/**
 * Load status of the orienteering 3D scene.
 *
 * The scene loads three things independently — buildings, roads and terrain —
 * and any of them may fail (the public Overpass and elevation APIs are
 * best-effort). The DOM panel reads this store to show what actually arrived,
 * so a partial scene is explained rather than just looking broken.
 */

import { create } from "zustand";

export type LoadState = "idle" | "loading" | "ready" | "error";

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
  set: (patch: Partial<SceneStatus>) => void;
  reset: () => void;
}

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
};

export const useSceneStore = create<SceneStatus>((set) => ({
  ...INITIAL,
  set: (patch) => set(patch),
  reset: () => set(INITIAL),
}));
