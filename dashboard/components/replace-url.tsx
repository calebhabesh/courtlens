"use client";

import { useEffect } from "react";

/**
 * Writes a server-resolved default into the address bar without another request. Next keeps
 * useSearchParams in step with history.replaceState, so client links built from the URL see it.
 *
 * The write waits until the main thread is idle (at most a second). Next patches
 * `history.replaceState` in the App Router's own effect, and on a full load of a page with no
 * Suspense boundary above it this effect runs in the same commit, before that one (children's
 * effects run first): an unpatched call left useSearchParams on the bare URL and dropped the router's
 * history state, so Back to the entry did nothing. Waiting one task fixed that, but the new search
 * params then reached Suspense boundaries still waiting to hydrate (the header, a page's
 * useSearchParams views), which hydrated against them instead of the server HTML: React #418 on a
 * bare /compare. Idle comes after React's hydration work, which runs in back-to-back tasks.
 */
export function ReplaceUrl({ href }: { href: string }) {
  useEffect(() => {
    const write = () => {
      // A `#section` the link asked for (site links SL05: a team's schedule) stays in the address.
      if (`${window.location.pathname}${window.location.search}` !== href) window.history.replaceState(null, "", `${href}${window.location.hash}`);
    };
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(write, { timeout: 1000 });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = window.setTimeout(write, 300);
    return () => window.clearTimeout(timer);
  }, [href]);
  return null;
}
