import { ResearchResultsView } from "@/components/research-results-view";
import { ImpactDisclosure } from "@/components/impact-disclosure";
import { getImpact } from "@/lib/workbench-api";
import { IMPACT_COLUMNS, formatStatValue } from "@/lib/stats-presets";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const season = typeof params.season === "string" ? params.season : "2025-26";
  const phase = typeof params.phase === "string" ? params.phase : "regular_season";
  const beforeDate = typeof params.beforeDate === "string" ? params.beforeDate : "2026-07-01";
  const data = await getImpact({ season, phase, beforeDate }).catch(() => null);
  const metrics = ["rapm", "orapm", "drapm", "bpr", "rapm_2y", "rapm_3y"];
  return <div className="workbench-content">
    <h1>CourtLens descriptive impact</h1>
    <p>Served public-source estimates with declared windows and samples.</p>
    <form className="control-button-group" action="/research/rapm">
      <label>Season <select name="season" defaultValue={season}>{["2023-24", "2024-25", "2025-26"].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Phase <select name="phase" defaultValue={phase}><option value="regular_season">Regular season</option><option value="playoffs">Playoffs</option></select></label>
      <label>Before date <input type="date" name="beforeDate" defaultValue={beforeDate} /></label>
      <button className="button" type="submit">Apply scope</button>
    </form>
    {!data ? <p role="alert">Impact serving unavailable. Restore the local API connection.</p> : <>
      <ImpactDisclosure data={data} />
      <div className="table-wrapper" role="region" aria-label="Served impact ratings" tabIndex={0}>
        <table className="data-table"><thead><tr><th>Player</th>{metrics.map(key => <th key={key} title={IMPACT_COLUMNS[key].tooltip}>{IMPACT_COLUMNS[key].label}</th>)}<th>1Y games</th><th>1Y minutes</th></tr></thead>
          <tbody>{data.players.length ? data.players.map(player => <tr key={player.player_id}>
            <th><Link href={`/players/${player.player_id}?${new URLSearchParams({ season, phase, beforeDate })}`}>{player.player_name}</Link></th>
            {metrics.map(key => <td key={key}>{formatStatValue(player.metrics[key], 2)}</td>)}
            <td>{player.support.rapm?.games ?? "—"}</td><td>{player.support.rapm?.seconds == null ? "—" : (player.support.rapm.seconds / 60).toFixed(1)}</td>
          </tr>) : <tr><td colSpan={9}>No qualified rating sample for this scope.</td></tr>}</tbody>
        </table>
      </div>
      <p>Showing up to 20 players by qualified 1Y RAPM. Units: points per 100 counted controls. <Link href={`/stats?${new URLSearchParams({ season, phase, beforeDate, viewId: "impact", sortMetric: "rapm" })}`}>Explore all available players in Stats</Link></p>
    </>}
    <section aria-label="B26 preregistered experiment status"><h2>B26 preregistered experiment</h2>
      <p>The descriptive serving artifacts above do not execute or promote this frozen out-of-time experiment.</p>
      <ResearchResultsView experiment="courtload-rapm-v1" embedded />
    </section>
  </div>;
}
