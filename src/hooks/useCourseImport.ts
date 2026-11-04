import { useEffect, useLayoutEffect, useRef } from "react";
import { useCourseStore } from "@/state/courseStore";
import { readCourseFile } from "@/utils/course";

/** Latest selection wins; leaving the editor, editing or opening a player invalidates old reads. */
export function useCourseImport(active: boolean, onError: (failed: boolean) => void) {
  const generation = useRef(0);
  const activeRef = useRef(active);
  useEffect(() => {
    const revision = generation;
    const unsubscribe = useCourseStore.subscribe((state, previous) => {
      if (state.course !== previous.course || state.readOnly !== previous.readOnly) revision.current++;
    });
    return () => { revision.current++; unsubscribe(); };
  }, []);
  // Publish only committed renders. A suspended/abandoned render must not
  // invalidate a live file selection; layout cleanup closes the commit-to-effect gap.
  useLayoutEffect(() => {
    const revision = generation;
    activeRef.current = active;
    revision.current++;
    return () => { activeRef.current = false; revision.current++; };
  }, [active]);

  return async (file: File) => {
    const current = ++generation.current;
    const before = useCourseStore.getState();
    if (!activeRef.current || before.readOnly) return;
    const stillCurrent = () => current === generation.current && activeRef.current &&
      !useCourseStore.getState().readOnly && useCourseStore.getState().course === before.course &&
      !window.location.hash.startsWith("#play=");
    try {
      const text = await readCourseFile(file);
      if (!stillCurrent()) return;
      useCourseStore.getState().importCourse(text);
      onError(false);
    } catch {
      // A superseded failure must not replace feedback for the current course.
      if (stillCurrent()) onError(true);
    }
  };
}
