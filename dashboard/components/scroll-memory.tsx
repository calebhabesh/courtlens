"use client";

import { useEffect } from "react";
import { readScrollPositions, reachable, rememberScroll, writeScrollPositions } from "@/lib/scroll-memory";

const RESTORE_MS = 3000;

function session(): Storage | null {
  try { return window.sessionStorage; } catch { return null; }
}

const here = () => `${location.pathname}${location.search}`;

/**
 * Back and Forward land where the page was scrolled. The position is saved on every click and key
 * press (before any navigation they start) and restored after a history traversal once the page
 * has rendered tall enough; a scroll by the reader cancels the restore.
 */
export function ScrollMemory() {
  useEffect(() => {
    const save = () => writeScrollPositions(session(), rememberScroll(readScrollPositions(session()), here(), window.scrollY));
    let frame = 0;
    let cancel = () => {};
    const restore = (event: PopStateEvent) => {
      cancel();
      // Only the App Router's own entries (they carry state); a jump to `#section` is the browser's.
      if (!event.state || location.hash) return;
      const saved = readScrollPositions(session())[here()];
      if (!saved) return;
      const started = performance.now();
      const stop = () => { cancelAnimationFrame(frame); removeEventListener("wheel", stop); removeEventListener("touchstart", stop); removeEventListener("keydown", stop); };
      cancel = stop;
      addEventListener("wheel", stop, { passive: true });
      addEventListener("touchstart", stop, { passive: true });
      addEventListener("keydown", stop);
      const tick = () => {
        const target = reachable(saved, document.documentElement.scrollHeight - window.innerHeight);
        if (target != null) { window.scrollTo({ top: target, behavior: "instant" }); stop(); return; }
        if (performance.now() - started > RESTORE_MS) { stop(); return; }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    addEventListener("click", save, true);
    addEventListener("keydown", save, true);
    addEventListener("pagehide", save);
    addEventListener("popstate", restore);
    return () => {
      cancel();
      removeEventListener("click", save, true);
      removeEventListener("keydown", save, true);
      removeEventListener("pagehide", save);
      removeEventListener("popstate", restore);
    };
  }, []);
  return null;
}
