"use client";

import { useEffect, useMemo, useState } from "react";
import { GatedNote } from "./ui/gated-note";
import { ButtonLink, Chip } from "./ui/kit";
import { formatPctValue, type ColumnDefinition } from "@/lib/stats-presets";
import { getShrinkage, shrinkRow, type Shrinkage } from "@/lib/signal-noise";
import type { PlayerResearchItem } from "@/lib/types";

/**
 * Research R03: the Stats table's Shrunk toggle. Off by default and inert when off: no request, no
 * column, no query change. On, it adds labelled shrunk columns beside 3P%, FT% and TS% (and raw
 * and shrunk Rim FG%) computed from each row's own makes and attempts and the season's frozen
 * beta-binomial prior. Raw values are never replaced, and the Stats query and its hash never see
 * the toggle (it lives in the URL as `shrunk=1`, written without a navigation).
 */
export const SHRUNK_PARAM = "shrunk";
const SHRUNK_SUFFIX = "__shrunk";
const RIM_KEY = "rim_fg_pct";
const BESIDE: Record<string, { label: string; what: string }> = {
  fg3_pct: { label: "3P%-Shrunk", what: "3P%" },
  ft_pct: { label: "FT%-Shrunk", what: "FT%" },
  ts_pct: { label: "TS%-Shrunk", what: "TS%" },
};
const RIM_GROUP = "Rim (shot detail)";

export const isShrunkColumn = (key: string) => key.endsWith(SHRUNK_SUFFIX) || key === RIM_KEY;

export interface ShrunkScope {
  season: string;
  phase: string;
  /** More than one season in scope: no single prior applies. */
  multiSeason: boolean;
  /** Whole regular season, all teams, no date or window cut: the only scope rim totals describe. */
  wholeSeason: boolean;
}

export type ShrunkOverlay =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "unavailable"; reason: string }
  | { status: "ready"; data: Shrinkage; wholeSeason: boolean };

export function useShrunkOverlay(enabled: boolean, scope: ShrunkScope): ShrunkOverlay | null {
  const [state, setState] = useState<{ key: string; overlay: ShrunkOverlay } | null>(null);
  const key = JSON.stringify([scope.season, scope.phase]);
  const fetchable = enabled && !scope.multiSeason;
  useEffect(() => {
    if (!fetchable) return;
    const abort = new AbortController();
    getShrinkage(scope.season, scope.phase, abort.signal)
      .then(data => { if (!abort.signal.aborted) setState({ key, overlay: { status: "ready", data, wholeSeason: scope.wholeSeason } }); })
      .catch(error => { if (!abort.signal.aborted) setState({ key, overlay: { status: "error", message: (error as Error).message } }); });
    return () => abort.abort();
  }, [fetchable, key, scope.season, scope.phase, scope.wholeSeason]);
  return useMemo<ShrunkOverlay | null>(() => {
    if (!enabled) return null;
    if (scope.multiSeason) return { status: "unavailable", reason: "Shrinkage needs one season: each season has its own prior." };
    if (state?.key !== key) return { status: "loading" };
    return state.overlay.status === "ready" ? { ...state.overlay, wholeSeason: scope.wholeSeason } : state.overlay;
  }, [enabled, scope.multiSeason, scope.wholeSeason, state, key]);
}

/** The view's columns with shrunk columns beside their raw ones and rim columns at the end. */
export function withShrunkColumns(columns: ColumnDefinition[], overlay: ShrunkOverlay | null): ColumnDefinition[] {
  if (!overlay) return columns;
  const out: ColumnDefinition[] = [];
  for (const column of columns) {
    out.push(column);
    const beside = BESIDE[column.key];
    if (beside) {
      out.push({
        key: `${column.key}${SHRUNK_SUFFIX}`, label: beside.label, group: column.group, num: true,
        sortMetric: `${column.key}${SHRUNK_SUFFIX}`, format: formatPctValue, keepLabel: true,
        tooltip: `${beside.what} shrunk toward the league (beta-binomial empirical Bayes, prior fitted on the three earlier seasons). The raw ${beside.what} column is unchanged. Not sortable.`
      });
    }
  }
  out.push(
    { key: RIM_KEY, label: "Rim FG%", group: RIM_GROUP, num: true, sortMetric: RIM_KEY, format: formatPctValue, keepLabel: true,
      tooltip: "Restricted-area FG% from NBA shot detail, whole regular season. Not sortable." },
    { key: `${RIM_KEY}${SHRUNK_SUFFIX}`, label: "Rim FG%-Shrunk", group: RIM_GROUP, num: true, sortMetric: `${RIM_KEY}${SHRUNK_SUFFIX}`,
      format: formatPctValue, keepLabel: true, tooltip: "Rim FG% shrunk toward the league (beta-binomial empirical Bayes). Not sortable." }
  );
  return out;
}

