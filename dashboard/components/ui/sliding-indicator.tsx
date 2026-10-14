"use client";

import { useLayoutEffect, useRef } from "react";
import { DURATIONS, EASINGS, useReducedMotion } from "../../lib/motion";

export interface SlidingIndicatorProps {
  /** Shared id for every indicator in one tab group; the indicator slides between owners. */
  layoutId: string;
  className?: string;
}

/** Last page-relative box of each group's indicator, so the next owner can slide in from it. */
const lastBoxes = new Map<string, { left: number; top: number; width: number; height: number; at: number }>();
/** A box older than this is a page revisit, not a hand-off, so the indicator just appears. */
const HANDOFF_MS = 1000;

function pageBox(el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  return { left: rect.left + window.scrollX, top: rect.top + window.scrollY, width: rect.width, height: rect.height, at: performance.now() };
}

/**
 * Shared-layout indicator for custom tab rows that can't use `Tabs` directly.
 * Render it inside the active tab only; it slides from the previous owner to the new one and
 * snaps when the OS requests reduced motion. The slide is a Web Animations transform, which the
 * browser runs on the compositor, so a heavy table re-render after the click can't stall it.
 */
export function SlidingIndicator({ layoutId, className = "" }: SlidingIndicatorProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const previous = lastBoxes.get(layoutId);
    const next = pageBox(el);
    lastBoxes.set(layoutId, next);
    const dx = previous ? previous.left - next.left : 0;
    const dy = previous ? previous.top - next.top : 0;
    if (previous && next.at - previous.at < HANDOFF_MS && !reduced && next.width && next.height && typeof el.animate === "function"
      && (Math.abs(dx) >= 1 || Math.abs(dy) >= 1)) {
      const from = `translate(${dx}px, ${dy}px) scale(${previous.width / next.width}, ${previous.height / next.height})`;
      el.animate([{ transformOrigin: "0 0", transform: from }, { transformOrigin: "0 0", transform: "none" }],
        { duration: DURATIONS.base * 1000, easing: `cubic-bezier(${EASINGS.easeOut.join(", ")})` });
    }
    return () => {
      // Record where this owner sat (scroll may have moved it) just before it hands off.
      if (el.isConnected) lastBoxes.set(layoutId, pageBox(el));
    };
  }, [layoutId, reduced]);

  return <span ref={ref} className={`ui-sliding-indicator ${className}`} aria-hidden="true" />;
}
