"use client";

import { useMemo, useState } from "react";
import { LookupInput } from "./lookup-input";
import { FeedFailure, FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { usePhone } from "./points-forecasts-research";
import { TeamLogo } from "./team-logo";
import { Panel } from "./zts-figures";
import { GatedNote } from "./ui/gated-note";
import { PlayerAvatar } from "./ui/identity";
import { Button, IconButton, Segmented, Select } from "./ui/kit";
import { MethodBlock, ResearchDisclosure, ResearchSection } from "./research/research-page";
import { LeaderBars } from "./research/leader-bars";
import { GridPlayer, GridSearch, GridValue, StatsGrid, type GridColumn } from "./research/stats-grid";
import { seasonEra } from "@/lib/portrait-source";
import { getPlayTypes, sourceLabel, type FeedPhase, type PlayTypeBreakdown, type PlayTypePlayer, type PlayTypesView } from "@/lib/stats-feeds";
import type { LookupItem } from "@/lib/types";
import {
  DEFAULT_SORT, defensePattern, fixed, leaguePointsPerPossession, playTypeLabel, scopeLabel, share, signedPoints, sortDefenders, whole,
  type DefenseSort, type DefenseSortKey,
} from "@/lib/zts-defense";

/*
 * RD17 (owner, 2026-11-10): zTS → Defense, the defensive half of the old Adjusted Shooting page (its offensive half was a duplicate
 * of zTS). The live play-type feed, unchanged: points a defender allowed per play-type possession against what the league scored on
 * the same mix. RD03's page (768 px column, panels one level deep, PlayerAvatar, search in place of a player dropdown), RD12's
 * LeaderBars for the league's play types, RD11 sorted-not-ranked, RD13 selecting in place and column groups on a phone, RD16's
 * pattern line. No interval is served, so no value is green or red and nothing carries a rank; thin samples are dimmed and listed last.
 * URL: dSeason, dPhase, dPlayer (`none` clears it); the old Adjusted links' season, phase and playerId are read as fallbacks.
 */

const NO_PLAYER = "none";
const PHASES: { value: FeedPhase; label: string }[] = [{ value: "regular_season", label: "Regular season" }, { value: "playoffs", label: "Playoffs" }];

function teamOf(p: Pick<PlayTypePlayer, "team_tricodes">) {
  return p.team_tricodes.length === 1 ? p.team_tricodes[0] : null;
}

/** Every team code with its logo; a traded player lists each team (feed order, not dates). */
function TeamCodes({ codes, season }: { codes: readonly string[]; season: string }) {
  return <span className="ztd-teams" data-field="teams">{codes.map(code => <span key={code} className="ztd-team"><TeamLogo team={code} season={season} size={14} />{code}</span>)}</span>;
}

function candidates(view: PlayTypesView): LookupItem[] {
  return view.players.map(p => ({
    id: p.player_id, kind: "player", canonical_id: p.player_id, display_name: p.player_name, subtitle: p.team_tricodes.join(" · ") || null,
    match_basis: "substring", match_score: 0, destination_url: `/players/${p.player_id}?season=${view.season}`,
    availability: { has_current_season: true, status: "served", seasons: [view.season], latest_team_id: null, latest_tricode: teamOf(p) },
  } satisfies LookupItem));
}

// ---- The board ----------------------------------------------------------------------------------------------------------------

function PatternLine({ view }: { view: PlayTypesView }) {
  const pattern = defensePattern(view.players);
  if (!pattern) return null;
  const { lowest, highest, qualified } = pattern;
  return <p className="ztd-text ztd-pattern" data-field="pattern" data-lowest={lowest.player_id} data-highest={highest.player_id} data-qualified={qualified}>
    A pattern, not a result: among the {whole(qualified)} defenders with {whole(view.qualification.possessions)} or more play-type possessions in the {scopeLabel(view)},
    {" "}<strong>{lowest.player_name}</strong> allowed the fewest points against expectation ({signedPoints(lowest.adjusted_per_100)} per 100 possessions over {whole(lowest.possessions)})
    {" "}and <strong>{highest.player_name}</strong> the most ({signedPoints(highest.adjusted_per_100)} over {whole(highest.possessions)}). No interval is served, so no defender
    here is shown to be better than another.
  </p>;
}

function LeagueTypes({ view }: { view: PlayTypesView }) {
  const total = view.league.reduce((sum, row) => sum + row.possessions, 0);
  const all = leaguePointsPerPossession(view);
  return <Panel className="ztd-league" label={`League points allowed by play type, ${scopeLabel(view)}`}>
    <LeaderBars title="Points per possession, by play type" measure="points per possession" zeroMeans="no points"
      source={sourceLabel(view.sources)} sample={`${whole(total)} play-type possessions, ${scopeLabel(view)}`}
      items={view.league.map(row => ({ key: row.play_type, name: row.label, label: row.label, value: row.points_per_possession, formatted: fixed(row.points_per_possession, 3),
        detail: `${whole(row.possessions)} possessions · ${share(total ? row.possessions / total : null)} of all` }))} />
    <p className="zt-panel-note" data-field="league-ppp" data-value={all ?? undefined}>Every listed play type together: {fixed(all, 3)} points per possession. Each defender&apos;s
      expectation is this table applied to the play types they defended.</p>
  </Panel>;
}

type View = "points" | "volume";

function DefendersGrid({ view, selected, onSelect }: { view: PlayTypesView; selected: string | null; onSelect: (id: string) => void }) {
  const phone = usePhone();
  const [mode, setMode] = useState<View>("points");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<DefenseSort>(DEFAULT_SORT);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortDefenders(view.players.filter(p => !q || p.player_name.toLowerCase().includes(q)), sort);
  }, [view.players, query, sort]);
  const onSort = (key: string) => setSort(s => s.key === key ? { key: s.key, direction: s.direction === "asc" ? "desc" : "asc" } : { key: key as DefenseSortKey, direction: key === "adjusted_per_100" || key === "points_per_possession" ? "asc" : "desc" });
  const points = !phone || mode === "points", volume = !phone || mode === "volume";
  const num = (key: DefenseSortKey, label: string, group: string | undefined, text: (p: PlayTypePlayer) => string, title?: string): GridColumn<PlayTypePlayer> => ({
    key, label, group, title, width: "sm", sort: p => p[key] ?? null,
    data: p => ({ field: key, value: p[key] ?? undefined }), cell: p => <GridValue text={text(p)} muted={!p.qualified} />,
  });
  const columns: GridColumn<PlayTypePlayer>[] = [
    ...(points ? [
      num("adjusted_per_100", "vs exp. /100", "Points allowed", p => signedPoints(p.adjusted_per_100), "Points allowed per 100 play-type possessions minus the league's on the same mix"),
      num("points_per_possession", "Per poss", "Points allowed", p => fixed(p.points_per_possession), "Points allowed per play-type possession"),
      num("expected_points_per_possession", "Expected", "Points allowed", p => fixed(p.expected_points_per_possession), "The league's points per possession on the same mix of play types"),
    ] : []),
    ...(volume ? [
      num("possessions", "Poss", "Volume", p => whole(p.possessions), "Play-type possessions defended"),
      { ...num("games", "GP", "Volume", p => whole(p.games)), width: "xs" as const },
      { key: "top", label: "Most often", group: "Volume", width: "md" as const, align: "left" as const, data: (p: PlayTypePlayer) => ({ field: "top", value: p.top_play_type ?? undefined }),
        cell: (p: PlayTypePlayer) => <span className="ztd-cell-text" data-muted={!p.qualified || undefined}>{playTypeLabel(view, p.top_play_type)}</span> },
    ] : []),
  ];
  return <div className="ztd-board">
    {phone && <div className="ztd-switch"><Segmented size="sm" label="Defender columns" value={mode} onChange={setMode} options={[{ value: "points", label: "Points allowed" }, { value: "volume", label: "Volume" }]} /></div>}
    <StatsGrid<PlayTypePlayer> label={`Defenders by play type, ${scopeLabel(view)}`} name="zts-defense" className={phone ? "ztd-grid ztd-phone" : "ztd-grid"}
      rows={rows} rowKey={p => p.player_id} columns={columns} leadWidth="lg" minWidth="narrow" height="scroll" empty="No defender matches this search."
      rowData={p => ({ player: p.player_id, qualified: p.qualified, selected: p.player_id === selected || undefined })}
      sort={{ key: sort.key, direction: sort.direction, onSort }}
      lead={{ group: "Defender", label: <GridSearch value={query} onChange={setQuery} placeholder="Search defenders…" label="Search defenders" />,
        cell: p => <GridPlayer playerId={p.player_id} name={p.player_name} team={teamOf(p)} season={view.season} era={seasonEra(view.season, teamOf(p))}
          href={`/players/${p.player_id}?season=${view.season}`}
          subtitle={<><TeamCodes codes={p.team_tricodes} season={view.season} />{p.qualified ? null : <span className="ztd-thin"> · small sample</span>}</>}
          tools={<IconButton size="xs" variant="ghost" icon="crosshair" pressed={p.player_id === selected} label={`Show ${p.player_name}'s play types`} onClick={() => onSelect(p.player_id)} data-field="select-defender" />} /> }} />
    <p className="rs-note ztd-note" data-field="board-note">Sorted, not ranked: with no interval, neighbouring rows can&apos;t be told apart. Values have no colour. Defenders under
      {" "}{whole(view.qualification.possessions)} play-type possessions are dimmed and listed last. The crosshair shows a defender&apos;s play types below without moving the page.</p>
  </div>;
}

