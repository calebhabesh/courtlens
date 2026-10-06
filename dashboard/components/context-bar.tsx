"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { getSharedCatalog } from "@/lib/route-availability";
import type { WorkbenchCatalog } from "@/lib/types";

interface ContextBarProps {
  catalog?: WorkbenchCatalog;
  allowedPhases?: string[];
  sampleNoun?: string;
  initialReleaseId?: string;
  initialSeason?: string;
  initialPhase?: string;
  initialBeforeDate?: string;
  initialWindow?: string;
  sampleSize?: number;
  lastIncludedDate?: string | null;
}

const PHASES = [
  { value: "regular_season", label: "Regular Season" },
  { value: "playoffs", label: "Playoffs" },
  { value: "preseason", label: "Preseason" },
  { value: "play_in", label: "Play-in" },
  { value: "cup_final", label: "NBA Cup final" }
];
const WINDOWS = [
  { value: "season", label: "Season-to-date" },
  { value: "last_10", label: "Last 10 appearances" },
  { value: "last_5", label: "Last 5 appearances" }
];

function CutoffDateField({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const commit = () => {
    if (draft !== value && /^\d{4}-\d{2}-\d{2}$/.test(draft)) onCommit(draft);
  };
  return <input type="date" value={draft} onChange={(event) => setDraft(event.target.value)}
    onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") commit(); }}
    className="context-input" aria-label="Before date cutoff" />;
}

export function ContextBar({
  catalog: suppliedCatalog,
  allowedPhases,
  sampleNoun = "games",
  initialReleaseId,
  initialSeason = "2025-26",
  initialPhase = "regular_season",
  initialBeforeDate = "2026-06-30",
  initialWindow = "season",
  sampleSize,
  lastIncludedDate
}: ContextBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const releaseId =
    searchParams?.get("releaseId") || searchParams?.get("release_id") || initialReleaseId;
  const season = searchParams?.get("season") || initialSeason;
  const phase = allowedPhases?.length === 1 ? allowedPhases[0] : searchParams?.get("phase") || initialPhase;
  const beforeDate =
    searchParams?.get("beforeDate") || searchParams?.get("before_date") || initialBeforeDate;
  const windowParam = searchParams?.get("window") || initialWindow;
  const [loadedCatalog, setLoadedCatalog] = useState<{ releaseId?: string; catalog: WorkbenchCatalog } | null>(null);
  useEffect(() => {
    if (suppliedCatalog) return;
    let active = true;
    getSharedCatalog(releaseId).then((catalog) => {
      if (active) setLoadedCatalog({ releaseId, catalog });
    }).catch(() => {});
    return () => { active = false; };
  }, [suppliedCatalog, releaseId]);
  const catalog = suppliedCatalog ?? (loadedCatalog?.releaseId === releaseId ? loadedCatalog?.catalog : undefined);


  const dateScope = `${releaseId}:${season}:${phase}:${beforeDate}:${windowParam}`;
  const seasons = catalog?.seasons ?? [initialSeason];
  const observedPhases = catalog?.stats_scopes?.filter((scope) => scope.season === season).map((scope) => scope.phase) ?? catalog?.phases;
  const phases = allowedPhases ?? observedPhases ?? [initialPhase];
  const windows = catalog?.stats_windows ?? WINDOWS.map((w) => w.value);

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      const aliases: Record<string, string> = { beforeDate: "before_date", releaseId: "release_id" };
      if (aliases[key]) params.delete(aliases[key]);
      if (key === "season" && catalog?.stats_scopes) {
        const scopes = catalog.stats_scopes.filter((scope) => scope.season === value && (!allowedPhases || allowedPhases.includes(scope.phase)));
        const scope = scopes.find((scope) => scope.phase === phase) ?? scopes.find((scope) => scope.phase === "regular_season") ?? scopes[0];
        if (scope) {
          params.set("phase", scope.phase);
          params.delete("before_date");
          params.set("beforeDate", scope.default_before_date);
        }
      }
      if (key === "phase") {
        const scope = catalog?.stats_scopes?.find((scope) => scope.season === season && scope.phase === value);
        if (scope) { params.delete("before_date"); params.set("beforeDate", scope.default_before_date); }
      }
      if (key === "window") {
        for (const name of ["windowN", "window_n", "fromDate", "from_date", "toDate", "to_date"]) params.delete(name);
      }
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      if (releaseId && !params.has("releaseId") && !params.has("release_id")) {
        params.set("releaseId", releaseId);
      }
      // Reset cursor pagination when context parameters change
      params.delete("cursor");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams, releaseId, catalog, phase, season, allowedPhases]
  );

  return (
    <header className="context-bar" aria-label="Research context controls">
      <div className="context-controls">
        <label className="context-field">
          <span className="context-label">Season</span>
          <select
            value={season}
            onChange={(e) => updateParam("season", e.target.value)}
            className="context-select"
            aria-label="Filter by season"
          >
            {!seasons.includes(season) && <option value={season}>{season} · unavailable</option>}
            {seasons.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="context-field">
          <span className="context-label">Phase</span>
          <select
            value={phase}
            onChange={(e) => updateParam("phase", e.target.value)}
            className="context-select"
            aria-label="Filter by competition phase"
          >
            {!phases.includes(phase) && <option value={phase}>{phase} · unavailable</option>}
            {phases.map((value) => ({ value, label: PHASES.find((p) => p.value === value)?.label ?? value })).map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <label className="context-field">
          <span className="context-label">Before date</span>
          <CutoffDateField key={dateScope} value={beforeDate} onCommit={(value) => updateParam("beforeDate", value)} />
        </label>

        <label className="context-field">
          <span className="context-label">Window</span>
          <select
            value={windowParam}
            onChange={(e) => updateParam("window", e.target.value)}
            className="context-select"
            aria-label="Analysis window"
          >
            {!windows.includes(windowParam) && <option value={windowParam}>{windowParam} · unavailable</option>}
            {WINDOWS.filter((w) => windows.includes(w.value)).map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="context-meta">
        <span className="context-cutoff-badge" title="Exclusive cutoff: includes only games dated before this day in America/New_York.">
          Strictly prior to {beforeDate}
        </span>
        {lastIncludedDate && (
          <span className="context-last-date">Last game: {lastIncludedDate}</span>
        )}
        {sampleSize !== undefined && (
          <span className="context-sample">{sampleSize} {sampleNoun}</span>
        )}
      </div>
    </header>
  );
}
