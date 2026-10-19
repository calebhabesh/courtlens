"use client";
import { useEffect, useState } from "react";
import { DatePicker } from "@/components/ui/date-picker";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { beforeDateFromThrough, throughDateFromBefore } from "@/lib/format-date";
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
  const coverage = catalog?.stats_scopes?.find(scope => scope.season === selectedSeason && scope.phase === (phase || catalog?.default_phase));
  return <>
    <Field label="Season"><Select aria-label="Season" value={season} onChange={e => {
      onSeason(e.target.value);
      const scope = catalog?.stats_scopes?.find(scope => scope.season === e.target.value && scope.phase === phase) ?? catalog?.stats_scopes?.find(scope => scope.season === e.target.value && scope.phase === "regular_season");
      if (scope) { onPhase(scope.phase); onBefore(scope.default_before_date); }
    }}><option value="">Published Default{catalog ? ` · ${catalog.default_season}` : ""}</option>{season && !seasons.includes(season) && <option value={season}>{season} · Unavailable</option>}{seasons.map(value => <option key={value} value={value}>{value}</option>)}</Select></Field>
    <Field label="Phase"><Select aria-label="Phase" value={phase} onChange={e => { onPhase(e.target.value); const scope = scopes.find(scope => scope.phase === e.target.value); if (scope) onBefore(scope.default_before_date); }}><option value="">Published Default{catalog ? ` · ${humanLabel(catalog.default_phase)}` : ""}</option>{phase && !phases.includes(phase) && <option value={phase}>{humanLabel(phase)} · Unavailable</option>}{phases.map(value => <option key={value} value={value}>{humanLabel(value)}</option>)}</Select></Field>
    <Field label="Through"><DatePicker label="Through date" value={/^\d{4}-\d{2}-\d{2}$/.test(before) ? throughDateFromBefore(before) : ""} placeholder="Published Default" min={coverage?.coverage_start} max={coverage?.coverage_end} onChange={value => onBefore(beforeDateFromThrough(value))} /></Field>
    {failed && <p role="status">Context catalog unavailable. Existing scope is retained; retry by reopening this tool.</p>}
  </>;
}
