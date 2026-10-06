"use client";
import { useEffect, useState } from "react";
import { getSharedCatalog, humanLabel } from "@/lib/route-availability";
import type { WorkbenchCatalog } from "@/lib/types";

export function CatalogScopeFields({ release, season, phase, before, onSeason, onPhase, onBefore }: {
  release?: string; season: string; phase: string; before: string;
  onSeason: (value: string) => void; onPhase: (value: string) => void; onBefore: (value: string) => void;
}) {
  const [loaded, setLoaded] = useState<{ release?: string; catalog: WorkbenchCatalog } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    getSharedCatalog(release).then(catalog => { if (active) { setLoaded({ release, catalog }); setFailed(false); } }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [release]);
  const catalog = loaded?.release === release ? loaded?.catalog : undefined;
  const selectedSeason = season || catalog?.default_season || "";
  const scopes = catalog?.stats_scopes?.filter(scope => scope.season === selectedSeason) ?? [];
  const seasons = catalog?.seasons ?? [];
  const phases = scopes.length ? scopes.map(scope => scope.phase) : catalog?.phases ?? [];
  return <>
    <label>Season<select aria-label="Season" value={season} onChange={e => {
      onSeason(e.target.value);
      const scope = catalog?.stats_scopes?.find(scope => scope.season === e.target.value && scope.phase === phase) ?? catalog?.stats_scopes?.find(scope => scope.season === e.target.value && scope.phase === "regular_season");
      if (scope) { onPhase(scope.phase); onBefore(scope.default_before_date); }
    }}><option value="">Published default{catalog ? ` · ${catalog.default_season}` : ""}</option>{season && !seasons.includes(season) && <option value={season}>{season} · unavailable</option>}{seasons.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
    <label>Phase<select aria-label="Phase" value={phase} onChange={e => { onPhase(e.target.value); const scope = scopes.find(scope => scope.phase === e.target.value); if (scope) onBefore(scope.default_before_date); }}><option value="">Published default{catalog ? ` · ${humanLabel(catalog.default_phase)}` : ""}</option>{phase && !phases.includes(phase) && <option value={phase}>{humanLabel(phase)} · unavailable</option>}{phases.map(value => <option key={value} value={value}>{humanLabel(value)}</option>)}</select></label>
    <label>Before date<input aria-label="Before date" type="date" value={before} onChange={e => onBefore(e.target.value)} title="Exclusive cutoff: only games dated before this day. Blank resolves the published default." /></label>
    {failed && <p role="status">Context catalog unavailable. Existing scope is retained; retry by reopening this tool.</p>}
  </>;
}
