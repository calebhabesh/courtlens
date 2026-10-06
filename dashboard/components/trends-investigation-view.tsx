"use client";

import { useReleaseCatalog } from "@/lib/use-release-catalog";
import { EntityField } from "./entity-picker";

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
  };

  return (
    <div className="workbench-content">
      {catalog === null && <p role="status">Context catalog unavailable. Explicit URL scope is retained; reload to retry.</p>}
      {/* Header */}
      <div className="page-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
            <span className="font-mono text-xs text-muted">F39</span>
            <span
              className="replica-badge-gated"
              style={{ background: "rgba(96, 211, 148, 0.15)", color: "var(--positive)" }}
            >
              Workload & Performance Trends
            </span>

          </div>
          <h1 className="page-title">Workload & Trajectory Trends</h1>
          <p className="page-subtitle">
            Disjoint window delta analysis across consecutive appearance slices and calendar periods. Detect usage shifts, scoring surges, and shooting percentage variance with strict temporal discipline.
          </p>
        </div>

        <div className="page-actions" style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            className="button button-secondary text-xs"
            onClick={handleCopyUrl}
            title="Copy shareable link with current investigation parameters"
          >
            {copiedUrl ? "✓ Copied!" : "Share Link"}
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
      <div className="filter-group" style={{ marginBottom: "1.25rem" }}>
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
          <div
            className="filter-bar"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "1rem",
              alignItems: "center",
              background: "var(--surface)",
              padding: "1rem",
              borderRadius: "6px",
              border: "1px solid var(--border)",
              marginBottom: "1.5rem"
            }}
          >
            {/* Quick Player Selectors */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <label className="text-xs font-mono text-muted uppercase">Featured Players</label>
              <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
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
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <label className="text-xs font-mono text-muted uppercase">Slicing Mode</label>
              <select
                value={mode}
                onChange={(e) => {
                  const m = e.target.value as PeriodMode;
                  setMode(m);
                  updateUrl(playerId, m, periodAN, periodBN);
                }}
                className="input text-xs"
                style={{ padding: "0.25rem 0.5rem" }}
              >
                <option value="appearances">Consecutive Appearances</option>
                <option value="date_range">Calendar Date Range</option>
              </select>
            </div>

            {/* Window Sizes for Appearances */}
            {mode === "appearances" ? (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <label className="text-xs font-mono text-muted uppercase">Period A (Recent)</label>
                  <select
                    value={periodAN}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setPeriodAN(val);
                      updateUrl(playerId, mode, val, periodBN);
                    }}
                    className="input text-xs"
                    style={{ padding: "0.25rem 0.5rem" }}
                  >
                    <option value={5}>Last 5 games</option>
                    <option value={10}>Last 10 games</option>
                    <option value={15}>Last 15 games</option>
                    <option value={20}>Last 20 games</option>
                  </select>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <label className="text-xs font-mono text-muted uppercase">Period B (Preceding)</label>
                  <select
                    value={periodBN}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setPeriodBN(val);
                      updateUrl(playerId, mode, periodAN, val);
                    }}
                    className="input text-xs"
                    style={{ padding: "0.25rem 0.5rem" }}
                  >
                    <option value={5}>Prior 5 games</option>
                    <option value={10}>Prior 10 games</option>
                    <option value={15}>Prior 15 games</option>
                    <option value={20}>Prior 20 games</option>
                  </select>
                </div>
              </>
            ) : (
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <label className="text-xs font-mono text-muted uppercase">Period A Range</label>
                  <div style={{ display: "flex", gap: "0.25rem" }}>
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

                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <label className="text-xs font-mono text-muted uppercase">Period B Range</label>
                  <div style={{ display: "flex", gap: "0.25rem" }}>
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
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <label className="text-xs font-mono text-muted uppercase">Season</label>
              <select
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                className="input text-xs"
                style={{ padding: "0.25rem 0.5rem" }}
              >
                {season && !catalog?.seasons.includes(season) && <option value={season}>{season} · availability unverified</option>}{catalog?.seasons.map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
          </div>

          {/* Loading and Error states */}
          {loading && (
            <div className="table-card" style={{ padding: "2rem", textAlign: "center" }}>
              <div className="text-muted">Computing disjoint period deltas...</div>
            </div>
          )}

          {error && (
            <div className="notice-box" style={{ borderLeftColor: "var(--negative)", marginBottom: "1.5rem" }}>
              <strong>Investigation Error:</strong> {error}
            </div>
          )}

          {data && !loading && (
            <>
              {/* Overlap Notice */}
              {data.has_calendar_overlap && (
                <div
                  className="notice-box"
                  style={{
                    borderLeftColor: "var(--warning)",
                    marginBottom: "1.5rem",
                    background: "rgba(255, 179, 0, 0.08)"
                  }}
                >
                  <strong>Calendar Overlap Detected:</strong> Period A and Period B contain overlapping calendar dates.
                  Games in the intersection are reflected in both periods.
                </div>
              )}

              {/* Period Summary Cards */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: "1rem",
                  marginBottom: "1.5rem"
                }}
              >
                {/* Period A Card */}
                <div className="table-card" style={{ padding: "1.25rem", borderTop: "3px solid var(--accent)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.5rem" }}>
                    <span className="font-mono text-xs text-muted uppercase">Period A (Target Slice)</span>
                    <span className="text-xs font-mono" style={{ color: "var(--accent)" }}>
                      {data.period_a.appearances_count} Games
                    </span>
                  </div>
                  <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.1rem" }}>{data.period_a.label}</h3>
                  <div className="text-xs text-muted" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
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
                <div className="table-card" style={{ padding: "1.25rem", borderTop: "3px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.5rem" }}>
                    <span className="font-mono text-xs text-muted uppercase">Period B (Baseline Slice)</span>
                    <span className="text-xs font-mono text-muted">
                      {data.period_b.appearances_count} Games
                    </span>
                  </div>
                  <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.1rem" }}>{data.period_b.label}</h3>
                  <div className="text-xs text-muted" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
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
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "0.75rem",
                  marginBottom: "1.5rem"
                }}
              >
                {data.deltas
                  .filter((d) => ["pts", "pts_per_game", "min_per_game", "ts_pct", "fg3_pct", "ast_per_game"].includes(d.metric_key))
                  .slice(0, 6)
                  .map((d) => {
                    const isPct = d.metric_key.endsWith("_pct");
                    const absVal = d.absolute_delta;
                    const pctVal = d.percentage_delta;
                    const sign = absVal && absVal > 0 ? "+" : "";
                    const badgeBg =
                      absVal && absVal > 0
                        ? "rgba(96, 211, 148, 0.15)"
                        : absVal && absVal < 0
                        ? "rgba(255, 107, 107, 0.15)"
                        : "var(--surface)";
                    const badgeColor =
                      absVal && absVal > 0
                        ? "var(--positive)"
                        : absVal && absVal < 0
                        ? "var(--negative)"
                        : "var(--text-muted)";

                    return (
                      <div
                        key={d.metric_key}
                        className="table-card"
                        style={{
                          padding: "1rem",
                          background: "var(--surface)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.35rem"
                        }}
                      >
                        <span className="text-xs text-muted font-mono">{d.display_name}</span>
                        <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
                          <span style={{ fontSize: "1.25rem", fontWeight: 700 }}>
                            {d.period_a_value !== null ? d.period_a_value : "—"}
                            {isPct ? "%" : ""}
                          </span>
                          <span className="text-xs text-muted">
                            from {d.period_b_value !== null ? d.period_b_value : "—"}
                            {isPct ? "%" : ""}
                          </span>
                        </div>
                        <div
                          style={{
                            alignSelf: "flex-start",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            background: badgeBg,
                            color: badgeColor
                          }}
                        >
                          {absVal !== null ? `${sign}${absVal}${isPct ? "%" : ""}` : "—"}
                          {pctVal !== null && ` (${sign}${pctVal}%)`}
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Detailed Deltas Table */}
              <div className="table-card" style={{ marginBottom: "1.5rem" }}>
                <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
                  <h3 style={{ margin: 0, fontSize: "1rem" }}>
                    Full Metric Variance Table — {data.player_name}
                  </h3>
                  <span className="text-xs text-muted">
                    Exact numerical reconciliation across {data.deltas.length} production and efficiency dimensions.
                  </span>
                </div>

                <div className="table-responsive">
                  <table className="data-table" style={{ width: "100%", textAlign: "left" }}>
                    <thead>
                      <tr>
                        <th style={{ padding: "0.75rem 1rem" }}>Metric</th>
                        <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>Period A Value</th>
                        <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>Period B Value</th>
                        <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>Absolute Delta</th>
                        <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>Percentage Delta</th>
                        <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Sample (A / B)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.deltas.map((row: MetricDelta) => {
                        const isPct = row.metric_key.endsWith("_pct");
                        return (
                          <tr key={row.metric_key} style={{ borderBottom: "1px solid var(--border)" }}>
                            <td style={{ padding: "0.75rem 1rem", fontWeight: 500 }}>
                              <div>{row.display_name}</div>
                              <span className="text-xs font-mono text-muted">{row.metric_key}</span>
                            </td>
                            <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                              {row.period_a_value !== null ? `${row.period_a_value}${isPct ? "%" : ""}` : "—"}
                            </td>
                            <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                              {row.period_b_value !== null ? `${row.period_b_value}${isPct ? "%" : ""}` : "—"}
                            </td>
                            <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                              {row.absolute_delta !== null ? (
                                <span
                                  className={
                                    row.absolute_delta > 0
                                      ? "text-positive"
                                      : row.absolute_delta < 0
                                      ? "text-negative"
                                      : "text-muted"
                                  }
                                  style={{ fontWeight: 600 }}
                                >
                                  {row.absolute_delta > 0 ? "+" : ""}
                                  {row.absolute_delta}
                                  {isPct ? "%" : ""}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontFamily: "var(--font-mono)" }}>
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
                            <td style={{ padding: "0.75rem 1rem", textAlign: "center", fontSize: "0.8rem", color: "var(--text-muted)" }}>
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
              <div
                className="table-card"
                style={{
                  padding: "1rem 1.25rem",
                  background: "var(--surface)",
                  fontSize: "0.8rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
                  <span className="font-mono text-muted uppercase text-xs">Cryptographic Lineage</span>
                  <span className="font-mono text-xs text-muted">
                    SHA-256: <code>{data.evidence_hash}</code>
                  </span>
                </div>
                <ul style={{ margin: 0, paddingLeft: "1.2rem", color: "var(--text-muted)" }}>
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
          <div
            className="filter-bar"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "1rem",
              alignItems: "center",
              background: "var(--surface)",
              padding: "1rem",
              borderRadius: "6px",
              border: "1px solid var(--border)",
              marginBottom: "1.5rem"
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <label className="text-xs font-mono text-muted uppercase">Metric</label>
              <select
                value={rankMetric}
                onChange={(e) => setRankMetric(e.target.value)}
                className="input text-xs"
                style={{ padding: "0.25rem 0.5rem" }}
              >
                <option value="pts">Total Points (pts)</option>
                <option value="pts_per_game">Points Per Game (pts_per_game)</option>
                <option value="min_per_game">Minutes Per Game (min_per_game)</option>
                <option value="reb_per_game">Rebounds Per Game (reb_per_game)</option>
                <option value="ast_per_game">Assists Per Game (ast_per_game)</option>
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <label className="text-xs font-mono text-muted uppercase">Direction</label>
              <select
                value={rankDirection}
                onChange={(e) => setRankDirection(e.target.value as "desc" | "asc")}
                className="input text-xs"
                style={{ padding: "0.25rem 0.5rem" }}
              >
                <option value="desc">Largest Surges (Descending)</option>
                <option value="asc">Largest Drops (Ascending)</option>
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <label className="text-xs font-mono text-muted uppercase">Season</label>
              <select
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                className="input text-xs"
                style={{ padding: "0.25rem 0.5rem" }}
              >
                {season && !catalog?.seasons.includes(season) && <option value={season}>{season} · availability unverified</option>}{catalog?.seasons.map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
          </div>

          {rankLoading && (
            <div className="table-card" style={{ padding: "2rem", textAlign: "center" }}>
              <div className="text-muted">Ranking active league cohort by period delta...</div>
            </div>
          )}

          {rankError && (
            <div className="notice-box" style={{ borderLeftColor: "var(--negative)", marginBottom: "1.5rem" }}>
              <strong>Ranking Error:</strong> {rankError}
            </div>
          )}

          {rankData && !rankLoading && (
            <div className="table-card" style={{ marginBottom: "1.5rem" }}>
              <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
                <h3 style={{ margin: 0, fontSize: "1rem" }}>
                  League Cohort Ranking: {rankMetric.toUpperCase()} ({rankDirection === "desc" ? "Surges" : "Drops"})
                </h3>
                <span className="text-xs text-muted">
                  Ranked across {rankData.total_eligible} eligible players with $\ge 10$ appearances. Comparing last 10 vs preceding 10 games.
                </span>
              </div>

              <div className="table-responsive">
                <table className="data-table" style={{ width: "100%", textAlign: "left" }}>
                  <thead>
                    <tr>
                      <th style={{ padding: "0.75rem 1rem", width: "60px" }}>Rank</th>
                      <th style={{ padding: "0.75rem 1rem" }}>Player</th>
                      <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>Baseline (Prior 10)</th>
                      <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>Recent (Last 10)</th>
                      <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>Absolute Delta</th>
                      <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>Percentage Delta</th>
                      <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankData.items.map((item: RankOperationItem) => {
                      const pctDelta = (item.details?.percentage_delta as number | undefined) ?? null;
                      return (
                        <tr key={item.player_id} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "0.75rem 1rem", fontWeight: 700, color: "var(--accent)" }}>
                            #{item.rank}
                          </td>
                          <td style={{ padding: "0.75rem 1rem" }}>
                            <div style={{ fontWeight: 600 }}>{item.player_name}</div>
                            <span className="text-xs font-mono text-muted">
                              {item.team_tricode || "—"} · {item.games_played} GP · {item.total_minutes} MIN
                            </span>
                          </td>
                          <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                            {item.baseline_value ?? "—"}
                          </td>
                          <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                            {item.comparison_value ?? "—"}
                          </td>
                          <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                            {item.delta_value !== null ? (
                              <span
                                className={
                                  item.delta_value > 0
                                    ? "text-positive"
                                    : item.delta_value < 0
                                    ? "text-negative"
                                    : "text-muted"
                                }
                                style={{ fontWeight: 600 }}
                              >
                                {item.delta_value > 0 ? "+" : ""}
                                {item.delta_value}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontFamily: "var(--font-mono)" }}>
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
                          <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
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
              <div
                className="table-card"
                style={{
                  padding: "1rem 1.25rem",
                  background: "var(--surface)",
                  fontSize: "0.8rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
                  <span className="font-mono text-muted uppercase text-xs">Cryptographic Lineage</span>
                  <span className="font-mono text-xs text-muted">
                    SHA-256: <code>{rankData.evidence_hash}</code>
                  </span>
                </div>
                <ul style={{ margin: 0, paddingLeft: "1.2rem", color: "var(--text-muted)" }}>
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
