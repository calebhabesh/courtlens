"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const subscribe = () => () => {};

/**
 * Shared overlay layer (FO02). Fixed overlays render at document.body so no ancestor can become
 * their containing block: a `backdrop-filter`, `filter` or `transform` on the sticky header (or any
 * page wrapper) would otherwise size and clip a `position: fixed` scrim or drawer to that ancestor.
 * Stacking comes only from the z-index tokens (--z-drawer, --z-modal, ...).
 */
export function OverlayPortal({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return mounted ? createPortal(children, document.body) : null;
}
