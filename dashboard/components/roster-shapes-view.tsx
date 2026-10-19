"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { chartVars } from "./charts";
import { ShapeBox, ShapeIcon, tone, type BoxEntry } from "./roster-shape-box";
import { FillVsResults, Missing, Sandbox, ShareCard, SinceLastSeason, teamEntries } from "./roster-shapes-sections";
import { SeasonStrip, TeamPanel, useLinkedHover } from "./roster-shapes-team";
import { TeamLogo } from "./team-logo";
import { BackButton, useNavLabel } from "./ui/back-button";
import { useFeed, useUrlState } from "./stats-feed-ui";
import { DataDetailsButton, type DataDetailRow } from "./ui/data-details";
import { FilterBar } from "./ui/filter-bar";
import { GatedNote } from "./ui/gated-note";
import { Icon } from "./ui/icon";
import { teamStyle } from "./ui/identity";
import { PageHeader } from "./ui/panel";
import { Skeleton } from "./ui/skeleton";
import { Button, Segmented, Select } from "./ui/kit";
import { formatDate } from "@/lib/format-date";
import { exportSvgAsPng } from "@/lib/image-export";
import { getTeamSixFactors } from "@/lib/team-six-factors";
import {
  CONTINUITY_LABELS, FIT_LABELS, FIT_SHAPES, MODES, SORTS, category, getRosterShapes, one, parseMode, parseSort,
  getRosterShapeHistory, playerSize, sandboxRoster, shapeKind, signed, sortTeams,
  type RosterShapes, type ShapeMode, type ShapeSort, type ShapeTeam
} from "@/lib/roster-shapes";

/** Pins the resolved player index in the URL (C3) so a shared link reproduces the same rosters. */
function useShapes(season: string | null) {
  const params = useSearchParams();
  const index = params.get("index");
  const releaseId = params.get("releaseId");
  const key = JSON.stringify([season, releaseId]);
  const [loaded, setLoaded] = useState<{ key: string; requested: string | null; index: string | null; data: RosterShapes | null; error: string } | null>(null);
  // Pinning the index rewrites the URL; the resolved data already matches it, so no refetch.
  const matches = loaded !== null && loaded.key === key && (index === null ? loaded.requested === null : loaded.index === index);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (matches) return;
    const abort = new AbortController();
    getRosterShapes({ season, datasetId: index, releaseId }, abort.signal).then(data => {
      if (abort.signal.aborted) return;
      const resolved = data.roster_context?.dataset_id ?? null;
      if (!index && resolved) {
        const next = new URLSearchParams(window.location.search); next.set("index", resolved);
        window.history.replaceState(null, "", `${window.location.pathname}?${next}`);
      }
      setLoaded({ key, requested: index, index: resolved ?? index, data, error: "" });
    }).catch(error => { if (!abort.signal.aborted) setLoaded({ key, requested: index, index, data: null, error: (error as Error).message }); });
    return () => abort.abort();
  }, [key, season, index, releaseId, matches, attempt]);
  return { data: matches ? loaded.data : null, error: matches ? loaded.error : "", retry: () => { setLoaded(null); setAttempt(n => n + 1); } };
}

function TeamCard({ team, entries, rank, mode, data, href, large = false, actions }: {
  team: ShapeTeam; entries: BoxEntry[]; rank: number; mode: ShapeMode; data: RosterShapes; href?: string; large?: boolean; actions?: ReactNode;
}) {
  const fill = entries.reduce((sum, e) => sum + (e.size ?? 0), 0) / data.capacity;
  const delta = (team.fill_playoff - team.fill) * 100;
  const head = <span className="shapes-card-head">
    <span className="shapes-card-rank">{rank}</span>
    <TeamLogo team={team.team_tricode} season={data.reference_season} size={large ? 44 : 32} />
    <strong>{team.team_name}</strong>
    {mode === "playoff" && <span className="shapes-card-delta" data-tone={Math.abs(delta) < 0.05 ? undefined : delta > 0 ? "up" : "down"} title="Change in fill from the playoff adjustment, in points of the box">{signed(delta)}</span>}
    <span className="shapes-card-fill" title="Share of the box filled">{Math.round(fill * 100)}%</span>
  </span>;
  const box = <span className="shapes-box" style={teamStyle(team.team_id)}>
    <ShapeBox entries={entries} mode={mode} capacity={data.capacity} large={large} label={`${team.team_name}: ${entries.filter(e => e.size && e.size > 0).length} players drawn, ${Math.round(fill * 100)}% of the box filled`} />
  </span>;
  return <li className={`shapes-card ${large ? "is-large" : ""}`}>
    {href ? <Link href={href} className="shapes-card-link" aria-label={`${team.team_name}: ${Math.round(fill * 100)}% of the box filled, rank ${rank}`}>{head}{box}</Link> : <div className="shapes-card-link">{head}{box}</div>}
    <Missing entries={entries} data={data} detailed={large} />
    {actions}
  </li>;
}

