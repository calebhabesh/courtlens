"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { buildPreservedContextUrl } from "@/lib/query-url";
import { formatDate } from "@/lib/format-date";
import type { TeamDetailResponse, TeamFourFactorsResponse, TeamScheduleResponse, TeamPeersResponse, TeamResearchItem, WorkbenchCatalog } from "@/lib/types";
import { ContextBar } from "./context-bar";
import { EntityField } from "./entity-picker";
import { TeamLogo } from "./team-logo";
import { CompareLayout } from "./ui/page-shell";
import { TeamIdentity } from "./ui/identity";
import { ComparisonRows, type ComparisonRow } from "./ui/comparison-rows";
import { SegmentedControl } from "./ui/segmented-control";
import { GatedNote } from "./ui/gated-note";
import { Icon } from "./ui/icon";

interface TeamCompareViewProps {
  teamsList: TeamResearchItem[];
  teamAId: string; teamBId: string;
  teamADetail: TeamDetailResponse | null; teamBDetail: TeamDetailResponse | null;
  teamAFourFactors: TeamFourFactorsResponse | null; teamBFourFactors: TeamFourFactorsResponse | null;
  teamASchedule: TeamScheduleResponse | null; teamBSchedule: TeamScheduleResponse | null;
  teamAPeers: TeamPeersResponse | null; teamBPeers: TeamPeersResponse | null;
  season: string; phase: string; beforeDate: string;
  catalog: WorkbenchCatalog | null; releaseId?: string;
}
const number = (v: number | null | undefined) => v == null ? "—" : v.toFixed(1);
const percentage = (v: number | null | undefined) => v == null ? "—" : `${(v * 100).toFixed(1)}%`;
const margin = (d: TeamDetailResponse | null) => d?.production.pts_per_game == null || d.allowance.pts_allowed_per_game == null ? null : d.production.pts_per_game - d.allowance.pts_allowed_per_game;

