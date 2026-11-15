"use client";

// Speed plan SP03 (docs/speed-plan.md, D4): a link fetches its whole page when someone shows they
// mean to open it, never because it scrolled into view. Intent is a mouse or pen resting on the
// link for INTENT_DELAY_MS, keyboard focus (`:focus-visible`), or a touch starting on it. A pointer
// sweeping across a table leaves each row before the timer fires, so it fetches nothing.
//
// The prefetch is `router.prefetch(href, { kind: "full" })`. These pages are `force-dynamic` with a
// `loading.tsx`, so the default (`auto`) prefetch would stop at the loading boundary and the click
// would still wait for the page. A full prefetch is cached by the router for `staleTimes.static`
// (5 minutes by default; bundled docs, next.config.js `staleTimes`: "used ... when calling
// router.prefetch"), and a click on the same href inside that time renders from it with no request.
// `<Link prefetch>` would fetch the same payload, but a prefetch-enabled Link is also re-prefetched
// whenever the router tree changes while it is on screen (a filter change, any navigation under the
// header), which is the per-row traffic this rule exists to stop. One explicit call per href per
// window is the whole contract.
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, type FocusEvent, type PointerEvent } from "react";

/** How long a mouse or pen must rest on a link before it counts as intent. */
export const INTENT_DELAY_MS = 80;
/** One prefetch per href per window: the router keeps a full prefetch this long (`staleTimes.static`). */
export const PREFETCH_WINDOW_MS = 5 * 60_000;

type Router = ReturnType<typeof useRouter>;
type PrefetchOptions = NonNullable<Parameters<Router["prefetch"]>[1]>;
// `PrefetchKind.FULL`; the enum is not exported from a public Next entry point.
const FULL_PREFETCH = { kind: "full" as PrefetchOptions["kind"] } satisfies PrefetchOptions;

const lastPrefetch = new Map<string, number>();

/**
 * Live pages read `never`-cached data (each prefetch is an uncached render) and the router would keep
 * a full prefetch for minutes, so a click could show an old score. Bundled docs (Adopting Partial
 * Prefetching): "A prefetch of real-time content would be stale by the click." They load on click.
 */
export function prefetchable(href: string | null | undefined): href is string {
  return Boolean(href) && !/^\/live(?:\/|$|\?)/.test(href as string);
}

/** Records a prefetch of `href` at `now` and returns true, unless one ran inside the window. */
export function claimPrefetch(href: string, now: number = Date.now()): boolean {
  const last = lastPrefetch.get(href);
  if (last !== undefined && now - last < PREFETCH_WINDOW_MS) return false;
  lastPrefetch.set(href, now);
  return true;
}

/** Test seam: forget every recorded prefetch. */
export function resetIntentPrefetch() {
  lastPrefetch.clear();
}

// Unit tests render links without an App Router; Next's useRouter throws there. The context read
// happens on every render either way, so hook order is stable.
function useOptionalRouter(): Router | null {
  try {
    return useRouter();
  } catch {
    return null;
  }
}

function focusVisible(element: HTMLElement): boolean {
  try {
    return element.matches(":focus-visible");
  } catch {
    return false;
  }
}

export interface IntentPrefetchHandlers {
  onPointerEnter: (event: PointerEvent<HTMLElement>) => void;
  onPointerLeave: () => void;
  onFocus: (event: FocusEvent<HTMLElement>) => void;
  onTouchStart: () => void;
}

/** Event handlers that prefetch `href` on intent. Spread them on the anchor (after the caller's own). */
export function useIntentPrefetch(href: string | null | undefined): IntentPrefetchHandlers {
  const router = useOptionalRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const prefetch = useCallback(() => {
    cancel();
    // Prefetching only runs in production builds, as Next's own does.
    if (!prefetchable(href) || !router || process.env.NODE_ENV !== "production") return;
    if (!claimPrefetch(href)) return;
    router.prefetch(href, FULL_PREFETCH);
  }, [cancel, href, router]);

  useEffect(() => cancel, [cancel]);

  const onPointerEnter = useCallback((event: PointerEvent<HTMLElement>) => {
    // Touch reports its own intent through touchstart; a touch pointerenter fires with it.
    if (event.pointerType === "touch") return;
    cancel();
    timer.current = setTimeout(prefetch, INTENT_DELAY_MS);
  }, [cancel, prefetch]);

  const onFocus = useCallback((event: FocusEvent<HTMLElement>) => {
    // A mouse press focuses the link too; only keyboard focus is intent (the click itself follows).
    if (focusVisible(event.currentTarget)) prefetch();
  }, [prefetch]);

  return { onPointerEnter, onPointerLeave: cancel, onFocus, onTouchStart: prefetch };
}
