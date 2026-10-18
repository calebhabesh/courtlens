"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
// The Stats table look, as the career table borrows it.
import "./stats-explorer.css";
import { EntityField } from "./entity-picker";
import { PlayerPortrait } from "./player-portrait";
import { CompareEmptySlot } from "./compare-empty-slot";
import { teamRecord } from "./compare-player-slot";
import { TeamLogo } from "./team-logo";
import { TeamWatermark } from "./team-watermark";
import { BrandMark } from "./brand";
import { CourtLensWordmark } from "./courtlens-wordmark";
import { SortHeader } from "./table-ui";
import { FeedDetails, FeedFailure, FeedScopeFields, FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { FilterBar } from "./ui/filter-bar";
import { Icon } from "./ui/icon";
import { PageHeader } from "./ui/panel";
import { Button, IconButton, Segmented, Select } from "./ui/kit";
import { teamBrandColor } from "@/lib/team-colors";
import { fmt, getSeasonMatchups, pct, type FeedPhase, type MatchupDetail, type MatchupPair, type MatchupRow } from "@/lib/stats-feeds";

/** Every opponent, so the table sorts the whole season rather than a top slice. */
const ROW_LIMIT = 500;

type Column = { key: string; label: string; title: string; value: (row: MatchupRow) => number | null; text: (row: MatchupRow) => string };
const made = (m: number | null | undefined, a: number | null | undefined) => m == null || a == null ? "—" : `${fmt(m, 0)}/${fmt(a, 0)}`;
const GROUPS: { label: string; columns: Column[] }[] = [
  { label: "Exposure", columns: [
    { key: "games", label: "GP", title: "Games in which the two were matched up", value: r => r.games, text: r => fmt(r.games, 0) },
    { key: "matchup_minutes", label: "MIN", title: "Minutes the defender spent guarding the offensive player", value: r => r.matchup_minutes, text: r => fmt(r.matchup_minutes) },
    { key: "partial_possessions", label: "POSS", title: "Possessions, each weighted by the share of it the two were matched up", value: r => r.partial_possessions, text: r => fmt(r.partial_possessions) },
  ] },
  { label: "Scoring", columns: [
    { key: "player_points", label: "PTS", title: "Points the offensive player scored while guarded by the defender", value: r => r.player_points, text: r => fmt(r.player_points, 0) },
    { key: "points_per_100", label: "PTS/100", title: "The offensive player's points per 100 matchup possessions", value: r => r.points_per_100, text: r => fmt(r.points_per_100) },
  ] },
  { label: "Shooting", columns: [
    { key: "fga", label: "FG", title: "The offensive player's field goals made / attempted", value: r => r.fga, text: r => made(r.fgm, r.fga) },
    { key: "fg_pct", label: "FG%", title: "The offensive player's field goal percentage", value: r => r.fg_pct, text: r => pct(r.fg_pct) },
    { key: "fg3a", label: "3P", title: "The offensive player's threes made / attempted", value: r => r.fg3a, text: r => made(r.fg3m, r.fg3a) },
    { key: "fta", label: "FT", title: "The offensive player's free throws made / attempted", value: r => r.fta ?? null, text: r => made(r.ftm, r.fta) },
  ] },
  { label: "Playmaking", columns: [
    { key: "assists", label: "AST", title: "The offensive player's assists in the matchup", value: r => r.assists, text: r => fmt(r.assists, 0) },
    { key: "turnovers", label: "TOV", title: "The offensive player's turnovers in the matchup", value: r => r.turnovers, text: r => fmt(r.turnovers, 0) },
  ] },
];
const COLUMNS = GROUPS.flatMap(group => group.columns);
/** Possession floors for ranking by rate; a handful of possessions makes PTS/100 noise. */
const FLOORS = [0, 10, 25, 50, 100] as const;
const RATE_FLOOR = 25;
type Ranking = "matched" | "best" | "worst";

/** Case- and accent-insensitive, so "doncic" finds Dončić. */
const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const GROUP_STARTS = new Set(GROUPS.slice(1).map(group => group.columns[0].key));

/** Pair rows: the table's measures, one column per direction. */
type PairRow = Omit<Column, "key"> & { compare: boolean };
const PAIR_ROWS: PairRow[] = COLUMNS.map(({ label, title, value, text }) =>
  ({ label, title, value, text, compare: label === "PTS/100" || label === "FG%" }));

/**
 * Player Matchups (alignment row 16): Player Comparison's card. The player's slot, an optional
 * second player whose direct matchup reads both ways, then every opponent in a Stats-style table.
 * Matchups are NBA tracking's estimate of who guarded whom; an absent pairing is unobserved.
 */
export function SeasonMatchupsView() {
  const { get, set } = useUrlState();
  const season = get("season"), phase = get("phase"), playerId = get("playerId"), opponentId = get("opponentId");
  const side = get("side") === "defense" ? "defense" : "offense";
  const sortKey = COLUMNS.some(column => column.key === get("sort")) ? get("sort")! : "partial_possessions";
  const sortDir = get("dir") === "asc" ? "asc" : "desc";
  const { data, error, loading, retry } = useFeed([season, phase, playerId, side, opponentId],
    signal => getSeasonMatchups({ season, phase, playerId, side, opponentId, limit: ROW_LIMIT }, signal));
  const detail = data?.detail;
  const pair = data?.pair ?? null;
  const scope = data ? new URLSearchParams({ season: data.season, phase: data.phase }).toString() : "";
  const rows = useMemo(() => {
    const column = COLUMNS.find(entry => entry.key === sortKey)!;
    return [...detail?.rows ?? []].sort((x, y) => {
      const vx = column.value(x), vy = column.value(y);
      if (vx == null && vy == null) return x.player_name.localeCompare(y.player_name);
      if (vx == null) return 1;
      if (vy == null) return -1;
      return (sortDir === "asc" ? vx - vy : vy - vx) || x.player_name.localeCompare(y.player_name);
    });
  }, [detail, sortKey, sortDir]);
  // The name search filters locally, like the Stats table's; a new player or side starts it empty.
  const tableKey = `${detail?.player_id}-${side}`;
  const [search, setSearch] = useState({ key: tableKey, text: "" });
  const searchText = search.key === tableKey ? search.text : "";
  const needle = fold(searchText.trim());
  const guardedBy = side === "offense";
  // Best and worst rank by PTS/100: the player's offense (Guarded By) is best where they scored
  // most, their defense (Guarding) where opponents scored least. The presets only set the sort,
  // so a header click and a preset never disagree. A rate sort applies a possession floor.
  const bestDir = guardedBy ? "desc" : "asc";
  const ranking: Ranking | "" = sortKey === "partial_possessions" && sortDir === "desc" ? "matched"
    : sortKey === "points_per_100" ? sortDir === bestDir ? "best" : "worst" : "";
  const floorParam = Number(get("minPoss"));
  const floor = FLOORS.includes(floorParam as (typeof FLOORS)[number]) && get("minPoss") != null ? floorParam : sortKey === "points_per_100" ? RATE_FLOOR : 0;
  const shown = rows.filter(row => (!needle || fold(row.player_name).includes(needle)) && (!floor || (row.partial_possessions ?? 0) >= floor));
  const sort = (key: string) => set({ sort: key === "partial_possessions" ? null : key, dir: key === sortKey && sortDir === "desc" ? "asc" : null });
  const rank = (value: Ranking) => value === "matched" ? set({ sort: null, dir: null })
    : set({ sort: "points_per_100", dir: (value === "best") === (bestDir === "desc") ? null : "asc" });

  return <div className="pvp mu" role="region" aria-label="Player Matchups">
    <PageHeader className="pvp-header" icon="swap" title="Player Matchups" subtitle="Who guarded whom, from NBA tracking." />
    {data && <div className="mu-console"><FilterBar label="Matchup controls" summary={data.label}
      scope={<FeedScopeFields scopes={data.scopes} season={data.season} phase={data.phase} onChange={next => set({ season: next.season, phase: next.phase as FeedPhase })} />}
      modes={<Segmented size="sm" label="Matchup side" value={side} onChange={value => set({ side: value === "defense" ? "defense" : null })}
        options={[{ value: "offense", label: "Guarded By", title: "Defenders who guarded this player" }, { value: "defense", label: "Guarding", title: "Players this player guarded" }]} />}
      details={<FeedDetails envelope={data} />} /></div>}
    {error && <FeedFailure error={error} retry={retry} what="Player Matchups" />}
    {loading && !data && <FeedSkeleton label="Loading matchups" />}
    {data && detail && <div className="pvp-column" data-paired>
      <section className="pvp-card mu-card" aria-label="Matchup card" aria-busy={loading || undefined}>
        <div className="pvp-players">
          <MatchupSlot side="a" detail={detail} guardedBy={guardedBy} excludedIds={pair ? [pair.player_id] : []}
            onPick={id => set({ playerId: id, opponentId: id === opponentId ? null : opponentId })} />
          <div className="pvp-pair-actions">
            <IconButton size="sm" variant="secondary" icon="swap" label="Swap players" disabled={!pair}
              onClick={() => pair && set({ playerId: pair.player_id, opponentId: detail.player_id })} />
            {pair && <Button size="sm" variant="ghost" aria-label="Clear matchup player" title="Clear the matchup player; the player whose matchups are listed stays" onClick={() => set({ opponentId: null })}>Clear</Button>}
          </div>
          {pair
            ? <MatchupSlot side="b" pair={pair} excludedIds={[detail.player_id]} onPick={id => set({ opponentId: id })} />
            : <CompareEmptySlot side="b" label="Add a matchup" selection={null} excludedIds={[detail.player_id]} onPick={selection => set({ opponentId: selection.id })} />}
        </div>
        {/* A player picked by rule says so (C3), centred under the slots it explains. */}
        {data.focus_rule && <p className="mu-default">Shown by default · {data.focus_rule}</p>}
        {pair && <PairRows player={detail} pair={pair} />}
        <section className="stats-workspace mu-table" aria-label={guardedBy ? `Who guarded ${detail.player_name}` : `Who ${detail.player_name} guarded`}>
          <div className="mu-table-head">
            <h2 className="mu-table-title">{guardedBy ? `Guarded By` : `Guarding`} <span>{shown.length !== rows.length ? `${shown.length.toLocaleString("en-US")} of ` : ""}{detail.opponents.toLocaleString("en-US")} {guardedBy
              ? `defenders · ${detail.player_name}'s offense against each one`
              : `players · each one's offense against ${detail.player_name}`}</span></h2>
            <div className="mu-table-tools">
              <Segmented<Ranking | ""> size="sm" label="Rank matchups" value={ranking} onChange={value => value && rank(value)} options={[
                { value: "matched", label: "Most Matched", title: guardedBy ? `Defenders who guarded ${detail.player_name} for the most possessions` : `Players ${detail.player_name} guarded for the most possessions` },
                { value: "best", label: guardedBy ? "Scored Best" : "Defended Best", title: guardedBy ? `Defenders ${detail.player_name} scored the most points per 100 possessions against` : `Players who scored the fewest points per 100 possessions against ${detail.player_name}` },
                { value: "worst", label: guardedBy ? "Scored Worst" : "Defended Worst", title: guardedBy ? `Defenders ${detail.player_name} scored the fewest points per 100 possessions against` : `Players who scored the most points per 100 possessions against ${detail.player_name}` },
              ]} />
              <Select size="sm" aria-label="Minimum matchup possessions" value={String(floor)}
                onChange={event => set({ minPoss: event.target.value })}>
                {FLOORS.map(value => <option key={value} value={value}>{value ? `${value}+ POSS` : "Any POSS"}</option>)}
              </Select>
            </div>
          </div>
          <div className="stats-table-frame is-table">
            <div className="table-wrapper stats-scroll-region mu-scroll" role="region" aria-label="Matchup table scroll area" tabIndex={0}>
              <table className="data-table dense-stats-table mu-grid" aria-label={guardedBy ? `Defenders who guarded ${detail.player_name}` : `Players ${detail.player_name} guarded`}>
                <colgroup><col className="mu-name-column" />{COLUMNS.map(column => <col key={column.key} />)}</colgroup>
                <thead>
                  <tr className="stats-header-tier-1">
                    <th className="pinned-col mu-name-group"><span className="sr-only">Player</span></th>
                    {GROUPS.map((group, index) => <th key={group.label} colSpan={group.columns.length} scope="colgroup" className={`stats-group-th ${index > 0 ? "group-start" : ""}`}>{group.label}</th>)}
                  </tr>
                  <tr className="stats-header-tier-2">
                    <th scope="col" className="pinned-col mu-name">
                      <div className="stats-header-search" role="search">
                        <div className="lookup-input-wrapper">
                          <Icon name="search" className="lookup-search-icon" />
                          <input type="search" className="lookup-input" aria-label={guardedBy ? "Filter defenders by name" : "Filter offensive players by name"}
                            placeholder={guardedBy ? "Search defenders…" : "Search players…"} autoComplete="off" spellCheck={false} value={searchText}
                            onChange={event => setSearch({ key: tableKey, text: event.target.value })}
                            onKeyDown={event => { if (event.key === "Escape" && searchText) { event.preventDefault(); setSearch({ key: tableKey, text: "" }); } }} />
                          {searchText && <IconButton size="sm" icon="close" label="Clear name search" onClick={() => setSearch({ key: tableKey, text: "" })} />}
                        </div>
                      </div>
                    </th>
                    {COLUMNS.map(column => <SortHeader key={column.key} label={column.label} metric={column.key} description={column.title}
                      active={sortKey === column.key} direction={sortDir} onSort={sort} className={`num ${GROUP_STARTS.has(column.key) ? "group-start" : ""}`} />)}
                  </tr>
                </thead>
                <tbody key={`${detail.player_id}-${side}`} className="pvp-fade">
                  {shown.length === 0 && <tr><td colSpan={COLUMNS.length + 1} className="stats-empty-cell">
                    No {guardedBy ? "defender" : "player"} {needle ? <>matches &ldquo;{searchText.trim()}&rdquo;{floor ? ` with ${floor}+ possessions` : ""}</> : `has ${floor}+ possessions`}
                  </td></tr>}
                  {shown.map(row => <tr key={row.player_id} className="mu-row" data-selected={row.player_id === pair?.player_id || undefined}
                    onClick={event => { if (!(event.target as HTMLElement).closest("a, button")) set({ opponentId: row.player_id }); }}>
                    <th scope="row" className="pinned-col mu-name">
                      <span className="mu-identity">
                        <PlayerPortrait playerId={row.player_id} name={row.player_name} size="sm" era={data.season && row.team_tricode ? { season: data.season, team: row.team_tricode } : null} />
                        <Link href={`/players/${row.player_id}?${scope}`}>{row.player_name}</Link>
                        {row.team_tricode && <TeamLogo team={row.team_tricode} season={data.season} size={16} />}
                      </span>
                    </th>
                    {COLUMNS.map(column => <td key={column.key} className={`stats-metric-cell num ${GROUP_STARTS.has(column.key) ? "group-start" : ""}`}>{column.text(row)}</td>)}
                  </tr>)}
                </tbody>
              </table>
            </div>
          </div>
          <p className="mu-note">NBA tracking assigns each offensive player a primary defender, moment to moment. MIN is time matched up; POSS weights each possession by the share of it the two were matched up. Best and worst rank by PTS/100 among matchups with at least the chosen possessions (25 unless changed). Choose a row to see that matchup both ways. A missing pairing was never observed, not zero.</p>
        </section>
        <footer className="pvp-foot"><BrandMark size={22} framed={false} /><CourtLensWordmark height={18} /></footer>
      </section>
    </div>}
  </div>;
}

/** The two directions side by side: each player with the ball against the other. */
function PairRows({ player, pair }: { player: MatchupDetail; pair: MatchupPair }) {
  const a = pair.player_on_offense, b = pair.opponent_on_offense;
  const cell = (row: MatchupRow | null, spec: (typeof PAIR_ROWS)[number], leading: boolean) =>
    <td className="pvp-value pvp-plain" data-leading={leading || undefined}>{row ? spec.text(row) : "—"}</td>;
  return <table className="pvp-rows mu-pair" aria-label={`${player.player_name} and ${pair.player_name}, each guarded by the other`}>
    <colgroup><col /><col className="pvp-col-label" /><col /></colgroup>
    <thead><tr>
      <PairHead offense={player.player_name} defense={pair.player_name} />
      <th scope="col"><span className="sr-only">Measure</span></th>
      <PairHead offense={pair.player_name} defense={player.player_name} />
    </tr></thead>
    <tbody>
      {PAIR_ROWS.map(spec => {
        const va = a ? spec.value(a) : null, vb = b ? spec.value(b) : null;
        // Rates only, and only when both directions were observed; counts depend on exposure.
        const lead = spec.compare && va != null && vb != null && va !== vb ? va > vb ? "a" : "b" : null;
        return <tr key={spec.label}>
          {cell(a, spec, lead === "a")}
          <th scope="row" className="pvp-label" title={spec.title}>{spec.label}</th>
          {cell(b, spec, lead === "b")}
        </tr>;
      })}
      {(!a || !b) && <tr className="pvp-pending"><td colSpan={3}>{!a && !b ? "Neither direction was observed" : `${(a ? pair.player_name : player.player_name)} was never observed on offense against ${(a ? player.player_name : pair.player_name)}`} in this scope; unobserved, not zero.</td></tr>}
    </tbody>
  </table>;
}

/** Whose numbers a pair column holds: the offensive player's, while the other guarded them. */
function PairHead({ offense, defense }: { offense: string; defense: string }) {
  return <th scope="col" className="mu-pair-head"><strong>{offense} On Offense</strong><span>Guarded By {defense}</span></th>;
}

/** One side of the card in Player Comparison's slot: photo on the team's colour, then who. */
function MatchupSlot({ side, detail, pair, guardedBy = true, excludedIds, onPick }: {
  side: "a" | "b"; detail?: MatchupDetail; pair?: MatchupPair; guardedBy?: boolean; excludedIds: string[]; onPick: (id: string) => void;
}) {
  const params = useSearchParams();
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (searching) searchRef.current?.querySelector<HTMLInputElement>('[role="combobox"]')?.focus(); }, [searching]);
  const id = detail?.player_id ?? pair!.player_id, name = detail?.player_name ?? pair!.player_name;
  const team = (detail?.team_tricode ?? pair?.team_tricode) || undefined;
  const season = params.get("season");
  const tint = teamBrandColor(team, season);
  const record = teamRecord(team, season);
  const label = side === "a" ? "Player" : "Matchup player";
  return <div className="pvp-slot pvp-fade" data-identity={side} style={tint ? ({ "--team-tint": tint } as CSSProperties) : undefined}>
    <div className="pvp-photo-frame">
      <button type="button" className="pvp-photo" aria-expanded={searching} aria-label={`Change ${label}, ${name}`} onClick={() => setSearching(open => !open)}>
        {record && <TeamWatermark asset={record.asset} />}
        <PlayerPortrait playerId={id} name={name} size="xl" className="pvp-portrait" era={season && team ? { season, team } : null} />
        {detail?.matchup_minutes != null && <span className="pvp-badge" title={`${fmt(detail.matchup_minutes, 0)} minutes ${guardedBy ? "guarded, all defenders" : "guarding, all players"}`}>{fmt(detail.matchup_minutes, 0)} MIN</span>}
        <span className="pvp-change" aria-hidden="true"><Icon name="user-edit" size={16} /></span>
      </button>
    </div>
    {searching
      ? <div className="pvp-search" ref={searchRef}>
          <EntityField label={label} value="" excludedIds={excludedIds} portalDropdown openOnFocus={false} dropdownMinWidth={440}
            releaseId={params.get("releaseId") || params.get("release_id")} season={season} phase={params.get("phase")} beforeDate={params.get("beforeDate") || params.get("before_date")}
            onChange={(next, items) => { if (next && items[0]) { setSearching(false); onPick(next); } }} />
        </div>
      : <div className="pvp-who">
          <Link className="pvp-name" href={`/players/${id}`}>{name}</Link>
          {team && <span className="pvp-team"><span className="pvp-team-entry"><TeamLogo team={team} season={season} size={16} />{record?.artwork_name ?? team}</span></span>}
          {detail && <span className="pvp-bio mu-bio">{guardedBy ? "Scored" : "Allowed"} {fmt(detail.points_per_100)} pts/100 · {pct(detail.fg_pct)} FG<span>{guardedBy ? "against all defenders" : "guarding all players"}</span></span>}
        </div>}
  </div>;
}
