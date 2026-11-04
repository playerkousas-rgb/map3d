import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { useExportStore } from "@/state/exportStore";
import { collectExportGroup, exportObject } from "@/utils/exporters";

/**
 * Lives inside a <Canvas>. Watches the export store and exports
 * enabled object hierarchies marked userData.exportable when triggered.
 */
export function ExportListener() {
  const { scene } = useThree();
  const requestId = useExportStore((s) => s.requestId);
  const format = useExportStore((s) => s.format);
  const filename = useExportStore((s) => s.filename);
  // Start from the current request id: when a scene (re)mounts it must not
  // replay an export that was requested for the previous scene.
  const handled = useRef(useExportStore.getState().status === "queued" ? 0 : useExportStore.getState().requestId);

  useEffect(() => {
    if (requestId === 0 || requestId === handled.current) return;
    handled.current = requestId;

    const store = useExportStore.getState();
    if (!store.start(requestId)) return;
    // Include synchronous collection errors as well as asynchronous encoders.
    Promise.resolve().then(() => exportObject(collectExportGroup(scene), format, filename))
      .then(() => store.finish(requestId, true))
      .catch((err) => {
        console.error("Export failed:", err);
        store.finish(requestId, false);
      });
  }, [requestId, format, filename, scene]);

  return null;
}
