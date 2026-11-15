"use client";

import { useEffect } from "react";

/**
 * Lands a link that names a section of a streamed page (site links SL05: a game's "Schedule" link
 * opens `/teams/…#schedule`). Next scrolls to the hash when the loading screen commits, before the
 * section exists, and the client tables above it keep growing after it mounts; so this keeps the
 * section aligned for up to 3 s, until the reader scrolls, types or presses.
 */
export function HashTarget({ id }: { id: string }) {
  useEffect(() => {
    if (decodeURIComponent(window.location.hash.slice(1)) !== id) return;
    const go = () => document.getElementById(id)?.scrollIntoView({ block: "start" });
    const events = ["wheel", "touchmove", "keydown", "pointerdown"] as const;
    const stop = () => { clearInterval(timer); clearTimeout(end); events.forEach(name => window.removeEventListener(name, stop)); };
    go();
    const timer = setInterval(go, 250);
    const end = setTimeout(stop, 3000);
    events.forEach(name => window.addEventListener(name, stop, { passive: true }));
    return stop;
  }, [id]);
  return null;
}
