"use client";

// Speed plan SP03 (D4): next/link with no viewport prefetch, which fetches its whole page on intent
// (pointer resting 80 ms, keyboard focus, touch start) through lib/intent-prefetch.ts. Entity links,
// the header navigation and the kit's ButtonLink and IconButtonLink render this.
import Link, { useLinkStatus } from "next/link";
import { forwardRef, type ComponentPropsWithoutRef, type FocusEvent, type PointerEvent, type TouchEvent } from "react";
import { useIntentPrefetch } from "@/lib/intent-prefetch";
import { useNavPendingMark } from "@/lib/pending-navigation";

export interface IntentLinkProps extends Omit<ComponentPropsWithoutRef<typeof Link>, "href" | "prefetch"> {
  href: string;
  /** `false`: no prefetch at all, not even on intent. */
  prefetch?: false;
}

export const IntentLink = forwardRef<HTMLAnchorElement, IntentLinkProps>(function IntentLink(
  { href, prefetch, onPointerEnter, onPointerLeave, onFocus, onTouchStart, children, ...props },
  ref,
) {
  const intent = useIntentPrefetch(prefetch === false ? null : href);
  return (
    <Link
      ref={ref}
      href={href}
      prefetch={false}
      onPointerEnter={(event: PointerEvent<HTMLAnchorElement>) => { onPointerEnter?.(event); intent.onPointerEnter(event); }}
      onPointerLeave={(event: PointerEvent<HTMLAnchorElement>) => { onPointerLeave?.(event); intent.onPointerLeave(); }}
      onFocus={(event: FocusEvent<HTMLAnchorElement>) => { onFocus?.(event); intent.onFocus(event); }}
      onTouchStart={(event: TouchEvent<HTMLAnchorElement>) => { onTouchStart?.(event); intent.onTouchStart(); }}
      {...props}
    >
      {children}
      <PendingSignal />
    </Link>
  );
});

/**
 * Marks the page being left while this link's navigation waits for its page, so motion.css can
 * lay a scrim over it after a short delay (`useNavPendingMark`). Stats has no loader (a skeleton
 * would hold its rows back by React's 300 ms reveal batch), so a slow Stats load keeps the old
 * page up under the scrim instead. Next reports pending even after IntentLink's own prefetch (the
 * Link itself has `prefetch={false}`); the delay keeps those quick navigations clear. Renders nothing.
 */
function PendingSignal() {
  const { pending } = useLinkStatus();
  useNavPendingMark(pending);
  return null;
}
