"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getDistribution,
  getOpponentContext,
  getRankOperation,
  getSplitProfile
} from "@/lib/workbench-api";
import type {
  DistributionResponse,
  DistributionSamplePoint,
  OpponentContextResponse,
  RankOperationItem,
  RankOperationResponse,
  SplitBucketSummary,
  SplitProfileResponse,
  TeamDefensiveAllowance
} from "@/lib/types";

const FEATURED_PLAYERS = [
  { id: "1628389", name: "Bam Adebayo", team: "MIA" },
  { id: "1630567", name: "Scottie Barnes", team: "TOR" },
  { id: "1627783", name: "Pascal Siakam", team: "IND" },
  { id: "1628369", name: "Jayson Tatum", team: "BOS" },
  { id: "1629630", name: "Ja Morant", team: "MEM" }
];

export function DistributionsInvestigationView() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL state initialization
  const initialPlayerId = searchParams.get("playerId") || searchParams.get("player_id") || "1628389";
  const initialSeason = searchParams.get("season") || "2025-26";
  const initialTab = (searchParams.get("tab") as "distribution" | "splits" | "opponent" | "rank") || "distribution";
  const initialMetric = searchParams.get("metric") || "pts";
  const initialWindow = parseInt(searchParams.get("window") || "20", 10);

  const [activeTab, setActiveTab] = useState<"distribution" | "splits" | "opponent" | "rank">(initialTab);
  const [playerId, setPlayerId] = useState(initialPlayerId);
  const [season, setSeason] = useState(initialSeason);
  const [metric, setMetric] = useState(initialMetric);
  const [windowN, setWindowN] = useState(initialWindow);
  const [customPlayerInput, setCustomPlayerInput] = useState(initialPlayerId);

  // Data states
  const [distLoading, setDistLoading] = useState(false);
  const [distError, setDistError] = useState<string | null>(null);
  const [distData, setDistData] = useState<DistributionResponse | null>(null);

  const [splitLoading, setSplitLoading] = useState(false);
  const [splitError, setSplitError] = useState<string | null>(null);
  const [splitData, setSplitData] = useState<SplitProfileResponse | null>(null);

  const [oppLoading, setOppLoading] = useState(false);
  const [oppError, setOppError] = useState<string | null>(null);
  const [oppData, setOppData] = useState<OpponentContextResponse | null>(null);

  const [rankLoading, setRankLoading] = useState(false);
  const [rankError, setRankError] = useState<string | null>(null);
  const [rankData, setRankData] = useState<RankOperationResponse | null>(null);
  const [rankMeasure, setRankMeasure] = useState<"iqr" | "population_sd">("iqr");
  const [rankDirection, setRankDirection] = useState<"desc" | "asc">("desc");

  const [copiedUrl, setCopiedUrl] = useState(false);

  // Sync URL search params
  const updateUrl = (pId: string, tab: string, met: string, win: number) => {
    const sp = new URLSearchParams();
    sp.set("playerId", pId);
    sp.set("season", season);
    sp.set("tab", tab);
    sp.set("metric", met);
    sp.set("window", String(win));
    router.replace(`/research/distributions?${sp.toString()}`);
  };

  const handleSelectPlayer = (id: string) => {
    setPlayerId(id);
    setCustomPlayerInput(id);
    updateUrl(id, activeTab, metric, windowN);
  };

  const handleCustomPlayerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customPlayerInput.trim()) {
      handleSelectPlayer(customPlayerInput.trim());
    }
  };

  // Fetch Distribution
  useEffect(() => {
    if (!playerId) return;

    let isMounted = true;
    queueMicrotask(() => {
      if (isMounted) {
        setDistLoading(true);
        setDistError(null);
      }
    });

    getDistribution({
      player_id: playerId,
      metric,
      season,
      phase: "regular_season",
      window_n: windowN
    })
      .then((res) => {
        if (isMounted) {
          setDistData(res);
          setDistLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setDistError(err instanceof Error ? err.message : "Failed to load distribution");
          setDistLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [playerId, season, metric, windowN]);

  // Fetch Splits
  useEffect(() => {
    if (activeTab !== "splits" || !playerId) return;

    let isMounted = true;
    queueMicrotask(() => {
      if (isMounted) {
        setSplitLoading(true);
        setSplitError(null);
      }
    });

    getSplitProfile({
      player_id: playerId,
      season,
      phase: "regular_season"
    })
      .then((res) => {
        if (isMounted) {
          setSplitData(res);
          setSplitLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setSplitError(err instanceof Error ? err.message : "Failed to load splits");
          setSplitLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [activeTab, playerId, season]);

  // Fetch Opponent Context
  useEffect(() => {
    if (activeTab !== "opponent") return;

    let isMounted = true;
    queueMicrotask(() => {
      if (isMounted) {
        setOppLoading(true);
        setOppError(null);
      }
    });

    getOpponentContext({
      season,
      phase: "regular_season"
    })
      .then((res) => {
        if (isMounted) {
          setOppData(res);
          setOppLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setOppError(err instanceof Error ? err.message : "Failed to load opponent context");
          setOppLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [activeTab, season]);

  // Fetch Cohort Dispersion Rank
  useEffect(() => {
    if (activeTab !== "rank") return;

    let isMounted = true;
    queueMicrotask(() => {
      if (isMounted) {
        setRankLoading(true);
        setRankError(null);
      }
    });

    getRankOperation({
      operation_type: "distribution",
      metric,
      measure: rankMeasure,
      sort_direction: rankDirection,
      season,
      phase: "regular_season",
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
          setRankError(err instanceof Error ? err.message : "Failed to load dispersion ranking");
          setRankLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [activeTab, metric, rankMeasure, rankDirection, season]);

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
    if (activeTab === "distribution" && distData) {
      const headers = ["Game ID", "Game Date", "Team", "Opponent", "Venue", "Minutes", distData.metric];
      const rows = distData.samples.map((s) => [
        s.game_id,
        s.game_date,
        s.team_tricode,
        s.opponent_tricode,
        s.is_home ? "Home" : "Away",
        s.minutes ?? "",
        s.value ?? ""
      ]);
      const csvContent =
        "data:text/csv;charset=utf-8," +
        [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute(
        "download",
        `courtload_dist_${distData.player_name.toLowerCase().replace(/\s+/g, "_")}_${distData.metric}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="workbench-content">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
            <span className="font-mono text-xs text-muted">F40</span>
            <span
              className="replica-badge-gated"
              style={{ background: "rgba(96, 211, 148, 0.15)", color: "var(--positive)" }}
            >
              Metric Distributions & Contextual Splits
            </span>
            <span className="font-mono text-xs text-muted">Blocks B12–B13</span>
          </div>
          <h1 className="page-title">Distributions, Dispersion & Splits</h1>
          <p className="page-subtitle">
            Empirical sample quantiles (Type 7 linear interpolation), interquartile ranges, home/away splits, schedule-based team rest days, and league-wide opponent defensive allowances.
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
          {activeTab === "distribution" && distData && (
            <button
              type="button"
              className="button button-secondary text-xs"
              onClick={handleExportCsv}
              title="Export distribution samples as CSV"
            >
              Export CSV
            </button>
          )}
          <Link href="/stats" className="button button-primary text-xs">
            Open in Stats
          </Link>
        </div>
      </div>

      {/* Main Tabs */}
      <div className="filter-group" style={{ marginBottom: "1.25rem" }}>
        <button
          type="button"
          className={`tab-button ${activeTab === "distribution" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("distribution");
            updateUrl(playerId, "distribution", metric, windowN);
          }}
        >
          Quantile Distribution
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === "splits" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("splits");
            updateUrl(playerId, "splits", metric, windowN);
          }}
        >
          Contextual Splits (Venue & Rest)
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === "opponent" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("opponent");
            updateUrl(playerId, "opponent", metric, windowN);
          }}
        >
          Opponent Defensive Context
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === "rank" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("rank");
            updateUrl(playerId, "rank", metric, windowN);
          }}
        >
          League Dispersion Ranking
        </button>
      </div>

      {/* TAB 1: Quantile Distribution */}
      {activeTab === "distribution" && (
        <>
          {/* Controls */}
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
            <form onSubmit={handleCustomPlayerSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <label className="text-xs font-mono text-muted uppercase" htmlFor="dist-player-id">
                Player ID / Search
              </label>
              <div style={{ display: "flex", gap: "0.25rem" }}>
                <input
                  id="dist-player-id"
                  type="text"
                  value={customPlayerInput}
                  onChange={(e) => setCustomPlayerInput(e.target.value)}
                  placeholder="e.g. 1628389"
                  className="input text-xs"
                  style={{ width: "110px", padding: "0.25rem 0.5rem" }}
                />
                <button type="submit" className="button button-secondary text-xs">
                  Load
                </button>
              </div>
            </form>

            {/* Metric Selector */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <label className="text-xs font-mono text-muted uppercase">Metric</label>
              <select
                value={metric}
                onChange={(e) => {
                  setMetric(e.target.value);
                  updateUrl(playerId, activeTab, e.target.value, windowN);
                }}
                className="input text-xs"
                style={{ padding: "0.25rem 0.5rem" }}
              >
                <option value="pts">Points (pts)</option>
                <option value="reb">Rebounds (reb)</option>
                <option value="ast">Assists (ast)</option>
                <option value="min">Minutes (min)</option>
                <option value="fg3m">3-Pointers Made (fg3m)</option>
                <option value="fga">Field Goals Attempted (fga)</option>
                <option value="fta">Free Throws Attempted (fta)</option>
              </select>
            </div>

            {/* Window Size */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <label className="text-xs font-mono text-muted uppercase">Window (Games)</label>
              <select
                value={windowN}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setWindowN(val);
                  updateUrl(playerId, activeTab, metric, val);
                }}
                className="input text-xs"
                style={{ padding: "0.25rem 0.5rem" }}
              >
                <option value={10}>Last 10 games</option>
                <option value={20}>Last 20 games (Default)</option>
                <option value={30}>Last 30 games</option>
                <option value={50}>Last 50 games</option>
                <option value={82}>Full Season (up to 82)</option>
              </select>
            </div>

            {/* Season */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <label className="text-xs font-mono text-muted uppercase">Season</label>
              <select
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                className="input text-xs"
                style={{ padding: "0.25rem 0.5rem" }}
              >
                <option value="2025-26">2025-26</option>
                <option value="2024-25">2024-25</option>
                <option value="2023-24">2023-24</option>
              </select>
            </div>
          </div>

          {distLoading && (
            <div className="table-card" style={{ padding: "2rem", textAlign: "center" }}>
              <div className="text-muted">Computing empirical quantiles and dispersion...</div>
            </div>
          )}

          {distError && (
            <div className="notice-box" style={{ borderLeftColor: "var(--negative)", marginBottom: "1.5rem" }}>
              <strong>Distribution Error:</strong> {distError}
            </div>
          )}

          {distData && !distLoading && (
            <>
              {/* Sample Gating Warning */}
              {!distData.summary.summary_available && (
                <div
                  className="notice-box"
                  style={{
                    borderLeftColor: "var(--warning)",
                    marginBottom: "1.5rem",
                    background: "rgba(255, 179, 0, 0.08)"
                  }}
                >
                  <strong>Sample Gating Guardrail:</strong> {distData.summary.reason}
                  <div className="text-xs text-muted" style={{ marginTop: "0.25rem" }}>
                    CourtLoad requires $n \ge 5$ confirmed appearances before estimating percentiles or dispersion.
                  </div>
                </div>
              )}

              {/* Quantile Summary Statistics Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                  gap: "0.75rem",
                  marginBottom: "1.5rem"
                }}
              >
                <div className="table-card" style={{ padding: "0.85rem", background: "var(--surface)" }}>
                  <span className="text-xs text-muted font-mono uppercase">Sample (n)</span>
                  <div style={{ fontSize: "1.3rem", fontWeight: 700 }}>{distData.summary.n}</div>
                  <span className="text-xs text-muted">games</span>
                </div>

                <div className="table-card" style={{ padding: "0.85rem", background: "var(--surface)" }}>
                  <span className="text-xs text-muted font-mono uppercase">Median (p50)</span>
                  <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--accent)" }}>
                    {distData.summary.median ?? "—"}
                  </div>
                  <span className="text-xs text-muted">central value</span>
                </div>

                <div className="table-card" style={{ padding: "0.85rem", background: "var(--surface)" }}>
                  <span className="text-xs text-muted font-mono uppercase">Mean</span>
                  <div style={{ fontSize: "1.3rem", fontWeight: 700 }}>{distData.summary.mean ?? "—"}</div>
                  <span className="text-xs text-muted">arithmetic avg</span>
                </div>

                <div className="table-card" style={{ padding: "0.85rem", background: "var(--surface)" }}>
                  <span className="text-xs text-muted font-mono uppercase">IQR (p75 - p25)</span>
                  <div style={{ fontSize: "1.3rem", fontWeight: 700 }}>{distData.summary.iqr ?? "—"}</div>
                  <span className="text-xs text-muted">interquartile range</span>
                </div>

                <div className="table-card" style={{ padding: "0.85rem", background: "var(--surface)" }}>
                  <span className="text-xs text-muted font-mono uppercase">Std Dev (σ)</span>
                  <div style={{ fontSize: "1.3rem", fontWeight: 700 }}>{distData.summary.population_sd ?? "—"}</div>
                  <span className="text-xs text-muted">dispersion</span>
                </div>

                <div className="table-card" style={{ padding: "0.85rem", background: "var(--surface)" }}>
                  <span className="text-xs text-muted font-mono uppercase">p25 — p75</span>
                  <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>
                    [{distData.summary.p25 ?? "—"}, {distData.summary.p75 ?? "—"}]
                  </div>
                  <span className="text-xs text-muted">50% core band</span>
                </div>

                <div className="table-card" style={{ padding: "0.85rem", background: "var(--surface)" }}>
                  <span className="text-xs text-muted font-mono uppercase">p10 — p90</span>
                  <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>
                    [{distData.summary.p10 ?? "—"}, {distData.summary.p90 ?? "—"}]
                  </div>
                  <span className="text-xs text-muted">80% span</span>
                </div>

                <div className="table-card" style={{ padding: "0.85rem", background: "var(--surface)" }}>
                  <span className="text-xs text-muted font-mono uppercase">Min — Max</span>
                  <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>
                    [{distData.summary.min ?? "—"}, {distData.summary.max ?? "—"}]
                  </div>
                  <span className="text-xs text-muted">observed range</span>
                </div>
              </div>

              {/* Visual Box & Quantile Strip Diagram */}
              {distData.summary.summary_available && (
                <div className="table-card" style={{ padding: "1.25rem", marginBottom: "1.5rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: "1rem" }}>
                        Empirical Dispersion Strip & Percentile Ranges
                      </h3>
                      <span className="text-xs text-muted">
                        Visualizing Type 7 sample percentiles: p10 ({distData.summary.p10}), p25 ({distData.summary.p25}), median ({distData.summary.median}), p75 ({distData.summary.p75}), p90 ({distData.summary.p90}).
                      </span>
                    </div>
                  </div>

                  {/* Strip / SVG diagram */}
                  <div style={{ padding: "1.5rem 1rem", background: "var(--bg-main)", borderRadius: "6px" }}>
                    {(() => {
                      const minV = Math.min(distData.summary.min ?? 0, distData.summary.p10 ?? 0);
                      const maxV = Math.max(distData.summary.max ?? 10, distData.summary.p90 ?? 10);
                      const range = maxV - minV || 1;
                      const getX = (val: number) => {
                        return Math.max(0, Math.min(100, ((val - minV) / range) * 100));
                      };

                      const p10X = getX(distData.summary.p10 ?? minV);
                      const p25X = getX(distData.summary.p25 ?? minV);
                      const medX = getX(distData.summary.median ?? minV);
                      const p75X = getX(distData.summary.p75 ?? maxV);
                      const p90X = getX(distData.summary.p90 ?? maxV);

                      return (
                        <div style={{ position: "relative", height: "80px", width: "100%" }}>
                          {/* 80% span line (p10 to p90) */}
                          <div
                            style={{
                              position: "absolute",
                              top: "35px",
                              left: `${p10X}%`,
                              width: `${Math.max(1, p90X - p10X)}%`,
                              height: "4px",
                              background: "rgba(255, 255, 255, 0.25)",
                              borderRadius: "2px"
                            }}
                          />

                          {/* 50% IQR box (p25 to p75) */}
                          <div
                            style={{
                              position: "absolute",
                              top: "23px",
                              left: `${p25X}%`,
                              width: `${Math.max(1, p75X - p25X)}%`,
                              height: "28px",
                              background: "rgba(255, 209, 102, 0.2)",
                              border: "2px solid var(--accent)",
                              borderRadius: "4px"
                            }}
                          />

                          {/* Median Marker Line */}
                          <div
                            style={{
                              position: "absolute",
                              top: "15px",
                              left: `calc(${medX}% - 2px)`,
                              width: "4px",
                              height: "44px",
                              background: "var(--accent)",
                              borderRadius: "2px",
                              zIndex: 2
                            }}
                          />

                          {/* Dots for individual games */}
                          {distData.samples.map((s, idx) => {
                            if (s.value === null) return null;
                            const sx = getX(s.value);
                            return (
                              <div
                                key={idx}
                                title={`${s.game_date} vs ${s.opponent_tricode}: ${s.value} ${distData.metric} (${s.minutes} min)`}
                                style={{
                                  position: "absolute",
                                  top: "33px",
                                  left: `calc(${sx}% - 4px)`,
                                  width: "8px",
                                  height: "8px",
                                  borderRadius: "50%",
                                  background: "#ffffff",
                                  boxShadow: "0 0 3px rgba(0,0,0,0.5)",
                                  opacity: 0.8,
                                  cursor: "pointer"
                                }}
                              />
                            );
                          })}

                          {/* Labels below */}
                          <div
                            style={{
                              position: "absolute",
                              top: "62px",
                              left: `${p10X}%`,
                              transform: "translateX(-50%)",
                              fontSize: "0.7rem",
                              color: "var(--text-muted)"
                            }}
                          >
                            p10: {distData.summary.p10}
                          </div>
                          <div
                            style={{
                              position: "absolute",
                              top: "62px",
                              left: `${medX}%`,
                              transform: "translateX(-50%)",
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              color: "var(--accent)"
                            }}
                          >
                            Med: {distData.summary.median}
                          </div>
                          <div
                            style={{
                              position: "absolute",
                              top: "62px",
                              left: `${p90X}%`,
                              transform: "translateX(-50%)",
                              fontSize: "0.7rem",
                              color: "var(--text-muted)"
                            }}
                          >
                            p90: {distData.summary.p90}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Sample Points Table */}
              <div className="table-card" style={{ marginBottom: "1.5rem" }}>
                <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
                  <h3 style={{ margin: 0, fontSize: "1rem" }}>
                    Observed Appearance Samples — {distData.player_name} ({distData.samples.length} Games)
                  </h3>
                  <span className="text-xs text-muted">
                    Exact game rows strictly prior to cutoff date ({distData.before_date}), without future leakage.
                  </span>
                </div>

                <div className="table-responsive">
                  <table className="data-table" style={{ width: "100%", textAlign: "left" }}>
                    <thead>
                      <tr>
                        <th style={{ padding: "0.75rem 1rem" }}>Date</th>
                        <th style={{ padding: "0.75rem 1rem" }}>Team</th>
                        <th style={{ padding: "0.75rem 1rem" }}>Opponent</th>
                        <th style={{ padding: "0.75rem 1rem" }}>Venue</th>
                        <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>Minutes</th>
                        <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>
                          {distData.metric_display_name} ({distData.metric_unit})
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {distData.samples.map((s: DistributionSamplePoint) => (
                        <tr key={s.game_id} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "0.75rem 1rem", fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}>
                            {s.game_date}
                          </td>
                          <td style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>{s.team_tricode}</td>
                          <td style={{ padding: "0.75rem 1rem" }}>{s.opponent_tricode}</td>
                          <td style={{ padding: "0.75rem 1rem" }}>
                            <span
                              className="filter-pill"
                              style={{ padding: "2px 6px", fontSize: "0.7rem", pointerEvents: "none" }}
                            >
                              {s.is_home ? "Home" : "Away"}
                            </span>
                          </td>
                          <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                            {s.minutes !== null ? `${s.minutes.toFixed(1)}m` : "—"}
                          </td>
                          <td
                            style={{
                              padding: "0.75rem 1rem",
                              textAlign: "right",
                              fontFamily: "var(--font-mono)",
                              fontWeight: 700,
                              color: "var(--accent)"
                            }}
                          >
                            {s.value !== null ? s.value : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Cryptographic Lineage Footer */}
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
                    SHA-256: <code>{distData.evidence_hash}</code>
                  </span>
                </div>
                <ul style={{ margin: 0, paddingLeft: "1.2rem", color: "var(--text-muted)" }}>
                  {distData.disclosures.map((disc: string, idx: number) => (
                    <li key={idx}>{disc}</li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </>
      )}

      {/* TAB 2: Contextual Splits (Venue & Rest) */}
      {activeTab === "splits" && (
        <>
          {splitLoading && (
            <div className="table-card" style={{ padding: "2rem", textAlign: "center" }}>
              <div className="text-muted">Partitioning appearances across venue, rest days, and opponent...</div>
            </div>
          )}

          {splitError && (
            <div className="notice-box" style={{ borderLeftColor: "var(--negative)", marginBottom: "1.5rem" }}>
              <strong>Splits Error:</strong> {splitError}
            </div>
          )}

          {splitData && !splitLoading && (
            <>
              {/* Mandatory Rest Days Disclosure */}
              <div
                className="notice-box"
                style={{
                  borderLeftColor: "var(--accent)",
                  marginBottom: "1.5rem",
                  background: "rgba(255, 209, 102, 0.08)"
                }}
              >
                <strong>Rest Days Definition:</strong> Team rest days measure full local calendar days elapsed between scheduled team games (max(0, delta_days - 1), where 0 = back-to-back). Gaps between individual player appearances are reported separately as descriptive appearance intervals and do not prove rest, benching, or injury.
              </div>

              {/* Venue Splits Table */}
              <div className="table-card" style={{ marginBottom: "1.5rem" }}>
                <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
                  <h3 style={{ margin: 0, fontSize: "1rem" }}>Venue Splits: Home vs. Away — {splitData.player_name}</h3>
                  <span className="text-xs text-muted">Comparative performance across game locations.</span>
                </div>

                <div className="table-responsive">
                  <table className="data-table" style={{ width: "100%", textAlign: "left" }}>
                    <thead>
                      <tr>
                        <th style={{ padding: "0.75rem 1rem" }}>Venue</th>
                        <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Games</th>
                        <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>Minutes/G</th>
                        <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>PTS/G</th>
                        <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>REB/G</th>
                        <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>AST/G</th>
                        <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>FG%</th>
                        <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>3P%</th>
                        <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>FT%</th>
                        <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>TS%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {splitData.venue_splits.map((b: SplitBucketSummary) => (
                        <tr key={b.bucket_key} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>{b.bucket_label}</td>
                          <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>{b.games_played}</td>
                          <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                            {b.min_per_game ?? "—"}
                          </td>
                          <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--accent)" }}>
                            {b.metrics.pts_per_game ?? "—"}
                          </td>
                          <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                            {b.metrics.reb_per_game ?? "—"}
                          </td>
                          <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                            {b.metrics.ast_per_game ?? "—"}
                          </td>
                          <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                            {b.metrics.fg_pct ? `${(b.metrics.fg_pct * 100).toFixed(1)}%` : "—"}
                          </td>
                          <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                            {b.metrics.fg3_pct ? `${(b.metrics.fg3_pct * 100).toFixed(1)}%` : "—"}
                          </td>
                          <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                            {b.metrics.ft_pct ? `${(b.metrics.ft_pct * 100).toFixed(1)}%` : "—"}
                          </td>
                          <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                            {b.metrics.ts_pct ? `${(b.metrics.ts_pct * 100).toFixed(1)}%` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Rest Days Splits Table */}
              <div className="table-card" style={{ marginBottom: "1.5rem" }}>
                <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
                  <h3 style={{ margin: 0, fontSize: "1rem" }}>Team Rest Days Splits — {splitData.player_name}</h3>
                  <span className="text-xs text-muted">
                    Performance partitioned by scheduled team calendar rest days.
                  </span>
                </div>

                <div className="table-responsive">
                  <table className="data-table" style={{ width: "100%", textAlign: "left" }}>
                    <thead>
                      <tr>
                        <th style={{ padding: "0.75rem 1rem" }}>Rest Bucket</th>
                        <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Games</th>
                        <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>Minutes/G</th>
                        <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>Appearance Gap (Avg)</th>
                        <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>PTS/G</th>
                        <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>REB/G</th>
                        <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>AST/G</th>
                        <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>FG%</th>
                        <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>TS%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {splitData.rest_splits.map((b: SplitBucketSummary) => (
                        <tr key={b.bucket_key} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>{b.bucket_label}</td>
                          <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>{b.games_played}</td>
                          <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                            {b.min_per_game ?? "—"}
                          </td>
                          <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                            {b.appearance_gap_days_avg !== null ? `${b.appearance_gap_days_avg} d` : "—"}
                          </td>
                          <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--accent)" }}>
                            {b.metrics.pts_per_game ?? "—"}
                          </td>
                          <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                            {b.metrics.reb_per_game ?? "—"}
                          </td>
                          <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                            {b.metrics.ast_per_game ?? "—"}
                          </td>
                          <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                            {b.metrics.fg_pct ? `${(b.metrics.fg_pct * 100).toFixed(1)}%` : "—"}
                          </td>
                          <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                            {b.metrics.ts_pct ? `${(b.metrics.ts_pct * 100).toFixed(1)}%` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Cryptographic Lineage Footer */}
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
                    SHA-256: <code>{splitData.evidence_hash}</code>
                  </span>
                </div>
                <ul style={{ margin: 0, paddingLeft: "1.2rem", color: "var(--text-muted)" }}>
                  {splitData.disclosures.map((disc: string, idx: number) => (
                    <li key={idx}>{disc}</li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </>
      )}

      {/* TAB 3: Opponent Defensive Context */}
      {activeTab === "opponent" && (
        <>
          {oppLoading && (
            <div className="table-card" style={{ padding: "2rem", textAlign: "center" }}>
              <div className="text-muted">Aggregating defensive allowances for all 30 NBA teams...</div>
            </div>
          )}

          {oppError && (
            <div className="notice-box" style={{ borderLeftColor: "var(--negative)", marginBottom: "1.5rem" }}>
              <strong>Opponent Context Error:</strong> {oppError}
            </div>
          )}

          {oppData && !oppLoading && (
            <div className="table-card" style={{ marginBottom: "1.5rem" }}>
              <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
                <h3 style={{ margin: 0, fontSize: "1rem" }}>
                  NBA Defensive Allowance Rankings — {oppData.season} ({oppData.teams_analyzed} Teams)
                </h3>
                <span className="text-xs text-muted">
                  Defensive points, shooting accuracy, and rebounds allowed per game strictly prior to cutoff date ({oppData.before_date}). Lower points allowed = better defensive rank (1 = stingiest defense).
                </span>
              </div>

              <div className="table-responsive">
                <table className="data-table" style={{ width: "100%", textAlign: "left" }}>
                  <thead>
                    <tr>
                      <th style={{ padding: "0.75rem 1rem", width: "60px" }}>Rank</th>
                      <th style={{ padding: "0.75rem 1rem" }}>Team</th>
                      <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Games</th>
                      <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>PTS Allowed / G</th>
                      <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>FG% Allowed</th>
                      <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>3P% Allowed</th>
                      <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>REB Allowed / G</th>
                      <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>AST Allowed / G</th>
                      <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>TOV Forced / G</th>
                    </tr>
                  </thead>
                  <tbody>
                    {oppData.allowances.map((team: TeamDefensiveAllowance) => (
                      <tr key={team.opponent_team_id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "0.75rem 1rem", fontWeight: 700, color: "var(--accent)" }}>
                          #{team.league_rank_pts_allowed ?? "—"}
                        </td>
                        <td style={{ padding: "0.75rem 1rem" }}>
                          <span style={{ fontWeight: 600 }}>{team.opponent_name}</span>
                          <span className="text-xs font-mono text-muted" style={{ marginLeft: "0.5rem" }}>
                            ({team.opponent_tricode})
                          </span>
                        </td>
                        <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>{team.games_observed}</td>
                        <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                          {team.pts_allowed_per_game.toFixed(1)}
                        </td>
                        <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                          {team.fg_pct_allowed ? `${(team.fg_pct_allowed * 100).toFixed(1)}%` : "—"}
                        </td>
                        <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                          {team.fg3_pct_allowed ? `${(team.fg3_pct_allowed * 100).toFixed(1)}%` : "—"}
                        </td>
                        <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                          {team.reb_allowed_per_game.toFixed(1)}
                        </td>
                        <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                          {team.ast_allowed_per_game.toFixed(1)}
                        </td>
                        <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                          {team.tov_forced_per_game.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Cryptographic Lineage Footer */}
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
                    SHA-256: <code>{oppData.evidence_hash}</code>
                  </span>
                </div>
                <ul style={{ margin: 0, paddingLeft: "1.2rem", color: "var(--text-muted)" }}>
                  {oppData.disclosures.map((disc: string, idx: number) => (
                    <li key={idx}>{disc}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </>
      )}

      {/* TAB 4: League Dispersion Ranking */}
      {activeTab === "rank" && (
        <div>
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
                value={metric}
                onChange={(e) => setMetric(e.target.value)}
                className="input text-xs"
                style={{ padding: "0.25rem 0.5rem" }}
              >
                <option value="pts">Points (pts)</option>
                <option value="reb">Rebounds (reb)</option>
                <option value="ast">Assists (ast)</option>
                <option value="min">Minutes (min)</option>
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <label className="text-xs font-mono text-muted uppercase">Dispersion Measure</label>
              <select
                value={rankMeasure}
                onChange={(e) => setRankMeasure(e.target.value as "iqr" | "population_sd")}
                className="input text-xs"
                style={{ padding: "0.25rem 0.5rem" }}
              >
                <option value="iqr">Interquartile Range (IQR)</option>
                <option value="population_sd">Standard Deviation (σ)</option>
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <label className="text-xs font-mono text-muted uppercase">Sort Order</label>
              <select
                value={rankDirection}
                onChange={(e) => setRankDirection(e.target.value as "desc" | "asc")}
                className="input text-xs"
                style={{ padding: "0.25rem 0.5rem" }}
              >
                <option value="desc">Highest Dispersion (Most Volatile)</option>
                <option value="asc">Lowest Dispersion (Most Consistent)</option>
              </select>
            </div>
          </div>

          {rankLoading && (
            <div className="table-card" style={{ padding: "2rem", textAlign: "center" }}>
              <div className="text-muted">Ranking league cohort by empirical dispersion...</div>
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
                  League Dispersion Ranking: {metric.toUpperCase()} ({rankMeasure.toUpperCase()})
                </h3>
                <span className="text-xs text-muted">
                  Ranked across {rankData.total_eligible} eligible players. Descriptive dispersion only; does not imply injury susceptibility or future volatility.
                </span>
              </div>

              <div className="table-responsive">
                <table className="data-table" style={{ width: "100%", textAlign: "left" }}>
                  <thead>
                    <tr>
                      <th style={{ padding: "0.75rem 1rem", width: "60px" }}>Rank</th>
                      <th style={{ padding: "0.75rem 1rem" }}>Player</th>
                      <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Games</th>
                      <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>Minutes</th>
                      <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>
                        Dispersion ({rankMeasure.toUpperCase()})
                      </th>
                      <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankData.items.map((item: RankOperationItem) => (
                      <tr key={item.player_id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "0.75rem 1rem", fontWeight: 700, color: "var(--accent)" }}>
                          #{item.rank}
                        </td>
                        <td style={{ padding: "0.75rem 1rem" }}>
                          <div style={{ fontWeight: 600 }}>{item.player_name}</div>
                          <span className="text-xs font-mono text-muted">{item.team_tricode || "—"}</span>
                        </td>
                        <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>{item.games_played}</td>
                        <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                          {item.total_minutes}
                        </td>
                        <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--accent)" }}>
                          {item.delta_value !== null ? item.delta_value : "—"}
                        </td>
                        <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                          <button
                            type="button"
                            className="button button-secondary text-xs"
                            onClick={() => {
                              handleSelectPlayer(item.player_id);
                              setActiveTab("distribution");
                            }}
                          >
                            View Curve
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Cryptographic Lineage Footer */}
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
