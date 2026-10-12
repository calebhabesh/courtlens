"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShapeGlyph, ShapePack, chartVars, toneColor } from "./charts";
import { RosterAllocationView, type RosterAllocationViewProps } from "./roster-allocation-view";
import { TeamLogo } from "./team-logo";
import { DataDetailsButton, type DataDetailRow } from "./ui/data-details";
import { Field } from "./ui/field";
import { GatedNote } from "./ui/gated-note";
import { TeamIdentity, teamStyle } from "./ui/identity";
import { PageShell, ProfileLayout, ResearchLayout } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { RouteTabs } from "./ui/route-tabs";
import { SegmentedControl } from "./ui/segmented-control";
import { Select } from "./ui/select";
import { Skeleton } from "./ui/skeleton";
import { StatTile } from "./ui/stat-tile";
import { FINANCE_TEAMS } from "@/lib/finance-teams";
import { formatDate } from "@/lib/format-date";
import {
  FIT_LABELS, SHAPE_FIT_LABELS, SORTS, SOURCE, category, categoryLabels, getRosterShapes, one, parseSort, percent, rankOf,
  shapeItems, signed, sortTeams, wholeMinutes, type RosterShapes, type ShapeSort, type ShapeTeam
} from "@/lib/roster-shapes";

const SIZE_LABEL = "value over replacement";

/** Pins the resolved player index in the URL (C3) so a shared link reproduces the same rosters. */
function useShapes(enabled = true) {
  const params = useSearchParams();
  const index = params.get("index");
  const releaseId = params.get("releaseId");
  const [loaded, setLoaded] = useState<{ requested: string | null; index: string | null; releaseId: string | null; data: RosterShapes | null; error: string } | null>(null);
  // Pinning the index rewrites the URL; the resolved data already matches it, so no refetch.
  const matches = loaded !== null && loaded.releaseId === releaseId && (index === null ? loaded.requested === null : loaded.index === index);
  useEffect(() => {
    if (matches || !enabled) return;
    const abort = new AbortController();
    getRosterShapes({ datasetId: index, releaseId }, abort.signal).then(data => {
      if (abort.signal.aborted) return;
      const resolved = data.roster_context.dataset_id;
      if (!index) {
        const next = new URLSearchParams(window.location.search); next.set("index", resolved);
        window.history.replaceState(null, "", `${window.location.pathname}?${next}`);
      }
      setLoaded({ requested: index, index: resolved, releaseId, data, error: "" });
    }).catch(error => { if (!abort.signal.aborted) setLoaded({ requested: index, index, releaseId, data: null, error: (error as Error).message }); });
    return () => abort.abort();
  }, [index, releaseId, matches, enabled]);
  return { data: matches ? loaded.data : null, error: matches ? loaded.error : "", params };
}

function contextRows(data: RosterShapes): DataDetailRow[] {
  return [
    { label: "Scope", value: `${data.label} · rosters from the NBA player index; numbers from ${data.reference_season}` },
    { label: "Player index observed", value: formatDate(data.roster_context.observed_at) },
    { label: "Player index dataset", value: data.roster_context.dataset_id, mono: true },
    { label: "Reference statistics release", value: data.statistics_release_id ?? "Unavailable", mono: true },
    { label: "Value", value: `${data.value.label}, regular season ${data.value.scope.seasons.join(" + ")}` },
    { label: "Value artifact", value: data.value.artifact_sha256, mono: true },
    { label: "Archetype artifact", value: data.archetypes.artifact_sha256, mono: true },
    { label: "Archetype names", value: data.archetypes.names_status === "confirmed" ? "Confirmed by the owner" : "Proposed" },
    { label: "Replacement level", value: `${data.replacement_level.toFixed(1)} BPR` },
    { label: "Full season", value: `${data.full_season_minutes.toLocaleString("en-US")} minutes (82 × 48)` },
  ];
}

function Limitations({ items }: { items: string[] }) {
  return <ul className="shapes-limitations">{items.map(item => <li key={item}>{item}</li>)}</ul>;
}

function Details({ data }: { data: RosterShapes }) {
  return <DataDetailsButton rows={contextRows(data)}>
    <Limitations items={data.limitations} />
    <p>{data.credit} Methodology: <Link href="/methodology#value-archetypes">value and archetypes</Link>.</p>
  </DataDetailsButton>;
}

function Failure({ error }: { error: string }) {
  return <div role="alert"><GatedNote why={error} action={<button className="button" onClick={() => window.location.reload()}>Retry</button>}>Roster Shapes are unavailable right now.</GatedNote></div>;
}

