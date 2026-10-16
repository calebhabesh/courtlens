"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MultiPlayerLinesView } from "./multi-player-lines-view";
import { Button } from "./ui/kit";

const smooth = (): ScrollBehavior => window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

/**
 * Trend lines slide out of the card and retract into it (alignment row 3, 37): once opened the
 * drawer stays mounted and only its grid rows animate, so the retraction ends without a
 * re-layout (47). The page follows it to the end on open (31, 36) and scrolls back as it
 * retracts. The open state lives in the URL (``compareView=lines``) without a server read.
 */
export function CompareTrendTray({ playerIds, context }: { playerIds: string[]; context: Parameters<typeof MultiPlayerLinesView>[0]["context"] }) {
  const params = useSearchParams();
  const trends = params.get("compareView") === "lines";
  const drawerRef = useRef<HTMLDivElement>(null), returnTo = useRef<number | null>(null);
  const [kept, setKept] = useState(trends);
  if (trends && !kept) setKept(true);
  useEffect(() => {
    const drawer = drawerRef.current;
    if (!trends || !drawer || returnTo.current == null) return;
    // Instant: the site scrolls smoothly by default, which would trail the growing drawer.
    const follow = () => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
    follow();
    const observer = new ResizeObserver(follow);
    observer.observe(drawer);
    const stop = window.setTimeout(() => observer.disconnect(), 2500);
    return () => { observer.disconnect(); window.clearTimeout(stop); };
  }, [trends]);
  function show(view: "lines" | "table") {
    const next = new URLSearchParams(params.toString());
    next.set("compareView", view);
    window.history.pushState(null, "", `/compare?${next}`);
  }
  function toggle() {
    if (!trends) { returnTo.current = window.scrollY; show("lines"); return; }
    const top = returnTo.current ?? window.scrollY;
    returnTo.current = null;
    show("table");
    window.scrollTo({ top, behavior: smooth() });
  }
  return <div className="pvp-tray">
    {kept && <div className="pvp-tray-drawer" data-open={trends || undefined} ref={drawerRef} inert={!trends}>
      <div className="pvp-tray-clip">
        <div className="pvp-tray-body" id="pvp-trend-drawer">
          <MultiPlayerLinesView variant="embedded" playerIds={playerIds} context={context} />
        </div>
      </div>
    </div>}
    <div className="pvp-tray-tab">
      <Button size="sm" variant="ghost" icon="chart-line" iconAfter={trends ? "chevron-up" : "chevron-down"} aria-expanded={trends} aria-controls="pvp-trend-drawer"
        onClick={toggle}>Trend lines</Button>
    </div>
  </div>;
}
