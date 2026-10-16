import type { ReactNode } from "react";
import { ComparisonRows } from "@/components/ui/comparison-rows";
import { TeamLogo } from "@/components/team-logo";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
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
import { getComparisonCareer, getMetricCatalog, getPlayerBio, getPlayerSeasons, queryLookup, queryPlayerResearch, getWorkbenchCatalog, executeWorkbenchQuery } from "@/lib/workbench-api";
import { comparePlayers, WorkbenchApiError } from "@/lib/workbench-api";
import type { AnalyticsCompare, AnalyticsProfile, AnalyticsSummary, PlayerBio, PlayerComparisonResponse, WorkbenchCatalog } from "@/lib/types";
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
    span?: string;
    seasonA?: string;
    seasonB?: string;
    empty?: string;
  }>;
}) {
  const rawSelected = await searchParams;
  const selected = { ...rawSelected, releaseId: rawSelected.releaseId ?? rawSelected.release_id, beforeDate: rawSelected.beforeDate ?? rawSelected.before_date };
  // Alignment row 3, 6: the page opens on a real pair, written to the URL (supersedes PC C5).
  const fallbackPair = await defaultPairUrl(rawSelected);
  if (fallbackPair) redirect(fallbackPair);
  const loaded = await loadComparison(selected);
  if (!loaded) return <PageShell template="compare"><PageHeader title="Player Comparison" /><GatedNote action={<ButtonLink size="lg" href="/players">Open players</ButtonLink>}>Comparison unavailable.</GatedNote></PageShell>;
  const { catalog, workbenchCatalog, date, comparison, wbComparison, error, targetA, targetB, additionalPlayerIds, cohort, metricDefinitions, bios, sides, played } = loaded;
  // Career view (alignment row 3, 21): both careers through the same cutoff, fetched on request.
  const careerIn = (side: CompareSide) => wbComparison ? getComparisonCareer(wbComparison.player_a.id, wbComparison.player_b.id, {
    season: side.season, beforeDate: side.before_date, phase: String(wbComparison.context.phase),
    releaseId: wbComparison.context.release_id ? String(wbComparison.context.release_id) : undefined
  }).catch(() => null) : Promise.resolve(null);
  const [careerA, careerB] = wbComparison && rawSelected.span === "career"
    ? await Promise.all(sides.a.season === sides.b.season ? [careerIn(sides.a)] : [careerIn(sides.a), careerIn(sides.b)]) : [null];
  const career = careerA ? { ...careerA, player_b: (careerB ?? careerA).player_b } : null;
  // No pair yet (row 3, 24): name whichever side is already chosen; an unknown ID stays open.
  const named = async (id: string | undefined) => {
    if (!id) return null;
    const found = await queryLookup({ query: id, kinds: ["player"], limit: 1, releaseId: selected.releaseId }).catch(() => null);
    const item = found?.items.find(entry => entry.canonical_id === id);
    return item ? { id, name: item.display_name } : null;
  };
  const pending = wbComparison || comparison ? null : await Promise.all([named(targetA), named(targetB === targetA ? undefined : targetB)]).then(([a, b]) => ({ a, b }));
  const context = {
    season: String(wbComparison?.context?.season ?? selected.season ?? workbenchCatalog?.default_season ?? ""),
    phase: String(wbComparison?.context?.phase ?? selected.phase ?? workbenchCatalog?.default_phase ?? "regular_season"),
    before_date: String(wbComparison?.context?.before_date ?? selected.beforeDate ?? date),
    window: String(wbComparison?.context?.window ?? selected.window ?? "season"),
    release_id: String(wbComparison?.context?.release_id ?? selected.releaseId ?? workbenchCatalog?.release_id ?? "")
  };
  // The legacy snapshot comparison keeps its form; everything else is the duel card.
  if(!comparison) return <PageShell template="compare" className="fo11-player-comparison">
    <PlayerCompareView comparison={wbComparison} pending={selected.snapshotId === "snapshot-browser-fixture" ? null : pending} bios={bios} career={career} sides={sides} played={played} span={rawSelected.span === "career" ? "career" : "season"} catalog={catalog} workbenchCatalog={workbenchCatalog} additionalPlayerIds={additionalPlayerIds} context={context} cohort={cohort} metricDefinitions={metricDefinitions} error={error}
      selector={<CompareSelector catalog={catalog} date={date} legacy={selected.snapshotId === "snapshot-browser-fixture"}
        initialA={targetA ? {id:targetA,name:`Player ${targetA}`} : null} initialB={targetB ? {id:targetB,name:`Player ${targetB}`} : null} />} />
  </PageShell>;
  const selector = <CompareSelector catalog={catalog} date={date} legacy initialA={comparison.player_a.player} initialB={comparison.player_b.player} />;
  return <PageShell template="compare" className="fo11-player-comparison">
    <PageHeader title="Player Comparison" subtitle="Descriptive metrics under a shared scope." />
    <ContextBar catalog={workbenchCatalog ?? undefined} initialReleaseId={context.release_id} initialSeason={context.season} initialPhase={context.phase} initialBeforeDate={context.before_date} initialWindow={context.window}
      detailRows={[{label:"Legacy snapshot",value:catalog.snapshot_id,mono:true},{label:"Source",value:catalog.source}]} />
    {selector}
    <ComparisonView comparison={comparison} />
  </PageShell>;
}

