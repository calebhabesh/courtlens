"use client";

import { Button } from "./ui/button";
import { formatDate } from "@/lib/format-date";
import { PlayerIdentity } from "./ui/identity";
import { LookupInput } from "./lookup-input";
import { DataDetailsButton } from "./ui/data-details";
import { Field } from "./ui/field";
import { CountChip, FilterBar } from "./ui/filter-bar";
import { GatedNote } from "./ui/gated-note";
import { Select } from "./ui/select";
import { Skeleton } from "./ui/skeleton";
import { buildPreservedContextUrl } from "@/lib/query-url";
import { useReleaseCatalog } from "@/lib/use-release-catalog";
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
  const [targetLookup, setTargetLookup] = useState("");
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
    router.replace(`/similar-players?${sp.toString()}`);
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
    <div className="similarity-view">
      <FilterBar
        label="Similar players controls"
        summary={`${season || "Season"} · ${windowMode === "season" ? "Season" : "Last 10"}`}
        scope={<>
          <Field label="Season" layout="inline">
            <Select value={season} onChange={(e) => setSeason(e.target.value)} aria-label="Season">
              {season && !catalog?.seasons.includes(season) && <option value={season}>{season} · availability unverified</option>}
              {catalog?.seasons.map(value => <option key={value} value={value}>{value}</option>)}
            </Select>
          </Field>
          <Field label="Window" layout="inline">
            <Select value={windowMode} aria-label="Window" onChange={(e) => {
              const val = e.target.value as "last_10" | "season";
              setWindowMode(val);
              updateUrl(playerId, val, topK);
            }}>
              <option value="last_10">Last 10 games</option>
              <option value="season">Full season</option>
            </Select>
          </Field>
        </>}
        filters={<>
          {/* Always reachable, even when the current target has no result; one 40px field. */}
          <div className="similarity-target-lookup">
            <LookupInput label="Target player" value={targetLookup} onChange={setTargetLookup} kinds={["player"]} portalDropdown
              releaseId={releaseId} season={season} placeholder={data?.target.player_name ? `Target: ${data.target.player_name}` : "Choose a target player…"}
              onSelect={(item) => { setTargetLookup(""); if (item.kind === "player") handleSelectPlayer(item.canonical_id); }} />
          </div>
          <Field label="Peers" layout="inline">
            <Select value={String(topK)} aria-label="Number of peers" onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              setTopK(val);
              updateUrl(playerId, windowMode, val);
            }}>
              {[3, 5, 8, 10].map(k => <option key={k} value={k}>Top {k}</option>)}
            </Select>
          </Field>
          <Field label="Min games" layout="inline">
            <Select value={String(minAppearances)} aria-label="Minimum games" onChange={(e) => setMinAppearances(parseInt(e.target.value, 10))}>
              {[5, 10, 15, 20].map(n => <option key={n} value={n}>{n}+</option>)}
            </Select>
          </Field>
          <Field label="Min minutes" layout="inline">
            <Select value={String(minMinutes)} aria-label="Minimum minutes" onChange={(e) => setMinMinutes(parseFloat(e.target.value))}>
              {[50, 100, 150, 200].map(n => <option key={n} value={n}>{n}+</option>)}
            </Select>
          </Field>
        </>}
        count={data ? <CountChip>{data.cohort.cohort_size.toLocaleString("en-US")} in cohort</CountChip> : undefined}
        details={<DataDetailsButton
          scope={{ releaseId, season, phase, beforeDate, window: windowMode }}
          rows={data ? [
            { label: "Evidence SHA-256", value: data.evidence_hash, mono: true },
            ...data.disclosures.map((text: string, i: number) => ({ label: i ? "" : "Disclosures", value: text })),
          ] : []}
        />}
      />
      {catalog === null && <GatedNote why="Explicit URL scope is retained; reload to retry." action={<Button onClick={() => window.location.reload()}>Retry</Button>}>Context catalog unavailable.</GatedNote>}

      {loading && (
        <div role="status" aria-label="Matching peers" aria-busy="true">
          <div className="trend-inv-grid-2col"><Skeleton height={440} /><Skeleton height={440} /></div>
          <Skeleton height={240} />
        </div>
      )}

      {error && (
        <GatedNote tone="warning" why={error} action={<Button onClick={() => window.location.reload()}>Retry</Button>}>Peers could not be matched for this scope.</GatedNote>
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
              <div className="similarity-target-head">
                <h2 className="section-title">
                  <PlayerIdentity playerId={data.target.player_id} name={data.target.player_name}
                    team={data.target.team_tricode && data.target.team_tricode !== "TOT" ? data.target.team_tricode : null} size="lg" />
                </h2>
              </div>

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
                {/* The API's description carries ISO dates and window codes; show them in the display format (D11). */}
                Active Standardization Cohort ({data.cohort.window_description.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (iso) => formatDate(iso)).replaceAll("last_10", "last 10")})
              </h3>
              <p className="text-xs text-muted mb-3">
                Candidates with at least {data.cohort.min_appearances} games and {data.cohort.min_minutes} minutes, sharing at least 6 dimensions.
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
              <div className="similarity-actions">
                <Button variant="secondary" size="sm" icon={copiedUrl ? "check" : "copy"} onClick={handleCopyUrl}>{copiedUrl ? "Copied" : "Share link"}</Button>
                <Link href={buildPreservedContextUrl("/stats", searchParams)} className="ui-button ui-button-secondary ui-button-sm">Open in Stats</Link>
              </div>
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
                        {/* "TOT" (several teams) has no single logo, so no team badge is guessed. */}
                        <PlayerIdentity playerId={peer.player_id} name={peer.player_name} team={peer.team_tricode && peer.team_tricode !== "TOT" ? peer.team_tricode : null}
                          subtitle={`${peer.team_tricode === "TOT" ? "Multiple teams · " : ""}${peer.games_played} GP · ${peer.total_minutes} MIN · ${peer.overlapping_dimensions_count} dims`} />
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

          <GatedNote why={<>Ranked by weighted Euclidean distance over 8 standardized workload and production dimensions, z-scored against the active league cohort: D = sqrt(sum(w · (zA − zB)²) / sum(w)). Lower distance means a closer statistical shape. Evidence hash and disclosures are in Data details.</>}>
            Peers are the closest standardized stat profiles, not a judgement of quality.
          </GatedNote>
        </>
      )}
    </div>
  );
}
