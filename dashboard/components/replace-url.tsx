"use client";

import { useEffect } from "react";

/**
 * Writes a server-resolved default into the address bar without another request. Next keeps
 * useSearchParams in step with history.replaceState, so client links built from the URL see it.
 */
export function ReplaceUrl({ href }: { href: string }) {
  useEffect(() => {
    if (`${window.location.pathname}${window.location.search}` !== href) window.history.replaceState(null, "", href);
  }, [href]);
  return null;
}
