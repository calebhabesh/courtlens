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
import { BrandMark } from "./brand";
import { CourtLensWordmark } from "./courtlens-wordmark";
import { SortHeader } from "./table-ui";
import { ExampleNote, FeedDetails, FeedFailure, FeedScopeFields, FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { FilterBar } from "./ui/filter-bar";
import { Icon } from "./ui/icon";
import { PageHeader } from "./ui/panel";
import { Button, IconButton, Segmented } from "./ui/kit";
import { teamBrandColor } from "@/lib/team-colors";
import { fmt, getSeasonMatchups, pct, type FeedPhase, type MatchupDetail, type MatchupPair, type MatchupRow } from "@/lib/stats-feeds";

/** Every opponent, so the table sorts the whole season rather than a top slice. */
const ROW_LIMIT = 500;

type Column = { key: string; label: string; title: string; value: (row: MatchupRow) => number | null; text: (row: MatchupRow) => string };
const made = (m: number | null | undefined, a: number | null | undefined) => m == null || a == null ? "—" : `${fmt(m, 0)}/${fmt(a, 0)}`;
const GROUPS: { label: string; columns: Column[] }[] = [
  { label: "Exposure", columns: [
    { key: "games", label: "GP", title: "Games with this matchup", value: r => r.games, text: r => fmt(r.games, 0) },
    { key: "matchup_minutes", label: "MIN", title: "Matchup minutes", value: r => r.matchup_minutes, text: r => fmt(r.matchup_minutes) },
    { key: "partial_possessions", label: "POSS", title: "Partial possessions: each matchup weighted by time together", value: r => r.partial_possessions, text: r => fmt(r.partial_possessions) },
  ] },
  { label: "Scoring", columns: [
    { key: "player_points", label: "PTS", title: "Points scored in the matchup", value: r => r.player_points, text: r => fmt(r.player_points, 0) },
    { key: "points_per_100", label: "PTS/100", title: "Points per 100 partial possessions", value: r => r.points_per_100, text: r => fmt(r.points_per_100) },
  ] },
  { label: "Shooting", columns: [
    { key: "fga", label: "FG", title: "Field goals made / attempted", value: r => r.fga, text: r => made(r.fgm, r.fga) },
    { key: "fg_pct", label: "FG%", title: "Field goal percentage", value: r => r.fg_pct, text: r => pct(r.fg_pct) },
    { key: "fg3a", label: "3P", title: "Threes made / attempted", value: r => r.fg3a, text: r => made(r.fg3m, r.fg3a) },
    { key: "fta", label: "FT", title: "Free throws made / attempted", value: r => r.fta ?? null, text: r => made(r.ftm, r.fta) },
  ] },
  { label: "Playmaking", columns: [
    { key: "assists", label: "AST", title: "Assists in the matchup", value: r => r.assists, text: r => fmt(r.assists, 0) },
    { key: "turnovers", label: "TOV", title: "Turnovers in the matchup", value: r => r.turnovers, text: r => fmt(r.turnovers, 0) },
  ] },
];
const COLUMNS = GROUPS.flatMap(group => group.columns);
const GROUP_STARTS = new Set(GROUPS.slice(1).map(group => group.columns[0].key));

/** Pair rows: the same measures, read as "with the ball against the other player". */
const PAIR_ROWS: { label: string; title: string; value: (row: MatchupRow) => number | null; text: (row: MatchupRow) => string; compare?: boolean }[] = [
  { label: "GP", title: "Games with this matchup", value: r => r.games, text: r => fmt(r.games, 0) },
  { label: "MIN", title: "Matchup minutes", value: r => r.matchup_minutes, text: r => fmt(r.matchup_minutes) },
  { label: "POSS", title: "Partial possessions", value: r => r.partial_possessions, text: r => fmt(r.partial_possessions) },
  { label: "PTS", title: "Points scored", value: r => r.player_points, text: r => fmt(r.player_points, 0) },
  { label: "PTS/100", title: "Points per 100 partial possessions", value: r => r.points_per_100, text: r => fmt(r.points_per_100), compare: true },
  { label: "FG", title: "Field goals made / attempted", value: r => r.fga, text: r => made(r.fgm, r.fga) },
  { label: "FG%", title: "Field goal percentage", value: r => r.fg_pct, text: r => pct(r.fg_pct), compare: true },
  { label: "3P", title: "Threes made / attempted", value: r => r.fg3a, text: r => made(r.fg3m, r.fg3a) },
  { label: "FT", title: "Free throws made / attempted", value: r => r.fta ?? null, text: r => made(r.ftm, r.fta) },
  { label: "AST", title: "Assists", value: r => r.assists, text: r => fmt(r.assists, 0) },
  { label: "TOV", title: "Turnovers", value: r => r.turnovers, text: r => fmt(r.turnovers, 0) },
];

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
  const sort = (key: string) => set({ sort: key === "partial_possessions" ? null : key, dir: key === sortKey && sortDir === "desc" ? "asc" : null });
  const guardedBy = side === "offense";

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
            {pair && <Button size="sm" variant="ghost" aria-label="Clear matchup player" onClick={() => set({ opponentId: null })}>Clear</Button>}
          </div>
          {pair
            ? <MatchupSlot side="b" pair={pair} excludedIds={[detail.player_id]} onPick={id => set({ opponentId: id })} />
            : <CompareEmptySlot side="b" label="Add a matchup" selection={null} excludedIds={[detail.player_id]} onPick={selection => set({ opponentId: selection.id })} />}
        </div>
        <ExampleNote name={detail.player_name} rule={data.focus_rule} />
        {pair && <PairRows player={detail} pair={pair} />}
        <section className="stats-workspace mu-table" aria-label={guardedBy ? `Who guarded ${detail.player_name}` : `Who ${detail.player_name} guarded`}>
          <h2 className="mu-table-title">{guardedBy ? `Guarded By` : `Guarding`} <span>{detail.opponents.toLocaleString("en-US")} {guardedBy ? "defenders" : "players"}</span></h2>
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
                    <th scope="col" className="pinned-col mu-name">{guardedBy ? "Defender" : "Player"}</th>
                    {COLUMNS.map(column => <SortHeader key={column.key} label={column.label} metric={column.key} description={column.title}
                      active={sortKey === column.key} direction={sortDir} onSort={sort} className={`num ${GROUP_STARTS.has(column.key) ? "group-start" : ""}`} />)}
                  </tr>
                </thead>
                <tbody key={`${detail.player_id}-${side}`} className="pvp-fade">
                  {rows.map(row => <tr key={row.player_id} className="mu-row" data-selected={row.player_id === pair?.player_id || undefined}
                    onClick={event => { if (!(event.target as HTMLElement).closest("a, button")) set({ opponentId: row.player_id }); }}>
                    <th scope="row" className="pinned-col mu-name">
                      <span className="mu-identity">
                        <PlayerPortrait playerId={row.player_id} name={row.player_name} size="sm" era={data.season && row.team_tricode ? { season: data.season, team: row.team_tricode } : null} />
                        <Link href={`/players/${row.player_id}?${scope}`}>{row.player_name}</Link>
                        {row.team_tricode && <TeamLogo team={row.team_tricode} season={data.season} size={16} />}
                      </span>
                    </th>
                    {COLUMNS.map(column => <td key={column.key} className={`num ${GROUP_STARTS.has(column.key) ? "group-start" : ""}`}>{column.text(row)}</td>)}
                  </tr>)}
                </tbody>
              </table>
            </div>
          </div>
          <p className="mu-note">Partial possessions weight each matchup by time together. Choose a row to see that matchup both ways. An absent pairing is unobserved, not zero.</p>
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
  return <table className="pvp-rows mu-pair" aria-label={`${player.player_name} and ${pair.player_name}, each with the ball`}>
    <colgroup><col /><col className="pvp-col-label" /><col /></colgroup>
    <thead><tr>
      <th scope="col" className="mu-pair-head">{player.player_name} with the ball</th>
      <th scope="col"><span className="sr-only">Measure</span></th>
      <th scope="col" className="mu-pair-head">{pair.player_name} with the ball</th>
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
      {(!a || !b) && <tr className="pvp-pending"><td colSpan={3}>{!a && !b ? "Neither direction was observed" : `${(a ? pair.player_name : player.player_name)} was never observed with the ball against ${(a ? player.player_name : pair.player_name)}`} in this scope; unobserved, not zero.</td></tr>}
    </tbody>
  </table>;
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
        {/* eslint-disable-next-line @next/next/no-img-element -- static SVG artwork, decorative */}
        {record && <img className="pvp-watermark" src={record.asset} alt="" aria-hidden="true" />}
        <PlayerPortrait playerId={id} name={name} size="xl" className="pvp-portrait" era={season && team ? { season, team } : null} />
        {detail?.matchup_minutes != null && <span className="pvp-badge" title={`${fmt(detail.matchup_minutes, 0)} matchup minutes`}>{fmt(detail.matchup_minutes, 0)} MIN</span>}
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
          {detail && <span className="pvp-bio">{guardedBy ? "Scored" : "Allowed"} {fmt(detail.points_per_100)} pts/100 · {pct(detail.fg_pct)} FG</span>}
        </div>}
  </div>;
}
