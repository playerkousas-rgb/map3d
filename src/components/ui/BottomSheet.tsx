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
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useIsMobile, useViewportHeight } from "@/hooks/useIsMobile";

export type SheetSnap = "peek" | "half" | "full";

interface BottomSheetProps {
  children: ReactNode;
  /** always-visible part of the sheet (title row, tool rail, key stats) */
  header: ReactNode;
  /** height of the peek stop in pixels, excluding the safe-area padding */
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
const HALF_RATIO = 0.46;
const FULL_RATIO = 0.86;

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
  const isMobile = useIsMobile(900);
  const viewportHeight = useViewportHeight();
  const [snap, setSnap] = useState<SheetSnap>(controlledSnap ?? defaultSnap);
  const containerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; startOffset: number; offset: number } | null>(null);

  useEffect(() => {
    if (controlledSnap) setSnap(controlledSnap);
  }, [controlledSnap]);

  const fullHeight = Math.round(viewportHeight * FULL_RATIO);
  const heights: Record<SheetSnap, number> = {
    peek: peekHeight,
    half: Math.round(viewportHeight * HALF_RATIO),
    full: fullHeight,
  };
  const maxOffset = fullHeight - heights.peek;
  const offsetFor = useCallback(
    (state: SheetSnap) => Math.max(0, Math.min(fullHeight - heights[state], maxOffset)),
    // heights are derived from the viewport, so this must follow it
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fullHeight, maxOffset, viewportHeight, peekHeight],
  );

  const applyOffset = (offset: number) => {
    const node = containerRef.current;
    if (!node) return;
    node.style.transition = "none";
    node.style.transform = `translateY(${offset}px)`;
  };

  /**
   * Announce the space the sheet occupies so floating controls (the camera
   * rail, hints) can sit clear of it instead of guessing a fixed offset.
   */
  const publishHeight = useCallback(
    (state: SheetSnap) => {
      if (typeof document === "undefined") return;
      const root = document.documentElement.style;
      if (isMobile) {
        root.setProperty("--sheet-h", `${heights[state]}px`);
        root.setProperty("--sheet-w", "0px");
      } else {
        root.setProperty("--sheet-h", "0px");
        root.setProperty("--sheet-w", `${desktopWidth}px`);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewportHeight, peekHeight, isMobile, desktopWidth],
  );

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

  // Keep the sheet glued to the right stop when the viewport changes (rotation,
  // keyboard, browser chrome).
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    node.style.transition = TRANSITION;
    node.style.transform = `translateY(${offsetFor(snap)}px)`;
    publishHeight(snap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportHeight, offsetFor]);

  const onPointerDown = (event: React.PointerEvent) => {
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
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
        aria-label={ariaLabel}
        css={css({
          position: "fixed",
          top: "var(--topnav-h)",
          right: 0,
          bottom: 0,
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
        <div css={css({ padding: "0.9rem 1rem", display: "flex", flexDirection: "column", gap: "0.6rem" })}>
          {header}
        </div>
        <div css={css({ padding: "0 1rem 1rem", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" })}>
          {children}
        </div>
      </aside>
    );
  }

  return (
    <section
      ref={containerRef}
      aria-label={ariaLabel}
      css={css({
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
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
        touchAction: "none",
        // start off-screen; the effect below moves it to the right stop
        transform: `translateY(${fullHeight}px)`,
        transition: TRANSITION,
        willChange: "transform",
      })}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="button"
        tabIndex={0}
        aria-label={ariaLabel ?? "Panel"}
        css={css({
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "10px",
          padding: "8px 14px 10px",
          cursor: "grab",
          touchAction: "none",
          flexShrink: 0,
        })}
      >
        <span
          aria-hidden
          css={css({
            width: "44px",
            height: "5px",
            borderRadius: "999px",
            backgroundColor: "#c8ccd2",
          })}
        />
        <div css={css({ width: "100%" })}>{header}</div>
      </div>

      <div
        css={css({
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          padding: "0 14px 12px",
          // content scrolls with the finger again, the sheet keeps the handle
          touchAction: "auto",
        })}
      >
        {children}
      </div>
    </section>
  );
}