type CompareSide = { season: string; before_date: string };

/** A cross-season comparison from two reads: A's side from A's season, B's from B's (row 3, 38). */
function mergeSides(inA: PlayerComparisonResponse, inB: PlayerComparisonResponse, context: PlayerComparisonResponse["context"]): PlayerComparisonResponse {
  const byMetric = new Map(inB.aligned_metrics.map(row => [row.metric, row]));
  return { ...inA, context, player_b: inB.player_b,
    aligned_metrics: inA.aligned_metrics.map(row => {
      const other = byMetric.get(row.metric);
      const valueB = other?.value_b ?? null;
      return { ...row, value_b: valueB, n_b: other?.n_b ?? 0,
        diff: typeof row.value_a === "number" && typeof valueB === "number" ? row.value_a - valueB : null };
    }),
    warnings: [...inA.warnings, ...inB.warnings] };
}

/** The season's top two scorers (points per game, 500+ minutes), else its two minutes leaders. */
async function defaultPairUrl(raw: Record<string, string | undefined>): Promise<string | null> {
  // ``empty`` is a cleared card (row 3, 24): it stays open instead of reloading the default pair.
  if (raw.playerA || raw.playerB || raw.players || raw.empty === "1" || raw.snapshotId === "snapshot-browser-fixture") return null;
  const workbenchCatalog: WorkbenchCatalog | null = await getWorkbenchCatalog(raw.releaseId ?? raw.release_id).catch(() => null);
  if (!workbenchCatalog) return null;
  const scope = resolveStatsQuery({ ...raw, beforeDate: raw.beforeDate ?? raw.before_date, releaseId: raw.releaseId ?? raw.release_id }, workbenchCatalog, "per_game");
  const base = { release_id: scope.release_id ?? undefined, season: scope.season, phase: scope.phase, before_date: scope.before_date ?? undefined, window: "season", sort_direction: "desc" as const, limit: 2 };
  const scorers = await queryPlayerResearch({ ...base, sort_metric: "pts_per_game", min_minutes: 500 }).catch(() => null);
  const pair = scorers && scorers.items.length >= 2 ? scorers.items
    : (await queryPlayerResearch({ ...base, sort_metric: "min", min_games: 1 }).catch(() => null))?.items ?? [];
  if (pair.length < 2) return null;
  const next = new URLSearchParams(Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  next.set("playerA", pair[0].player_id); next.set("playerB", pair[1].player_id);
  return `/compare?${next}`;
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
  seasonA?: string;
  seasonB?: string;
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

    // Each side's season and cutoff: the page scope unless the player's own season is chosen.
    const sideScope = (season: string | undefined): { season: string; before_date: string; query: typeof scope } => {
      const own = season && season !== scope?.season && /^\d{4}-\d{2}$/.test(season) && workbenchCatalog?.stats_scopes?.some(entry => entry.season === season)
        ? resolveStatsQuery({ ...selected, beforeDate: undefined, season }, workbenchCatalog, "per_game") : scope;
      return { season: own?.season ?? String(selected.season ?? ""), before_date: own?.before_date ?? selected.beforeDate ?? date, query: own };
    };
    const scopedA = sideScope(selected.seasonA), scopedB = sideScope(selected.seasonB);
    const sides = { a: { season: scopedA.season, before_date: scopedA.before_date }, b: { season: scopedB.season, before_date: scopedB.before_date } };

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
            const compareIn = (side: CompareSide) => comparePlayers(targetA, targetB, {
              season: side.season, phase: scope?.phase ?? selected.phase, beforeDate: side.before_date,
              window: selected.window, releaseId: scope?.release_id ?? selected.releaseId
            });
            if (sides.a.season === sides.b.season) wbComparison = await compareIn(sides.a);
            else {
              // Each player in their own season (alignment row 3, 38): one read per season, merged.
              const [inA, inB] = await Promise.all([compareIn(sides.a), compareIn(sides.b)]);
              // The page scope keeps the page's season and cutoff; each side carries its own.
              wbComparison = mergeSides(inA, inB, { ...inA.context, season: scope?.season ?? inA.context.season, before_date: scope?.before_date ?? inA.context.before_date });
            }
          } catch (reason) {
            // An unknown player is final; other failures fall through to the legacy comparison.
            if (reason instanceof WorkbenchApiError && reason.status === 404) error = "One selected player is not in this release.";
          }
        }

        if (!wbComparison && !error) {
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
    const cohortIn = (query: typeof scope, ids: string[]) => query ? executeWorkbenchQuery({ ...query, page: { limit: 2 } }, { player_ids: ids, table_percentiles: true }).catch(() => null) : Promise.resolve(null);
    const ids = wbComparison ? [wbComparison.player_a.id, wbComparison.player_b.id] : [];
    const [cohortA, cohortB] = wbComparison ? sides.a.season === sides.b.season ? [await cohortIn(scopedA.query, ids)] : await Promise.all([cohortIn(scopedA.query, [ids[0]]), cohortIn(scopedB.query, [ids[1]])]) : [null];
    // One cohort-shaped source: each player's row from their own season.
    const cohort = cohortA && cohortB ? { ...cohortA, items: [...cohortA.items, ...cohortB.items] } : cohortA ?? null;
    const [metrics, bios, playedSeasons] = await Promise.all([getMetricCatalog().catch(() => null), wbComparison
      ? Promise.all(([[ids[0], sides.a], [ids[1], sides.b]] as const).map(([id, side]) => getPlayerBio(id, { season: side.season, beforeDate: side.before_date }).catch(() => null))) as Promise<[PlayerBio | null, PlayerBio | null]>
      : Promise.resolve([null, null] as [PlayerBio | null, PlayerBio | null]),
      wbComparison ? getPlayerSeasons(ids, String(wbComparison.context.phase ?? scope?.phase ?? "regular_season"), scope?.release_id ?? undefined).catch(() => null) : Promise.resolve(null)]);
    const played = wbComparison && playedSeasons ? { a: playedSeasons.seasons[ids[0]] ?? [], b: playedSeasons.seasons[ids[1]] ?? [] } : null;
    return {
      metricDefinitions: metrics?.metrics ?? [],
      bios,
      sides,
      played,
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
