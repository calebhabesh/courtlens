"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useOptimistic, useState, useTransition } from "react";

import { CountChip, FilterBar } from "@/components/ui/filter-bar";
import { phaseLabel } from "@/lib/scope-labels";
import { DataDetailsButton, type DataDetailRow } from "@/components/ui/data-details";
import { DatePicker } from "@/components/ui/date-picker";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Icon } from "@/components/ui/icon";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { beforeDateFromThrough, formatDate, throughDateFromBefore } from "@/lib/format-date";
import { getSharedCatalog } from "@/lib/route-availability";
import { applyScopeChange, type ScopeKey } from "@/lib/scope-url";
import { SEASON_FROM_PARAM, seasonRange, shiftRange } from "@/lib/season-range";
import { SeasonScopePicker } from "@/components/season-scope-picker";
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
  /** D6: Window appears only on pages whose results depend on it. */
  showWindow?: boolean;
  /**
   * Hide the Through picker where the page's own date sets the cutoff (Live Finals: the slate date).
   * An explicit `beforeDate` in the URL still applies and is listed in Data details.
   */
  showThrough?: boolean;
  /** Page-specific filters rendered to the right of the scope controls. */
  filters?: React.ReactNode;
  /** View/mode switches that stay visible on phones (see `FilterBar` `modes`). */
  modes?: React.ReactNode;
  /** Page-specific Data details rows (source routes, resolved context), after the catalog rows. */
  detailRows?: DataDetailRow[];
  /** Stats alignment: season picker flanked by previous/next buttons, phase as a segmented control. */
  steppedScope?: boolean;
  /** Stats alignment 43e: the stepped picker also offers From–Through season ranges. */
  allowMultiSeason?: boolean;
}

const SHORT_PHASES: Record<string, string> = { regular_season: "Regular", playoffs: "Playoffs", play_in: "Play-In", cup_final: "Cup Final" };