// ---- One defender -----------------------------------------------------------------------------------------------------------

function DefenderPicker({ view, value, onChange }: { view: PlayTypesView; value: PlayTypePlayer | null; onChange: (id: string) => void }) {
  const [text, setText] = useState("");
  const items = useMemo(() => candidates(view), [view]);
  return <span className="ztd-picker">
    <LookupInput label="Search for a defender" placeholder={`Search ${scopeLabel(view)}`} value={text} onChange={setText} kinds={["player"]} candidates={items}
      excludedIds={value ? [value.player_id] : []} limit={8} openOnFocus={false} clearable={false}
      onSelect={item => { setText(""); onChange(item.canonical_id); }} />
    {value && <Button size="md" variant="ghost" icon="close" aria-label="Clear the defender" onClick={() => { setText(""); onChange(NO_PLAYER); }}>Clear</Button>}
  </span>;
}

function breakdownColumns(phone: boolean, mode: View): GridColumn<PlayTypeBreakdown>[] {
  const points = !phone || mode === "points", volume = !phone || mode === "volume";
  const cell = (key: string, text: (r: PlayTypeBreakdown) => string, value: (r: PlayTypeBreakdown) => number | null) => ({
    data: (r: PlayTypeBreakdown) => ({ field: key, value: value(r) ?? undefined }), cell: (r: PlayTypeBreakdown) => <GridValue text={text(r)} />,
  });
  return [
    ...(points ? [
      { key: "ppp", label: "Allowed", group: "Per possession", width: "sm" as const, ...cell("ppp", r => fixed(r.points_per_possession), r => r.points_per_possession) },
      { key: "league", label: "League", group: "Per possession", width: "sm" as const, ...cell("league", r => fixed(r.league_points_per_possession), r => r.league_points_per_possession) },
      { key: "diff", label: "Difference", group: "Per possession", width: "sm" as const,
        ...cell("diff", r => r.points_per_possession != null && r.league_points_per_possession != null ? signedPoints(r.points_per_possession - r.league_points_per_possession, 2) : "—",
          r => r.points_per_possession != null && r.league_points_per_possession != null ? r.points_per_possession - r.league_points_per_possession : null) },
    ] : []),
    ...(volume ? [
      { key: "poss", label: "Poss", group: "Volume", width: "sm" as const, ...cell("poss", r => whole(r.possessions), r => r.possessions) },
      { key: "share", label: "Share", group: "Volume", width: "sm" as const, ...cell("share", r => share(r.share), r => r.share) },
      { key: "fg", label: "FG%", group: "Volume", width: "sm" as const, title: "Field-goal percentage allowed on that play type", ...cell("fg", r => share(r.fg_pct, 1), r => r.fg_pct) },
    ] : []),
  ];
}

