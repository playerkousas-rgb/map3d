import { create } from "zustand";
import type { ExportFormat } from "@/utils/exporters";

export type ExportStatus = "idle" | "queued" | "running" | "success" | "error";
const FORMATS: readonly string[] = ["glb", "gltf", "obj", "stl", "dxf"];
export function safeExportFilename(value: string): string {
  return value.replace(/[^\w\u4e00-\u9fff-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "map3d";
}
type ExportStore = {
  requestId: number;
  format: ExportFormat;
  filename: string;
  status: ExportStatus;
  requestExport: (format: ExportFormat, filename?: string) => boolean;
  start: (requestId: number) => boolean;
  finish: (requestId: number, success: boolean) => void;
  dismiss: () => void;
};
export const useExportStore = create<ExportStore>((set, get) => ({
  requestId: 0, format: "glb", filename: "map3d", status: "idle",
  requestExport: (format, filename = "map3d") => {
    const state = get();
    if (!FORMATS.includes(format) || state.status === "queued" || state.status === "running") return false;
    set({ requestId: state.requestId + 1, format, filename: safeExportFilename(filename), status: "queued" });
    return true;
  },
  start: requestId => {
    if (get().requestId !== requestId || get().status !== "queued") return false;
    set({ status: "running" });
    return true;
  },
  finish: (requestId, success) => {
    if (get().requestId === requestId && get().status === "running") set({ status: success ? "success" : "error" });
  },
  dismiss: () => {
    if (["success", "error"].includes(get().status)) set({ status: "idle" });
  },
}));
