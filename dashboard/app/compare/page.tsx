import type { ReactNode } from "react";
import { ComparisonRows } from "@/components/ui/comparison-rows";
import { TeamLogo } from "@/components/team-logo";
import type { Metadata } from "next";
import { CompareSuggestions } from "@/components/compare-suggestions";
import { CompareSelector } from "@/components/compare-selector";
import { PlayerCompareView } from "@/components/player-compare-view";
import { AnalyticsApiError, getAnalyticsCatalog, getAnalyticsCompare } from "@/lib/api";
import { ContextBar } from "@/components/context-bar";
import { PageShell, CompareLayout } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/ui/panel";
import { GatedNote } from "@/components/ui/gated-note";
import { PlayerIdentity } from "@/components/ui/identity";
import { formatDate } from "@/lib/format-date";
import { resolveStatsQuery } from "@/lib/stats-query";
import { getMetricCatalog, queryPlayerResearch, getWorkbenchCatalog, executeWorkbenchQuery } from "@/lib/workbench-api";
import { comparePlayers } from "@/lib/workbench-api";
import type { AnalyticsCompare, AnalyticsProfile, AnalyticsSummary, PlayerComparisonResponse } from "@/lib/types";
import { ButtonLink } from "@/components/ui/kit";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Player Comparison · CourtLens" };

export default async function ComparePage({ searchParams }: {
  searchParams: Promise<{
    playerA?: string;
    playerB?: string;
    players?: string;
    date?: string;
    snapshotId?: string;
    season?: string;
    phase?: string;
    beforeDate?: string;
    window?: string;
    releaseId?: string;
    release_id?: string;
    before_date?: string;
  }>;
}) {
  const rawSelected = await searchParams;
  const selected = { ...rawSelected, releaseId: rawSelected.releaseId ?? rawSelected.release_id, beforeDate: rawSelected.beforeDate ?? rawSelected.before_date };
  const loaded = await loadComparison(selected);
  if (!loaded) return <PageShell template="compare"><PageHeader title="Player Comparison" /><GatedNote action={<ButtonLink size="lg" href="/players">Open players</ButtonLink>}>Comparison unavailable.</GatedNote></PageShell>;
  const { catalog, workbenchCatalog, date, comparison, wbComparison, error, targetA, targetB, additionalPlayerIds, cohort, metricDefinitions, leaders } = loaded;
  const context = {
    season: String(wbComparison?.context?.season ?? selected.season ?? workbenchCatalog?.default_season ?? ""),
    phase: String(wbComparison?.context?.phase ?? selected.phase ?? workbenchCatalog?.default_phase ?? "regular_season"),
    before_date: String(wbComparison?.context?.before_date ?? selected.beforeDate ?? date),
    window: String(wbComparison?.context?.window ?? selected.window ?? "season"),
    release_id: String(wbComparison?.context?.release_id ?? selected.releaseId ?? workbenchCatalog?.release_id ?? "")
  };
  const selector = (    <CompareSelector catalog={catalog} date={date} legacy={Boolean(selected.snapshotId === "snapshot-browser-fixture" || comparison && !wbComparison)}
      initialA={wbComparison ? { id: wbComparison.player_a.id, name: wbComparison.player_a.name } : comparison ? comparison.player_a.player : targetA ? {id:targetA,name:`Player ${targetA}`} : null}
      initialB={wbComparison ? { id: wbComparison.player_b.id, name: wbComparison.player_b.name } : comparison ? comparison.player_b.player : targetB ? {id:targetB,name:`Player ${targetB}`} : null} />);
  if(wbComparison) return <PageShell template="compare" className="fo11-player-comparison"><PlayerCompareView comparison={wbComparison} catalog={catalog} workbenchCatalog={workbenchCatalog} selector={selector} additionalPlayerIds={additionalPlayerIds} context={context} cohort={cohort} metricDefinitions={metricDefinitions} /></PageShell>;
  return <PageShell template="compare" className="fo11-player-comparison">
    <PageHeader title="Player Comparison" subtitle="Descriptive metrics under a shared scope." />
    <ContextBar catalog={workbenchCatalog ?? undefined} initialReleaseId={context.release_id} initialSeason={context.season} initialPhase={context.phase} initialBeforeDate={context.before_date} initialWindow={context.window}
      detailRows={[{label:"Legacy snapshot",value:catalog.snapshot_id,mono:true},{label:"Source",value:catalog.source}, ...(cohort ? [{label:"Percentile cohort",value:`${cohort.total_eligible_players} eligible players; Stats midrank percentiles, oriented by catalog direction.`}] : [])]} />
    {!comparison && !error ? <CompareSuggestions leaders={leaders} scope={context} selector={selector} /> : selector}
    {error && <div role="alert"><GatedNote why={error} action={<ButtonLink size="lg" href="/compare">Choose players</ButtonLink>}>Unable to compare.</GatedNote></div>}
    {comparison && !wbComparison && <ComparisonView comparison={comparison} />}

  </PageShell>;
}

