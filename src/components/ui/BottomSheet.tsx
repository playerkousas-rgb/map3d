/**
 * Mobile-first panel that slides up from the bottom edge — the layout the whole
 * touch UI is built on.
 *
 * On a phone a floating desktop panel would either cover the 3D scene or be too
 * small to tap, so every panel here is a sheet with three stops (peek / half /
 * full) that is dragged by its handle and snaps to the nearest one. On a wide
 * screen the same content renders as an ordinary side panel, so one component
 * serves both layouts and the pages do not fork.
 */

import { css } from "@emotion/react";
import { ReactNode, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/i18n";
import { useIsMobile, useMediaQuery, useViewportMetrics } from "@/hooks/useIsMobile";
import { sheetStops, type SheetSnap } from "@/utils/panelLayout";

export type { SheetSnap } from "@/utils/panelLayout";

interface BottomSheetProps {
  children: ReactNode;
  /** Fixed header on tall screens; part of the scroll body on short screens. */
  header: ReactNode;
  /** Visible peek target in pixels, capped to the available viewport. */
  peekHeight?: number;
  /** width of the side panel on wide screens */
  desktopWidth?: number;
  defaultSnap?: SheetSnap;
  /** force a stop from the outside (e.g. open the details after tapping a marker) */
  snap?: SheetSnap;
  onSnapChange?: (snap: SheetSnap) => void;
  ariaLabel?: string;
}

const TRANSITION = "transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)";

export function BottomSheet({
  children,
  header,
  peekHeight = 132,
  desktopWidth = 340,
  defaultSnap = "peek",
  snap: controlledSnap,
  onSnapChange,
  ariaLabel,
}: BottomSheetProps) {
  const { t } = useI18n();
  const dragged = useRef(false);
  const narrow = useIsMobile(900);
  const landscape = useMediaQuery("(min-width: 500px) and (max-height: 500px) and (orientation: landscape)");
  const isMobile = narrow && !landscape;
  const viewport = useViewportMetrics();
  const [snap, setSnap] = useState<SheetSnap>(controlledSnap ?? defaultSnap);
  const [previousCommand, setPreviousCommand] = useState(controlledSnap);
  // A changed prop commands a stop; gestures remain local between commands.
  // Adjust before commit rather than rendering once with stale state in an effect.
  if (previousCommand !== controlledSnap) {
    setPreviousCommand(controlledSnap);
    if (controlledSnap) setSnap(controlledSnap);
  }
  const containerRef = useRef<HTMLElement>(null);
  const drag = useRef<{ startY: number; startOffset: number; offset: number } | null>(null);

  const heights = useMemo(() => sheetStops(viewport.height, viewport.navHeight, peekHeight),
    [viewport.height, viewport.navHeight, peekHeight]);
  const fullHeight = heights.full;
  const compactHeader = fullHeight < 360;
  const maxOffset = fullHeight - heights.peek;
  const offsetFor = useCallback((state: SheetSnap) => fullHeight - heights[state], [fullHeight, heights]);

  const applyOffset = (offset: number) => {
    const node = containerRef.current;
    if (!node) return;
    node.style.transition = "none";
    node.style.transform = `translateY(${offset}px)`;
  };

  /**
   * Announce the space the sheet occupies so floating controls (the camera
   * palette, hints) can sit clear of it instead of guessing a fixed offset.
   */
  const publishHeight = useCallback((state: SheetSnap) => {
    const root = document.documentElement.style;
    root.setProperty("--sheet-h", isMobile ? `${heights[state]}px` : "0px");
    root.setProperty("--sheet-w", isMobile ? "0px" : `${desktopWidth}px`);
    root.setProperty("--viewport-top", `${viewport.top}px`);
    root.setProperty("--viewport-bottom", `${viewport.bottom}px`);
    root.setProperty("--viewport-h", `${viewport.height}px`);
    root.setProperty("--scene-bottom", isMobile ? `${viewport.bottom + heights[state]}px`
      : `calc(${viewport.bottom}px + var(--safe-bottom))`);
  }, [isMobile, heights, desktopWidth, viewport]);

  const commit = useCallback(
    (next: SheetSnap) => {
      const node = containerRef.current;
      if (node) {
        node.style.transition = TRANSITION;
        node.style.transform = `translateY(${offsetFor(next)}px)`;
      }
      setSnap(next);
      publishHeight(next);
      onSnapChange?.(next);
    },
    [offsetFor, onSnapChange, publishHeight],
  );

  // Publish desktop dimensions too: the previous effect returned early because
  // only the phone branch had a ref. Layout effects avoid a stale-overlap paint.
  useLayoutEffect(() => {
    const node = containerRef.current;
    if (node && isMobile) {
      node.style.transition = TRANSITION;
      node.style.transform = `translateY(${offsetFor(snap)}px)`;
    }
    publishHeight(snap);
    return () => {
      for (const property of ["--sheet-h", "--sheet-w", "--viewport-top", "--viewport-bottom", "--viewport-h", "--scene-bottom"]) {
        document.documentElement.style.removeProperty(property);
      }
    };
  }, [snap, isMobile, offsetFor, publishHeight]);

  const onPointerDown = (event: React.PointerEvent) => {
    dragged.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = {
      startY: event.clientY,
      startOffset: offsetFor(snap),
      offset: offsetFor(snap),
    };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const state = drag.current;
    if (!state) return;
    const delta = event.clientY - state.startY;
    if (Math.abs(delta) > 4) dragged.current = true;
    state.offset = Math.max(0, Math.min(state.startOffset + delta, maxOffset));
    applyOffset(state.offset);
  };

  const onPointerUp = () => {
    const state = drag.current;
    drag.current = null;
    if (!state) return;
    // Snap to whichever stop the handle was released nearest to.
    const remaining = fullHeight - state.offset; // visible height
    const candidates: SheetSnap[] = ["peek", "half", "full"];
    let best: SheetSnap = "peek";
    let bestDistance = Infinity;
    for (const candidate of candidates) {
      const distance = Math.abs(heights[candidate] - remaining);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
    commit(best);
  };

  if (!isMobile) {
    return (
      <aside
        ref={containerRef}
        data-course-panel="sidebar"
        aria-label={ariaLabel}
        css={css({
          position: "fixed",
          boxSizing: "border-box",
          top: "calc(var(--topnav-h) + var(--viewport-top, 0px))",
          right: "var(--safe-right)",
          bottom: "var(--viewport-bottom, 0px)",
          paddingBottom: "var(--safe-bottom)",
          width: `${desktopWidth}px`,
          zIndex: 1200,
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#ffffffdd",
          backdropFilter: "blur(14px)",
          borderLeft: "1px solid #e8eaed",
          boxShadow: "-2px 0 18px rgba(0,0,0,0.06)",
        })}
      >
        {!compactHeader && <div css={css({ padding: "0.9rem 1rem", display: "flex", flexDirection: "column", gap: "0.6rem" })}>
          {header}
        </div>}
        <div data-course-scroll="" css={css({ padding: "0 1rem 1rem", flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", display: "flex", flexDirection: "column" })}>
          {compactHeader && <div css={css({ padding: "0.9rem 0" })}>{header}</div>}
          {children}
        </div>
      </aside>
    );
  }

  return (
    <section
      ref={containerRef}
      data-course-panel="sheet"
      aria-label={ariaLabel}
      css={css({
        position: "fixed",
        left: 0,
        right: 0,
        bottom: "var(--viewport-bottom, 0px)",
        boxSizing: "border-box",
        height: `${fullHeight}px`,
        zIndex: 1200,
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#fffffff2",
        backdropFilter: "blur(16px)",
        borderTopLeftRadius: "18px",
        borderTopRightRadius: "18px",
        boxShadow: "0 -6px 26px rgba(0,0,0,0.14)",
        borderTop: "1px solid #eceef1",
        paddingBottom: "var(--safe-bottom)",
        paddingLeft: "var(--safe-left)",
        paddingRight: "var(--safe-right)",
        overflow: "hidden",
        // start off-screen; the effect below moves it to the right stop
        transform: `translateY(${fullHeight}px)`,
        transition: TRANSITION,
        willChange: "transform",
      })}
    >
      <div css={css({ padding: "0 14px", flexShrink: 0 })}>
        <button
          type="button"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-label={t("panelResize")}
          aria-expanded={snap !== "peek"}
          onClick={() => {
            if (dragged.current) { dragged.current = false; return; }
            commit(snap === "peek" ? "half" : snap === "half" ? "full" : "peek");
          }}
          onKeyDown={event => {
            if (event.key === "ArrowUp") commit(snap === "peek" ? "half" : "full");
            else if (event.key === "ArrowDown") commit(snap === "full" ? "half" : "peek");
            else if (event.key === "Home") commit("peek");
            else if (event.key === "End") commit("full");
            else return;
            event.preventDefault();
          }}
          css={css({ display: "flex", justifyContent: "center", alignItems: "center", width: "100%",
            minHeight: 44, border: 0, background: "transparent", borderRadius: 10,
            cursor: "grab", touchAction: "none" })}
        >
          <span aria-hidden="true" css={css({ width: 44, height: 5, borderRadius: 999, backgroundColor: "#c8ccd2" })} />
        </button>
      </div>
      {!compactHeader && <div css={css({ padding: "0 14px 10px", flexShrink: 0 })}>{header}</div>}

      <div data-course-scroll=""
        css={css({
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          padding: "0 14px 12px",
          // The body scrolls independently; only the handle drags the sheet.
          overflowY: "auto",
          overscrollBehavior: "contain",
          touchAction: "pan-y",
        })}
      >
        {compactHeader && <div css={css({ paddingBottom: 10 })}>{header}</div>}
        {children}
      </div>
    </section>
  );
}
