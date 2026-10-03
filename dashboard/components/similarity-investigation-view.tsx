"use client";

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

  // URL state initialization
  const initialPlayerId = searchParams.get("playerId") || searchParams.get("player_id") || "1628389";
  const initialSeason = searchParams.get("season") || "2025-26";
  const initialWindow = (searchParams.get("window") as "last_10" | "season") || "last_10";
  const initialTopK = parseInt(searchParams.get("topK") || "5", 10);

  const [playerId, setPlayerId] = useState(initialPlayerId);
  const [season, setSeason] = useState(initialSeason);
  const [windowMode, setWindowMode] = useState<"last_10" | "season">(initialWindow);
  const [topK, setTopK] = useState(initialTopK);
  const [minAppearances, setMinAppearances] = useState(10);
  const [minMinutes, setMinMinutes] = useState(150.0);
  const [customPlayerInput, setCustomPlayerInput] = useState(initialPlayerId);

  // Data states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<StatisticalPeersResponse | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Sync URL search params
  const updateUrl = (pId: string, win: string, k: number) => {
    const sp = new URLSearchParams();
    sp.set("playerId", pId);
    sp.set("season", season);
    sp.set("window", win);
    sp.set("topK", String(k));
    router.replace(`/research/similarity?${sp.toString()}`);
  };

  const handleSelectPlayer = (id: string) => {
    setPlayerId(id);
    setCustomPlayerInput(id);
    updateUrl(id, windowMode, topK);
  };

  const handleCustomPlayerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customPlayerInput.trim()) {
      handleSelectPlayer(customPlayerInput.trim());
    }
  };

  useEffect(() => {
    if (!playerId) return;

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
      phase: "regular_season",
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
  }, [playerId, season, windowMode, minAppearances, minMinutes, topK]);

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

  return (
    <div className="workbench-content">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
            <span className="font-mono text-xs text-muted">F14</span>
            <span
              className="replica-badge-gated"
              style={{ background: "rgba(96, 211, 148, 0.15)", color: "var(--positive)" }}
            >
              Statistical Twin Modeling
            </span>
            <span className="font-mono text-xs text-muted">Blocks B12–B13</span>
          </div>
          <h1 className="page-title">Statistical Peers & Profile Twins</h1>
          <p className="page-subtitle">
            Multidimensional Euclidean distance matching across 8 standardized workload and production dimensions. Standardized z-score calculation relative to the active league cohort.
          </p>
        </div>

        <div className="page-actions" style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            className="button button-secondary text-xs"
            onClick={handleCopyUrl}
            title="Copy shareable link with current similarity parameters"
          >
            {copiedUrl ? "✓ Copied!" : "Share Link"}
          </button>
          <Link href="/stats" className="button button-primary text-xs">
            Open in Stats
          </Link>
        </div>
      </div>

      {/* Control Bar */}
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
          <label className="text-xs font-mono text-muted uppercase">Featured Targets</label>
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
          <label className="text-xs font-mono text-muted uppercase" htmlFor="sim-player-id">
            Target Player ID
          </label>
          <div style={{ display: "flex", gap: "0.25rem" }}>
            <input
              id="sim-player-id"
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

        {/* Window Selector */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <label className="text-xs font-mono text-muted uppercase">Window Mode</label>
          <select
            value={windowMode}
            onChange={(e) => {
              const val = e.target.value as "last_10" | "season";
              setWindowMode(val);
              updateUrl(playerId, val, topK);
            }}
            className="input text-xs"
            style={{ padding: "0.25rem 0.5rem" }}
          >
            <option value="last_10">Recent Form (Last 10 Games)</option>
            <option value="season">Full Season Aggregate</option>
          </select>
        </div>

        {/* Top K */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <label className="text-xs font-mono text-muted uppercase">Top Twins (K)</label>
          <select
            value={topK}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              setTopK(val);
              updateUrl(playerId, windowMode, val);
            }}
            className="input text-xs"
            style={{ padding: "0.25rem 0.5rem" }}
          >
            <option value={3}>Top 3</option>
            <option value={5}>Top 5 (Default)</option>
            <option value={8}>Top 8</option>
            <option value={10}>Top 10</option>
          </select>
        </div>

        {/* Min Appearances */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <label className="text-xs font-mono text-muted uppercase">Min Games</label>
          <select
            value={minAppearances}
            onChange={(e) => setMinAppearances(parseInt(e.target.value, 10))}
            className="input text-xs"
            style={{ padding: "0.25rem 0.5rem" }}
          >
            <option value={5}>≥ 5 games</option>
            <option value={10}>≥ 10 games (Default)</option>
            <option value={15}>≥ 15 games</option>
            <option value={20}>≥ 20 games</option>
          </select>
        </div>

        {/* Min Minutes */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <label className="text-xs font-mono text-muted uppercase">Min Minutes</label>
          <select
            value={minMinutes}
            onChange={(e) => setMinMinutes(parseFloat(e.target.value))}
            className="input text-xs"
            style={{ padding: "0.25rem 0.5rem" }}
          >
            <option value={50}>≥ 50 min</option>
            <option value={100}>≥ 100 min</option>
            <option value={150}>≥ 150 min (Default)</option>
            <option value={200}>≥ 200 min</option>
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

      {loading && (
        <div className="table-card" style={{ padding: "2rem", textAlign: "center" }}>
          <div className="text-muted">Standardizing cohort z-scores and evaluating Euclidean distances...</div>
        </div>
      )}

      {error && (
        <div className="notice-box" style={{ borderLeftColor: "var(--negative)", marginBottom: "1.5rem" }}>
          <strong>Peer Matching Error:</strong> {error}
        </div>
      )}

      {data && !loading && (
        <>
          {/* Target Profile and Cohort Summary Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: "1rem",
              marginBottom: "1.5rem"
            }}
          >
            {/* Target Player Card */}
            <div className="table-card" style={{ padding: "1.25rem", borderTop: "3px solid var(--accent)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.5rem" }}>
                <span className="font-mono text-xs text-muted uppercase">Target Baseline Profile</span>
                <span className="text-xs font-mono" style={{ color: "var(--accent)" }}>
                  {data.target.team_tricode || "TOT"} · {data.target.games_played} GP · {data.target.total_minutes} MIN
                </span>
              </div>
              <h2 style={{ margin: "0 0 0.75rem 0", fontSize: "1.3rem" }}>{data.target.player_name}</h2>

              {/* 8 Dimensions Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", fontSize: "0.8rem" }}>
                {Object.entries(data.target.raw_values).map(([key, val]) => {
                  const zScore = data.target.standardized_values[key];
                  const zSign = zScore && zScore > 0 ? "+" : "";
                  const zColor =
                    zScore && zScore > 0.5
                      ? "var(--positive)"
                      : zScore && zScore < -0.5
                      ? "var(--negative)"
                      : "var(--text-muted)";

                  return (
                    <div
                      key={key}
                      style={{
                        padding: "0.4rem 0.6rem",
                        background: "var(--bg-main)",
                        borderRadius: "4px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 500 }}>{DIMENSION_LABELS[key] || key}</div>
                        <span className="text-muted font-mono">{val !== null ? val : "—"}</span>
                      </div>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: "0.75rem",
                          fontFamily: "var(--font-mono)",
                          color: zColor
                        }}
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
            <div className="table-card" style={{ padding: "1.25rem", borderTop: "3px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.5rem" }}>
                <span className="font-mono text-xs text-muted uppercase">Comparison Cohort</span>
                <span className="text-xs font-mono text-muted">{data.cohort.cohort_size} Eligible Candidates</span>
              </div>
              <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.1rem" }}>
                Active Standardization Cohort ({data.cohort.window_description})
              </h3>
              <p className="text-xs text-muted" style={{ margin: "0 0 0.75rem 0" }}>
                Filtered strictly to candidates with $\ge {data.cohort.min_appearances}$ games and $\ge {data.cohort.min_minutes}$ minutes. Requires $\ge 6$ overlapping dimensions.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "0.8rem" }}>
                {data.cohort.dimensions.map((dim: DimensionStats) => (
                  <div
                    key={dim.dimension_key}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "0.25rem 0",
                      borderBottom: "1px solid rgba(255,255,255,0.05)"
                    }}
                  >
                    <span style={{ color: "var(--text-muted)" }}>{dim.display_name}</span>
                    <span className="font-mono text-xs">
                      μ = {dim.cohort_mean} · σ = {dim.cohort_sd}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Matched Statistical Twin Cards */}
          <div className="table-card" style={{ marginBottom: "1.5rem" }}>
            <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
              <h3 style={{ margin: 0, fontSize: "1rem" }}>
                Closest Statistical Peers (Top {data.peers.length})
              </h3>
              <span className="text-xs text-muted">
                Ranked by weighted Euclidean distance (D = sqrt(sum(w * (zA - zB)^2) / sum(w))). Lower distance indicates a closer statistical shape match.
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", padding: "1.25rem" }}>
              {data.peers.map((peer: PeerMatchItem, idx: number) => {

                return (
                  <div
                    key={peer.player_id}
                    style={{
                      padding: "1rem",
                      background: "var(--bg-main)",
                      borderRadius: "6px",
                      border: "1px solid var(--border)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.75rem"
                    }}
                  >
                    {/* Peer Header Row */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "0.5rem"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <span
                          style={{
                            fontSize: "1.25rem",
                            fontWeight: 800,
                            color: idx === 0 ? "var(--accent)" : "var(--text-muted)"
                          }}
                        >
                          #{idx + 1}
                        </span>
                        <div>
                          <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>{peer.player_name}</div>
                          <span className="text-xs font-mono text-muted">
                            {peer.team_tricode || "TOT"} · {peer.games_played} GP · {peer.total_minutes} MIN · {peer.overlapping_dimensions_count} dims
                          </span>
                        </div>
                      </div>

                      {/* Distance Score Badge and PvP compare link */}
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: "1.1rem", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--accent)" }}>
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
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                        gap: "0.5rem",
                        paddingTop: "0.5rem",
                        borderTop: "1px solid rgba(255,255,255,0.05)",
                        fontSize: "0.75rem"
                      }}
                    >
                      {Object.entries(peer.raw_values).map(([dimKey, peerRaw]) => {
                        const targetRaw = data.target.raw_values[dimKey];
                        const diff = peer.dimension_contributions[dimKey];

                        return (
                          <div
                            key={dimKey}
                            style={{
                              padding: "0.35rem 0.5rem",
                              background: "var(--surface)",
                              borderRadius: "4px",
                              display: "flex",
                              flexDirection: "column",
                              gap: "2px"
                            }}
                          >
                            <span className="text-muted font-mono text-xs">{DIMENSION_LABELS[dimKey] || dimKey}</span>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span style={{ fontWeight: 600 }}>{peerRaw !== null ? peerRaw : "—"}</span>
                              <span className="text-muted" title="Target player value">
                                vs {targetRaw !== null ? targetRaw : "—"}
                              </span>
                            </div>
                            {diff !== undefined && (
                              <span className="text-xs font-mono" style={{ color: "var(--text-muted)", fontSize: "0.65rem" }}>
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
              <span className="font-mono text-muted uppercase text-xs">Cryptographic Lineage & Invariants</span>
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
    </div>
  );
}
