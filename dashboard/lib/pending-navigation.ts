"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useTransition } from "react";

/**
 * Marks the page being left (`#content > .route-enter[data-nav-pending]`) while `pending`, so
 * motion.css lays a scrim over it after `--delay-skeleton`; a faster navigation never shows it.
 * The mark sits on the old page's own wrapper: the template mounts a new one for the next page,
 * so the next page never shows the scrim however late this cleanup runs. A count, so two
 * overlapping navigations cannot clear each other's mark.
 */
export function useNavPendingMark(pending: boolean) {
  useEffect(() => {
    if (!pending) return;
    const page = document.querySelector<HTMLElement>("#content > .route-enter");
    if (!page) return;
    page.dataset.navPending = String((Number(page.dataset.navPending) || 0) + 1);
    return () => {
      const left = (Number(page.dataset.navPending) || 1) - 1;
      if (left > 0) page.dataset.navPending = String(left);
      else delete page.dataset.navPending;
    };
  }, [pending]);
}

type NavigateOptions = { scroll?: boolean };

/**
 * `router.push` and `replace` run in a transition, so a navigation that waits for a server
 * render is known: `pending` holds until the new render commits (owner, 2026-11-18: a season
 * read from the server can take 2–3 s, and its numbers must not pop in unannounced). By default
 * the page gets the same delayed scrim as a link's navigation (`IntentLink`). A view that shows
 * its own loading state in place passes `scrim: false` and reads `pending`. `start` runs an async
 * step (a lookup the URL depends on) and its navigation as one wait.
 */
export function usePendingRouter({ scrim = true }: { scrim?: boolean } = {}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useNavPendingMark(scrim && pending);
  return useMemo(() => ({
    pending,
    start: (action: () => void | Promise<void>) => startTransition(action),
    push: (href: string, options?: NavigateOptions) => startTransition(() => router.push(href, options)),
    replace: (href: string, options?: NavigateOptions) => startTransition(() => router.replace(href, options)),
  }), [pending, router]);
}
