import { create } from "zustand";
import { ExportFormat } from "@/utils/exporters";

type ExportStore = {
  /** increments every time an export is requested */
  requestId: number;
  format: ExportFormat;
  filename: string;

  requestExport: (format: ExportFormat, filename?: string) => void;
};

export const useExportStore = create<ExportStore>((set) => ({
  requestId: 0,
  format: "glb",
  filename: "map3d",

  requestExport: (format, filename = "map3d") =>
    set((state) => ({
      requestId: state.requestId + 1,
      format,
      filename,
    })),
}));
