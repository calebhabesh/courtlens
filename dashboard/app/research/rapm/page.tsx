import { RankedBars } from "@/components/charts";
import { PlayerIdentity } from "@/components/ui/identity";
import { Suspense } from "react";
import { ResearchResultsView } from "@/components/research-results-view";
import { ImpactDisclosure } from "@/components/impact-disclosure";
import { ContextBar } from "@/components/context-bar";
import { RapmRatingsTable } from "@/components/rapm-ratings-table";
import { ResearchCard, ResearchCards, ResearchIntro, ResearchSection } from "@/components/research/research-page";
import { GatedNote } from "@/components/ui/gated-note";
import { getImpact } from "@/lib/workbench-api";
import { formatStatValue } from "@/lib/stats-presets";
import { formatDate } from "@/lib/format-date";
import { seasonEra } from "@/lib/portrait-source";
import { ButtonLink } from "@/components/ui/kit";

export const dynamic = "force-dynamic";

/** Research → Six-Factor RAPM → RAPM Ratings (RD00 round 3): the served 1Y / 2Y / 3Y ratings in the Research column pattern. */
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
  const statsHref = `/stats?${new URLSearchParams({ season, phase, beforeDate, viewId: "impact", sortMetric: "rapm" })}`;
  const sixFactorHref = `/research/rapm/six-factor?${new URLSearchParams({ season, ...(phase === "playoffs" ? { phase } : {}) })}`;
  const detailRows = data ? [
    { label: "Serving version", value: data.version, mono: true },
    { label: "Manifest SHA-256", value: data.manifest_sha256, mono: true },
    ...data.artifacts.map(artifact => ({ label: `${artifact.years}Y fit (${artifact.seasons.join(" / ")})`, value: `${artifact.sha256} · exclusive fit cutoff ${artifact.cutoff} · games through ${artifact.last_included_date}`, mono: true }))
  ] : [];
  const facts = data?.status === "available" ? [
    { label: "Top 1Y RAPM", value: leader ? formatStatValue(leader.metrics.rapm, 2) : "—", note: leader?.player_name ?? "Unknown" },
    { label: "Rated Players", value: data.total_players.toLocaleString("en-US"), note: "In the served impact cohort" },
    { label: "Admitted Games", value: coverage ? `${coverage.admitted_games.toLocaleString("en-US")} / ${coverage.scheduled_games.toLocaleString("en-US")}` : "—", note: "Scheduled games in this scope" },
    { label: "1Y Fit Through", value: fit ? formatDate(fit.last_included_date) : "—", note: fit ? fit.seasons.join(" / ") : "Unknown" },
  ] : [];
  return <div className="rs-column rapm-ratings">
    <Suspense fallback={<div className="ui-filter-bar" aria-hidden="true" />}>
      <ContextBar initialSeason={season} initialPhase={phase} initialBeforeDate={beforeDate} showWindow={false} sampleNoun="players" sampleSize={data?.total_players} detailRows={detailRows} />
    </Suspense>
    {!data ? <div role="alert"><GatedNote tone="warning" action={<ButtonLink size="lg" href={`/research/rapm?${scope}`}>Retry</ButtonLink>}>Impact serving unavailable. Restore the local API connection.</GatedNote></div> : <>
      <ResearchIntro tagline="One-, two- and three-year RAPM from public play-by-play, fitted on games before the chosen date."
        links={[{ label: "Intervals on the Six-Factor tab", href: sixFactorHref, icon: "layers" }, { label: "All players in Stats", href: statsHref, icon: "table" }]} />
      <GatedNote why={<ImpactDisclosure data={data} />}>{data.status === "available" ? "CourtLens model: descriptive estimates under lineup confounding." : data.reason || "No sealed impact fit for this scope."}</GatedNote>
      {data.status === "available" && <ResearchSection icon="trophy" title="Leaders">
        {/* PC12: the headline chart leads on first load, labelled for assistive tech; open, not boxed (RD00). */}
        <section className="rapm-headline" aria-label="Headline result">
          <RankedBars title="Qualified 1Y RAPM leaders" source="CourtLens sealed IM04 lineup model" sample={`${data.total_players} served players · ${coverage?.admitted_games ?? "unknown"} admitted games`}
            measure="points per 100 counted controls" tone="identity-b" note="Blue = 1Y RAPM; descriptive under lineup confounding. Intervals are on the Six-Factor tab."
            items={data.players.filter(p => p.metrics.rapm != null).slice(0, 5).map(p => ({ key: p.player_id, name: p.player_name, label: <PlayerIdentity playerId={p.player_id} name={p.player_name} era={seasonEra(season)} href={`/players/${p.player_id}?${scope}`} size="sm" />, value: p.metrics.rapm!, formatted: formatStatValue(p.metrics.rapm, 2), detail: `${p.support.rapm?.games ?? "unknown"} games · ${p.support.rapm?.seconds == null ? "unknown" : Math.round(p.support.rapm.seconds / 60)} minutes` }))} />
        </section>
        <ResearchCards columns={4} label="Fit summary">
          {facts.map(fact => <ResearchCard key={fact.label} listItem kicker={fact.label} title={fact.value}><p className="rs-card-text">{fact.note}</p></ResearchCard>)}
        </ResearchCards>
      </ResearchSection>}
      <ResearchSection id="ratings" icon="table" title="All Ratings">
        {data.players.length ? <RapmRatingsTable players={data.players} season={season} phase={phase} scope={scope.toString()} statsHref={statsHref} />
          : <GatedNote>No qualified rating sample for this scope.</GatedNote>}
      </ResearchSection>
    </>}
    {/* The registered experiment is independent of impact serving and stays readable without it. */}
    <ResearchSection icon="graduation" title="Registered Experiment">
      <ResearchResultsView experiment="courtload-rapm-v1" embedded title="B26 preregistered experiment" />
    </ResearchSection>
  </div>;
}