/** One shared legend: color = archetype, outline = fit, hatch = unknown, white space = gap to the fullest roster. */
export function ShapesLegend({ data, note = true }: { data: RosterShapes; note?: boolean }) {
  return <section className="shapes-legend" aria-label="How to read the shapes">
    <ul className="chart-legend chart-legend-inline" aria-label="Color: derived archetype">
      {data.archetypes.clusters.map(cluster => { const key = category(cluster.cluster); return <li key={cluster.cluster} title={cluster.description}>
        <span className="chart-key" style={chartVars({ "--chart-tone": key ? toneColor(`category-${key}`) : "var(--color-status-unknown)" })} aria-hidden="true" />{cluster.name}
      </li>; })}
      <li><span className="chart-key chart-key-unknown" aria-hidden="true" />Archetype unknown</li>
    </ul>
    <ul className="chart-legend chart-legend-inline shapes-outline-key" aria-label="Outline: fit">
      {(["observed", "projected", "unknown"] as const).map(fit => <li key={fit}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" className={`shapes-outline shapes-outline-${fit}`} /></svg>
        {fit === "observed" ? "Solid: returning" : fit === "projected" ? "Dashed: new arrival" : "Dotted: no 2025-26 sample"}
      </li>)}
    </ul>
    {note && <ShapesNote data={data} />}
  </section>;
}

function ShapesNote({ data }: { data: RosterShapes }) {
  return <p className="chart-note">Size = {SIZE_LABEL}: (BPR + 2.0) × share of a full season&apos;s {data.reference_season} minutes. White space = the gap to the fullest roster. Players without a value or minutes are unknown and not drawn, never zero. {data.credit}</p>;
}

function TeamCard({ team, data, rank, query }: { team: ShapeTeam; data: RosterShapes; rank: number; query: string }) {
  const labels = categoryLabels(data.archetypes.clusters);
  return <li className="shapes-card" style={teamStyle(team.team_id)}>
    <Link href={`/roster-shapes/${team.team_tricode}${query}`} className="shapes-card-link" aria-label={`${team.team_name}: rank ${rank} of 30 by value over replacement`}>
      <span className="shapes-card-head"><TeamLogo team={team.team_id} size={24} /><strong>{team.team_name}</strong><span className="shapes-card-rank">#{rank}</span></span>
      <ShapeGlyph items={shapeItems(team)} label={`${team.team_name} roster shape`} sizeLabel={SIZE_LABEL} categoryLabels={labels} capacity={data.capacity} fitLabels={SHAPE_FIT_LABELS} />
      <span className="shapes-card-stats">
        <span><strong>{one(team.total_vor)}</strong> value</span>
        <span><strong>{percent(team.returning_share)}</strong> returning</span>
        <span><strong>{team.unknown_players}</strong> unknown</span>
      </span>
    </Link>
  </li>;
}

function GridSkeleton() {
  return <div role="status" aria-busy="true" aria-label="Loading roster shapes" className="shapes-loading"><Skeleton height={96} /><Skeleton height={480} /></div>;
}

