"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { getDistribution, getOpponentContext, getRankOperation, getSplitProfile } from "@/lib/workbench-api";
import { formatDate } from "@/lib/format-date";
import type { DistributionResponse, OpponentContextResponse, RankOperationResponse, SplitBucketSummary, SplitProfileResponse } from "@/lib/types";
import { ContextBar } from "./context-bar";
import { TeamLogo } from "./team-logo";
import { Field } from "./ui/field";
import { GatedNote } from "./ui/gated-note";
import { PlayerIdentity } from "./ui/identity";
import { PageShell, ResearchLayout } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { SegmentedControl } from "./ui/segmented-control";
import { Select } from "./ui/select";
import { StatTile } from "./ui/stat-tile";
import { PlayerLookup, ResearchBodySkeleton, downloadCsv, evidenceRows, useInvestigationScope, useShareLink } from "./research-investigation";

type Tab = "distribution" | "splits" | "opponent" | "rank";
type Loaded<T> = { key: string; value?: T; error?: string } | null;
const TABS: { value: Tab; label: string }[] = [{ value: "distribution", label: "Distribution" }, { value: "splits", label: "Venue & Rest" }, { value: "opponent", label: "Opponent Context" }, { value: "rank", label: "Dispersion Ranking" }];
const METRICS = [["pts", "Points"], ["reb", "Rebounds"], ["ast", "Assists"], ["min", "Minutes"], ["fg3m", "3-pointers made"], ["fga", "Field goals attempted"], ["fta", "Free throws attempted"]] as const;
const RANK_METRICS = METRICS.slice(0, 4);
const WINDOWS = [[10, "Last 10 games"], [20, "Last 20 games"], [30, "Last 30 games"], [50, "Last 50 games"], [82, "Full season (up to 82)"]] as const;
const pct = (value: number | null | undefined) => value ? `${(value * 100).toFixed(1)}%` : "—";
const metricLabel = (key: string) => METRICS.find(([value]) => value === key)?.[1] ?? key;

/** One request per view; the key holds every input so a superseded response is never shown. */
function useLoad<T>(enabled: boolean, key: string, load: () => Promise<T>, fallback: string): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    load().then(value => { if (active) setState({ key, value }); }).catch(err => { if (active) setState({ key, error: err instanceof Error ? err.message : fallback }); });
    return () => { active = false; };
    // `key` covers every request input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);
  return state?.key === key ? state : null;
}

function Strip({ data }: { data: DistributionResponse }) {
  const s = data.summary;
  const minV = Math.min(s.min ?? 0, s.p10 ?? 0), maxV = Math.max(s.max ?? 10, s.p90 ?? 10), span = maxV - minV || 1;
  const x = (v: number) => Math.max(0, Math.min(100, ((v - minV) / span) * 100));
  const p10 = x(s.p10 ?? minV), p25 = x(s.p25 ?? minV), med = x(s.median ?? minV), p75 = x(s.p75 ?? maxV), p90 = x(s.p90 ?? maxV);
  return <figure className="table-card dist-strip-card" aria-label={`${data.metric_display_name} dispersion: p10 ${s.p10}, p25 ${s.p25}, median ${s.median}, p75 ${s.p75}, p90 ${s.p90}`}>
    <figcaption className="research-caption">Each dot is one game. The box spans p25–p75 and the line p10–p90.</figcaption>
    <div className="dist-strip-container"><div className="dist-strip-track">
      <div className="dist-strip-span-line" style={{ "--span-left": `${p10}%`, "--span-width": `${Math.max(1, p90 - p10)}%` } as CSSProperties} />
      <div className="dist-strip-iqr-box" style={{ "--iqr-left": `${p25}%`, "--iqr-width": `${Math.max(1, p75 - p25)}%` } as CSSProperties} />
      <div className="dist-strip-median-line" style={{ "--med-left": `${med}%` } as CSSProperties} />
      {data.samples.map((sample, index) => sample.value === null ? null : <div key={index} className="dist-strip-dot" title={`${formatDate(sample.game_date)} vs ${sample.opponent_tricode}: ${sample.value} ${data.metric} (${sample.minutes} min)`} style={{ "--dot-left": `${x(sample.value)}%` } as CSSProperties} />)}
      <div className="dist-strip-label" style={{ "--label-left": `${p10}%` } as CSSProperties}>p10: {s.p10}</div>
      <div className="dist-strip-label median" style={{ "--label-left": `${med}%` } as CSSProperties}>Med: {s.median}</div>
      <div className="dist-strip-label" style={{ "--label-left": `${p90}%` } as CSSProperties}>p90: {s.p90}</div>
    </div></div>
  </figure>;
}