async function loadComparison(selected: {
  playerA?: string;
  playerB?: string;
  players?: string;
  date?: string;
  snapshotId?: string;
  season?: string;
  phase?: string;
  beforeDate?: string;
  window?: string;
  releaseId?: string;
}) {
  try {
    const catalog = await getAnalyticsCatalog(selected.snapshotId);
    const workbenchCatalog = await getWorkbenchCatalog(selected.releaseId).catch(() => null);
    const scope = workbenchCatalog ? resolveStatsQuery(selected, workbenchCatalog, "per_game") : null;
    const date = selected.date ?? (selected.snapshotId === "snapshot-browser-fixture" ? catalog.default_replay_date : scope?.before_date) ?? catalog.default_replay_date;

    // Resolve Player IDs from playerA/playerB or comma-separated players param
    const parsedPlayers = selected.players
      ? selected.players.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    const targetA = selected.playerA || parsedPlayers[0];
    const targetB = selected.playerB || parsedPlayers[1];
    const additionalPlayerIds = parsedPlayers.filter((id) => id !== targetA && id !== targetB);

    let comparison: AnalyticsCompare | null = null;
    let wbComparison: PlayerComparisonResponse | null = null;
    let error: string | null = null;

    if (targetA && targetB) {
      if (targetA === targetB) {
        error = "Please select two different players to compare.";
      } else {
        // First try workbench comparison if not explicitly locked to mock fixture
        if (selected.snapshotId !== "snapshot-browser-fixture") {
          try {
            wbComparison = await comparePlayers(targetA, targetB, {
              season: scope?.season ?? selected.season,
              phase: scope?.phase ?? selected.phase,
              beforeDate: selected.beforeDate || scope?.before_date || date,
              window: selected.window,
              releaseId: scope?.release_id ?? selected.releaseId
            });
          } catch {
            // Fall through to legacy comparison
          }
        }

        if (!wbComparison) {
          try {
            comparison = await getAnalyticsCompare(targetA, targetB, date, catalog.snapshot_id);
          } catch (reason) {
            const apiError = reason instanceof AnalyticsApiError ? reason : null;
            error =
              apiError?.status === 422
                ? `Replay date ${date} is unsupported, or the same player was selected twice.`
                : apiError?.status === 404
                ? "One selected player is absent from this snapshot."
                : "Comparison is unavailable. Try again.";
          }
        }
      }
    }
    const cohort = wbComparison && scope ? await executeWorkbenchQuery({...scope,page:{limit:2}}, {player_ids:[wbComparison.player_a.id,wbComparison.player_b.id]}).catch(() => null) : null;
    const [metrics, suggested] = await Promise.all([getMetricCatalog().catch(() => null), !targetA && !targetB && scope ? queryPlayerResearch({ release_id:scope.release_id ?? undefined, season:scope.season, phase:scope.phase, before_date:scope.before_date ?? undefined, window:"season", sort_metric:"min", sort_direction:"desc", min_games:1, limit:2 }).catch(() => null) : Promise.resolve(null)]);
    return {
      metricDefinitions: metrics?.metrics ?? [],
      leaders: suggested?.items.slice(0,2) ?? [],
      catalog,
      workbenchCatalog,
      cohort,
      date,
      comparison,
      wbComparison,
      error,
      targetA,
      targetB,
      additionalPlayerIds
    };
  } catch {
    return null;
  }
}