export function RosterShapesLeague() {
  const { data, error, params } = useShapes();
  const router = useRouter();
  const sort = parseSort(params.get("sort"));
  const setSort = (value: ShapeSort) => {
    const next = new URLSearchParams(window.location.search);
    if (value === "fullest") next.delete("sort"); else next.set("sort", value);
    router.replace(`/roster-shapes?${next}`, { scroll: false });
  };
  const carry = new URLSearchParams();
  if (data) carry.set("index", data.roster_context.dataset_id);
  if (params.get("releaseId")) carry.set("releaseId", params.get("releaseId")!);
  const query = carry.size ? `?${carry}` : "";
  const teams = data ? sortTeams(data.teams, sort) : [];
  const ranks = data ? new Map(sortTeams(data.teams, "fullest").map((team, i) => [team.team_tricode, i + 1])) : new Map<string, number>();
  const players = data?.teams.reduce((sum, t) => sum + t.players, 0) ?? 0;
  const sized = data?.teams.reduce((sum, t) => sum + t.sized_players, 0) ?? 0;
  const unknown = data?.teams.reduce((sum, t) => sum + t.unknown_players, 0) ?? 0;
  const fullest = data ? sortTeams(data.teams, "fullest")[0] : null;
  const bestFit = data ? sortTeams(data.teams, "fit")[0] : null;
  return <PageShell template="research" className="shapes-page">
    <PageHeader title="Roster Shapes" subtitle={data ? `${data.label} · ${data.projected_note}` : "2026-27 · projected"} actions={data && <Details data={data} />} />
    {error && <Failure error={error} />}
    {!data && !error && <GridSkeleton />}
    {data && <ResearchLayout findings={<>
      <StatTile size="lg" label="Fullest roster" value={fullest ? `${fullest.team_tricode} ${one(fullest.total_vor)}` : null} footnote="Known value over replacement, a lower bound" />
      <StatTile label="Most returning value" value={bestFit ? `${bestFit.team_tricode} ${percent(bestFit.returning_share)}` : null} footnote="Share of value from players back on the same team" />
      <StatTile label="Players drawn" value={`${sized} / ${players}`} footnote="Active index players with positive value over replacement" />
      <StatTile label="Unknown players" value={String(unknown)} footnote="No value or 2025-26 minutes; never sized as zero" />
    </>}>
      <ShapesLegend data={data} note={false} />
      <div className="shapes-toolbar">
        <SegmentedControl<ShapeSort> name="shapes-sort" value={sort} onChange={setSort} options={SORTS} />
        <span className="chart-note">{sort === "fit" ? "Best fit = share of known value from returning players." : sort === "az" ? "Alphabetical by team." : "Largest known value over replacement first."}</span>
      </div>
      <ul className="shapes-grid" aria-label="Team roster shapes">
        {teams.map(team => <TeamCard key={team.team_id} team={team} data={data} rank={ranks.get(team.team_tricode)!} query={query} />)}
      </ul>
      <ShapesNote data={data} />
      <p className="chart-provenance">Source: {SOURCE}. Sample: {players} active players on 30 index rosters, observed {formatDate(data.roster_context.observed_at)}.</p>
    </ResearchLayout>}
  </PageShell>;
}

function RosterTable({ team, data, query }: { team: ShapeTeam; data: RosterShapes; query: string }) {
  return <div className="table-wrapper" role="region" aria-label={`${team.team_name} roster`} tabIndex={0}><table className="data-table shapes-table">
    <caption>Sorted by value over replacement. Value is BPR (regular season {data.value.scope.seasons.join(" + ")}); minutes are {data.reference_season} regular season.</caption>
    <thead><tr>
      <th scope="col">Player</th><th scope="col">Pos</th><th scope="col">Derived archetype</th>
      <th scope="col" className="num">BPR</th><th scope="col" className="num">{data.reference_season} min</th>
      <th scope="col" className="num">Value over repl.</th><th scope="col">Fit</th>
    </tr></thead>
    <tbody>{team.roster.map(p => { const key = category(p.archetype?.primary); return <tr key={p.player_id}>
      <th scope="row"><Link href={`/players/${p.player_id}${query}`}>{p.player_name}</Link></th>
      <td>{p.listed_position ?? "—"}</td>
      <td>{p.archetype ? <span className="shapes-archetype">
        <span className="chart-key" style={chartVars({ "--chart-tone": key ? toneColor(`category-${key}`) : "var(--color-status-unknown)" })} aria-hidden="true" />
        <span>{p.archetype.primary_name}<small>{p.archetype.membership.slice(0, 2).map(m => `${Math.round(m.probability * 100)}% ${m.name}`).join(" · ")}{p.archetype.season !== data.reference_season ? ` · ${p.archetype.season}` : ""}{p.archetype.small_sample ? " · small sample" : ""}</small></span>
      </span> : <span className="shapes-unknown">Unknown</span>}</td>
      <td className="num">{signed(p.value)}{p.value !== null && !p.value_qualified && <small>small sample</small>}</td>
      <td className="num">{wholeMinutes(p.reference_minutes)}</td>
      <td className="num">{p.vor === null ? "—" : p.vor <= 0 ? <>{signed(p.vor)}<small>below replacement</small></> : one(p.vor)}</td>
      <td>{FIT_LABELS[p.fit]}{p.fit === "new" && <small>{p.previous_teams.join(", ")} in {data.reference_season}</small>}</td>
    </tr>; })}</tbody>
  </table></div>;
}

export interface RosterShapesTeamProps { team: string; view: "shape" | "depth"; depth: Omit<RosterAllocationViewProps, "teamId" | "embedded"> }

