"use client";

import { useEffect } from "react";

/**
 * Writes a server-resolved default into the address bar without another request. Next keeps
 * useSearchParams in step with history.replaceState, so client links built from the URL see it.
 *
 * The write waits one task. Next patches `history.replaceState` in the App Router's own effect, and
 * on a full load of a page with no Suspense boundary above it (Stats, since 2026-11-17) this effect
 * runs in the same commit, before that one (children's effects run first). An unpatched call left
 * useSearchParams on the bare URL and replaced the router's history state with null, so Back to
 * this entry did nothing.
 */
export function ReplaceUrl({ href }: { href: string }) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      // A `#section` the link asked for (site links SL05: a team's schedule) stays in the address.
      if (`${window.location.pathname}${window.location.search}` !== href) window.history.replaceState(null, "", `${href}${window.location.hash}`);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [href]);
  return null;
}
