"use client";
import Link from "next/link";
import { useState } from "react";
import { getTeamDetail } from "@/lib/workbench-api";
import { downloadResearch } from "@/lib/advanced-research";
import type { TeamDetailResponse } from "@/lib/types";

export function RosterAllocationView() {
  const [team, setTeam] = useState(""); const [season, setSeason] = useState("2025-26");
  const [phase, setPhase] = useState("regular_season"); const [cutoff, setCutoff] = useState("2026-07-01");
  const [release, setRelease] = useState(""); const [data, setData] = useState<TeamDetailResponse | null>(null);
  const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("observed"); const [positions, setPositions] = useState<Record<string,string>>({});
  const [minutes, setMinutes] = useState<Record<string,string>>({});
  const rows = data?.player_cohort ?? [];
  const allocations = rows.map(row => ({...row, allocation_position: positions[row.player_id] ?? "Unassigned", allocation_minutes: mode === "observed" ? row.total_minutes : minutes[row.player_id]?.trim() ? Number(minutes[row.player_id]) : null}));
  const invalid = allocations.some(row => row.allocation_minutes != null && (!Number.isFinite(row.allocation_minutes) || row.allocation_minutes < 0));
  const total = allocations.reduce((sum,row) => sum + (row.allocation_minutes != null && Number.isFinite(row.allocation_minutes) && row.allocation_minutes >= 0 ? row.allocation_minutes : 0),0);
  return <div className="advanced-research"><h1>Roster allocation diagrams</h1><p>Observed team participation and explicit user projections. Minute share describes an allocation; shape fit does not measure causal team compatibility.</p>
    <form className="panel research-links" onSubmit={async e => { e.preventDefault(); setLoading(true); setError(""); setData(null); setPositions({}); setMinutes({}); try {setData(await getTeamDetail(team,{season,phase,beforeDate:cutoff,releaseId:release || undefined}));} catch(err) {setError((err as Error).message);} finally {setLoading(false);} }}>
      <label>Team ID<input required value={team} onChange={e => setTeam(e.target.value)} /></label><label>Season<input required value={season} onChange={e => setSeason(e.target.value)} /></label>
      <label>Phase<select value={phase} onChange={e => setPhase(e.target.value)}><option value="regular_season">Regular season</option><option value="playoffs">Postseason</option><option value="preseason">Preseason</option></select></label>
      <label>Exclusive cutoff<input type="date" required value={cutoff} onChange={e => setCutoff(e.target.value)} /></label><label>Release ID (optional)<input value={release} onChange={e => setRelease(e.target.value)} /></label><button className="button" disabled={loading}>Load participation</button>
    </form>
    {loading && <p role="status">Loading observed team minutes…</p>}{error && <p role="alert">Allocation unavailable: {error}</p>}
    {data && <section className="panel" aria-label="Roster allocations"><h2>{data.team.name} · participation cohort</h2><p>Source: release-bound team player-game boxes. Observed total minutes are team-stint minutes within the returned context, including traded participants. These rows do not establish a current roster, lineup or positional assignment.</p><details><summary>Resolved source context</summary><pre className="research-document">{JSON.stringify(data.context,null,2)}</pre></details>{data.warnings.map((w,i) => <p className="notice" key={i}>{w}</p>)}
      <label>Allocation basis <select value={mode} onChange={e => setMode(e.target.value)}><option value="observed">Observed total minutes</option><option value="projected">User-projected minutes per game</option></select></label>
      <p>Unknown allocations: {allocations.filter(row => row.allocation_minutes == null).length}. Positions are user-assigned diagram labels; unassigned players remain unassigned. {mode === "projected" ? "Projected inputs start unknown. A regulation team rotation normally allocates 240 player-minutes per game; overtime and incomplete projections may differ." : "Shares use the sum of returned nonnegative observed player minutes."}</p>
      {invalid && <p role="alert">Minutes must be finite and nonnegative. Export is unavailable until corrected.</p>}
      {!invalid && <><h3>{mode === "observed" ? "Observed" : "Projected"} minute allocation · known total {total.toFixed(1)}</h3>{["PG","SG","SF","PF","C","Unassigned"].map(position => { const value = allocations.filter(row => row.allocation_position === position).reduce((sum,row) => sum+(row.allocation_minutes ?? 0),0); return <div className="allocation-row" key={position}><span>{position}</span><meter min="0" max={total || 1} value={value}>{value}</meter><strong>{value.toFixed(1)} · {total > 0 ? (100*value/total).toFixed(1) : "—"}%</strong></div>; })}</>}
      <div className="table-wrapper" role="region" aria-label="Player allocation inputs" tabIndex={0}><table className="data-table"><thead><tr><th>Player</th><th>Observed games</th><th>Observed minutes</th><th>User position</th><th>Projected minutes/game</th></tr></thead><tbody>{allocations.map(row => <tr key={row.player_id}><th><Link href={`/players/${row.player_id}`}>{row.player_name}</Link></th><td>{row.games_played}</td><td>{row.total_minutes ?? "—"}</td><td><select aria-label={`Position for ${row.player_name}`} value={row.allocation_position} onChange={e => setPositions({...positions,[row.player_id]:e.target.value})}>{["Unassigned","PG","SG","SF","PF","C"].map(p => <option key={p}>{p}</option>)}</select></td><td><input aria-label={`Projected minutes for ${row.player_name}`} type="number" min="0" step="0.1" disabled={mode !== "projected"} value={minutes[row.player_id] ?? ""} onChange={e => setMinutes({...minutes,[row.player_id]:e.target.value})} /></td></tr>)}</tbody></table></div>
      {!rows.length && <p>No observed participation in this scope. Missing participation is not a confirmed zero or roster exclusion.</p>}
      <button className="button" disabled={invalid || !rows.length} onClick={() => downloadResearch("courtload-roster-allocation.json",{version:"roster-minute-allocation-v1",context:data.context,team:data.team,source:"team-detail-player-game-boxes",basis:mode,position_source:"user_assigned",units:mode === "observed" ? "total_team_stint_minutes" : "projected_minutes_per_game",allocations,warnings:data.warnings})}>Export allocation inputs JSON</button>
    </section>}
    <p className="notice">Impact sizing requires admitted registered coefficients. Financial sizing requires admitted contract amounts and a value model. Defensive load, current-roster association and observed positional minutes remain unavailable without their own input evidence.</p>
  </div>;
}
