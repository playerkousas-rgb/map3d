/**
 * Viewport helpers for the mobile layout.
 *
 * Media queries select the panel form. Separate visual-viewport metrics track
 * resize/pan and measured navigation bounds; physical keyboard behaviour still
 * needs device testing.
 */

import { useEffect, useState } from "react";

/** Width at or below which the layout switches to the touch-first variant. */
export const MOBILE_BREAKPOINT = 720;

function matches(query: string): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(query).matches;
}

export function useIsMobile(breakpoint = MOBILE_BREAKPOINT): boolean {
  return useMediaQuery(`(max-width: ${breakpoint}px)`);
}

export function useMediaQuery(query: string): boolean {
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

/** Visible bounds also account for keyboard pan/resize, not only CSS height.
 * Layout-viewport emulation in tests is not physical keyboard certification.
 */
function readViewport() {
  if (typeof window === "undefined") return { height: 800, top: 0, bottom: 0, navHeight: 52 };
  const vv = window.visualViewport;
  const top = Math.max(0, Math.round(vv?.offsetTop ?? 0));
  const height = Math.max(0, Math.round(vv?.height ?? window.innerHeight));
  const nav = document.querySelector("[data-topnav]");
  return { height, top, bottom: Math.max(0, window.innerHeight - top - height),
    navHeight: nav?.getBoundingClientRect().height ?? (matches("(max-width: 720px)") ? 52 : 48) };
}

export function useViewportMetrics() {
  const [viewport, setViewport] = useState(readViewport);
  useEffect(() => {
    const read = () => {
      const next = readViewport();
      setViewport(previous => Object.keys(next).every(key =>
        next[key as keyof typeof next] === previous[key as keyof typeof previous]) ? previous : next);
    };
    const observer = new ResizeObserver(read);
    const nav = document.querySelector("[data-topnav]");
    if (nav) observer.observe(nav);
    read();
    window.addEventListener("resize", read);
    window.addEventListener("orientationchange", read);
    window.visualViewport?.addEventListener("resize", read);
    window.visualViewport?.addEventListener("scroll", read);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", read);
      window.removeEventListener("orientationchange", read);
      window.visualViewport?.removeEventListener("resize", read);
      window.visualViewport?.removeEventListener("scroll", read);
    };
  }, []);
  return viewport;
}
