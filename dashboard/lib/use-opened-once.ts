"use client";

import { useState } from "react";

/**
 * True from the first render where `open` is true, and from then on (speed plan SP05). An overlay
 * whose code loads with `next/dynamic` mounts on its first opening and then stays mounted, so its
 * state (a typed email, the palette's focus return) carries across openings as it did when the
 * overlay was always mounted, and a closed overlay's code is not in the page's first load. Give
 * each such `dynamic()` a `loading` option (`() => null`): that is what wraps it in its own Suspense
 * boundary, so its loading never reaches a parent boundary and hides the page around it.
 */
export function useOpenedOnce(open: boolean): boolean {
  const [opened, setOpened] = useState(open);
  if (open && !opened) setOpened(true);
  return opened || open;
}
