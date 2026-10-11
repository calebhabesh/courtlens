"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { CountChip, FilterBar } from "@/components/ui/filter-bar";
import { phaseLabel } from "@/lib/scope-labels";
import { DataDetailsButton, type DataDetailRow } from "@/components/ui/data-details";
import { DatePicker } from "@/components/ui/date-picker";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { beforeDateFromThrough, formatDate, throughDateFromBefore } from "@/lib/format-date";
import { getSharedCatalog } from "@/lib/route-availability";
import { applyScopeChange, type ScopeKey } from "@/lib/scope-url";
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
}

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
  detailRows = []
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

  const throughDate = /^\d{4}-\d{2}-\d{2}$/.test(beforeDate) ? throughDateFromBefore(beforeDate) : "";

  const scope = (
    <>
      <Field label="Season" layout="inline">
        <Select value={season} onChange={(e) => updateParam("season", e.target.value)} aria-label="Filter by season">
          {!seasons.includes(season) && <option value={season}>{season} · unavailable</option>}
          {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </Field>
      <Field label="Phase" layout="inline">
        <Select value={phase} onChange={(e) => updateParam("phase", e.target.value)} aria-label="Filter by competition phase">
          {!phases.includes(phase) && <option value={phase}>{phaseLabel(phase)} · unavailable</option>}
          {phases.map((value) => <option key={value} value={value}>{phaseLabel(value)}</option>)}
        </Select>
      </Field>
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
      summary={`${season} · ${phaseLabel(phase)}${showThrough && throughDate ? ` · ${formatDate(throughDate, "compact")}` : ""}`}
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