/** Rows with the shrunk values added under new keys; every served value is left as it was. */
export function withShrunkMetrics(items: PlayerResearchItem[], overlay: ShrunkOverlay | null): PlayerResearchItem[] {
  if (!overlay) return items;
  const ready = overlay.status === "ready" ? overlay.data : null;
  const priors = ready ? Object.fromEntries(Object.entries(ready.priors).flatMap(([key, prior]) =>
    prior.status === "available" ? [[key, { alpha: prior.alpha, beta: prior.beta }]] : [])) : {};
  const rim = ready && ready.rim.status === "available" && overlay.status === "ready" && overlay.wholeSeason ? ready.rim.players : null;
  return items.map(item => {
    const shrunk = ready ? shrinkRow(item.metrics, priors) : { fg3_pct: null, ft_pct: null, ts_pct: null };
    const rimRow = rim?.[item.player_id];
    return {
      ...item,
      metrics: {
        ...item.metrics,
        [`fg3_pct${SHRUNK_SUFFIX}`]: shrunk.fg3_pct,
        [`ft_pct${SHRUNK_SUFFIX}`]: shrunk.ft_pct,
        [`ts_pct${SHRUNK_SUFFIX}`]: shrunk.ts_pct,
        [RIM_KEY]: rimRow?.raw ?? null,
        [`${RIM_KEY}${SHRUNK_SUFFIX}`]: rimRow?.shrunk.value ?? null,
      }
    };
  });
}

/** Toolbar toggle; its state is the `shrunk=1` URL flag, written without re-running the query. */
export function ShrunkToggle({ pressed, onChange }: { pressed: boolean; onChange: (next: boolean) => void }) {
  return <Chip size="sm" tone="console" pressed={pressed} onClick={() => onChange(!pressed)}
    aria-label="Show shrunk shooting percentages"
    title="Add empirical-Bayes shrunk 3P%, FT%, TS% and Rim FG% beside the raw values (Signal vs Noise)">Shrunk %</Chip>;
}

/** One line saying what the shrunk columns use, and what is unknown and why. */
export function ShrunkNote({ overlay, season }: { overlay: ShrunkOverlay; season: string }) {
  const link = <ButtonLink size="sm" variant="text" href="/research/signal-noise">How shrinkage works</ButtonLink>;
  if (overlay.status === "loading") return <GatedNote action={link}>Loading the {season} shrinkage priors…</GatedNote>;
  if (overlay.status === "error") return <GatedNote tone="warning" action={link}>Shrunk values unavailable: {overlay.message}</GatedNote>;
  if (overlay.status === "unavailable") return <GatedNote action={link}>Shrunk values unknown: {overlay.reason}</GatedNote>;
  const { priors, rim } = overlay.data;
  const parts: string[] = [];
  const fg3 = priors.fg3_pct;
  if (fg3.status === "available") parts.push(`Shrunk columns use the ${season} priors, fitted on ${fg3.seasons.join(", ")} only; raw columns are unchanged.`);
  else parts.push(`Shrunk 3P%, FT% and TS% unknown: ${fg3.reason}`);
  if (rim.status !== "available") parts.push(`Rim FG% unknown: ${rim.reason}`);
  else if (!overlay.wholeSeason) parts.push("Rim FG% unknown here: it is served for a whole regular season with no team, date or window filter.");
  return <GatedNote action={link}>{parts.join(" ")}</GatedNote>;
}