function SplitTable({ label, rows, rest = false }: { label: string; rows: SplitBucketSummary[]; rest?: boolean }) {
  return <div className="table-wrapper research-table" role="region" aria-label={label} tabIndex={0}>
    <table className="data-table"><caption>{label}</caption>
      <thead><tr><th>{rest ? "Team Rest" : "Venue"}</th><th className="num">Games</th><th className="num">MIN/G</th>{rest && <th className="num">Appearance Gap</th>}<th className="num">PTS/G</th><th className="num">REB/G</th><th className="num">AST/G</th><th className="num">FG%</th>{!rest && <><th className="num">3P%</th><th className="num">FT%</th></>}<th className="num">TS%</th></tr></thead>
      <tbody>{rows.map(b => <tr key={b.bucket_key}><th scope="row">{b.bucket_label}</th><td className="num">{b.games_played}</td><td className="num">{b.min_per_game ?? "—"}</td>{rest && <td className="num">{b.appearance_gap_days_avg !== null ? `${b.appearance_gap_days_avg} d` : "—"}</td>}<td className="num">{b.metrics.pts_per_game ?? "—"}</td><td className="num">{b.metrics.reb_per_game ?? "—"}</td><td className="num">{b.metrics.ast_per_game ?? "—"}</td><td className="num">{pct(b.metrics.fg_pct)}</td>{!rest && <><td className="num">{pct(b.metrics.fg3_pct)}</td><td className="num">{pct(b.metrics.ft_pct)}</td></>}<td className="num">{pct(b.metrics.ts_pct)}</td></tr>)}</tbody>
    </table>
  </div>;
}

const Disclosures = ({ items, children }: { items: string[]; children: ReactNode }) => <GatedNote why={<ul>{items.map((text, index) => <li key={index}>{text}</li>)}</ul>}>{children}</GatedNote>;

