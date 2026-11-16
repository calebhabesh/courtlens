"use client";

import { useEffect } from "react";

/**
 * Writes a server-resolved default into the address bar without another request. Next keeps
 * useSearchParams in step with history.replaceState, so client links built from the URL see it.
 */
export function ReplaceUrl({ href }: { href: string }) {
  useEffect(() => {
    // A `#section` the link asked for (site links SL05: a team's schedule) stays in the address.
    if (`${window.location.pathname}${window.location.search}` !== href) window.history.replaceState(null, "", `${href}${window.location.hash}`);
  }, [href]);
  return null;
}