export function RosterShapesTeam({ team, view, depth }: RosterShapesTeamProps) {
  const { data, error, params } = useShapes(view === "shape");
  const router = useRouter();
  const info = FINANCE_TEAMS.find(t => t.tricode === team.toUpperCase() || t.id === team);
  const tricode = info?.tricode ?? team.toUpperCase();
  const shape = data?.teams.find(t => t.team_tricode === tricode) ?? null;
  const carry = new URLSearchParams();
  for (const key of ["index", "releaseId"]) { const value = params.get(key); if (value) carry.set(key, value); }
  const query = carry.size ? `?${carry}` : "";
  const switcher = <Field label="Team" layout="inline"><Select aria-label="Choose team" value={tricode} onChange={e => router.push(`/roster-shapes/${e.target.value}${view === "depth" ? `?${new URLSearchParams({ ...Object.fromEntries(params), view: "depth" })}` : query}`)}>
    {FINANCE_TEAMS.map(t => <option key={t.id} value={t.tricode}>{t.tricode} · {t.name}</option>)}
  </Select></Field>;
  const tabs = <RouteTabs aria-label="Roster views" carry={["index"]} active={view === "depth" ? `/roster-shapes/${tricode}?view=depth` : `/roster-shapes/${tricode}`}
    tabs={[{ label: "Shape", href: `/roster-shapes/${tricode}` }, { label: "Depth chart", href: `/roster-shapes/${tricode}?view=depth` }]} />;
  const labels = data ? categoryLabels(data.archetypes.clusters) : null;
  const rank = data && shape ? rankOf(data.teams, tricode) : null;
  // The depth chart reads any team id the stats API knows; the shape view needs an NBA team.
  if (!info && view === "shape") return <PageShell template="profile" className="shapes-page"><PageHeader title="Roster Shapes" /><GatedNote why={`"${team}" is not an NBA team code.`}>Unknown team.</GatedNote></PageShell>;
  const teamId = info?.id ?? team;
  const teamName = info?.name ?? team;
  return <PageShell template="profile" className="shapes-page">
    <PageHeader title="Roster Shapes" subtitle={`${teamName} · ${view === "depth" ? "depth chart from observed minutes" : data ? `${data.label} · ${data.projected_note}` : "2026-27 · projected"}`}
      actions={<>{switcher}<Link className="button" href={`/roster-shapes${query}`}>All teams</Link>{data && view === "shape" && <Details data={data} />}</>} />
    <ProfileLayout tabs={tabs} hero={view === "depth" ? null : <div className="shapes-hero">
      <TeamIdentity team={teamId} name={teamName} size="xl" subtitle={shape ? `${shape.players} players on the 2026-27 index roster` : "2026-27 index roster"} />
      {shape && <div className="shapes-tiles">
        <StatTile size="lg" label="Value over replacement" value={one(shape.total_vor)} rank={rank ?? undefined} rankOf={30} footnote="Known players only; a lower bound" />
        <StatTile label="Returning value" value={percent(shape.returning_share)} footnote="Share from players back on this team (fit)" />
        <StatTile label="Players drawn" value={`${shape.sized_players} / ${shape.players}`} footnote={`${shape.below_replacement_players} below replacement`} />
        <StatTile label="Unknown players" value={String(shape.unknown_players)} footnote="No value or 2025-26 minutes; never zero" />
      </div>}
    </div>}>
      {view === "depth" ? <RosterAllocationView {...depth} teamId={teamId} embedded /> : <>
        {error && <Failure error={error} />}
        {!data && !error && <GridSkeleton />}
        {data && shape && labels && <>
          <div className="shapes-detail">
            <ShapePack title={`${teamName} roster shape`} source={SOURCE} sample={`${shape.sized_players} of ${shape.players} players drawn · ${shape.unknown_players} unknown`}
              note={`White space = gap to the fullest roster (${one(data.capacity)})`} items={shapeItems(shape)} sizeLabel={SIZE_LABEL}
              categoryLabels={labels} capacity={data.capacity} fitLabels={SHAPE_FIT_LABELS} listItems={false} />
            <div className="shapes-detail-side">
              <ShapesLegend data={data} />
              {shape.unknown_players > 0 && <GatedNote why={<Limitations items={data.limitations} />}>{shape.unknown_players} players have no value or {data.reference_season} minutes. They are listed below and never drawn as zero.</GatedNote>}
            </div>
          </div>
          <section aria-labelledby="shapes-roster-heading" className="shapes-section">
            <h2 id="shapes-roster-heading">Roster</h2>
            <RosterTable team={shape} data={data} query={query} />
          </section>
          <p className="chart-provenance">Derived archetypes describe statistical style in one season, not listed positions. Positions come from the NBA player index.</p>
        </>}
      </>}
    </ProfileLayout>
  </PageShell>;
}