function ComparisonView({ comparison }: { comparison: AnalyticsCompare }) {
  const a = comparison.player_a;
  const b = comparison.player_b;
  const rows: Array<[string, (profile: AnalyticsProfile) => ReactNode]> = [
    ["Last 5 · CourtLens points / game", (p) => summaryValue(p.summaries.last_5, "reference_points_per_game")],
    ["Last 10 · CourtLens points / game", (p) => summaryValue(p.summaries.last_10, "reference_points_per_game")],
    ["Season · CourtLens points / game", (p) => summaryValue(p.summaries.season, "reference_points_per_game")],
    ["Last 5 · minutes / game", (p) => summaryValue(p.summaries.last_5, "minutes_per_game")],
    ["Last 10 · minutes / game", (p) => summaryValue(p.summaries.last_10, "minutes_per_game")],
    ["Season · minutes / game", (p) => summaryValue(p.summaries.season, "minutes_per_game")],
    ["Last 10 sample", (p) => p.summaries.last_10 == null ? "Unavailable" : String(p.summaries.last_10.n)],
    ["Next team game", (p) => p.target ? <>{formatDate(p.target.date)} · <TeamLogo team={p.target.team ?? p.target.team_id} size={20} />{p.target.team ?? p.target.team_id} {p.target.side === "home" ? "vs" : "at"} <TeamLogo team={p.target.opponent ?? p.target.opponent_id} size={20} />{p.target.opponent ?? p.target.opponent_id}</> : "No reconstructed target"],
    ["Rest before game", (p) => p.target?.rest_days == null ? "Unavailable" : `${p.target.rest_days} days`],
    ["Opponent context", (p) => p.opponent_context && p.opponent_context.eligible_games >= 5 ? `${p.opponent_context.eligible_games} prior games` : "Insufficient opponent coverage"],
    ["Next-game estimate", (p) => p.estimate.point == null ? estimateReason(p.estimate.status) : `${p.estimate.point.toFixed(1)} points`],
    ["80% empirical interval", (p) => p.estimate.interval ? `${p.estimate.interval.lower.toFixed(1)}–${p.estimate.interval.upper.toFixed(1)} points` : "Unavailable"],
  ];

  return (
    <section className="comparison-results" aria-labelledby="comparison-title">
      <CompareLayout sides={[a,b].map(p => <PlayerIdentity key={p.player.id} playerId={p.player.id} name={p.player.name} team={p.target?.team} size="xl" />)}>

      <div className="panel-header">
        <h2 id="comparison-title" className="panel-title">Side by side</h2>
      </div>
      <ComparisonRows names={[a.player.name,b.player.name]} rows={(["last_5","last_10","season"] as const).flatMap(window=>(["reference_points_per_game","minutes_per_game"] as const).map(key=>({key:`${window}-${key}`,label:`${window.replaceAll("_"," ")} · ${key === "reference_points_per_game" ? "CourtLens points / game" : "minutes / game"}`,a:a.summaries[window]?.[key],b:b.summaries[window]?.[key],formattedA:summaryValue(a.summaries[window],key),formattedB:summaryValue(b.summaries[window],key)})))} />
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th>{a.player.name}</th>
              <th>{b.player.name}</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(6).map(([label, value]) => (
              <tr key={label}>
                <td className="font-semibold">{label}</td>
                <td>{value(a)}</td>
                <td>{value(b)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <GatedNote why={<>
        <strong>Estimate gap:</strong>{" "}
        {comparison.estimate_gap == null
          ? "Unavailable until both players have a supported estimate at this cutoff."
          : `${Math.abs(comparison.estimate_gap).toFixed(1)} CourtLens points.`}
        <p className="panel-subtitle-margin">
          Different next-game dates are possible. An estimate covers production conditional on appearance; it does not estimate availability.
        </p>
      </>}>Estimates are conditional on appearance.</GatedNote>
      </CompareLayout>
    </section>
  );
}

function summaryValue(summary: AnalyticsSummary | null, key: "reference_points_per_game" | "minutes_per_game") {
  const value = summary?.[key];
  return value == null ? "Unavailable" : `${value.toFixed(1)} (n=${summary?.n ?? 0})`;
}

function estimateReason(status: string) {
  return status === "insufficient_history"
    ? "Fewer than 5 valid games"
    : status === "artifact_not_available_for_cutoff"
    ? "Estimate unavailable at this cutoff"
    : status === "evaluation_pending"
    ? "Estimate artifact not installed"
    : status.replaceAll("_", " ");
}
