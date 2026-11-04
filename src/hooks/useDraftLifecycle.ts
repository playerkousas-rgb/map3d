import { useEffect } from "react";
import { ORTHO_STORAGE_KEY, useCourseStore } from "@/state/courseStore";

/** One app-level listener; never auto-load external data over a local/private draft. */
export function useDraftLifecycle() {
  useEffect(() => {
    const check = () => useCourseStore.getState().checkStorage();
    const storage = (event: StorageEvent) => {
      try {
        if (event.storageArea === localStorage && (event.key === ORTHO_STORAGE_KEY || event.key === null)) check();
      } catch { check(); }
    };
    const visible = () => { if (document.visibilityState === "visible") check(); };
    const unload = (event: BeforeUnloadEvent) => {
      if (!useCourseStore.getState().draftDirty) return;
      // Best effort only: mobile process termination may not dispatch beforeunload.
      event.preventDefault();
      event.returnValue = "";
    };
    check();
    window.addEventListener("storage", storage);
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", check);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("beforeunload", unload);
    return () => {
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", check);
      window.removeEventListener("pageshow", check);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("beforeunload", unload);
    };
  }, []);
}