export function TeamCompareView(p: TeamCompareViewProps) {
  const router = useRouter(), params = useSearchParams();
  const [a,setA] = useState(p.teamAId), [b,setB] = useState(p.teamBId);
  const [previous,setPrevious] = useState(`${p.teamAId}/${p.teamBId}`);
  if(previous !== `${p.teamAId}/${p.teamBId}`) {setPrevious(`${p.teamAId}/${p.teamBId}`);setA(p.teamAId);setB(p.teamBId);}
  const activeTab = params.get("tab") || "overview";
  const [regressionA,setRegressionA] = useState(100), [regressionB,setRegressionB] = useState(100);
  function change(nextA: string, nextB: string) {
    setA(nextA);setB(nextB);
    if(nextA && nextB && nextA !== nextB) router.push(buildPreservedContextUrl(`/team-compare?teamA=${nextA}&teamB=${nextB}&season=${p.season}&phase=${p.phase}&beforeDate=${p.beforeDate}&releaseId=${p.releaseId ?? ""}`, params));
  }
  function tab(value: string) {const next = new URLSearchParams(params.toString());next.set("tab",value);router.push(`/team-compare?${next}`);}
  const names: [string,string] = [p.teamADetail?.team.name ?? "Team A",p.teamBDetail?.team.name ?? "Team B"];
  const details = [p.teamADetail,p.teamBDetail];
  const factors = [p.teamAFourFactors,p.teamBFourFactors];
  const schedules = [p.teamASchedule,p.teamBSchedule];
  const games = p.teamASchedule?.games.filter(g => g.opponent_id === p.teamBId || Boolean(p.teamBDetail?.team.tricode && g.opponent_tricode === p.teamBDetail.team.tricode)) ?? [];
  const scored = games.filter(g => g.team_points != null && g.opponent_points != null);
  const rows: ComparisonRow[] = [
    {key:"gp",label:"Games Played",a:p.teamADetail?.record.games_played,b:p.teamBDetail?.record.games_played},
    {key:"wins",label:"Wins",a:p.teamADetail?.record.wins,b:p.teamBDetail?.record.wins},
    {key:"winpct",label:"Win Percentage",a:p.teamADetail?.record.win_pct,b:p.teamBDetail?.record.win_pct,formattedA:percentage(p.teamADetail?.record.win_pct),formattedB:percentage(p.teamBDetail?.record.win_pct)},
    ...[["pts_per_game","Points Per Game"],["fg_pct","Field Goal %"],["fg3_pct","Three-Point %"],["ft_pct","Free Throw %"]].map(([key,label]) => ({key,label,a:p.teamADetail?.production[key],b:p.teamBDetail?.production[key],formattedA:key.endsWith("pct") ? percentage(p.teamADetail?.production[key]) : number(p.teamADetail?.production[key]),formattedB:key.endsWith("pct") ? percentage(p.teamBDetail?.production[key]) : number(p.teamBDetail?.production[key])})),
    {key:"allowed",label:"Opponent PPG Allowed",a:p.teamADetail?.allowance.pts_allowed_per_game,b:p.teamBDetail?.allowance.pts_allowed_per_game,formattedA:number(p.teamADetail?.allowance.pts_allowed_per_game),formattedB:number(p.teamBDetail?.allowance.pts_allowed_per_game)},
    {key:"oppfg",label:"Opponent FG % Allowed",a:p.teamADetail?.allowance.fg_pct_allowed,b:p.teamBDetail?.allowance.fg_pct_allowed,formattedA:percentage(p.teamADetail?.allowance.fg_pct_allowed),formattedB:percentage(p.teamBDetail?.allowance.fg_pct_allowed)},
    {key:"margin",label:"Net Scoring Margin",a:margin(p.teamADetail),b:margin(p.teamBDetail),formattedA:number(margin(p.teamADetail)),formattedB:number(margin(p.teamBDetail))}
  ];
  function factorRows(group: "ratings" | "offense_factors" | "defense_factors"): ComparisonRow[] {
    const keys = [...new Set(factors.flatMap(f => f?.[group]?.map(m => m.key) ?? []))];
    return keys.map(key => {
      const first=factors[0]?.[group]?.find(f => f.key === key), second=factors[1]?.[group]?.find(f => f.key === key), metric=first ?? second!;
      const fmt=metric.unit === "percentage" ? percentage : number;
      // Team analytics already counts worse values using each metric's good direction.
      return {key,label:metric.display_name,a:first?.value,b:second?.value,formattedA:fmt(first?.value),formattedB:fmt(second?.value),percentileA:first?.value != null ? first.percentile : null,percentileB:second?.value != null ? second.percentile : null};
    });
  }
  const scope={releaseId:p.releaseId ?? null,season:p.season,phase:p.phase,beforeDate:p.beforeDate};
  return <div className="team-compare-container fo11-team-body">
    <ContextBar catalog={p.catalog ?? undefined} initialReleaseId={p.releaseId} initialSeason={p.season} initialPhase={p.phase} initialBeforeDate={p.beforeDate} showWindow={false}
      modes={<SegmentedControl name="Comparison tabs" value={activeTab} onChange={tab} options={[{value:"overview",label:"Overview & H2H"},{value:"factors",label:"Four Factors"},{value:"three_point",label:"3P Variation"},{value:"roster",label:"Participation Cohorts"},{value:"peers",label:"Similar Peers"}]} />}
      detailRows={[{label:"Team A identity",value:p.teamAId},{label:"Team B identity",value:p.teamBId},...details.filter(Boolean).map(d => ({label:"Resolved context",value:JSON.stringify(d!.context),mono:true})),...[p.teamADetail,p.teamBDetail,p.teamASchedule,p.teamBSchedule,p.teamAPeers,p.teamBPeers].filter(Boolean).flatMap(source => (source!.warnings ?? []).map(value=>({label:"Source warning",value}))),...factors.filter(Boolean).flatMap(f => [...f!.warnings.map(value => ({label:"Source warning",value})),...f!.offense_factors.concat(f!.defense_factors).map(m => ({label:m.display_name,value:`${m.formula}; weight ${m.weight == null ? "unknown" : m.weight * 100 + "%"}; rank ${m.rank ?? "unknown"}; cohort ${m.total_teams} teams`}))])]} />
    <div className="fo11-selectors">
      <EntityField {...scope} label="Team A" kind="team" value={a} initialName={p.teamADetail?.team.name} excludedIds={[b]} onChange={id=>change(id,b)} />
      <EntityField {...scope} label="Team B" kind="team" value={b} initialName={p.teamBDetail?.team.name} excludedIds={[a]} onChange={id=>change(a,id)} />
      <button className="button" disabled={!a || !b} onClick={()=>change(b,a)}><Icon name="swap" size={14} />Swap Teams</button>
    </div>
    <CompareLayout sides={details.map((d,i) => <TeamIdentity key={i} team={d?.team.tricode ?? (i === 0 ? p.teamAId : p.teamBId)} name={d?.team.name} size="xl" subtitle={d ? `${d.record.wins}–${d.record.losses} · ${d.record.games_played} GP` : "Team data unavailable"} />)}>
      {activeTab === "overview" && <>
        <ComparisonRows rows={rows} names={names} />
        <div className="fo11-team-splits">{details.map((d,i) => <div key={i}><h3>{names[i]}</h3><p>Home: {schedules[i] ? `${schedules[i]!.home_split.wins}–${schedules[i]!.home_split.losses}` : "—"} · Away: {schedules[i] ? `${schedules[i]!.away_split.wins}–${schedules[i]!.away_split.losses}` : "—"} · Streak: {d?.current_streak ?? "—"}</p></div>)}</div>
        <section className="panel"><h2>Head-to-Head Series & Matchup History</h2>
          <p>{p.teamASchedule ? `${games.filter(g=>g.is_win === true).length}–${games.filter(g=>g.is_win === false).length} observed record` : "Head-to-head coverage unavailable"}{scored.length ? ` · ${number(scored.reduce((sum,g)=>sum+g.team_points!-g.opponent_points!,0)/scored.length)} average margin (${scored.length} scored games)` : ""}</p>
          {games.length ? <div className="table-wrapper"><table className="data-table"><thead><tr><th>Date</th><th>Home / Away</th><th className="num">Team A Points</th><th className="num">Team B Points</th><th>Outcome</th></tr></thead><tbody>{games.map(g=><tr key={g.game_id}><th>{formatDate(g.game_date)}</th><td>{g.side}</td><td className="num">{g.team_points ?? "—"}</td><td className="num">{g.opponent_points ?? "—"}</td><td>{g.is_win == null ? "Unknown" : g.is_win ? "Team A win" : "Team B win"}</td></tr>)}</tbody></table></div> : <GatedNote>No verified head-to-head games in this scope.</GatedNote>}
        </section>
      </>}
      {activeTab === "factors" && <>{(["ratings","offense_factors","defense_factors"] as const).map((group,i)=><section className="panel" key={group}><h2>{["Pace & Efficiency Ratings","Offensive Four Factors Comparison","Defensive Four Factors (Allowed) Comparison"][i]}</h2>{factorRows(group).length ? <ComparisonRows rows={factorRows(group)} names={names} /> : <GatedNote>Factor data unavailable.</GatedNote>}</section>)}</>}
      {activeTab === "three_point" && <section className="panel"><h2>Three-Point Variation What-If Scenario Comparison</h2><div className="fo11-team-splits">{factors.map((f,i)=>{
        const s=f?.three_point_scenario, regression=i === 0 ? regressionA : regressionB;
        if(!s || !f || f.games_played <= 0) return <GatedNote key={i}>Scenario unavailable for {names[i]}.</GatedNote>;
        const target=s.observed_3p_pct+regression/100*(s.league_3p_pct-s.observed_3p_pct);
        const delta=Math.round((target*s.observed_fg3a-s.observed_fg3m)*3);
        const rating=f.pace != null && f.pace > 0 ? delta*100/(f.pace*f.games_played) : null;
        return <div key={i}><h3><TeamLogo team={details[i]?.team.tricode ?? (i === 0 ? p.teamAId : p.teamBId)} size={20} />{names[i]}</h3><label>Regression to League Mean: {regression}%<input aria-label={`${i === 0 ? "Team A" : "Team B"} regression to league mean`} type="range" min={0} max={100} step={5} value={regression} onChange={e=>(i === 0 ? setRegressionA : setRegressionB)(Number(e.target.value))} /></label><dl><dt>Observed 3P%</dt><dd>{percentage(s.observed_3p_pct)}</dd><dt>Simulated 3P%</dt><dd>{percentage(target)}</dd><dt>Point Differential (Season)</dt><dd>{delta}</dd><dt>Hypothetical PPG</dt><dd>{number(s.actual_ppg+delta/f.games_played)}</dd><dt>Simulated ORTG Impact</dt><dd>{number(rating)}</dd></dl></div>;
      })}</div><GatedNote why={<><p>Feature F18 evaluates counterfactual what-if arithmetic holding observed 3P attempt volumes strictly constant. It is not an injury adjustment, luck-removal guarantee, or causal predictor.</p>{factors.map((f,i)=><p key={i}>{f?.three_point_scenario?.disclaimer}</p>)}</>}>Hypothetical arithmetic with fixed attempt volumes.</GatedNote></section>}
      {activeTab === "roster" && <><div className="fo11-team-splits">{details.map((d,i)=><section className="panel" key={i}><h2>{names[i]} Participation Cohort</h2><div className="table-wrapper"><table className="data-table"><thead><tr><th>Player</th><th className="num">Stint GP</th><th className="num">Minutes</th><th className="num">PPG</th></tr></thead><tbody>{d?.player_cohort.slice(0,15).map(player=><tr key={player.player_id}><th><Link href={buildPreservedContextUrl(`/players/${player.player_id}`,params)}>{player.player_name}</Link></th><td className="num">{player.games_played}</td><td className="num">{player.total_minutes.toFixed(0)}</td><td className="num">{number(player.points_per_game)}</td></tr>)}</tbody></table></div></section>)}</div><GatedNote why="Player rows represent all individuals with verified on-court minutes for the franchise during this season window (for example, Toronto’s 31-player cohort across in-season trades). This is an empirical accounting of court exposure, not a contractual or end-of-season roster claim.">Season participation, distinct from a current roster.</GatedNote></>}
      {activeTab === "peers" && <div className="fo11-team-splits">{[p.teamAPeers,p.teamBPeers].map((peers,i)=><section className="panel" key={i}><h2>{names[i]} Statistical Peers</h2><div className="table-wrapper"><table className="data-table"><thead><tr><th>Franchise</th><th className="num">Similarity</th><th className="num">Distance</th><th>Action</th></tr></thead><tbody>{peers?.peers.map(peer=><tr key={peer.team_id}><th><TeamLogo team={peer.tricode} size={20} />{peer.name}</th><td className="num">{percentage(peer.similarity_score)}</td><td className="num">{peer.distance.toFixed(3)}</td><td><button className="button" onClick={()=>i === 0 ? change(a,peer.team_id) : change(peer.team_id,b)}>Compare</button></td></tr>)}</tbody></table></div>{!peers?.peers.length && <GatedNote>No eligible peers in this scope.</GatedNote>}</section>)}</div>}
      <GatedNote why={<><p>Dean Oliver Four Factors weights: Shooting (eFG% 40%), Turnovers (TOV% 25%), Rebounding (ORB% 20%), Free Throws (FTR 15%).</p><p>Ties in record ordering do not establish official conference placement.</p><p>CourtLens never invents a “winner probability” or automated matchup prediction from overlapping prediction intervals or descriptive differences.</p><p>Bar length shows absolute magnitude; the signed value stays visible. The larger value is bold without implying that it is better. Team percentiles are supplied by the API and already account for each metric’s good direction.</p></>}>Descriptive comparisons of verified games.</GatedNote>
    </CompareLayout>
  </div>;
}