function Legend({ data }: { data: RosterShapes }) {
  return <section className="shapes-legend" aria-label="How to read the shapes">
    <span><strong>Size</strong> DPM over replacement × minutes</span>
    <span className="shapes-legend-fit"><strong>Outline</strong> Plugs in anywhere
      {FIT_SHAPES.map(kind => <ShapeIcon key={kind} kind={kind} size={18} color="var(--color-status-unknown)" />)} Hardest to fit</span>
    <span className="shapes-legend-colour"><strong>Colour</strong>
      {data.archetypes.clusters.filter(c => category(c.cluster)).map(c => <span key={c.cluster} title={c.description}><span className="shapes-swatch" style={chartVars({ "--chart-tone": tone(c.cluster) })} aria-hidden="true" />{c.name}</span>)}
      <span><span className="shapes-swatch" style={chartVars({ "--chart-tone": tone(null) })} aria-hidden="true" />Unknown</span></span>
    <span><strong>White</strong> what a perfect team would add</span>
  </section>;
}

function Note({ data }: { data: RosterShapes }) {
  return <p className="shapes-note">{data.projected
    ? <><strong>Projected.</strong> Rosters come from the NBA player index{data.roster_context ? ` observed ${formatDate(data.roster_context.observed_at)}` : ""}. {data.minutes_source === "darko_expected"
      ? <>Each player is drawn from his latest DARKO DPM and DARKO&apos;s expected minutes per game (ratings through {formatDate(data.dpm.data_date)}); where a roster adds up to more than 240 a game, players keep theirs in order of minutes until the team reaches 240 and the bench gets what is left.</>
      : <>Minutes per game are each player&apos;s {data.reference_season} minutes over 82 games, capped at 240 a game in order of minutes; each player is drawn from his {data.reference_season} DPM.</>} Nobody has played a {data.season} minute yet.</>
    : <><strong>{data.season}.</strong> Everyone who played for each team in the regular season, sized by his minutes per team game there and his end-of-season DPM. A traded player appears on each of his teams.</>}</p>;
}

