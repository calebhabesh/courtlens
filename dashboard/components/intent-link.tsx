"use client";

// Speed plan SP03 (D4): next/link with no viewport prefetch, which fetches its whole page on intent
// (pointer resting 80 ms, keyboard focus, touch start) through lib/intent-prefetch.ts. Entity links,
// the header navigation and the kit's ButtonLink and IconButtonLink render this.
import Link from "next/link";
import { forwardRef, type ComponentPropsWithoutRef, type FocusEvent, type PointerEvent, type TouchEvent } from "react";
import { useIntentPrefetch } from "@/lib/intent-prefetch";

export interface IntentLinkProps extends Omit<ComponentPropsWithoutRef<typeof Link>, "href" | "prefetch"> {
  href: string;
  /** `false`: no prefetch at all, not even on intent. */
  prefetch?: false;
}

export const IntentLink = forwardRef<HTMLAnchorElement, IntentLinkProps>(function IntentLink(
  { href, prefetch, onPointerEnter, onPointerLeave, onFocus, onTouchStart, ...props },
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
    />
  );
});
