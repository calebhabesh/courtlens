"use client";

import { useEffect, useState } from "react";
import { liveRead, type LiveRead } from "./live";

export interface LiveReadState<T> { read: LiveRead<T> | null; error: string | null; loading: boolean }

/**
 * One Live resource, read again after the API's `refresh_seconds` while the tab is visible.
 * Final reads (no refresh) are read once. A changed path drops the old read; a late response
 * for an old path never lands.
 */
export function useLiveRead<T>(path: string | null): LiveReadState<T> {
  const [state, setState] = useState<LiveReadState<T> & { path: string | null }>({ read: null, error: null, loading: path != null, path });
  if (state.path !== path) setState({ read: null, error: null, loading: path != null, path });

  useEffect(() => {
    if (!path) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let next: number | null = null;
    let done = false;
    async function tick() {
      clearTimeout(timer);
      if (stopped || done || document.visibilityState === "hidden") return;
      controller?.abort();
      controller = new AbortController();
      const abort = controller;
      const timeout = setTimeout(() => abort.abort(), 20000);
      try {
        const read = await liveRead<T>(path!, abort.signal);
        if (stopped) return;
        next = read.refresh_seconds;
        done = next == null;
        setState(current => current.path === path ? { ...current, read, error: null, loading: false } : current);
      } catch {
        if (stopped) return;
        next = 30;
        setState(current => current.path === path ? { ...current, error: "Live data unavailable. Showing the last read.", loading: false } : current);
      } finally {
        clearTimeout(timeout);
      }
      if (!stopped && next != null) timer = setTimeout(tick, Math.max(5, next) * 1000);
    }
    function visibility() { if (document.visibilityState === "visible") void tick(); else clearTimeout(timer); }
    void tick();
    document.addEventListener("visibilitychange", visibility);
    return () => { stopped = true; clearTimeout(timer); controller?.abort(); document.removeEventListener("visibilitychange", visibility); };
  }, [path]);

  return { read: state.read, error: state.error, loading: state.loading };
}
