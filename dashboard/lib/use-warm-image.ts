"use client";

import { useEffect, type RefObject } from "react";

/**
 * Lazy images that start loading once the page is idle, so a table's rows are ready before they are
 * scrolled to. Stats scrolls inside its own box, where lazy loading starts an image only when it is
 * in view, so rows filled in as the table scrolled (owner, 2026-11-17).
 *
 * Images stay `loading="lazy"` in the HTML (speed plan SP06). That keeps them out of the first
 * render and leaves React no image preloads to emit; Draft and Matchups hold 278 and 424 portraits,
 * and loading them all up front measured 30–70 ms later to first paint. Each image joins from its own
 * component's effect, so only images React has hydrated are touched: a page-wide sweep also reached
 * Suspense boundaries still waiting to hydrate, and /compare then failed hydration (React #418).
 */
const queue = new Set<HTMLImageElement>();
let cancel: (() => void) | null = null;

/** Waits for an idle main thread, or two seconds at most (Safari has no `requestIdleCallback`). */
function whenIdle(callback: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(callback, { timeout: 2000 });
    return () => window.cancelIdleCallback(handle);
  }
  const handle = window.setTimeout(callback, 200);
  return () => window.clearTimeout(handle);
}

/** Starts every queued image still on the page, except those inside `display: none` (a closed tab). */
export function warmQueuedImages(): number {
  cancel = null;
  let started = 0;
  for (const image of queue) {
    if (!image.isConnected || image.loading !== "lazy") { queue.delete(image); continue; }
    if (typeof image.checkVisibility === "function" && !image.checkVisibility()) continue;
    image.loading = "eager";
    queue.delete(image);
    started++;
  }
  return started;
}

/** Queues this lazy image to start loading once the page is idle. */
export function useWarmImage(ref: RefObject<HTMLImageElement | null>) {
  useEffect(() => {
    const image = ref.current;
    if (!image || image.loading !== "lazy") return;
    queue.add(image);
    cancel ??= whenIdle(warmQueuedImages);
    return () => { queue.delete(image); };
  }, [ref]);
}