function DefenderCard({ view, player, rule }: { view: PlayTypesView; player: PlayTypePlayer; rule: string | null }) {
  const phone = usePhone();
  const [mode, setMode] = useState<View>("points");
  const team = teamOf(player);
  const tiles = [
    { key: "possessions", label: "Play-type possessions", text: whole(player.possessions), value: player.possessions, foot: `${whole(player.games)} games` },
    { key: "points_per_possession", label: "Allowed per possession", text: fixed(player.points_per_possession), value: player.points_per_possession, foot: `${whole(player.points)} points` },
    { key: "expected_points_per_possession", label: "Expected", text: fixed(player.expected_points_per_possession), value: player.expected_points_per_possession, foot: "the league on this mix" },
    { key: "adjusted_per_100", label: "Against expectation", text: signedPoints(player.adjusted_per_100), value: player.adjusted_per_100, foot: "points per 100 possessions" },
  ];
  return <>
    <div className="zt-hero-card ztd-card" data-field="defender-card" data-player={player.player_id}>
      <PlayerAvatar playerId={player.player_id} name={player.player_name} team={team} size="lg" era={seasonEra(view.season, team)} className="zt-avatar" />
      <div className="zt-hero-text">
        <a className="zt-hero-name" href={`/players/${player.player_id}?season=${view.season}`}>{player.player_name}</a>
        <span className="zt-hero-sub"><TeamCodes codes={player.team_tricodes} season={view.season} /><span>· {scopeLabel(view)}</span></span>
        {rule && <span className="zt-panel-note" data-field="focus-rule">Shown first: the defender with the most play-type possessions.</span>}
      </div>
    </div>
    {!player.qualified && <p className="ztd-text ztd-thin-note" data-field="thin">A small sample: under {whole(view.qualification.possessions)} play-type possessions, so read these with care.</p>}
    <div className="zt-tiles" data-player-tiles="true">
      {tiles.map(t => <div key={t.key} className="zt-well zt-tile" data-field={t.key}>
        <span className="zt-kicker">{t.label}</span><span className="zt-tile-value" data-value={t.value ?? undefined}>{t.text}</span><span className="zt-tile-foot">{t.foot}</span></div>)}
    </div>
    {phone && <div className="ztd-switch"><Segmented size="sm" label="Play-type columns" value={mode} onChange={setMode} options={[{ value: "points", label: "Points allowed" }, { value: "volume", label: "Volume" }]} /></div>}
    <StatsGrid<PlayTypeBreakdown> label={`${player.player_name}'s play types`} name="zts-defense-types" density="compact" height="auto" leadWidth="md"
      className={phone ? "ztd-types ztd-phone" : "ztd-types"} rows={player.breakdown ?? []} rowKey={r => r.play_type} rowData={r => ({ type: r.play_type })}
      lead={{ label: "Play type", cell: r => <span className="ztd-cell-strong">{r.label}</span> }} columns={breakdownColumns(phone, mode)}
      empty="No play type is listed for this defender." />
    <p className="rs-note" data-field="types-note">Play types under the source&apos;s minimum aren&apos;t listed for a player, so shares need not add to 100%; an unlisted type is unknown, not zero.</p>
  </>;
}

