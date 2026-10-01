import type { Metadata } from "next";
import Link from "next/link";
import { CompareSelector } from "@/components/compare-selector";
import { WorkbenchCompareView } from "@/components/workbench-compare-view";
import { AnalyticsApiError, getAnalyticsCatalog, getAnalyticsCompare } from "@/lib/api";
import { comparePlayers } from "@/lib/workbench-api";
import type { AnalyticsCompare, AnalyticsProfile, AnalyticsSummary, PlayerComparisonResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Compare Players · CourtLoad" };

export default async function ComparePage({ searchParams }: {
  searchParams: Promise<{
    playerA?: string;
    playerB?: string;
    date?: string;
    snapshotId?: string;
    season?: string;
    phase?: string;
    beforeDate?: string;
    window?: string;
  }>;
}) {
  const selected = await searchParams;
  const loaded = await loadComparison(selected);
  if (!loaded) {
    return (
      <section className="workbench-content">
        <div className="empty-state tall" role="alert">
          <h1>Comparison unavailable</h1>
          <p>No published archive could be opened.</p>
          <Link className="button button-dark" href="/players">Open players</Link>
        </div>
      </section>
    );
  }

  const { catalog, date, comparison, wbComparison, error } = loaded;

  return (
    <div className="workbench-content">
      <header className="page-header">
        <div>
          <span className="text-xs text-muted font-mono uppercase">Player Comparison</span>
          <h1 className="page-title">Compare Players</h1>
          <p className="page-subtitle">
            Side-by-side descriptive metrics under an identical cutoff and calculation formula.
          </p>
        </div>
      </header>

      <div className="notice-box">
        <strong>Temporal discipline & no forced winner:</strong> Reconstructed matchup estimates are conditional on appearing. CourtLoad does not declare an automated start/sit decision.
      </div>

      <CompareSelector
        catalog={catalog}
        date={date}
        initialA={
          wbComparison ? { id: wbComparison.player_a.id, name: wbComparison.player_a.name } :
          comparison ? comparison.player_a.player :
          selected.playerA ? { id: selected.playerA, name: `Player ${selected.playerA}` } : null
        }
        initialB={
          wbComparison ? { id: wbComparison.player_b.id, name: wbComparison.player_b.name } :
          comparison ? comparison.player_b.player :
          selected.playerB ? { id: selected.playerB, name: `Player ${selected.playerB}` } : null
        }
      />

      {error && (
        <div className="empty-state" role="alert">
          <h2>Unable to compare</h2>
          <p>{error}</p>
          <p>Your date and snapshot remain in the URL.</p>
        </div>
      )}

      {wbComparison && (
        <div style={{ marginTop: "1.5rem" }}>
          <WorkbenchCompareView comparison={wbComparison} />
        </div>
      )}

      {comparison && !wbComparison && (
        <ComparisonView comparison={comparison} />
      )}

      {!comparison && !wbComparison && !error && (
        <div className="empty-state" role="status">
          <h2>Select two players</h2>
          <p>Search by name and choose a shared replay date to compare their prior form and reconstructed matchups.</p>
        </div>
      )}

      <p className="snapshot-footnote" style={{ marginTop: "2rem" }}>
        Snapshot {catalog.snapshot_id} · source {catalog.source}
      </p>
    </div>
  );
}

async function loadComparison(selected: {
  playerA?: string;
  playerB?: string;
  date?: string;
  snapshotId?: string;
  season?: string;
  phase?: string;
  beforeDate?: string;
  window?: string;
}) {
  try {
    const catalog = await getAnalyticsCatalog(selected.snapshotId);
    const date = selected.date ?? catalog.default_replay_date;
    let comparison: AnalyticsCompare | null = null;
    let wbComparison: PlayerComparisonResponse | null = null;
    let error: string | null = null;

    if (selected.playerA && selected.playerB) {
      // First try workbench comparison if not explicitly locked to mock fixture
      if (selected.snapshotId !== "snapshot-browser-fixture") {
        try {
          wbComparison = await comparePlayers(selected.playerA, selected.playerB, {
            season: selected.season,
            phase: selected.phase,
            beforeDate: selected.beforeDate || date,
            window: selected.window
          });
        } catch {
          // Fall through to legacy comparison
        }
      }

      if (!wbComparison) {
        try {
          comparison = await getAnalyticsCompare(selected.playerA, selected.playerB, date, catalog.snapshot_id);
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
    return { catalog, date, comparison, wbComparison, error };
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

  return (
    <section className="comparison-results" aria-labelledby="comparison-title" style={{ marginTop: "1.5rem" }}>
      <div className="panel-header">
        <h2 id="comparison-title" className="panel-title">Side by side</h2>
      </div>
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
            {rows.map(([label, value]) => (
              <tr key={label}>
                <td className="font-semibold">{label}</td>
                <td>{value(a)}</td>
                <td>{value(b)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="notice-box" style={{ marginTop: "1rem" }}>
        <strong>Estimate gap:</strong>{" "}
        {comparison.estimate_gap == null
          ? "Unavailable until both players have a supported estimate at this cutoff."
          : `${Math.abs(comparison.estimate_gap).toFixed(1)} CourtLoad points.`}
        <p style={{ margin: "0.4rem 0 0" }}>
          Different next-game dates are possible. An estimate covers production conditional on appearance; it does not estimate availability.
        </p>
      </div>
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
