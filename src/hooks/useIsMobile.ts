/**
 * Viewport helpers for the mobile layout.
 *
 * `useIsMobile` reacts to the media query *and* to the on-screen keyboard /
 * URL-bar height changes, so panels that are sized from the viewport keep
 * working when the browser chrome moves (which it does constantly on iOS).
 */

import { useEffect, useState } from "react";

/** Width at or below which the layout switches to the touch-first variant. */
export const MOBILE_BREAKPOINT = 720;

function matches(query: string): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(query).matches;
}

export function useIsMobile(breakpoint = MOBILE_BREAKPOINT): boolean {
  const query = `(max-width: ${breakpoint}px)`;
  const [isMobile, setIsMobile] = useState(() => matches(query));

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(query);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    if (mq.addEventListener) {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    // Safari < 14
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, [query]);

  return isMobile;
}

/** True when the primary input is a finger rather than a mouse. */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(() => matches("(pointer: coarse)"));
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(pointer: coarse)");
    const onChange = () => setCoarse(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return coarse;
}

/**
 * Visible viewport height in pixels — `window.innerHeight` on desktop, the
 * visual viewport (which shrinks with the keyboard) on mobile.
 */
export function useViewportHeight(): number {
  const [height, setHeight] = useState(() =>
    typeof window === "undefined" ? 800 : window.innerHeight,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const read = () => {
      const vv = window.visualViewport;
      setHeight(Math.round(vv ? vv.height : window.innerHeight));
    };
    read();
    window.addEventListener("resize", read);
    window.addEventListener("orientationchange", read);
    window.visualViewport?.addEventListener("resize", read);
    return () => {
      window.removeEventListener("resize", read);
      window.removeEventListener("orientationchange", read);
      window.visualViewport?.removeEventListener("resize", read);
    };
  }, []);

  return height;
}