/** Distributions & Splits on the Research template: four views of one scope, all in the URL. */
export function DistributionsInvestigationView() {
  const { params, catalog, releaseId, season, phase, beforeDate, set } = useInvestigationScope();
  const tab = (TABS.some(t => t.value === params.get("tab")) ? params.get("tab") : "distribution") as Tab;
  const playerId = params.get("playerId") || params.get("player_id") || "1628389";
  const metric = params.get("metric") || "pts";
  const legacyWindow = Number(params.get("window"));
  const windowN = Number(params.get("windowN") || ([5, 10, 20, 30, 50].includes(legacyWindow) ? legacyWindow : 20));
  const measure = params.get("measure") === "population_sd" ? "population_sd" : "iqr";
  const direction = params.get("rankDirection") === "asc" ? "asc" : "desc";
  const [retry, setRetry] = useState(0);
  const share = useShareLink();
  const scope = { season, phase, release_id: releaseId, before_date: beforeDate };
  const base = JSON.stringify([season, phase, releaseId, beforeDate, retry]);
  const dist = useLoad<DistributionResponse>(tab === "distribution" && !!playerId && !!season, `${base}|${playerId}|${metric}|${windowN}`, () => getDistribution({ player_id: playerId, metric, window_n: windowN, ...scope }), "Failed to load distribution");
  const splits = useLoad<SplitProfileResponse>(tab === "splits" && !!playerId && !!season, `${base}|${playerId}`, () => getSplitProfile({ player_id: playerId, ...scope }), "Failed to load splits");
  const opponent = useLoad<OpponentContextResponse>(tab === "opponent" && !!season, base, () => getOpponentContext(scope), "Failed to load opponent context");
  const rank = useLoad<RankOperationResponse>(tab === "rank" && !!season, `${base}|${metric}|${measure}|${direction}`, () => getRankOperation({ operation_type: "distribution", metric, measure, sort_direction: direction, limit: 25, min_games: 10, ...scope }), "Failed to load dispersion ranking");
  const active = { distribution: dist, splits, opponent, rank }[tab];

  const exportCsv = () => dist?.value && downloadCsv(`courtlens_dist_${dist.value.player_name.toLowerCase().replace(/\s+/g, "_")}_${dist.value.metric}.csv`,
    ["Game ID", "Game Date", "Team", "Opponent", "Venue", "Minutes", dist.value.metric],
    dist.value.samples.map(s => [s.game_id, s.game_date, s.team_tricode, s.opponent_tricode, s.is_home ? "Home" : "Away", s.minutes ?? "", s.value ?? ""]));
  const metricField = (options: readonly (readonly [string, string])[]) => <Field label="Metric" layout="inline"><Select aria-label="Metric" value={metric} onChange={e => set({ metric: e.target.value })}>{!options.some(([key]) => key === metric) && <option value={metric}>{metricLabel(metric)}</option>}{options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></Field>;
  const playerName = dist?.value?.player_name ?? splits?.value?.player_name;
  const lookup = <PlayerLookup label="Target player" prefix="Target" name={playerName} releaseId={releaseId} season={season} phase={phase} beforeDate={beforeDate} onSelect={id => set({ playerId: id, player_id: null })} />;
  const filters = tab === "splits" ? lookup : tab === "distribution" ? <>{lookup}{metricField(METRICS)}<Field label="Games" layout="inline"><Select aria-label="Window (games)" value={String(windowN)} onChange={e => set({ windowN: e.target.value, window: null })}>{WINDOWS.map(([n, label]) => <option key={n} value={n}>{label}</option>)}</Select></Field></>
    : tab === "rank" ? <>{metricField(RANK_METRICS)}
      <Field label="Measure" layout="inline"><Select aria-label="Dispersion measure" value={measure} onChange={e => set({ measure: e.target.value })}><option value="iqr">Interquartile range</option><option value="population_sd">Standard deviation</option></Select></Field>
      <Field label="Order" layout="inline"><Select aria-label="Sort order" value={direction} onChange={e => set({ rankDirection: e.target.value })}><option value="desc">Highest dispersion (most volatile)</option><option value="asc">Lowest dispersion (most consistent)</option></Select></Field></>
    : undefined;
  const failed = active?.error && <div role="alert"><GatedNote tone="warning" action={<button className="button" onClick={() => setRetry(v => v + 1)}>Retry</button>}>{TABS.find(t => t.value === tab)?.label} unavailable: {active.error}</GatedNote></div>;
  const loading = !active && (tab === "opponent" || tab === "rank" || playerId) && <ResearchBodySkeleton tiles={tab === "distribution" ? 4 : 3} />;
  const d = dist?.value, sp = splits?.value, opp = opponent?.value, rk = rank?.value;
  const backToBack = sp?.rest_splits.find(b => /back-to-back/i.test(b.bucket_label));
  const stingiest = opp?.allowances.find(team => team.league_rank_pts_allowed === 1) ?? opp?.allowances[0];

  return <PageShell template="research" className="research-view distributions-view">
    <PageHeader title="Distributions & Splits" subtitle="Game-to-game spread, venue and rest splits, and opponent defensive context." actions={<>
      <button type="button" className="button" onClick={share}>Share Link</button>
      {tab === "distribution" && d && <button type="button" className="button" onClick={exportCsv}>Export CSV</button>}
      <Link href="/stats" className="button button-primary">Open in Stats</Link>
    </>} />
    <ContextBar initialReleaseId={releaseId ?? undefined} initialSeason={season || undefined} initialPhase={phase} initialBeforeDate={beforeDate ?? undefined} showWindow={false}
      filters={filters}
      modes={<SegmentedControl<Tab> name="Distributions view" value={tab} onChange={next => set({ tab: next })} options={TABS} />}
      detailRows={evidenceRows(active?.value, TABS.find(t => t.value === tab)?.label)} />
    {catalog === null && <div role="status"><GatedNote>Context catalog unavailable. Explicit URL scope is retained; reload to retry.</GatedNote></div>}
    {loading}{failed}

    {tab === "distribution" && d && <ResearchLayout findings={<>
      <StatTile label="Median" value={d.summary.median} unit={` ${d.metric_unit}`} footnote={`Mean ${d.summary.mean ?? "—"}`} />
      <StatTile label="Middle 50%" value={d.summary.p25 === null ? null : `${d.summary.p25}–${d.summary.p75}`} footnote={`IQR ${d.summary.iqr ?? "—"}`} />
      <StatTile label="Middle 80%" value={d.summary.p10 === null ? null : `${d.summary.p10}–${d.summary.p90}`} footnote={`SD ${d.summary.population_sd ?? "—"}`} />
      <StatTile label="Games" value={d.summary.n} footnote={`Range ${d.summary.min ?? "—"}–${d.summary.max ?? "—"}`} />
    </>}>
      <PlayerIdentity playerId={d.player_id} name={d.player_name} team={d.samples.at(-1)?.team_tricode} subtitle={`${d.metric_display_name} · ${d.season}`} size="lg" href={`/players/${d.player_id}`} />
      {!d.summary.summary_available && <GatedNote why={<p>CourtLens requires at least 5 confirmed appearances before estimating percentiles or dispersion.</p>}>{d.summary.reason ?? "Too few games for percentiles."}</GatedNote>}
      {d.summary.summary_available && <Strip data={d} />}
      <div className="table-wrapper research-table" role="region" aria-label="Appearance samples" tabIndex={0}>
        <table className="data-table"><caption>{d.samples.length} games · {d.metric_display_name} ({d.metric_unit})</caption>
          <thead><tr><th>Date</th><th>Team</th><th>Opponent</th><th>Venue</th><th className="num">Minutes</th><th className="num">{d.metric_display_name}</th></tr></thead>
          <tbody>{d.samples.map(s => <tr key={s.game_id}><th scope="row">{formatDate(s.game_date)}</th><td><span className="research-team"><TeamLogo team={s.team_tricode} size={16} />{s.team_tricode}</span></td><td><span className="research-team"><TeamLogo team={s.opponent_tricode} size={16} />{s.opponent_tricode}</span></td><td>{s.is_home ? "Home" : "Away"}</td><td className="num">{s.minutes !== null ? s.minutes.toFixed(1) : "—"}</td><td className="num">{s.value ?? "—"}</td></tr>)}</tbody>
        </table>
      </div>
      <Disclosures items={d.disclosures}>Sample percentiles (type 7) from games before the cutoff; descriptive only.</Disclosures>
    </ResearchLayout>}

    {tab === "splits" && sp && <ResearchLayout findings={<>
      {sp.venue_splits.slice(0, 2).map(b => <StatTile key={b.bucket_key} label={`${b.bucket_label} PTS/G`} value={b.metrics.pts_per_game} footnote={`${b.games_played} games · TS ${pct(b.metrics.ts_pct)}`} />)}
      {backToBack && <StatTile label="Back-to-Back PTS/G" value={backToBack.metrics.pts_per_game} footnote={`${backToBack.games_played} games`} />}
    </>}>
      <PlayerIdentity playerId={sp.player_id} name={sp.player_name} subtitle={sp.season} size="lg" href={`/players/${sp.player_id}`} />
      <SplitTable label={`Venue splits · ${sp.player_name}`} rows={sp.venue_splits} />
      <GatedNote why={<p>Team rest days measure full local calendar days elapsed between scheduled team games (max(0, delta_days - 1), where 0 = back-to-back). Gaps between individual player appearances are reported separately as descriptive appearance intervals and do not prove rest, benching, or injury.</p>}>Rest counts days between the team&apos;s scheduled games, not the player&apos;s appearances.</GatedNote>
      <SplitTable label={`Team rest splits · ${sp.player_name}`} rows={sp.rest_splits} rest />
      <Disclosures items={sp.disclosures}>Splits partition the same games; small buckets are noisy.</Disclosures>
    </ResearchLayout>}

    {tab === "opponent" && opp && <ResearchLayout findings={<>
      <StatTile label="Teams" value={opp.teams_analyzed} footnote="Defensive allowances in scope" />
      <StatTile label="Fewest Points Allowed" value={stingiest ? stingiest.pts_allowed_per_game.toFixed(1) : null} footnote={stingiest?.opponent_name} />
      <StatTile label="League Average Allowed" value={opp.allowances.length ? (opp.allowances.reduce((sum, t) => sum + t.pts_allowed_per_game, 0) / opp.allowances.length).toFixed(1) : null} footnote="Points per game" />
    </>}>
      <div className="table-wrapper research-table" role="region" aria-label="Defensive allowances" tabIndex={0}>
        <table className="data-table"><caption>Defensive allowances per game · rank 1 allows the fewest points</caption>
          <thead><tr><th className="num">Rank</th><th>Team</th><th className="num">Games</th><th className="num">PTS Allowed</th><th className="num">FG% Allowed</th><th className="num">3P% Allowed</th><th className="num">REB Allowed</th><th className="num">AST Allowed</th><th className="num">TOV Forced</th></tr></thead>
          <tbody>{opp.allowances.map(team => <tr key={team.opponent_team_id}><td className="num">{team.league_rank_pts_allowed ?? "—"}</td><th scope="row"><span className="research-team"><TeamLogo team={team.opponent_tricode} size={16} />{team.opponent_name}</span></th><td className="num">{team.games_observed}</td><td className="num">{team.pts_allowed_per_game.toFixed(1)}</td><td className="num">{pct(team.fg_pct_allowed)}</td><td className="num">{pct(team.fg3_pct_allowed)}</td><td className="num">{team.reb_allowed_per_game.toFixed(1)}</td><td className="num">{team.ast_allowed_per_game.toFixed(1)}</td><td className="num">{team.tov_forced_per_game.toFixed(1)}</td></tr>)}</tbody>
        </table>
      </div>
      <Disclosures items={opp.disclosures}>Allowances use games before the cutoff.</Disclosures>
    </ResearchLayout>}

    {tab === "rank" && rk && <ResearchLayout findings={<>
      <StatTile label="Eligible Players" value={rk.total_eligible} footnote="At least 10 appearances" />
      <StatTile label={direction === "desc" ? "Most Volatile" : "Most Consistent"} value={rk.items[0]?.delta_value ?? null} footnote={rk.items[0]?.player_name} />
      <StatTile label="Measure" value={measure === "iqr" ? "IQR" : "SD"} footnote={metricLabel(metric)} />
    </>}>
      <div className="table-wrapper research-table" role="region" aria-label="Dispersion ranking" tabIndex={0}>
        <table className="data-table"><caption>{metricLabel(metric)} · {measure === "iqr" ? "interquartile range" : "standard deviation"}</caption>
          <thead><tr><th className="num">Rank</th><th>Player</th><th>Team</th><th className="num">Games</th><th className="num">Minutes</th><th className="num">{measure === "iqr" ? "IQR" : "SD"}</th><th><span className="sr-only">Action</span></th></tr></thead>
          <tbody>{rk.items.map(item => <tr key={item.player_id}><td className="num">{item.rank}</td><th scope="row">{item.player_name}</th><td>{item.team_tricode ? <span className="research-team"><TeamLogo team={item.team_tricode} size={16} />{item.team_tricode}</span> : "—"}</td><td className="num">{item.games_played}</td><td className="num">{item.total_minutes}</td><td className="num">{item.delta_value ?? "—"}</td><td><button type="button" className="button button-small" onClick={() => set({ tab: "distribution", playerId: item.player_id, player_id: null })}>View Distribution</button></td></tr>)}</tbody>
        </table>
      </div>
      <Disclosures items={rk.disclosures}>Descriptive dispersion only; not injury risk or future volatility.</Disclosures>
    </ResearchLayout>}
  </PageShell>;
}
