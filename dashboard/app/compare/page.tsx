import type { Metadata } from "next";
import Link from "next/link";
import { CompareSelector } from "@/components/compare-selector";
import { AnalyticsApiError, getAnalyticsCatalog, getAnalyticsCompare } from "@/lib/api";
import type { AnalyticsCompare, AnalyticsProfile, AnalyticsSummary } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Compare historical players" };

export default async function ComparePage({ searchParams }: {
  searchParams: Promise<{ playerA?: string; playerB?: string; date?: string; snapshotId?: string }>;
}) {
  const selected = await searchParams;
  const loaded = await loadComparison(selected);
  if (!loaded) {
    return <section className="page shell"><div className="empty-state tall" role="alert"><h1>Comparison unavailable</h1><p>No published archive could be opened.</p><Link className="button button-dark" href="/players">Open players</Link></div></section>;
  }
  const { catalog, date, comparison, error } = loaded;
  return <main className="page shell comparison-page">
    <header className="page-heading"><div><p className="kicker">Historical replay · {date}</p><h1>Compare players</h1><p>One archive snapshot, one cutoff and CourtLoad&apos;s fixed scoring formula.</p></div></header>
    <div className="replay-banner"><strong>Historical replay</strong><span>Reconstructed matchup estimates are conditional on appearing. Teams reflect the last observed appearance.</span></div>
    <CompareSelector catalog={catalog} date={date}
      initialA={comparison ? comparison.player_a.player : selected.playerA ? { id: selected.playerA, name: `Player ${selected.playerA}` } : null}
      initialB={comparison ? comparison.player_b.player : selected.playerB ? { id: selected.playerB, name: `Player ${selected.playerB}` } : null} />
    {error && <div className="empty-state" role="alert"><h2>Unable to compare</h2><p>{error}</p><p>Your date and snapshot remain in the URL.</p></div>}
    {comparison ? <ComparisonView comparison={comparison} /> : !error && <div className="empty-state" role="status"><h2>Select two players</h2><p>Search by name and choose a shared replay date to compare their prior form and reconstructed matchups.</p></div>}
    <p className="snapshot-footnote">Snapshot {catalog.snapshot_id} · source {catalog.source}</p>
  </main>;
}

async function loadComparison(selected: { playerA?: string; playerB?: string; date?: string; snapshotId?: string }) {
  try {
    const catalog = await getAnalyticsCatalog(selected.snapshotId);
    const date = selected.date ?? catalog.default_replay_date;
    let comparison: AnalyticsCompare | null = null;
    let error: string | null = null;
    if (selected.playerA && selected.playerB) {
      try {
        comparison = await getAnalyticsCompare(selected.playerA, selected.playerB, date, catalog.snapshot_id);
      } catch (reason) {
        const apiError = reason instanceof AnalyticsApiError ? reason : null;
        error = apiError?.status === 422 ? `Replay date ${date} is unsupported, or the same player was selected twice.` :
          apiError?.status === 404 ? "One selected player is absent from this snapshot." : "Comparison is unavailable. Try again.";
      }
    }
    return { catalog, date, comparison, error };
  } catch {
    return null;
  }
}

function ComparisonView({ comparison }: { comparison: AnalyticsCompare }) {
  const a = comparison.player_a;
  const b = comparison.player_b;
  const rows: Array<[string, (profile: AnalyticsProfile) => string]> = [
    ["Last 5 · CourtLoad points / game", (p) => summaryValue(p.summaries.last_5, "reference_points_per_game")],
    ["Last 10 · CourtLoad points / game", (p) => summaryValue(p.summaries.last_10, "reference_points_per_game")],
    ["Season · CourtLoad points / game", (p) => summaryValue(p.summaries.season, "reference_points_per_game")],
    ["Last 5 · minutes / game", (p) => summaryValue(p.summaries.last_5, "minutes_per_game")],
    ["Last 10 · minutes / game", (p) => summaryValue(p.summaries.last_10, "minutes_per_game")],
    ["Season · minutes / game", (p) => summaryValue(p.summaries.season, "minutes_per_game")],
    ["Last 10 sample", (p) => String(p.summaries.last_10?.n ?? 0)],
    ["Next team game", (p) => p.target ? `${p.target.date} · ${p.target.team ?? p.target.team_id} ${p.target.side === "home" ? "vs" : "at"} ${p.target.opponent ?? p.target.opponent_id}` : "No reconstructed target"],
    ["Rest before game", (p) => p.target?.rest_days == null ? "Unavailable" : `${p.target.rest_days} days`],
    ["Opponent context", (p) => p.opponent_context && p.opponent_context.eligible_games >= 5 ? `${p.opponent_context.eligible_games} prior games` : "Insufficient opponent coverage"],
    ["Next-game estimate", (p) => p.estimate.point == null ? estimateReason(p.estimate.status) : `${p.estimate.point.toFixed(1)} points`],
    ["80% empirical interval", (p) => p.estimate.interval ? `${p.estimate.interval.lower.toFixed(1)}–${p.estimate.interval.upper.toFixed(1)} points` : "Unavailable"],
  ];
  return <section className="comparison-results" aria-labelledby="comparison-title">
    <div className="profile-section-heading"><p className="kicker">At the same cutoff</p><h2 id="comparison-title">Side by side</h2></div>
    <div className="comparison-head"><span>Metric</span><strong>{a.player.name}</strong><strong>{b.player.name}</strong></div>
    <dl className="comparison-rows">{rows.map(([label, value]) => <div className="comparison-row" key={label}><dt>{label}</dt><dd>{value(a)}</dd><dd>{value(b)}</dd></div>)}</dl>
    <div className="comparison-interpretation">
      <h3>Estimate gap</h3>
      <p>{comparison.estimate_gap == null ? "Unavailable until both players have a supported estimate at this cutoff." : `${Math.abs(comparison.estimate_gap).toFixed(1)} CourtLoad points. Compare the gap with the empirical uncertainty below.`}</p>
      <p>Different next-game dates are possible. An estimate covers production conditional on appearance; it does not estimate availability.</p>
      <Link href="/evaluation">How the estimator performed →</Link>
    </div>
    <div className="comparison-profile-links"><Link href={`/players/${a.player.id}?date=${comparison.replay_date}&snapshotId=${comparison.snapshot_id}`}>Open {a.player.name}&apos;s profile</Link><Link href={`/players/${b.player.id}?date=${comparison.replay_date}&snapshotId=${comparison.snapshot_id}`}>Open {b.player.name}&apos;s profile</Link></div>
  </section>;
}

function summaryValue(summary: AnalyticsSummary | null, key: "reference_points_per_game" | "minutes_per_game") {
  const value = summary?.[key];
  return value == null ? "Unavailable" : `${value.toFixed(1)} (n=${summary?.n ?? 0})`;
}

function estimateReason(status: string) {
  return status === "insufficient_history" ? "Fewer than 5 valid games" :
    status === "artifact_not_available_for_cutoff" ? "Estimate unavailable at this cutoff" :
    status === "evaluation_pending" ? "Estimate artifact not installed" : status.replaceAll("_", " ");
}
