import { useLayoutEffect, useState } from "react";

/** Prefer native top-layer dismissal/focus restoration. An explicit modeless
 * fallback keeps camera actions usable when the Popover API is unavailable.
 * Neither branch traps focus or claims dialog modality.
 */
export function useCameraPalette(paletteId: string, triggerId: string) {
  const [native] = useState(() => typeof HTMLElement !== "undefined" &&
    typeof HTMLElement.prototype.showPopover === "function");
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    if (native || !open) return;
    const palette = document.getElementById(paletteId);
    const trigger = document.getElementById(triggerId);
    palette?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      trigger?.focus({ preventScroll: true });
    };
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || palette?.contains(event.target) || trigger?.contains(event.target)) return;
      // Leave focus with the newly clicked control, rather than stealing it.
      setOpen(false);
    };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", outside);
    };
  }, [native, open, paletteId, triggerId]);

  return { native, open, setOpen,
    toggle: () => { if (!native) setOpen(previous => !previous); },
    hide: () => {
      if (native) return;
      setOpen(false);
      document.getElementById(triggerId)?.focus({ preventScroll: true });
    },
  };
}
