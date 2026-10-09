"use client";

import { Icon } from "./ui/icon";
import { useReleaseCatalog } from "@/lib/use-release-catalog";
import { EntityField } from "./entity-picker";
import { useToast } from "./ui/toast";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { comparePeriods, getRankOperation } from "@/lib/workbench-api";
import type {
  ComparePeriodsResponse,
  MetricDelta,
  PeriodMode,
  RankOperationItem,
  RankOperationResponse
} from "@/lib/types";

const FEATURED_PLAYERS = [
  { id: "1628389", name: "Bam Adebayo", team: "MIA" },
  { id: "1630567", name: "Scottie Barnes", team: "TOR" },
  { id: "1627783", name: "Pascal Siakam", team: "IND" },
  { id: "1628369", name: "Jayson Tatum", team: "BOS" },
  { id: "1629630", name: "Ja Morant", team: "MEM" }
];

export function TrendsInvestigationView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedReleaseId = searchParams.get("releaseId") ?? searchParams.get("release_id");
  const catalog = useReleaseCatalog(selectedReleaseId);
  const releaseId = selectedReleaseId ?? catalog?.release_id ?? null;
  const phase = searchParams.get("phase") ?? catalog?.default_phase ?? "regular_season";

  // URL state initialization
  const initialPlayerId = searchParams.get("playerId") || searchParams.get("player_id") || "1628389";
  const initialSeason = searchParams.get("season") || catalog?.default_season || "";
  const initialMode = (searchParams.get("mode") as PeriodMode) || "appearances";
  const initialPeriodAN = parseInt(searchParams.get("periodAN") || searchParams.get("period_a_n") || "10", 10);
  const initialPeriodBN = parseInt(searchParams.get("periodBN") || searchParams.get("period_b_n") || "10", 10);

  const [activeTab, setActiveTab] = useState<"player" | "rank">("player");
  const [playerId, setPlayerId] = useState(initialPlayerId);
  const [season, setSeason] = useState(initialSeason);
  if (!season && initialSeason) setSeason(initialSeason);
  const beforeDate = searchParams.get("beforeDate") ?? searchParams.get("before_date") ?? catalog?.stats_scopes?.find(scope => scope.season === season && scope.phase === phase)?.default_before_date ?? catalog?.default_before_date ?? null;
  const [mode, setMode] = useState<PeriodMode>(initialMode);
  const [periodAN, setPeriodAN] = useState(initialPeriodAN);
  const [periodBN, setPeriodBN] = useState(initialPeriodBN);

  // Date range state
  const [periodAFrom, setPeriodAFrom] = useState(searchParams.get("periodAFrom") || "");
  const [periodATo, setPeriodATo] = useState(searchParams.get("periodATo") || "");
  const [periodBFrom, setPeriodBFrom] = useState(searchParams.get("periodBFrom") || "");
  const [periodBTo, setPeriodBTo] = useState(searchParams.get("periodBTo") || "");

  // Data states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ComparePeriodsResponse | null>(null);

  // League Cohort Rank state
  const [rankMetric, setRankMetric] = useState("pts");
  const [rankDirection, setRankDirection] = useState<"desc" | "asc">("desc");
  const [rankLoading, setRankLoading] = useState(false);
  const [rankData, setRankData] = useState<RankOperationResponse | null>(null);
  const [rankError, setRankError] = useState<string | null>(null);

  const [copiedUrl, setCopiedUrl] = useState(false);
  const { toast } = useToast();

  // Fetch comparison data
  useEffect(() => {
    if (!playerId || !season) return;

    let isMounted = true;
    queueMicrotask(() => {
      if (isMounted) {
        setLoading(true);
        setError(null);
      }
    });

    const req = {
      player_id: playerId,
      season,
      phase, release_id: releaseId, before_date: beforeDate,
      mode,
      period_a_n: mode === "appearances" ? periodAN : undefined,
      period_b_n: mode === "appearances" ? periodBN : undefined,
      period_a_from: mode === "date_range" && periodAFrom ? periodAFrom : undefined,
      period_a_to: mode === "date_range" && periodATo ? periodATo : undefined,
      period_b_from: mode === "date_range" && periodBFrom ? periodBFrom : undefined,
      period_b_to: mode === "date_range" && periodBTo ? periodBTo : undefined
    };

    comparePeriods(req)
      .then((res) => {
        if (isMounted) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load period comparison");
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [playerId, season, mode, periodAN, periodBN, periodAFrom, periodATo, periodBFrom, periodBTo, phase, releaseId, beforeDate]);

  // Fetch rank data when Rank tab is active
  useEffect(() => {
    if (activeTab !== "rank" || !season) return;

    let isMounted = true;
    queueMicrotask(() => {
      if (isMounted) {
        setRankLoading(true);
        setRankError(null);
      }
    });

    getRankOperation({
      operation_type: "compare_periods",
      metric: rankMetric,
      season,
      phase, release_id: releaseId, before_date: beforeDate,
      sort_direction: rankDirection,
      limit: 25,
      min_games: 10
    })
      .then((res) => {
        if (isMounted) {
          setRankData(res);
          setRankLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setRankError(err instanceof Error ? err.message : "Failed to load cohort ranking");
          setRankLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [activeTab, rankMetric, rankDirection, season, phase, releaseId, beforeDate]);

  const [previousUrl,setPreviousUrl] = useState(searchParams.toString());
  if(previousUrl !== searchParams.toString()) {setPreviousUrl(searchParams.toString());setPlayerId(initialPlayerId);setSeason(initialSeason);}

  // Sync URL search params
  const updateUrl = (newPlayerId: string, newMode: PeriodMode, aN: number, bN: number) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("playerId", newPlayerId);
    sp.set("season", season);
    sp.set("mode", newMode);
    if (newMode === "appearances") {
      sp.set("periodAN", String(aN));
      sp.set("periodBN", String(bN));
    }
    router.replace(`/research/trends?${sp.toString()}`);
  };

  const handleSelectPlayer = (id: string) => {
    setPlayerId(id);
    updateUrl(id, mode, periodAN, periodBN);
  };


  const handleCopyUrl = async () => {
    if (typeof window === "undefined") return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedUrl(true);
      toast({
        title: "Link Copied",
        description: "Investigation link copied to clipboard.",
        variant: "info",
      });
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleExportCsv = () => {
    if (!data) return;
    const headers = [
      "Metric",
      "Display Name",
      `Period A (${data.period_a.label})`,
      `Period B (${data.period_b.label})`,
      "Absolute Delta",
      "Percentage Delta (%)",
      "Period A Sample",
      "Period B Sample"
    ];
    const rows = data.deltas.map((d) => [
      d.metric_key,
      d.display_name,
      d.period_a_value ?? "",
      d.period_b_value ?? "",
      d.absolute_delta ?? "",
      d.percentage_delta ?? "",
      d.period_a_n,
      d.period_b_n
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `courtlens_trends_${data.player_name.toLowerCase().replace(/\s+/g, "_")}_${data.season}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({
      title: "Export Downloaded",
      description: "Trends CSV export ready.",
      variant: "positive",
    });
  };

  return (
    <div className="workbench-content">
      {catalog === null && <p role="status">Context catalog unavailable. Explicit URL scope is retained; reload to retry.</p>}
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="dist-header-meta">
            <span className="font-mono text-xs text-muted">F39</span>
            <span className="replica-badge-gated dist-badge-positive">
              Workload & Performance Trends
            </span>

          </div>
          <h1 className="page-title">Workload & Trajectory Trends</h1>
          <p className="page-subtitle">
            Disjoint window delta analysis across consecutive appearance slices and calendar periods. Detect usage shifts, scoring surges, and shooting percentage variance with strict temporal discipline.
          </p>
        </div>

        <div className="page-actions dist-actions">
          <button
            type="button"
            className="button button-secondary text-xs"
            onClick={handleCopyUrl}
            title="Copy shareable link with current investigation parameters"
          >
            {copiedUrl ? <><Icon name="check" size={14} />Copied</> : "Share Link"}
          </button>
          {data && (
            <button
              type="button"
              className="button button-secondary text-xs"
              onClick={handleExportCsv}
              title="Export period deltas as CSV"
            >
              Export CSV
            </button>
          )}
          <Link href="/stats" className="button button-primary text-xs">
            Open in Stats
          </Link>
        </div>
      </div>

      {/* Main Tabs: Single Player vs Cohort Surges */}
      <div className="dist-tab-group">
        <button
          type="button"
          className={`tab-button ${activeTab === "player" ? "active" : ""}`}
          onClick={() => setActiveTab("player")}
        >
          Player Period Comparison
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === "rank" ? "active" : ""}`}
          onClick={() => setActiveTab("rank")}
        >
          League Cohort Surges & Declines
        </button>
      </div>

      {activeTab === "player" ? (
        <>
          {/* Controls Bar */}
          <div className="filter-bar dist-filter-bar">
            {/* Quick Player Selectors */}
            <div className="dist-field-group">
              <label className="text-xs font-mono text-muted uppercase">Featured Players</label>
              <div className="dist-quick-pills">
                {FEATURED_PLAYERS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`filter-pill ${playerId === p.id ? "active" : ""}`}
                    onClick={() => handleSelectPlayer(p.id)}
                  >
                    {p.name} ({p.team})
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Player ID Form */}
            <EntityField label="Target player" value={playerId} releaseId={releaseId} season={season} phase={phase} beforeDate={beforeDate} onChange={id => { if(id) handleSelectPlayer(id); else setPlayerId(""); }} />

            {/* Mode Selector */}
            <div className="dist-field-group">
              <label className="text-xs font-mono text-muted uppercase">Slicing Mode</label>
              <select
                value={mode}
                onChange={(e) => {
                  const m = e.target.value as PeriodMode;
                  setMode(m);
                  updateUrl(playerId, m, periodAN, periodBN);
                }}
                className="input text-xs dist-select-compact"
              >
                <option value="appearances">Consecutive Appearances</option>
                <option value="date_range">Calendar Date Range</option>
              </select>
            </div>

            {/* Window Sizes for Appearances */}
            {mode === "appearances" ? (
              <>
                <div className="dist-field-group">
                  <label className="text-xs font-mono text-muted uppercase">Period A (Recent)</label>
                  <select
                    value={periodAN}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setPeriodAN(val);
                      updateUrl(playerId, mode, val, periodBN);
                    }}
                    className="input text-xs dist-select-compact"
                  >
                    <option value={5}>Last 5 games</option>
                    <option value={10}>Last 10 games</option>
                    <option value={15}>Last 15 games</option>
                    <option value={20}>Last 20 games</option>
                  </select>
                </div>

                <div className="dist-field-group">
                  <label className="text-xs font-mono text-muted uppercase">Period B (Preceding)</label>
                  <select
                    value={periodBN}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setPeriodBN(val);
                      updateUrl(playerId, mode, periodAN, val);
                    }}
                    className="input text-xs dist-select-compact"
                  >
                    <option value={5}>Prior 5 games</option>
                    <option value={10}>Prior 10 games</option>
                    <option value={15}>Prior 15 games</option>
                    <option value={20}>Prior 20 games</option>
                  </select>
                </div>
              </>
            ) : (
              <div className="ranking-header-actions">
                <div className="dist-field-group">
                  <label className="text-xs font-mono text-muted uppercase">Period A Range</label>
                  <div className="dist-quick-pills">
                    <input
                      type="date"
                      value={periodAFrom}
                      onChange={(e) => setPeriodAFrom(e.target.value)}
                      className="input text-xs"
                    />
                    <span className="text-muted">to</span>
                    <input
                      type="date"
                      value={periodATo}
                      onChange={(e) => setPeriodATo(e.target.value)}
                      className="input text-xs"
                    />
                  </div>
                </div>

                <div className="dist-field-group">
                  <label className="text-xs font-mono text-muted uppercase">Period B Range</label>
                  <div className="dist-quick-pills">
                    <input
                      type="date"
                      value={periodBFrom}
                      onChange={(e) => setPeriodBFrom(e.target.value)}
                      className="input text-xs"
                    />
                    <span className="text-muted">to</span>
                    <input
                      type="date"
                      value={periodBTo}
                      onChange={(e) => setPeriodBTo(e.target.value)}
                      className="input text-xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Season Selector */}
            <div className="dist-field-group">
              <label className="text-xs font-mono text-muted uppercase">Season</label>
              <select
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                className="input text-xs dist-select-compact"
              >
                {season && !catalog?.seasons.includes(season) && <option value={season}>{season} · availability unverified</option>}{catalog?.seasons.map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
          </div>

          {/* Loading and Error states */}
          {loading && (
            <div className="table-card dist-loading-card">
              <div className="text-muted">Computing disjoint period deltas...</div>
            </div>
          )}

          {error && (
            <div className="notice-box dist-notice-error">
              <strong>Investigation Error:</strong> {error}
            </div>
          )}

          {data && !loading && (
            <>
              {/* Overlap Notice */}
              {data.has_calendar_overlap && (
                <div className="notice-box dist-notice-gating">
                  <strong>Calendar Overlap Detected:</strong> Period A and Period B contain overlapping calendar dates.
                  Games in the intersection are reflected in both periods.
                </div>
              )}

              {/* Period Summary Cards */}
              <div className="trend-inv-grid-2col">
                {/* Period A Card */}
                <div className="table-card trend-inv-card-period-a">
                  <div className="trend-inv-stat-head">
                    <span className="font-mono text-xs text-muted uppercase">Period A (Target Slice)</span>
                    <span className="text-xs font-mono text-accent">
                      {data.period_a.appearances_count} Games
                    </span>
                  </div>
                  <h3 className="trend-inv-title">{data.period_a.label}</h3>
                  <div className="trend-inv-meta-list">
                    <div>
                      <strong>Dates:</strong> {data.period_a.start_date || "—"} to {data.period_a.end_date || "—"}
                    </div>
                    <div>
                      <strong>Total Minutes:</strong> {data.period_a.total_minutes} ({data.period_a.min_per_game ?? "—"} MPG)
                    </div>
                    <div>
                      <strong>Team Stints:</strong> {data.period_a.stints.join(", ") || "None"}
                    </div>
                  </div>
                </div>

                {/* Period B Card */}
                <div className="table-card trend-inv-card-period-b">
                  <div className="trend-inv-stat-head">
                    <span className="font-mono text-xs text-muted uppercase">Period B (Baseline Slice)</span>
                    <span className="text-xs font-mono text-muted">
                      {data.period_b.appearances_count} Games
                    </span>
                  </div>
                  <h3 className="trend-inv-title">{data.period_b.label}</h3>
                  <div className="trend-inv-meta-list">
                    <div>
                      <strong>Dates:</strong> {data.period_b.start_date || "—"} to {data.period_b.end_date || "—"}
                    </div>
                    <div>
                      <strong>Total Minutes:</strong> {data.period_b.total_minutes} ({data.period_b.min_per_game ?? "—"} MPG)
                    </div>
                    <div>
                      <strong>Team Stints:</strong> {data.period_b.stints.join(", ") || "None"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Key Delta Highlights */}
              <div className="trend-inv-delta-grid">
                {data.deltas
                  .filter((d) => ["pts", "pts_per_game", "min_per_game", "ts_pct", "fg3_pct", "ast_per_game"].includes(d.metric_key))
                  .slice(0, 6)
                  .map((d) => {
                    const isPct = d.metric_key.endsWith("_pct");
                    const absVal = d.absolute_delta;
                    const pctVal = d.percentage_delta;
                    const sign = absVal && absVal > 0 ? "+" : "";
                    const isPos = absVal && absVal > 0;
                    const isNeg = absVal && absVal < 0;

                    return (
                      <div
                        key={d.metric_key}
                        className="table-card trend-inv-delta-card"
                      >
                        <span className="text-xs text-muted font-mono">{d.display_name}</span>
                        <div className="flex items-baseline gap-2">
                          <span className="trend-inv-val-large">
                            {d.period_a_value !== null ? d.period_a_value : "—"}
                            {isPct ? "%" : ""}
                          </span>
                          <span className="text-xs text-muted">
                            from {d.period_b_value !== null ? d.period_b_value : "—"}
                            {isPct ? "%" : ""}
                          </span>
                        </div>
                        <div
                          className={`badge self-start ${isPos ? "badge-positive" : isNeg ? "badge-negative" : ""}`}
                        >
                          {absVal !== null ? `${sign}${absVal}${isPct ? "%" : ""}` : "—"}
                          {pctVal !== null && ` (${sign}${pctVal}%)`}
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Detailed Deltas Table */}
              <div className="table-card dist-table-card">
                <div className="dist-table-header">
                  <h3 className="dist-table-title">
                    Full Metric Variance Table — {data.player_name}
                  </h3>
                  <span className="text-xs text-muted">
                    Exact numerical reconciliation across {data.deltas.length} production and efficiency dimensions.
                  </span>
                </div>

                <div className="table-responsive">
                  <table className="data-table w-full text-left">
                    <thead>
                      <tr>
                        <th className="th-col-pad">Metric</th>
                        <th className="th-col-pad-right">Period A Value</th>
                        <th className="th-col-pad-right">Period B Value</th>
                        <th className="th-col-pad-right">Absolute Delta</th>
                        <th className="th-col-pad-right">Percentage Delta</th>
                        <th className="th-col-pad-center">Sample (A / B)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.deltas.map((row: MetricDelta) => {
                        const isPct = row.metric_key.endsWith("_pct");
                        return (
                          <tr key={row.metric_key} className="dist-table-row">
                            <td className="td-col-pad font-medium">
                              <div>{row.display_name}</div>
                              <span className="text-xs font-mono text-muted">{row.metric_key}</span>
                            </td>
                            <td className="td-col-pad-right font-mono">
                              {row.period_a_value !== null ? `${row.period_a_value}${isPct ? "%" : ""}` : "—"}
                            </td>
                            <td className="td-col-pad-right font-mono">
                              {row.period_b_value !== null ? `${row.period_b_value}${isPct ? "%" : ""}` : "—"}
                            </td>
                            <td className="td-col-pad-right font-mono">
                              {row.absolute_delta !== null ? (
                                <span
                                  className={
                                    row.absolute_delta > 0
                                      ? "text-positive font-semibold"
                                      : row.absolute_delta < 0
                                      ? "text-negative font-semibold"
                                      : "text-muted font-semibold"
                                  }
                                >
                                  {row.absolute_delta > 0 ? "+" : ""}
                                  {row.absolute_delta}
                                  {isPct ? "%" : ""}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="td-col-pad-right font-mono">
                              {row.percentage_delta !== null ? (
                                <span
                                  className={
                                    row.percentage_delta > 0
                                      ? "text-positive"
                                      : row.percentage_delta < 0
                                      ? "text-negative"
                                      : "text-muted"
                                  }
                                >
                                  {row.percentage_delta > 0 ? "+" : ""}
                                  {row.percentage_delta}%
                                </span>
                              ) : (
                                <span className="text-muted" title="Percentage delta is null when baseline value is zero">
                                  —
                                </span>
                              )}
                            </td>
                            <td className="td-col-pad-center text-xs text-muted">
                              {row.period_a_n} / {row.period_b_n}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Cryptographic Disclosures & Evidence Footer */}
              <div className="dist-provenance-box">
                <div className="dist-provenance-header">
                  <span className="font-mono text-muted uppercase text-xs">Cryptographic Lineage</span>
                  <span className="font-mono text-xs text-muted">
                    SHA-256: <code>{data.evidence_hash}</code>
                  </span>
                </div>
                <ul className="dist-provenance-list">
                  {data.disclosures.map((disc: string, idx: number) => (
                    <li key={idx}>{disc}</li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </>
      ) : (
        /* Cohort Surges & Declines Tab */
        <div>
          {/* Cohort Rank Controls */}
          <div className="filter-bar dist-filter-bar">
            <div className="dist-field-group">
              <label className="text-xs font-mono text-muted uppercase">Metric</label>
              <select
                value={rankMetric}
                onChange={(e) => setRankMetric(e.target.value)}
                className="input text-xs dist-select-compact"
              >
                <option value="pts">Total Points (pts)</option>
                <option value="pts_per_game">Points Per Game (pts_per_game)</option>
                <option value="min_per_game">Minutes Per Game (min_per_game)</option>
                <option value="reb_per_game">Rebounds Per Game (reb_per_game)</option>
                <option value="ast_per_game">Assists Per Game (ast_per_game)</option>
              </select>
            </div>

            <div className="dist-field-group">
              <label className="text-xs font-mono text-muted uppercase">Direction</label>
              <select
                value={rankDirection}
                onChange={(e) => setRankDirection(e.target.value as "desc" | "asc")}
                className="input text-xs dist-select-compact"
              >
                <option value="desc">Largest Surges (Descending)</option>
                <option value="asc">Largest Drops (Ascending)</option>
              </select>
            </div>

            <div className="dist-field-group">
              <label className="text-xs font-mono text-muted uppercase">Season</label>
              <select
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                className="input text-xs dist-select-compact"
              >
                {season && !catalog?.seasons.includes(season) && <option value={season}>{season} · availability unverified</option>}{catalog?.seasons.map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
          </div>

          {rankLoading && (
            <div className="table-card dist-loading-card">
              <div className="text-muted">Ranking active league cohort by period delta...</div>
            </div>
          )}

          {rankError && (
            <div className="notice-box dist-notice-error">
              <strong>Ranking Error:</strong> {rankError}
            </div>
          )}

          {rankData && !rankLoading && (
            <div className="table-card dist-table-card">
              <div className="dist-table-header">
                <h3 className="dist-table-title">
                  League Cohort Ranking: {rankMetric.toUpperCase()} ({rankDirection === "desc" ? "Surges" : "Drops"})
                </h3>
                <span className="text-xs text-muted">
                  Ranked across {rankData.total_eligible} eligible players with $\ge 10$ appearances. Comparing last 10 vs preceding 10 games.
                </span>
              </div>

              <div className="table-responsive">
                <table className="data-table w-full text-left">
                  <thead>
                    <tr>
                      <th className="th-col-pad th-w80">Rank</th>
                      <th className="th-col-pad">Player</th>
                      <th className="th-col-pad-right">Baseline (Prior 10)</th>
                      <th className="th-col-pad-right">Recent (Last 10)</th>
                      <th className="th-col-pad-right">Absolute Delta</th>
                      <th className="th-col-pad-right">Percentage Delta</th>
                      <th className="th-col-pad-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankData.items.map((item: RankOperationItem) => {
                      const pctDelta = (item.details?.percentage_delta as number | undefined) ?? null;
                      return (
                        <tr key={item.player_id} className="dist-table-row">
                          <td className="td-col-pad font-bold text-accent">
                            #{item.rank}
                          </td>
                          <td className="td-col-pad">
                            <div className="font-semibold">{item.player_name}</div>
                            <span className="text-xs font-mono text-muted">
                              {item.team_tricode || "—"} · {item.games_played} GP · {item.total_minutes} MIN
                            </span>
                          </td>
                          <td className="td-col-pad-right font-mono">
                            {item.baseline_value ?? "—"}
                          </td>
                          <td className="td-col-pad-right font-mono">
                            {item.comparison_value ?? "—"}
                          </td>
                          <td className="td-col-pad-right font-mono">
                            {item.delta_value !== null ? (
                              <span
                                className={
                                  item.delta_value > 0
                                    ? "text-positive font-semibold"
                                    : item.delta_value < 0
                                    ? "text-negative font-semibold"
                                    : "text-muted font-semibold"
                                }
                              >
                                {item.delta_value > 0 ? "+" : ""}
                                {item.delta_value}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="td-col-pad-right font-mono">
                            {pctDelta !== null ? (
                              <span
                                className={
                                  pctDelta > 0
                                    ? "text-positive"
                                    : pctDelta < 0
                                    ? "text-negative"
                                    : "text-muted"
                                }
                              >
                                {pctDelta > 0 ? "+" : ""}
                                {pctDelta}%
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="td-col-pad-center">
                            <button
                              type="button"
                              className="button button-secondary text-xs"
                              onClick={() => {
                                handleSelectPlayer(item.player_id);
                                setActiveTab("player");
                              }}
                            >
                              Investigate
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Cryptographic Disclosures & Evidence Footer */}
              <div className="dist-provenance-box">
                <div className="dist-provenance-header">
                  <span className="font-mono text-muted uppercase text-xs">Cryptographic Lineage</span>
                  <span className="font-mono text-xs text-muted">
                    SHA-256: <code>{rankData.evidence_hash}</code>
                  </span>
                </div>
                <ul className="dist-provenance-list">
                  {rankData.disclosures.map((disc: string, idx: number) => (
                    <li key={idx}>{disc}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
