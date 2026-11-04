/** Layout budgets, not course/data limits. Keep 44px scene controls and the
 * wrapped attribution above a phone sheet, even at its fullest stop.
 */
export const SCENE_CLEARANCE = 116;
export type SheetSnap = "peek" | "half" | "full";

export function sheetStops(viewportHeight: number, navHeight: number, peekHeight: number) {
  const finite = (value: number) => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const height = finite(viewportHeight);
  const full = Math.min(Math.round(height * 0.86), Math.max(0, height - finite(navHeight) - SCENE_CLEARANCE));
  const peek = Math.min(finite(peekHeight), full);
  const half = Math.min(full, Math.max(peek, Math.round(height * 0.46)));
  return { peek, half, full };
}