const WINDOWS = [
  { value: "season", label: "Season-to-date" },
  { value: "last_10", label: "Last 10 appearances" },
  { value: "last_5", label: "Last 5 appearances" }
];

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
  lastIncludedDate,
  showWindow = true,
  showThrough = true,
  filters,
  modes,
  detailRows = [],
  steppedScope = false,
  allowMultiSeason = false
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

  const seasons = catalog?.seasons ?? [initialSeason];
  const observedPhases = catalog?.stats_scopes?.filter((scope) => scope.season === season).map((scope) => scope.phase) ?? catalog?.phases;
  const phases = allowedPhases ?? observedPhases ?? [initialPhase];
  const windows = catalog?.stats_windows ?? WINDOWS.map((w) => w.value);
  const coverage = catalog?.stats_scopes?.find((scope) => scope.season === season && scope.phase === phase);

  const updateParam = useCallback(
    (key: ScopeKey, value: string) => {
      const params = applyScopeChange(searchParams?.toString() ?? "", key, value, { catalog, season, phase, releaseId, allowedPhases });
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams, releaseId, catalog, phase, season, allowedPhases]
  );
  // The phase indicator slides on click; the URL value takes over once the navigation commits.
  const [, startPhaseNavigation] = useTransition();
  const [shownPhase, setShownPhase] = useOptimistic(phase);
  const selectPhase = (value: string) => startPhaseNavigation(() => {
    setShownPhase(value);
    updateParam("phase", value);
  });

  const throughDate = /^\d{4}-\d{2}-\d{2}$/.test(beforeDate) ? throughDateFromBefore(beforeDate) : "";
  const range = allowMultiSeason ? seasonRange(seasons, searchParams?.get(SEASON_FROM_PARAM), season) : null;
  const seasonFrom = range ? range[0] : null;
  const applySeasonScope = useCallback(
    (from: string | null, through: string) => {
      const params = applyScopeChange(searchParams?.toString() ?? "", "season", through, { catalog, season, phase, releaseId, allowedPhases });
      if (from) {
        params.set(SEASON_FROM_PARAM, from);
        // DARKO ratings are per season: a range cannot keep ranking by them.
        for (const key of ["sortMetric", "sort_metric", "sort"]) {
          if (["dpm", "o_dpm", "d_dpm"].includes((params.get(key) ?? "").split(":")[0])) params.delete(key);
        }
      } else {
        params.delete(SEASON_FROM_PARAM);
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams, catalog, season, phase, releaseId, allowedPhases]
  );

  const seasonSelect = (
    <Select value={season} onChange={(e) => updateParam("season", e.target.value)} aria-label="Filter by season">
      {!seasons.includes(season) && <option value={season}>{season} · unavailable</option>}
      {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
    </Select>
  );
  const chronological = [...seasons].sort();
  const seasonIndex = chronological.indexOf(season);
  const previousSeason = seasonIndex > 0 ? chronological[seasonIndex - 1] : undefined;
  const nextSeason = seasonIndex >= 0 ? chronological[seasonIndex + 1] : undefined;
  // A range steps as a whole window, one season at a time.
  const earlierRange = seasonFrom ? shiftRange(seasons, seasonFrom, season, -1) : null;
  const laterRange = seasonFrom ? shiftRange(seasons, seasonFrom, season, 1) : null;
  const stepBack = seasonFrom
    ? earlierRange && (() => applySeasonScope(earlierRange.from, earlierRange.through))
    : previousSeason && (() => updateParam("season", previousSeason));
  const stepForward = seasonFrom
    ? laterRange && (() => applySeasonScope(laterRange.from, laterRange.through))
    : nextSeason && (() => updateParam("season", nextSeason));
  // Regular and Playoffs always hold their places; a phase without coverage is shown disabled.
  const phaseSegments = [...new Set([...(allowedPhases ? [] : ["regular_season", "playoffs"]), ...phases, phase])];

  const scope = (
    <>
      {steppedScope ? (
        <div className="context-season-stepper" role="group" aria-label="Season">
          <button type="button" className="context-stepper-button" disabled={!stepBack}
            onClick={() => stepBack && stepBack()}
            aria-label={seasonFrom
              ? (earlierRange ? `Earlier range, ${earlierRange.from} – ${earlierRange.through}` : "No earlier range")
              : (previousSeason ? `Previous season, ${previousSeason}` : "No earlier season")}>
            <Icon name="left" size={14} />
          </button>
          {allowMultiSeason ? (
            <SeasonScopePicker seasons={seasons} season={season} seasonFrom={seasonFrom} onApply={applySeasonScope} />
          ) : (
            <span className="context-season-picker"><Icon name="calendar" size={14} />{seasonSelect}</span>
          )}
          <button type="button" className="context-stepper-button" disabled={!stepForward}
            onClick={() => stepForward && stepForward()}
            aria-label={seasonFrom
              ? (laterRange ? `Later range, ${laterRange.from} – ${laterRange.through}` : "No later range")
              : (nextSeason ? `Next season, ${nextSeason}` : "No later season")}>
            <Icon name="right" size={14} />
          </button>
        </div>
      ) : (
        <Field label="Season" layout="inline">{seasonSelect}</Field>
      )}
      {steppedScope ? (
        <SegmentedControl name="Filter by competition phase" size="sm" className="context-phase-segments" value={shownPhase}
          onChange={selectPhase}
          options={phaseSegments.map((value) => ({ value, disabled: !phases.includes(value),
            label: `${SHORT_PHASES[value] ?? phaseLabel(value)}${value === phase && !phases.includes(value) ? " · unavailable" : ""}` }))} />
      ) : (
        <Field label="Phase" layout="inline">
          <Select value={phase} onChange={(e) => updateParam("phase", e.target.value)} aria-label="Filter by competition phase">
            {!phases.includes(phase) && <option value={phase}>{phaseLabel(phase)} · unavailable</option>}
            {phases.map((value) => <option key={value} value={value}>{phaseLabel(value)}</option>)}
          </Select>
        </Field>
      )}
      {showThrough && <Field label="Through" layout="inline">
        <DatePicker
          label="Through date"
          value={throughDate}
          min={coverage?.coverage_start}
          max={coverage?.coverage_end}
          onChange={(value) => updateParam("beforeDate", beforeDateFromThrough(value))}
        />
      </Field>}
      {showWindow && (
        <Field label="Window" layout="inline">
          <Select value={windowParam} onChange={(e) => updateParam("window", e.target.value)} aria-label="Analysis window">
            {!windows.includes(windowParam) && <option value={windowParam}>{windowParam} · unavailable</option>}
            {WINDOWS.filter((w) => windows.includes(w.value)).map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
          </Select>
        </Field>
      )}
    </>
  );

  return (
    <FilterBar
      scope={scope}
      filters={filters}
      modes={modes}
      summary={`${seasonFrom ? `${seasonFrom} – ${season}` : season} · ${phaseLabel(phase)}${showThrough && throughDate ? ` · ${formatDate(throughDate, "compact")}` : ""}`}
      count={sampleSize !== undefined ? <CountChip>{sampleSize.toLocaleString("en-US")} {sampleNoun}</CountChip> : undefined}
      details={
        <DataDetailsButton
          scope={{ releaseId: releaseId ?? catalog?.release_id, season, phase, beforeDate, window: showWindow ? windowParam : null, lastIncludedDate }}
          rows={[...(catalog ? [
            { label: "Dataset", value: catalog.dataset_id, mono: true },
            { label: "Snapshot", value: catalog.snapshot_id, mono: true },
            { label: "Source", value: catalog.source },
            { label: "Coverage", value: `${formatDate(catalog.coverage_start)} – ${formatDate(catalog.coverage_end)}` }
          ] : []), ...detailRows]}
        />
      }
    />
  );
}
