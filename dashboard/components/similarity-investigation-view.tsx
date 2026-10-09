"use client";

import { Icon } from "./ui/icon";
import { useReleaseCatalog } from "@/lib/use-release-catalog";
import { EntityField } from "./entity-picker";
import { useToast } from "./ui/toast";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getStatisticalPeers } from "@/lib/workbench-api";
import type {
  DimensionStats,
  PeerMatchItem,
  StatisticalPeersResponse
} from "@/lib/types";

const FEATURED_PLAYERS = [
  { id: "1628389", name: "Bam Adebayo", team: "MIA" },
  { id: "1630567", name: "Scottie Barnes", team: "TOR" },
  { id: "1627783", name: "Pascal Siakam", team: "IND" },
  { id: "1628369", name: "Jayson Tatum", team: "BOS" },
  { id: "1629630", name: "Ja Morant", team: "MEM" }
];

const DIMENSION_LABELS: Record<string, string> = {
  pts_per_36: "Points / 36m",
  reb_per_36: "Rebounds / 36m",
  ast_per_36: "Assists / 36m",
  tov_per_36: "Turnovers / 36m",
  fg3a_per_36: "3PA / 36m",
  fta_per_36: "FTA / 36m",
  ts_pct: "True Shooting %",
  min_per_game: "Minutes / Game"
};