function DefenderSection({ view, chosen, onChange }: { view: PlayTypesView; chosen: string | null; onChange: (id: string) => void }) {
  const cleared = chosen === NO_PLAYER;
  const player = cleared ? null : view.focus;
  return <ResearchSection id="defender" icon="crosshair" title="One defender's play types">
    <Panel className="zt-controls ztd-pick" label="Defender"><div className="zt-control-row"><DefenderPicker view={view} value={player} onChange={onChange} /></div></Panel>
    {player ? <DefenderCard view={view} player={player} rule={view.focus_rule} />
      : <div className="ztd-empty" data-field="defender-empty"><p className="ztd-text">No defender chosen. Search above, or press a crosshair in the table.</p>
        <div><Button size="sm" variant="secondary" onClick={() => onChange("")}>Show the busiest defender</Button></div></div>}
  </ResearchSection>;
}

// ---- About ----------------------------------------------------------------------------------------------------------------------

function About({ view }: { view: PlayTypesView }) {
  const q = view.qualification;
  return <ResearchDisclosure id="defense-about" icon="info" title="About these numbers">
    <MethodBlock title="What it measures">
      <p className="ztd-text">For each play type, the points the league scored per possession. A defender&apos;s expectation is those rates applied to the play-type possessions they
        defended; points allowed against expectation is the difference per 100 of those possessions. Lower allowed fewer.</p>
      <ul className="ztd-list">{view.limitations.map(text => <li key={text}>{text}</li>)}</ul>
    </MethodBlock>
    <MethodBlock title="Who is dimmed">
      <p className="ztd-text" data-field="qualification" data-possessions={q.possessions}>Defenders with fewer than {whole(q.possessions)} play-type possessions in the {view.phase === "playoffs" ? "playoffs" : "regular season"}
        {" "}are a small sample: dimmed, listed last and left out of the pattern line. The playoffs use a lower bar because there are fewer games.</p>
    </MethodBlock>
    <MethodBlock title="Source and credit">
      <p className="ztd-text">{sourceLabel(view.sources)}: the NBA&apos;s defensive play-type tables, one per play type, read as season totals. Shown here as they were on the earlier
        Adjusted Shooting page; the registered play-type-adjusted shooting experiment has never run, because its play-type and foul-trip inputs aren&apos;t admitted.</p>
      <ul className="ztd-list ztd-sources">{view.sources.map(s => <li key={s.dataset_id}>{s.variant.replace(/_defensive$/, "").replace(/_/g, " ")}: <code>{s.dataset_id}</code> · <code>{s.content_sha256.slice(0, 16)}</code></li>)}</ul>
    </MethodBlock>
  </ResearchDisclosure>;
}

