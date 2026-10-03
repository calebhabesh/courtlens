"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useState } from "react";

interface ContextBarProps {
  initialReleaseId?: string;
  initialSeason?: string;
  initialPhase?: string;
  initialBeforeDate?: string;
  initialWindow?: string;
  sampleSize?: number;
  lastIncludedDate?: string | null;
}

const SEASONS = ["2026-27", "2025-26", "2024-25", "2023-24"];
const PHASES = [
  { value: "regular_season", label: "Regular Season" },
  { value: "playoffs", label: "Playoffs" },
  { value: "preseason", label: "Preseason" }
];
const WINDOWS = [
  { value: "season", label: "Season-to-date" },
  { value: "last_10", label: "Last 10 Games" },
  { value: "last_5", label: "Last 5 Games" }
];

export function ContextBar({
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
  const phase = searchParams?.get("phase") || initialPhase;
  const beforeDate =
    searchParams?.get("beforeDate") || searchParams?.get("before_date") || initialBeforeDate;
  const windowParam = searchParams?.get("window") || initialWindow;

  const [localBeforeDate, setLocalBeforeDate] = useState(beforeDate);

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
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
    [router, pathname, searchParams, releaseId]
  );

  const handleDateBlurOrSubmit = () => {
    if (localBeforeDate !== beforeDate && localBeforeDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      updateParam("beforeDate", localBeforeDate);
    }
  };

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
            {SEASONS.map((s) => (
              <option key={s} value={s}>
                {s} {s === "2026-27" ? "(Current)" : ""}
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
            {PHASES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <label className="context-field">
          <span className="context-label">Before Cutoff (America/NY)</span>
          <input
            type="date"
            value={localBeforeDate}
            onChange={(e) => setLocalBeforeDate(e.target.value)}
            onBlur={handleDateBlurOrSubmit}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleDateBlurOrSubmit();
            }}
            className="context-input"
            aria-label="Before date cutoff"
          />
        </label>

        <label className="context-field">
          <span className="context-label">Window</span>
          <select
            value={windowParam}
            onChange={(e) => updateParam("window", e.target.value)}
            className="context-select"
            aria-label="Analysis window"
          >
            {WINDOWS.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="context-meta">
        <span className="context-cutoff-badge" title="Temporal discipline: game_date < cutoff">
          Strictly prior to {beforeDate}
        </span>
        {lastIncludedDate && (
          <span className="context-last-date">Last game: {lastIncludedDate}</span>
        )}
        {sampleSize !== undefined && (
          <span className="context-sample">Sample: {sampleSize} games</span>
        )}
      </div>
    </header>
  );
}
