"use client";

import { Icon } from "./ui/icon";
import { useReleaseCatalog } from "@/lib/use-release-catalog";
import { EntityField } from "./entity-picker";
import { useToast } from "./ui/toast";

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
  const selectedReleaseId = searchParams.get("releaseId") ?? searchParams.get("release_id");
  const catalog = useReleaseCatalog(selectedReleaseId);
  const releaseId = selectedReleaseId ?? catalog?.release_id ?? null;
  const phase = searchParams.get("phase") ?? catalog?.default_phase ?? "regular_season";

  // URL state initialization
  const initialPlayerId = searchParams.get("playerId") || searchParams.get("player_id") || "1628389";
  const initialSeason = searchParams.get("season") || catalog?.default_season || "";
  const initialTab = (searchParams.get("tab") as "distribution" | "splits" | "opponent" | "rank") || "distribution";
  const initialMetric = searchParams.get("metric") || "pts";
  const legacyWindow = Number(searchParams.get("window"));
  const initialWindow = Number(searchParams.get("windowN") || ([5,10,20,30,50].includes(legacyWindow) ? legacyWindow : 20));

  const [activeTab, setActiveTab] = useState<"distribution" | "splits" | "opponent" | "rank">(initialTab);
  const [playerId, setPlayerId] = useState(initialPlayerId);
  const [season, setSeason] = useState(initialSeason);
  if (!season && initialSeason) setSeason(initialSeason);
  const beforeDate = searchParams.get("beforeDate") ?? searchParams.get("before_date") ?? catalog?.stats_scopes?.find(scope => scope.season === season && scope.phase === phase)?.default_before_date ?? catalog?.default_before_date ?? null;
  const [metric, setMetric] = useState(initialMetric);
  const [windowN, setWindowN] = useState(initialWindow);

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
  const { toast } = useToast();

  const [previousUrl,setPreviousUrl] = useState(searchParams.toString());
  if(previousUrl !== searchParams.toString()) {setPreviousUrl(searchParams.toString());setPlayerId(initialPlayerId);setSeason(initialSeason);setActiveTab(initialTab);setMetric(initialMetric);setWindowN(initialWindow);}

  // Sync URL search params
  const updateUrl = (pId: string, tab: string, met: string, win: number) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("playerId", pId);
    sp.set("season", season);
    sp.set("tab", tab);
    sp.set("metric", met);
    sp.set("windowN", String(win));
    router.replace(`/research/distributions?${sp.toString()}`);
  };

  const handleSelectPlayer = (id: string) => {
    setPlayerId(id);
    updateUrl(id, activeTab, metric, windowN);
  };


  // Fetch Distribution
  useEffect(() => {
    if (!playerId || !season) return;

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
      phase, release_id: releaseId, before_date: beforeDate,
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
  }, [playerId, season, metric, windowN, phase, releaseId, beforeDate]);

  // Fetch Splits
  useEffect(() => {
    if (activeTab !== "splits" || !playerId || !season) return;

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
      phase, release_id: releaseId, before_date: beforeDate
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
  }, [activeTab, playerId, season, phase, releaseId, beforeDate]);

  // Fetch Opponent Context
  useEffect(() => {
    if (activeTab !== "opponent" || !season) return;

    let isMounted = true;
    queueMicrotask(() => {
      if (isMounted) {
        setOppLoading(true);
        setOppError(null);
      }
    });

    getOpponentContext({
      season,
      phase, release_id: releaseId, before_date: beforeDate
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
  }, [activeTab, season, phase, releaseId, beforeDate]);

  // Fetch Cohort Dispersion Rank
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
      operation_type: "distribution",
      metric,
      measure: rankMeasure,
      sort_direction: rankDirection,
      season,
      phase, release_id: releaseId, before_date: beforeDate,
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
  }, [activeTab, metric, rankMeasure, rankDirection, season, phase, releaseId, beforeDate]);

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
        `courtlens_dist_${distData.player_name.toLowerCase().replace(/\s+/g, "_")}_${distData.metric}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({
        title: "Export Downloaded",
        description: "Distribution CSV export ready.",
        variant: "positive",
      });
    }
  };

  return (
    <div className="workbench-content">
      {catalog === null && <p role="status">Context catalog unavailable. Explicit URL scope is retained; reload to retry.</p>}
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div className="dist-header-meta">
            <span className="font-mono text-xs text-muted">F40</span>
            <span className="replica-badge-gated dist-badge-positive">
              Metric Distributions & Contextual Splits
            </span>

          </div>
          <h1 className="page-title">Distributions, Dispersion & Splits</h1>
          <p className="page-subtitle">
            Empirical sample quantiles (Type 7 linear interpolation), interquartile ranges, home/away splits, schedule-based team rest days, and league-wide opponent defensive allowances.
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
      <div className="dist-tab-group">
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

            {/* Metric Selector */}
            <div className="dist-field-group">
              <label className="text-xs font-mono text-muted uppercase">Metric</label>
              <select
                value={metric}
                onChange={(e) => {
                  setMetric(e.target.value);
                  updateUrl(playerId, activeTab, e.target.value, windowN);
                }}
                className="input text-xs dist-select-compact"
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
            <div className="dist-field-group">
              <label className="text-xs font-mono text-muted uppercase">Window (Games)</label>
              <select
                value={windowN}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setWindowN(val);
                  updateUrl(playerId, activeTab, metric, val);
                }}
                className="input text-xs dist-select-compact"
              >
                <option value={10}>Last 10 games</option>
                <option value={20}>Last 20 games (Default)</option>
                <option value={30}>Last 30 games</option>
                <option value={50}>Last 50 games</option>
                <option value={82}>Full Season (up to 82)</option>
              </select>
            </div>

            {/* Season */}
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

          {distLoading && (
            <div className="table-card dist-loading-card">
              <div className="text-muted">Computing empirical quantiles and dispersion...</div>
            </div>
          )}

          {distError && (
            <div className="notice-box dist-notice-error">
              <strong>Distribution Error:</strong> {distError}
            </div>
          )}

          {distData && !distLoading && (
            <>
              {/* Sample Gating Warning */}
              {!distData.summary.summary_available && (
                <div className="notice-box dist-notice-gating">
                  <strong>Sample Gating Guardrail:</strong> {distData.summary.reason}
                  <div className="text-xs text-muted mt-1">
                    CourtLens requires $n \ge 5$ confirmed appearances before estimating percentiles or dispersion.
                  </div>
                </div>
              )}

              {/* Quantile Summary Statistics Grid */}
              <div className="dist-summary-grid">
                <div className="table-card dist-stat-card">
                  <span className="text-xs text-muted font-mono uppercase">Sample (n)</span>
                  <div className="dist-stat-val">{distData.summary.n}</div>
                  <span className="text-xs text-muted">games</span>
                </div>

                <div className="table-card dist-stat-card">
                  <span className="text-xs text-muted font-mono uppercase">Median (p50)</span>
                  <div className="dist-stat-val accent">
                    {distData.summary.median ?? "—"}
                  </div>
                  <span className="text-xs text-muted">central value</span>
                </div>

                <div className="table-card dist-stat-card">
                  <span className="text-xs text-muted font-mono uppercase">Mean</span>
                  <div className="dist-stat-val">{distData.summary.mean ?? "—"}</div>
                  <span className="text-xs text-muted">arithmetic avg</span>
                </div>

                <div className="table-card dist-stat-card">
                  <span className="text-xs text-muted font-mono uppercase">IQR (p75 - p25)</span>
                  <div className="dist-stat-val">{distData.summary.iqr ?? "—"}</div>
                  <span className="text-xs text-muted">interquartile range</span>
                </div>

                <div className="table-card dist-stat-card">
                  <span className="text-xs text-muted font-mono uppercase">Std Dev (σ)</span>
                  <div className="dist-stat-val">{distData.summary.population_sd ?? "—"}</div>
                  <span className="text-xs text-muted">dispersion</span>
                </div>

                <div className="table-card dist-stat-card">
                  <span className="text-xs text-muted font-mono uppercase">p25 — p75</span>
                  <div className="dist-stat-val-md">
                    [{distData.summary.p25 ?? "—"}, {distData.summary.p75 ?? "—"}]
                  </div>
                  <span className="text-xs text-muted">50% core band</span>
                </div>

                <div className="table-card dist-stat-card">
                  <span className="text-xs text-muted font-mono uppercase">p10 — p90</span>
                  <div className="dist-stat-val-md">
                    [{distData.summary.p10 ?? "—"}, {distData.summary.p90 ?? "—"}]
                  </div>
                  <span className="text-xs text-muted">80% span</span>
                </div>

                <div className="table-card dist-stat-card">
                  <span className="text-xs text-muted font-mono uppercase">Min — Max</span>
                  <div className="dist-stat-val-md">
                    [{distData.summary.min ?? "—"}, {distData.summary.max ?? "—"}]
                  </div>
                  <span className="text-xs text-muted">observed range</span>
                </div>
              </div>

              {/* Visual Box & Quantile Strip Diagram */}
              {distData.summary.summary_available && (
                <div className="table-card dist-strip-card">
                  <div className="dist-strip-header">
                    <div>
                      <h3 className="dist-strip-title">
                        Empirical Dispersion Strip & Percentile Ranges
                      </h3>
                      <span className="text-xs text-muted">
                        Visualizing Type 7 sample percentiles: p10 ({distData.summary.p10}), p25 ({distData.summary.p25}), median ({distData.summary.median}), p75 ({distData.summary.p75}), p90 ({distData.summary.p90}).
                      </span>
                    </div>
                  </div>

                  {/* Strip / SVG diagram */}
                  <div className="dist-strip-container">
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
                        <div className="dist-strip-track">
                          {/* 80% span line (p10 to p90) */}
                          <div
                            className="dist-strip-span-line"
                            style={{ "--span-left": `${p10X}%`, "--span-width": `${Math.max(1, p90X - p10X)}%` } as React.CSSProperties}
                          />

                          {/* 50% IQR box (p25 to p75) */}
                          <div
                            className="dist-strip-iqr-box"
                            style={{ "--iqr-left": `${p25X}%`, "--iqr-width": `${Math.max(1, p75X - p25X)}%` } as React.CSSProperties}
                          />

                          {/* Median Marker Line */}
                          <div
                            className="dist-strip-median-line"
                            style={{ "--med-left": `${medX}%` } as React.CSSProperties}
                          />

                          {/* Dots for individual games */}
                          {distData.samples.map((s, idx) => {
                            if (s.value === null) return null;
                            const sx = getX(s.value);
                            return (
                              <div
                                key={idx}
                                title={`${s.game_date} vs ${s.opponent_tricode}: ${s.value} ${distData.metric} (${s.minutes} min)`}
                                className="dist-strip-dot"
                                style={{ "--dot-left": `${sx}%` } as React.CSSProperties}
                              />
                            );
                          })}

                          {/* Labels below */}
                          <div
                            className="dist-strip-label"
                            style={{ "--label-left": `${p10X}%` } as React.CSSProperties}
                          >
                            p10: {distData.summary.p10}
                          </div>
                          <div
                            className="dist-strip-label median"
                            style={{ "--label-left": `${medX}%` } as React.CSSProperties}
                          >
                            Med: {distData.summary.median}
                          </div>
                          <div
                            className="dist-strip-label"
                            style={{ "--label-left": `${p90X}%` } as React.CSSProperties}
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
              <div className="table-card dist-table-card">
                <div className="dist-table-header">
                  <h3 className="dist-table-title">
                    Observed Appearance Samples — {distData.player_name} ({distData.samples.length} Games)
                  </h3>
                  <span className="text-xs text-muted">
                    Exact game rows strictly prior to cutoff date ({distData.before_date}), without future leakage.
                  </span>
                </div>

                <div className="table-responsive">
                  <table className="data-table w-full text-left">
                    <thead>
                      <tr>
                        <th className="th-col-pad">Date</th>
                        <th className="th-col-pad">Team</th>
                        <th className="th-col-pad">Opponent</th>
                        <th className="th-col-pad">Venue</th>
                        <th className="th-col-pad-right">Minutes</th>
                        <th className="th-col-pad-right">
                          {distData.metric_display_name} ({distData.metric_unit})
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {distData.samples.map((s: DistributionSamplePoint) => (
                        <tr key={s.game_id} className="dist-table-row">
                          <td className="td-col-pad font-mono text-xs">
                            {s.game_date}
                          </td>
                          <td className="td-col-pad font-semibold">{s.team_tricode}</td>
                          <td className="td-col-pad">{s.opponent_tricode}</td>
                          <td className="td-col-pad">
                            <span className="filter-pill pointer-events-none text-xs">
                              {s.is_home ? "Home" : "Away"}
                            </span>
                          </td>
                          <td className="td-col-pad-right font-mono">
                            {s.minutes !== null ? `${s.minutes.toFixed(1)}m` : "—"}
                          </td>
                          <td className="td-col-pad-right font-mono font-bold text-accent">
                            {s.value !== null ? s.value : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Cryptographic Lineage Footer */}
              <div className="dist-provenance-box">
                <div className="dist-provenance-header">
                  <span className="font-mono text-muted uppercase text-xs">Cryptographic Lineage</span>
                  <span className="font-mono text-xs text-muted">
                    SHA-256: <code>{distData.evidence_hash}</code>
                  </span>
                </div>
                <ul className="dist-provenance-list">
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
            <div className="table-card dist-loading-box">
              <div className="text-muted">Partitioning appearances across venue, rest days, and opponent...</div>
            </div>
          )}

          {splitError && (
            <div className="notice-box dist-notice-error">
              <strong>Splits Error:</strong> {splitError}
            </div>
          )}

          {splitData && !splitLoading && (
            <>
              {/* Mandatory Rest Days Disclosure */}
              <div className="notice-box dist-notice-box">
                <strong>Rest Days Definition:</strong> Team rest days measure full local calendar days elapsed between scheduled team games (max(0, delta_days - 1), where 0 = back-to-back). Gaps between individual player appearances are reported separately as descriptive appearance intervals and do not prove rest, benching, or injury.
              </div>

              {/* Venue Splits Table */}
              <div className="table-card dist-table-card">
                <div className="dist-table-header">
                  <h3 className="dist-table-title">Venue Splits: Home vs. Away — {splitData.player_name}</h3>
                  <span className="text-xs text-muted">Comparative performance across game locations.</span>
                </div>

                <div className="table-responsive">
                  <table className="data-table dist-data-table">
                    <thead>
                      <tr>
                        <th className="th-col-pad">Venue</th>
                        <th className="th-col-pad-center">Games</th>
                        <th className="th-col-pad-right">Minutes/G</th>
                        <th className="th-col-pad-right">PTS/G</th>
                        <th className="th-col-pad-right">REB/G</th>
                        <th className="th-col-pad-right">AST/G</th>
                        <th className="th-col-pad-right">FG%</th>
                        <th className="th-col-pad-right">3P%</th>
                        <th className="th-col-pad-right">FT%</th>
                        <th className="th-col-pad-right">TS%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {splitData.venue_splits.map((b: SplitBucketSummary) => (
                        <tr key={b.bucket_key} className="dist-table-row">
                          <td className="td-col-pad font-semibold">{b.bucket_label}</td>
                          <td className="td-col-pad-center">{b.games_played}</td>
                          <td className="td-col-pad-right">
                            {b.min_per_game ?? "—"}
                          </td>
                          <td className="td-col-pad-right font-bold text-accent">
                            {b.metrics.pts_per_game ?? "—"}
                          </td>
                          <td className="td-col-pad-right">
                            {b.metrics.reb_per_game ?? "—"}
                          </td>
                          <td className="td-col-pad-right">
                            {b.metrics.ast_per_game ?? "—"}
                          </td>
                          <td className="td-col-pad-right">
                            {b.metrics.fg_pct ? `${(b.metrics.fg_pct * 100).toFixed(1)}%` : "—"}
                          </td>
                          <td className="td-col-pad-right">
                            {b.metrics.fg3_pct ? `${(b.metrics.fg3_pct * 100).toFixed(1)}%` : "—"}
                          </td>
                          <td className="td-col-pad-right">
                            {b.metrics.ft_pct ? `${(b.metrics.ft_pct * 100).toFixed(1)}%` : "—"}
                          </td>
                          <td className="td-col-pad-right font-semibold">
                            {b.metrics.ts_pct ? `${(b.metrics.ts_pct * 100).toFixed(1)}%` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Rest Days Splits Table */}
              <div className="table-card dist-table-card">
                <div className="dist-table-header">
                  <h3 className="dist-table-title">Team Rest Days Splits — {splitData.player_name}</h3>
                  <span className="text-xs text-muted">
                    Performance partitioned by scheduled team calendar rest days.
                  </span>
                </div>

                <div className="table-responsive">
                  <table className="data-table dist-data-table">
                    <thead>
                      <tr>
                        <th className="th-col-pad">Rest Bucket</th>
                        <th className="th-col-pad-center">Games</th>
                        <th className="th-col-pad-right">Minutes/G</th>
                        <th className="th-col-pad-right">Appearance Gap (Avg)</th>
                        <th className="th-col-pad-right">PTS/G</th>
                        <th className="th-col-pad-right">REB/G</th>
                        <th className="th-col-pad-right">AST/G</th>
                        <th className="th-col-pad-right">FG%</th>
                        <th className="th-col-pad-right">TS%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {splitData.rest_splits.map((b: SplitBucketSummary) => (
                        <tr key={b.bucket_key} className="dist-table-row">
                          <td className="td-col-pad font-semibold">{b.bucket_label}</td>
                          <td className="td-col-pad-center">{b.games_played}</td>
                          <td className="td-col-pad-right">
                            {b.min_per_game ?? "—"}
                          </td>
                          <td className="td-col-pad-right text-muted">
                            {b.appearance_gap_days_avg !== null ? `${b.appearance_gap_days_avg} d` : "—"}
                          </td>
                          <td className="td-col-pad-right font-bold text-accent">
                            {b.metrics.pts_per_game ?? "—"}
                          </td>
                          <td className="td-col-pad-right">
                            {b.metrics.reb_per_game ?? "—"}
                          </td>
                          <td className="td-col-pad-right">
                            {b.metrics.ast_per_game ?? "—"}
                          </td>
                          <td className="td-col-pad-right">
                            {b.metrics.fg_pct ? `${(b.metrics.fg_pct * 100).toFixed(1)}%` : "—"}
                          </td>
                          <td className="td-col-pad-right font-semibold">
                            {b.metrics.ts_pct ? `${(b.metrics.ts_pct * 100).toFixed(1)}%` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Cryptographic Lineage Footer */}
              <div className="table-card dist-provenance-box">
                <div className="dist-provenance-header">
                  <span className="font-mono text-muted uppercase text-xs">Cryptographic Lineage</span>
                  <span className="font-mono text-xs text-muted">
                    SHA-256: <code>{splitData.evidence_hash}</code>
                  </span>
                </div>
                <ul className="dist-provenance-list">
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
            <div className="table-card dist-loading-box">
              <div className="text-muted">Aggregating defensive allowances for all 30 NBA teams...</div>
            </div>
          )}

          {oppError && (
            <div className="notice-box dist-notice-error">
              <strong>Opponent Context Error:</strong> {oppError}
            </div>
          )}

          {oppData && !oppLoading && (
            <div className="table-card dist-table-card">
              <div className="dist-table-header">
                <h3 className="dist-table-title">
                  NBA Defensive Allowance Rankings — {oppData.season} ({oppData.teams_analyzed} Teams)
                </h3>
                <span className="text-xs text-muted">
                  Defensive points, shooting accuracy, and rebounds allowed per game strictly prior to cutoff date ({oppData.before_date}). Lower points allowed = better defensive rank (1 = stingiest defense).
                </span>
              </div>

              <div className="table-responsive">
                <table className="data-table dist-data-table">
                  <thead>
                    <tr>
                      <th className="dist-th-rank">Rank</th>
                      <th className="th-col-pad">Team</th>
                      <th className="th-col-pad-center">Games</th>
                      <th className="th-col-pad-right">PTS Allowed / G</th>
                      <th className="th-col-pad-right">FG% Allowed</th>
                      <th className="th-col-pad-right">3P% Allowed</th>
                      <th className="th-col-pad-right">REB Allowed / G</th>
                      <th className="th-col-pad-right">AST Allowed / G</th>
                      <th className="th-col-pad-right">TOV Forced / G</th>
                    </tr>
                  </thead>
                  <tbody>
                    {oppData.allowances.map((team: TeamDefensiveAllowance) => (
                      <tr key={team.opponent_team_id} className="dist-table-row">
                        <td className="dist-td-rank">
                          #{team.league_rank_pts_allowed ?? "—"}
                        </td>
                        <td className="dist-td-player">
                          <span className="dist-player-title">{team.opponent_name}</span>
                          <span className="text-xs font-mono text-muted dist-team-tricode">
                            ({team.opponent_tricode})
                          </span>
                        </td>
                        <td className="td-col-pad-center">{team.games_observed}</td>
                        <td className="td-col-pad-right font-bold">
                          {team.pts_allowed_per_game.toFixed(1)}
                        </td>
                        <td className="td-col-pad-right">
                          {team.fg_pct_allowed ? `${(team.fg_pct_allowed * 100).toFixed(1)}%` : "—"}
                        </td>
                        <td className="td-col-pad-right">
                          {team.fg3_pct_allowed ? `${(team.fg3_pct_allowed * 100).toFixed(1)}%` : "—"}
                        </td>
                        <td className="td-col-pad-right">
                          {team.reb_allowed_per_game.toFixed(1)}
                        </td>
                        <td className="td-col-pad-right">
                          {team.ast_allowed_per_game.toFixed(1)}
                        </td>
                        <td className="td-col-pad-right">
                          {team.tov_forced_per_game.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Cryptographic Lineage Footer */}
              <div className="table-card dist-provenance-box">
                <div className="dist-provenance-header">
                  <span className="font-mono text-muted uppercase text-xs">Cryptographic Lineage</span>
                  <span className="font-mono text-xs text-muted">
                    SHA-256: <code>{oppData.evidence_hash}</code>
                  </span>
                </div>
                <ul className="dist-provenance-list">
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
          <div className="filter-bar dist-filter-bar">
            <div className="dist-filter-group">
              <label className="text-xs font-mono text-muted uppercase">Metric</label>
              <select
                value={metric}
                onChange={(e) => setMetric(e.target.value)}
                className="input text-xs dist-filter-select"
              >
                <option value="pts">Points (pts)</option>
                <option value="reb">Rebounds (reb)</option>
                <option value="ast">Assists (ast)</option>
                <option value="min">Minutes (min)</option>
              </select>
            </div>

            <div className="dist-filter-group">
              <label className="text-xs font-mono text-muted uppercase">Dispersion Measure</label>
              <select
                value={rankMeasure}
                onChange={(e) => setRankMeasure(e.target.value as "iqr" | "population_sd")}
                className="input text-xs dist-filter-select"
              >
                <option value="iqr">Interquartile Range (IQR)</option>
                <option value="population_sd">Standard Deviation (σ)</option>
              </select>
            </div>

            <div className="dist-filter-group">
              <label className="text-xs font-mono text-muted uppercase">Sort Order</label>
              <select
                value={rankDirection}
                onChange={(e) => setRankDirection(e.target.value as "desc" | "asc")}
                className="input text-xs dist-filter-select"
              >
                <option value="desc">Highest Dispersion (Most Volatile)</option>
                <option value="asc">Lowest Dispersion (Most Consistent)</option>
              </select>
            </div>
          </div>

          {rankLoading && (
            <div className="table-card dist-loading-box">
              <div className="text-muted">Ranking league cohort by empirical dispersion...</div>
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
                  League Dispersion Ranking: {metric.toUpperCase()} ({rankMeasure.toUpperCase()})
                </h3>
                <span className="text-xs text-muted">
                  Ranked across {rankData.total_eligible} eligible players. Descriptive dispersion only; does not imply injury susceptibility or future volatility.
                </span>
              </div>

              <div className="table-responsive">
                <table className="data-table dist-data-table">
                  <thead>
                    <tr>
                      <th className="dist-th-rank">Rank</th>
                      <th className="th-col-pad">Player</th>
                      <th className="th-col-pad-center">Games</th>
                      <th className="th-col-pad-right">Minutes</th>
                      <th className="th-col-pad-right">
                        Dispersion ({rankMeasure.toUpperCase()})
                      </th>
                      <th className="th-col-pad-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankData.items.map((item: RankOperationItem) => (
                      <tr key={item.player_id} className="dist-table-row">
                        <td className="dist-td-rank">
                          #{item.rank}
                        </td>
                        <td className="dist-td-player">
                          <div className="dist-player-title">{item.player_name}</div>
                          <span className="text-xs font-mono text-muted">{item.team_tricode || "—"}</span>
                        </td>
                        <td className="td-col-pad-center">{item.games_played}</td>
                        <td className="td-col-pad-right">
                          {item.total_minutes}
                        </td>
                        <td className="td-col-pad-right font-bold text-accent">
                          {item.delta_value !== null ? item.delta_value : "—"}
                        </td>
                        <td className="td-col-pad-center">
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
              <div className="table-card dist-provenance-box">
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
