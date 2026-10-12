import { RankedBars } from "@/components/charts";
import { PlayerIdentity } from "@/components/ui/identity";
import { Suspense } from "react";
import Link from "next/link";
import { ResearchResultsView } from "@/components/research-results-view";
import { ImpactDisclosure } from "@/components/impact-disclosure";
import { ContextBar } from "@/components/context-bar";
import { GatedNote } from "@/components/ui/gated-note";
import { ResearchLayout } from "@/components/ui/page-shell";
import { StatTile } from "@/components/ui/stat-tile";
import { getImpact } from "@/lib/workbench-api";
import { IMPACT_COLUMNS, formatStatValue } from "@/lib/stats-presets";
import { formatDate } from "@/lib/format-date";

export const dynamic = "force-dynamic";

const METRICS = ["rapm", "orapm", "drapm", "bpr", "rapm_2y", "rapm_3y"];

export default async function Page({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const read = (key: string, fallback: string) => typeof params[key] === "string" ? params[key] as string : fallback;
  const season = read("season", "2025-26");
  const phase = read("phase", "regular_season");
  const beforeDate = read("beforeDate", "2026-07-01");
  const data = await getImpact({ season, phase, beforeDate }).catch(() => null);
  const scope = new URLSearchParams({ season, phase, beforeDate });
  const coverage = data?.coverage.find(row => row.season === season && row.phase === phase);
  const fit = data?.artifacts.find(artifact => artifact.years === 1 && artifact.season === season && artifact.phase === phase);
  const leader = data?.players.find(player => player.metrics.rapm != null);
  const detailRows = data ? [
    { label: "Serving version", value: data.version, mono: true },
    { label: "Manifest SHA-256", value: data.manifest_sha256, mono: true },
    ...data.artifacts.map(artifact => ({ label: `${artifact.years}Y fit (${artifact.seasons.join(" / ")})`, value: `${artifact.sha256} · exclusive fit cutoff ${artifact.cutoff} · games through ${artifact.last_included_date}`, mono: true }))
  ] : [];
  return <>
    <Suspense fallback={<div className="ui-filter-bar" aria-hidden="true" />}>
      <ContextBar initialSeason={season} initialPhase={phase} initialBeforeDate={beforeDate} showWindow={false} sampleNoun="players" sampleSize={data?.total_players} detailRows={detailRows} />
    </Suspense>
    {!data ? <div role="alert"><GatedNote tone="warning" action={<Link className="button" href={`/research/rapm?${scope}`}>Retry</Link>}>Impact serving unavailable. Restore the local API connection.</GatedNote></div> :
      <ResearchLayout headline={data.status === "available" && <RankedBars title="Qualified 1Y RAPM leaders" source="CourtLens sealed IM04 lineup model" sample={`${data.total_players} served players · ${coverage?.admitted_games ?? "unknown"} admitted games`}
        measure="points per 100 counted controls" tone="identity-b" note="Blue = 1Y RAPM; descriptive under lineup confounding. No uncertainty interval is served."
        items={data.players.filter(p => p.metrics.rapm != null).slice(0, 5).map(p => ({key: p.player_id, name: p.player_name, label: <PlayerIdentity playerId={p.player_id} name={p.player_name} href={`/players/${p.player_id}?${scope}`} size="sm" />, value: p.metrics.rapm!, formatted: formatStatValue(p.metrics.rapm, 2), detail: `${p.support.rapm?.games ?? "unknown"} games · ${p.support.rapm?.seconds == null ? "unknown" : Math.round(p.support.rapm.seconds / 60)} minutes`}))} />} findings={data.status === "available" ? <>
        <StatTile label="Top 1Y RAPM" value={leader ? formatStatValue(leader.metrics.rapm, 2) : null} footnote={leader?.player_name} />
        <StatTile label="Rated Players" value={data.total_players.toLocaleString("en-US")} footnote="In the served impact cohort" />
        <StatTile label="Admitted Games" value={coverage ? `${coverage.admitted_games.toLocaleString("en-US")} / ${coverage.scheduled_games.toLocaleString("en-US")}` : null} footnote="Scheduled games in this scope" />
        <StatTile label="1Y Fit Through" value={fit ? formatDate(fit.last_included_date) : null} footnote={fit ? fit.seasons.join(" / ") : undefined} />
      </> : undefined}>
        <GatedNote why={<ImpactDisclosure data={data} />}>{data.status === "available" ? "CourtLens model: descriptive estimates under lineup confounding." : data.reason || "No sealed impact fit for this scope."}</GatedNote>
        <div className="table-wrapper research-table" role="region" aria-label="Served impact ratings" tabIndex={0}>
          <table className="data-table"><thead><tr><th>Player</th>{METRICS.map(key => <th key={key} className="num" title={IMPACT_COLUMNS[key].tooltip}>{IMPACT_COLUMNS[key].label}</th>)}<th className="num">1Y Games</th><th className="num">1Y Minutes</th></tr></thead>
            <tbody>{data.players.length ? data.players.map(player => <tr key={player.player_id}>
              <th><PlayerIdentity playerId={player.player_id} name={player.player_name} href={`/players/${player.player_id}?${scope}`} size="sm" /></th>
              {METRICS.map(key => <td key={key} className="num">{formatStatValue(player.metrics[key], 2)}</td>)}
              <td className="num">{player.support.rapm?.games ?? "—"}</td><td className="num">{player.support.rapm?.seconds == null ? "—" : (player.support.rapm.seconds / 60).toFixed(1)}</td>
            </tr>) : <tr><td colSpan={9}>No qualified rating sample for this scope.</td></tr>}</tbody>
          </table>
        </div>
        <p className="research-caption">Top 20 by qualified 1Y RAPM, in points per 100 counted controls. <Link href={`/stats?${new URLSearchParams({ season, phase, beforeDate, viewId: "impact", sortMetric: "rapm" })}`}>Explore all players in Stats</Link></p>
      </ResearchLayout>}
    {/* The registered experiment is independent of impact serving and stays readable without it. */}
    <ResearchResultsView experiment="courtload-rapm-v1" embedded title="B26 preregistered experiment" />
  </>;
}