// ---- Tab ------------------------------------------------------------------------------------------------------------------------

export function DefenseTab() {
  const { get, set } = useUrlState();
  const season = get("dSeason") ?? get("season");
  const phase = get("dPhase") ?? get("phase");
  const chosen = get("dPlayer") ?? get("playerId");
  const cleared = chosen === NO_PLAYER;
  const { data, stale, error, loading, retry } = useFeed([season, phase, cleared ? null : chosen], signal => getPlayTypes({ season, phase, side: "defensive", playerId: cleared ? null : chosen }, signal));
  const view = data ?? stale;
  const seasons = view ? [...new Set(view.scopes.map(s => s.season))] : [];
  const phases = view ? view.scopes.filter(s => s.season === view.season).map(s => s.phase) : [];
  const pick = (id: string) => set({ dPlayer: id || null, playerId: null });
  return <div className="zt-defense" data-section="defense">
    <ResearchSection id="defense" icon="shield" title="Points allowed by play type">
      <p className="ztd-text ztd-lead">zTS asks how hard a scorer&apos;s play types are. This turns it around: the points a defender allowed per play-type possession, against what the
        league scored on the same mix of play types. Below zero allowed fewer than expected.</p>
      {view && <Panel className="zt-controls ztd-controls" label="Scope">
        <div className="zt-control-row">
          <Select size="md" aria-label="Season" value={view.season} onChange={e => {
            const next = e.target.value;
            const open = view.scopes.filter(s => s.season === next).map(s => s.phase);
            set({ dSeason: next, dPhase: open.includes(view.phase) ? (view.phase === "regular_season" ? null : view.phase) : open[0], dPlayer: null, season: null, phase: null, playerId: null });
          }}>{seasons.map(s => <option key={s} value={s}>{s}</option>)}</Select>
          <Segmented size="md" label="Season type" value={view.phase} onChange={next => set({ dPhase: next === "regular_season" ? null : next, dPlayer: null, phase: null, playerId: null })}
            options={PHASES.map(p => ({ ...p, disabled: !phases.includes(p.value) }))} />
          <span className="zt-panel-note" data-field="count" data-count={view.players.length}>{whole(view.players.length)} defenders</span>
        </div>
      </Panel>}
      {error && <FeedFailure error={error} retry={retry} what="Play-type defense" />}
      {loading && !view && <FeedSkeleton label="Loading play-type defense" />}
      {view && <div className="ztd-body" data-loading={loading || undefined}>
        <PatternLine view={view} />
        {view.players.length === 0 ? <GatedNote>No defensive play types are served for the {scopeLabel(view)}.</GatedNote> : <>
          <LeagueTypes view={view} />
          <DefendersGrid view={view} selected={cleared ? null : view.focus?.player_id ?? null} onSelect={pick} />
        </>}
      </div>}
    </ResearchSection>
    {view && view.players.length > 0 && <DefenderSection view={view} chosen={chosen} onChange={pick} />}
    {view && <About view={view} />}
  </div>;
}