function RosterTable({ team, data, mode }: { team: ShapeTeam; data: RosterShapes; mode: ShapeMode }) {
  const groups: { label: string; columns: string[] }[] = [
    { label: "Profile", columns: ["Style", "Status"] },
    { label: "Impact", columns: mode === "playoff" ? ["DPM", "ODPM", "DDPM", "PO shift"] : ["DPM", "ODPM", "DDPM"] },
    { label: "Shape", columns: ["MPG", "Box", "Fit"] },
  ];
  const count = groups.reduce((n, g) => n + g.columns.length, 0);
  return <div className="player-ref-grid-frame">
    <div className="player-ref-grid-scroll" role="region" aria-label={`${team.team_name} roster`} tabIndex={0}>
      <table className="player-ref-grid shapes-roster-grid" data-columns={count}>
        <colgroup><col className="player-ref-grid-lead-column" /><col className="shapes-style-column" />{Array.from({ length: count - 2 }, (_, i) => <col key={i} />)}<col className="shapes-fit-column" /></colgroup>
        <thead>
          <tr className="player-ref-grid-tier-1">
            <th scope="colgroup" className="player-ref-grid-lead">Player</th>
            {groups.map(g => <th key={g.label} scope="colgroup" colSpan={g.columns.length} className="group-start">{g.label}</th>)}
          </tr>
          <tr className="player-ref-grid-tier-2">
            <td className="player-ref-grid-lead" />
            {groups.flatMap((g, gi) => g.columns.map((c, ci) => <th key={c} scope="col" className={gi > 0 && ci === 0 ? "group-start" : undefined}>{c}</th>))}
          </tr>
        </thead>
        <tbody>{team.roster.map(p => {
          const size = playerSize(p, mode);
          return <tr key={p.player_id} title={p.unknown_reasons.join(" ") || undefined}>
            <th scope="row" className="player-ref-grid-lead"><Link href={`/players/${p.player_id}`}>{p.player_name}</Link></th>
            <td className="shapes-style-cell">{p.archetype ? <span className="shapes-style"><span className="shapes-swatch" style={chartVars({ "--chart-tone": tone(p.archetype.primary) })} aria-hidden="true" />{p.archetype.primary_name}</span> : "—"}</td>
            <td title={p.continuity === "unknown" ? `No ${data.projected ? data.reference_season : "prior-season"} games` : undefined}>{CONTINUITY_LABELS[p.continuity]}{p.continuity === "new" && p.previous_teams.length > 0 && <small>{p.previous_teams.join(", ")}</small>}</td>
            <td className="group-start" data-tone={p.dpm === null || Math.abs(p.dpm) < 0.05 ? undefined : p.dpm > 0 ? "up" : "down"}>{signed(p.dpm)}</td>
            <td>{signed(p.o_dpm)}</td>
            <td>{signed(p.d_dpm)}</td>
            {mode === "playoff" && <td>{p.playoff_shift !== null && p.playoff_games ? <>{signed(p.playoff_shift)}<small>{p.playoff_games} games</small></> : "—"}</td>}
            <td className="group-start">{one(p.minutes_per_game)}</td>
            <td>{size === null ? "—" : size === 0 ? <>0%<small>at replacement</small></> : `${(size / data.capacity * 100).toFixed(1)}%`}</td>
            <td className="shapes-fit-cell">{p.fit_band === null ? "—" : <span title={`Ease of fit ${Math.round((p.fit_ease ?? 0) * 100)} of 100`}><ShapeIcon kind={shapeKind(p.fit_band)} color={tone(p.archetype?.primary)} />{FIT_LABELS[p.fit_band]}</span>}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </div>;
}

function details(data: RosterShapes): DataDetailRow[] {
  return [
    { label: "Scope", value: data.projected ? `${data.label}: rosters from the NBA player index; ${data.minutes_source === "darko_expected" ? "DARKO's latest DPM and expected minutes" : `minutes and DPM from ${data.reference_season}`}` : `${data.season} regular season, every player who appeared for each team` },
    ...(data.roster_context ? [{ label: "Player index", value: `${formatDate(data.roster_context.observed_at)} · ${data.roster_context.dataset_id}`, mono: true }] : []),
    { label: "Statistics release", value: data.statistics_release_id ?? "Unavailable", mono: true },
    { label: "Size", value: `(DPM − (${data.replacement_level.toFixed(1)}))^${data.exponent} × minutes per team game, as a share of the box: a +${data.box_net} team, whose 240 minutes are all played by +${(data.box_net / 5).toFixed(2)} DPM players.` },
    { label: "DPM", value: data.dpm.phase === "current"
      ? `${data.dpm.source}: latest ratings (through ${formatDate(data.dpm.data_date)}) and expected minutes, sealed ${formatDate(data.dpm.as_of)}`
      : `${data.dpm.source}, ${data.dpm.season} regular season as of ${formatDate(data.dpm.as_of)}` },
    { label: "Shape", value: `Ease of fit, an estimate: the mean league percentile of DPM, defensive DPM, three-point rate and 1 − usage, in ${data.fit_bands} equal bands from plugs in anywhere to hardest to fit.` },
    { label: "Playoff-Adjusted", value: `Each player moves by his DARKO offensive DPM change across the playoffs he played, weighted by playoff games and shrunk by ${data.playoff_prior_games} games toward none.` },
    { label: "Colour", value: `Derived archetype (${data.archetypes.names_status === "confirmed" ? "names confirmed by the owner" : "proposed names"})` },
    { label: "Archetype artifact", value: data.archetypes.artifact_sha256, mono: true },
    { label: "DARKO snapshot", value: data.dpm.raw_sha256, mono: true },
    { label: "Method version", value: data.version, mono: true },
  ];
}

const BLURB = "Every roster is a box to fill. Bigger shapes are better players, squarer shapes are easier to build around, and the white is what a perfect team would add.";

const ids = (value: string | null) => value ? value.split(",").filter(Boolean) : [];

/** Roster Shapes (alignment row 12): Databallr's 2D Wyman diagrams, one white box per roster. */
export function RosterShapesView() {
  const { get, set } = useUrlState();
  const season = get("season");
  const { data, error, retry } = useShapes(season);
  const sort = parseSort(get("sort"));
  const mode = parseMode(get("mode"));
  const selected = get("team")?.toUpperCase() ?? null;
  const addKey = get("add"), dropKey = get("drop");
  const add = useMemo(() => ids(addKey), [addKey]), drop = useMemo(() => ids(dropKey), [dropKey]);
  const teams = data ? sortTeams(data.teams, sort, mode) : [];
  const team = selected ? teams.find(t => t.team_tricode === selected) ?? null : null;
  const carry = new URLSearchParams();
  for (const key of ["season", "index", "releaseId", "mode", "sort"]) { const value = get(key); if (value) carry.set(key, value); }
  const teamHref = (tricode: string) => { const next = new URLSearchParams(carry); next.set("team", tricode); return `/roster-shapes?${next}`; };
  const shownSeason = data?.season ?? season ?? "2026-27";
  // The last full season backs "Since last season" and "Fill vs results"; reuse the page's data when it is that season.
  const reference = data?.reference_season ?? null;
  const releaseId = get("releaseId");
  const past = useFeed([reference, releaseId, data && !data.projected ? "same" : "fetch"], signal => data && !data.projected
    ? Promise.resolve(data) : reference ? getRosterShapes({ season: reference, releaseId }, signal) : Promise.resolve(null));
  const factors = useFeed([reference, releaseId, team ? "team" : "league"], signal => !team && reference
    ? getTeamSixFactors({ season: reference, phase: "regular_season", releaseId }, signal) : Promise.resolve(null));
  const sandboxed = add.length + drop.length > 0;
  const entries: BoxEntry[] = !team || !data ? [] : sandboxed
    ? sandboxRoster(team, data.teams, add, drop, mode, data).map(e => ({ ...e, mark: e.added ? "added" as const : undefined }))
    : teamEntries(team, mode);
  const card = useRef<SVGSVGElement>(null);
  const [sharing, setSharing] = useState(false);
  const share = async () => {
    if (!card.current || !team || !data) return;
    setSharing(true);
    try {
      await exportSvgAsPng(card.current, { title: `${team.team_name} roster shape`, subtitle: `${data.label}${mode === "playoff" ? " · Playoff-adjusted" : ""}${sandboxed ? " · sandbox" : ""}`,
        context: { season: data.season, release_id: data.statistics_release_id ?? undefined }, evidenceId: data.dpm.raw_sha256, filename: `courtlens-roster-shape-${team.team_tricode.toLowerCase()}-${data.season}` });
    } finally { setSharing(false); }
  };
  // The player highlighted in team view, shared by the box and the panel's table.
  const hover = useLinkedHover();
  const active = hover.linked?.id ?? null;
  const history = useFeed([releaseId, team ? "team" : "league"], signal => team ? getRosterShapeHistory({ releaseId }, signal) : Promise.resolve(null));
  const previous = past.data && team ? past.data.teams.find(t => t.team_tricode === team.team_tricode) ?? null : null;
  useNavLabel(team ? `${team.team_name} Roster Shape` : null);
  return <div className="shapes-page" role="region" aria-label="Roster Shapes">
    {selected && <BackButton parent={{ href: `/roster-shapes${carry.size ? `?${carry}` : ""}`, label: "Roster Shapes" }} />}
    {team && data
      ? <PageHeader className="pvp-header shapes-team-header" title={<><TeamLogo team={team.team_tricode} season={data.reference_season} size={48} />{team.team_name}</>} />
      : <PageHeader className="pvp-header" icon="shapes" title="Roster Shapes" subtitle={BLURB} />}
    <p className="shapes-credit">Also known as <strong>Wyman Diagrams</strong>. Created by <a href="https://www.tiktok.com/@taylormetrics" target="_blank" rel="noreferrer">@taylormetrics</a> on TikTok, where they became a viral trend.</p>
    <div className="shapes-console"><FilterBar label="Roster Shapes controls" summary={[shownSeason, selected ?? "All Teams", mode === "playoff" ? "Playoff-Adjusted" : null].filter(Boolean).join(" · ")}
      scope={<>
        <Select size="md" aria-label="Season" value={shownSeason} onChange={event => set({ season: event.target.value === "2026-27" ? null : event.target.value, index: null, add: null, drop: null })}>
          {(data?.seasons ?? [{ season: shownSeason, label: shownSeason, projected: true }]).map(entry => <option key={entry.season} value={entry.season}>{entry.label}</option>)}
        </Select>
        <Select size="md" aria-label="Team" value={selected ?? ""} onChange={event => set({ team: event.target.value || null, add: null, drop: null })}>
          <option value="">All Teams</option>
          {[...(data?.teams ?? [])].sort((a, b) => a.team_name.localeCompare(b.team_name)).map(t => <option key={t.team_id} value={t.team_tricode}>{t.team_name}</option>)}
        </Select>
        <Segmented size="md" label="Season phase" value={mode} onChange={value => set({ mode: value === "playoff" ? "playoff" : null })} options={MODES} />
      </>}
      details={data ? <DataDetailsButton rows={details(data)}><ul className="shapes-limitations">{data.limitations.map(item => <li key={item}>{item}</li>)}</ul></DataDetailsButton> : undefined} /></div>
    {error && <div role="alert"><GatedNote why={error} action={<Button size="lg" onClick={retry}>Retry</Button>}>Roster Shapes are unavailable right now.</GatedNote></div>}
    {!data && !error && <div role="status" aria-busy="true" aria-label="Loading roster shapes" className="shapes-loading"><Skeleton height={64} /><Skeleton height={480} /></div>}
    {data && <>
      <Note data={data} />
      <Legend data={data} />
      <div className="shapes-summary">
        <p>{data.season}, {team ? team.team_name : `${data.teams.length} rosters`}. The box is a +{data.box_net} team.</p>
        {!team && <Segmented<ShapeSort> size="md" label="Sort rosters" value={sort} onChange={value => set({ sort: value === "fullest" ? null : value })} options={SORTS} />}
        {team && <Button size="md" icon="download" disabled={sharing} onClick={() => void share()}>{sharing ? "Exporting…" : "Share Image"}</Button>}
      </div>
      {selected && !team && <p className="shapes-note">No {selected} roster in {data.season}.</p>}
      {team ? <>
        <div className="shapes-team">
          <div className="shapes-team-main">
            <span className="shapes-box is-large" style={teamStyle(team.team_id)}>
              <ShapeBox entries={entries} mode={mode} capacity={data.capacity} large active={active} card={hover.linked?.from === "box"} onActive={hover.box} label={`${team.team_name}: ${entries.filter(e => e.size && e.size > 0).length} players drawn`} />
            </span>
            {history.data && <SeasonStrip team={team} history={history.data} data={data} mode={mode} />}
          </div>
          <TeamPanel team={team} entries={entries} data={data} mode={mode} active={active} onActive={hover.table} />
        </div>
        <ShareCard ref={card} team={team} entries={entries} data={data} mode={mode} season={data.label} />
        <Sandbox team={team} data={data} mode={mode} add={add} drop={drop} onChange={(nextAdd, nextDrop) => set({ add: nextAdd.join(",") || null, drop: nextDrop.join(",") || null })} />
        {data.projected && <SinceLastSeason team={team} previous={previous} data={data} mode={mode} />}
        <section className="player-open-section player-glass shapes-roster" aria-label="Roster">
          <header className="player-open-heading"><h2><Icon name="users" size={20} />Roster</h2>
            <span>{team.sized_players} drawn · {team.below_replacement_players} at replacement · {team.unknown_players} unknown</span></header>
          <RosterTable team={team} data={data} mode={mode} />
        </section>
      </> : <>
        <ul className="shapes-grid" aria-label="Team roster shapes">
          {teams.map((t, i) => <TeamCard key={t.team_id} team={t} entries={teamEntries(t, mode)} rank={i + 1} mode={mode} data={data} href={teamHref(t.team_tricode)} />)}
        </ul>
        {past.data && factors.data && <FillVsResults shapes={past.data} factors={factors.data.teams} />}
      </>}
      <p className="shapes-footnote">This version follows Taylormetrics&apos; Wyman Diagram and Databallr&apos;s Roster Shapes. Size is DARKO DPM above a −2.0 replacement level to the power 2.2, times minutes per game. Shapes are an estimate of ease of fit (DPM, defensive DPM, three-point rate and usage), so read them as a lean, not a stat. Playoff-adjusted moves each player by his career playoff offense change in DARKO. Players without a DPM or minutes are not drawn, never zero. {data.credit}</p>
    </>}
  </div>;
}