export function SimilarityInvestigationView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedReleaseId = searchParams.get("releaseId") ?? searchParams.get("release_id");
  const catalog = useReleaseCatalog(selectedReleaseId);
  const releaseId = selectedReleaseId ?? catalog?.release_id ?? null;
  const phase = searchParams.get("phase") ?? catalog?.default_phase ?? "regular_season";

  // URL state initialization
  const initialPlayerId = searchParams.get("playerId") || searchParams.get("player_id") || "1628389";
  const initialSeason = searchParams.get("season") || catalog?.default_season || "";
  const initialWindow = (searchParams.get("window") as "last_10" | "season") || "last_10";
  const initialTopK = parseInt(searchParams.get("topK") || "5", 10);

  const [playerId, setPlayerId] = useState(initialPlayerId);
  const [season, setSeason] = useState(initialSeason);
  if (!season && initialSeason) setSeason(initialSeason);
  const beforeDate = searchParams.get("beforeDate") ?? searchParams.get("before_date") ?? catalog?.stats_scopes?.find(scope => scope.season === season && scope.phase === phase)?.default_before_date ?? catalog?.default_before_date ?? null;
  const [windowMode, setWindowMode] = useState<"last_10" | "season">(initialWindow);
  const [topK, setTopK] = useState(initialTopK);
  const [minAppearances, setMinAppearances] = useState(10);
  const [minMinutes, setMinMinutes] = useState(150.0);

  // Data states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<StatisticalPeersResponse | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const { toast } = useToast();

  const [previousUrl,setPreviousUrl] = useState(searchParams.toString());
  if(previousUrl !== searchParams.toString()) {setPreviousUrl(searchParams.toString());setPlayerId(initialPlayerId);setSeason(initialSeason);setWindowMode(searchParams.get("window") === "season" ? "season" : "last_10");}

  // Sync URL search params
  const updateUrl = (pId: string, win: string, k: number) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("playerId", pId);
    sp.set("season", season);
    sp.set("window", win);
    sp.set("topK", String(k));
    router.replace(`/research/similarity?${sp.toString()}`);
  };

  const handleSelectPlayer = (id: string) => {
    setPlayerId(id);
    updateUrl(id, windowMode, topK);
  };


  useEffect(() => {
    if (!playerId || !season) return;

    let isMounted = true;
    queueMicrotask(() => {
      if (isMounted) {
        setLoading(true);
        setError(null);
      }
    });

    getStatisticalPeers({
      target_player_id: playerId,
      season,
      phase, release_id: releaseId, before_date: beforeDate,
      window: windowMode,
      min_appearances: minAppearances,
      min_minutes: minMinutes,
      top_k: topK
    })
      .then((res) => {
        if (isMounted) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to compute statistical peers");
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [playerId, season, windowMode, minAppearances, minMinutes, topK, phase, releaseId, beforeDate]);

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

  return (
    <div className="workbench-content">
      {catalog === null && <p role="status">Context catalog unavailable. Explicit URL scope is retained; reload to retry.</p>}
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div className="dist-header-meta">
            <span className="font-mono text-xs text-muted">F14</span>
            <span
              className="replica-badge-gated dist-badge-positive"
            >
              Statistical Twin Modeling
            </span>

          </div>
          <h1 className="page-title">Statistical Peers & Profile Twins</h1>
          <p className="page-subtitle">
            Multidimensional Euclidean distance matching across 8 standardized workload and production dimensions. Standardized z-score calculation relative to the active league cohort.
          </p>
        </div>

        <div className="page-actions dist-actions">
          <button
            type="button"
            className="button button-secondary text-xs"
            onClick={handleCopyUrl}
            title="Copy shareable link with current similarity parameters"
          >
            {copiedUrl ? <><Icon name="check" size={14} />Copied</> : "Share Link"}
          </button>
          <Link href="/stats" className="button button-primary text-xs">
            Open in Stats
          </Link>
        </div>
      </div>

      {/* Control Bar */}
      <div className="filter-bar dist-filter-bar">
        {/* Quick Player Selectors */}
        <div className="dist-field-group">
          <label className="text-xs font-mono text-muted uppercase">Featured Targets</label>
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

        {/* Window Selector */}
        <div className="dist-field-group">
          <label className="text-xs font-mono text-muted uppercase">Window Mode</label>
          <select
            value={windowMode}
            onChange={(e) => {
              const val = e.target.value as "last_10" | "season";
              setWindowMode(val);
              updateUrl(playerId, val, topK);
            }}
            className="input text-xs dist-select-compact"
          >
            <option value="last_10">Recent Form (Last 10 Games)</option>
            <option value="season">Full Season Aggregate</option>
          </select>
        </div>

        {/* Top K */}
        <div className="dist-field-group">
          <label className="text-xs font-mono text-muted uppercase">Top Twins (K)</label>
          <select
            value={topK}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              setTopK(val);
              updateUrl(playerId, windowMode, val);
            }}
            className="input text-xs dist-select-compact"
          >
            <option value={3}>Top 3</option>
            <option value={5}>Top 5 (Default)</option>
            <option value={8}>Top 8</option>
            <option value={10}>Top 10</option>
          </select>
        </div>

        {/* Min Appearances */}
        <div className="dist-field-group">
          <label className="text-xs font-mono text-muted uppercase">Min Games</label>
          <select
            value={minAppearances}
            onChange={(e) => setMinAppearances(parseInt(e.target.value, 10))}
            className="input text-xs dist-select-compact"
          >
            <option value={5}>≥ 5 games</option>
            <option value={10}>≥ 10 games (Default)</option>
            <option value={15}>≥ 15 games</option>
            <option value={20}>≥ 20 games</option>
          </select>
        </div>

        {/* Min Minutes */}
        <div className="dist-field-group">
          <label className="text-xs font-mono text-muted uppercase">Min Minutes</label>
          <select
            value={minMinutes}
            onChange={(e) => setMinMinutes(parseFloat(e.target.value))}
            className="input text-xs dist-select-compact"
          >
            <option value={50}>≥ 50 min</option>
            <option value={100}>≥ 100 min</option>
            <option value={150}>≥ 150 min (Default)</option>
            <option value={200}>≥ 200 min</option>
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

      {loading && (
        <div className="table-card dist-loading-card">
          <div className="text-muted">Standardizing cohort z-scores and evaluating Euclidean distances...</div>
        </div>
      )}

      {error && (
        <div className="notice-box dist-notice-error">
          <strong>Peer Matching Error:</strong> {error}
        </div>
      )}

      {data && !loading && (
        <>
          {/* Target Profile and Cohort Summary Grid */}
          <div className="trend-inv-grid-2col">
            {/* Target Player Card */}
            <div className="table-card similarity-target-card">
              <div className="trend-inv-stat-head">
                <span className="font-mono text-xs text-muted uppercase">Target Baseline Profile</span>
                <span className="text-xs font-mono text-accent">
                  {data.target.team_tricode || "TOT"} · {data.target.games_played} GP · {data.target.total_minutes} MIN
                </span>
              </div>
              <h2 className="section-title mb-3">{data.target.player_name}</h2>

              {/* 8 Dimensions Grid */}
              <div className="similarity-dim-grid">
                {Object.entries(data.target.raw_values).map(([key, val]) => {
                  const zScore = data.target.standardized_values[key];
                  const zSign = zScore && zScore > 0 ? "+" : "";
                  const zClass =
                    zScore && zScore > 0.5
                      ? "text-positive"
                      : zScore && zScore < -0.5
                      ? "text-negative"
                      : "text-muted";

                  return (
                    <div
                      key={key}
                      className="similarity-dim-row"
                    >
                      <div>
                        <div className="font-medium">{DIMENSION_LABELS[key] || key}</div>
                        <span className="text-muted font-mono">{val !== null ? val : "—"}</span>
                      </div>
                      <div
                        className={`font-mono text-xs font-bold ${zClass}`}
                        title={`Cohort z-score: ${zScore ?? "—"}`}
                      >
                        {zScore !== null ? `${zSign}${zScore}σ` : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Cohort Summary Card */}
            <div className="table-card similarity-weights-card">
              <div className="trend-inv-stat-head">
                <span className="font-mono text-xs text-muted uppercase">Comparison Cohort</span>
                <span className="text-xs font-mono text-muted">{data.cohort.cohort_size} Eligible Candidates</span>
              </div>
              <h3 className="section-title mb-2">
                Active Standardization Cohort ({data.cohort.window_description})
              </h3>
              <p className="text-xs text-muted mb-3">
                Filtered strictly to candidates with $\ge {data.cohort.min_appearances}$ games and $\ge {data.cohort.min_minutes}$ minutes. Requires $\ge 6$ overlapping dimensions.
              </p>

              <div className="trend-inv-meta-col text-sm">
                {data.cohort.dimensions.map((dim: DimensionStats) => (
                  <div
                    key={dim.dimension_key}
                    className="similarity-dim-row"
                  >
                    <span className="text-muted">{dim.display_name}</span>
                    <span className="font-mono text-xs">
                      μ = {dim.cohort_mean} · σ = {dim.cohort_sd}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Matched Statistical Twin Cards */}
          <div className="table-card dist-table-card">
            <div className="dist-table-header">
              <h3 className="dist-table-title">
                Closest Statistical Peers (Top {data.peers.length})
              </h3>
              <span className="text-xs text-muted">
                Ranked by weighted Euclidean distance (D = sqrt(sum(w * (zA - zB)^2) / sum(w))). Lower distance indicates a closer statistical shape match.
              </span>
            </div>

            <div className="trend-inv-meta-col p-5">
              {data.peers.map((peer: PeerMatchItem, idx: number) => {

                return (
                  <div
                    key={peer.player_id}
                    className="table-card similarity-match-card"
                  >
                    {/* Peer Header Row */}
                    <div className="similarity-match-header">
                      <div className="dist-actions">
                        <span
                          className={`font-mono text-lg font-bold ${idx === 0 ? "text-accent" : "text-muted"}`}
                        >
                          #{idx + 1}
                        </span>
                        <div>
                          <div className="font-bold text-md">{peer.player_name}</div>
                          <span className="text-xs font-mono text-muted">
                            {peer.team_tricode || "TOT"} · {peer.games_played} GP · {peer.total_minutes} MIN · {peer.overlapping_dimensions_count} dims
                          </span>
                        </div>
                      </div>

                      {/* Distance Score Badge and PvP compare link */}
                      <div className="dist-actions">
                        <div className="text-right">
                          <div className="similarity-match-score">
                            D = {peer.distance.toFixed(3)}
                          </div>
                          <span className="text-xs text-muted">Euclidean Distance</span>
                        </div>

                        <Link
                          href={`/compare?playerA=${data.target.player_id}&playerB=${peer.player_id}`}
                          className="button button-secondary text-xs"
                          title="Open PvP comparison table and charts for these two players"
                        >
                          PvP Compare
                        </Link>

                        <button
                          type="button"
                          className="button button-secondary text-xs"
                          onClick={() => handleSelectPlayer(peer.player_id)}
                          title="Set this player as the target to find their twins"
                        >
                          Set Target
                        </button>
                      </div>
                    </div>

                    {/* Dimension Comparison Grid */}
                    <div className="similarity-dim-grid pt-2">
                      {Object.entries(peer.raw_values).map(([dimKey, peerRaw]) => {
                        const targetRaw = data.target.raw_values[dimKey];
                        const diff = peer.dimension_contributions[dimKey];

                        return (
                          <div
                            key={dimKey}
                            className="similarity-dim-row"
                          >
                            <span className="text-muted font-mono text-xs">{DIMENSION_LABELS[dimKey] || dimKey}</span>
                            <div className="flex gap-2">
                              <span className="font-semibold">{peerRaw !== null ? peerRaw : "—"}</span>
                              <span className="text-muted" title="Target player value">
                                vs {targetRaw !== null ? targetRaw : "—"}
                              </span>
                            </div>
                            {diff !== undefined && (
                              <span className="text-xs font-mono text-muted">
                                Δ²: {diff.toFixed(2)}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cryptographic Lineage Footer */}
          <div className="table-card dist-provenance-box">
            <div className="dist-provenance-header">
              <span className="font-mono text-muted uppercase text-xs">Cryptographic Lineage & Invariants</span>
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
    </div>
  );
}
