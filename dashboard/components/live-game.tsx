"use client";

import Link from "next/link";
import { useDeferredValue, useState, type CSSProperties, type ReactNode } from "react";
import {
  awayFirst, formatRecord, gameStatus, lineFavourite, madeAttempted, moneyline, periodLabel, seasonOf, shootingTone, STAT_KEYS, teamCode, teamFullName, trueShooting, twoPoint,
  type LiveGame, type LiveGameData, type LiveInjury, type LiveLeader, type LiveOdds, type LivePlay, type LivePlayer, type LiveTeam,
} from "@/lib/live";
import { teamAccent, teamBrandColor } from "@/lib/team-colors";
import { seasonEra } from "@/lib/portrait-source";
import { ShotChart } from "./live-shot-chart";
import { logoTeam, Panel } from "./live-panel";
import { DivisionStandings, GameFlow, Matchups, NewsPanel } from "./live-game-extras";
import { HotkeyBadge } from "./live-board";
import { TeamLogo } from "./team-logo";
import { Icon, type IconName } from "./ui/icon";
import { PlayerPortrait } from "./player-portrait";
import { teamRecord } from "./compare-player-slot";
import { TeamWatermark } from "./team-watermark";
import { PredictionPanel } from "./live-prediction";
import { PageHeader } from "./ui/panel";
import { SearchField } from "./ui/input";
import { ButtonLink, Segmented } from "./ui/kit";
import { Tabs, TabsContent, TabsList, TabTrigger } from "./ui/tabs";

export type GameTab = "summary" | "box" | "plays" | "pregame";
export const GAME_TABS: { value: GameTab; label: string }[] = [
  { value: "summary", label: "Summary" },
  { value: "box", label: "Box Score" },
  { value: "plays", label: "Play-by-Play" },
  { value: "pregame", label: "Pre-Game" },
];

const vars = (values: Record<`--${string}`, string>) => values as CSSProperties;

function rgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Two colours a viewer could mistake for each other (two reds), by distance in RGB. */
function similar(a: string, b: string): boolean {
  const [x, y] = [rgb(a), rgb(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < 64;
}

/**
 * Each team keeps its own colour, as on Databallr (follow-up 5). `--live-*-brand` is the true brand
 * colour (the banner's bar: black for the Nets); `--live-away` / `--live-home` are the brightened
 * accents that stay visible as shot marks and bars. Only near-identical colours change, and then
 * the away team takes a lighter tint of its own colour, never another team's.
 */
export function teamColors(teams: readonly LiveTeam[], season: string): CSSProperties {
  const away = teams.find(t => t.side === "away"), home = teams.find(t => t.side === "home");
  const a = teamAccent(away?.tricode ?? null, season), h = teamAccent(home?.tricode ?? null, season);
  const awayAccent = a ?? "var(--color-text-secondary)";
  return vars({
    "--live-away": a && h && similar(a, h) ? `color-mix(in srgb, ${a} 55%, white)` : awayAccent,
    "--live-home": h ?? "var(--color-text-secondary)",
    "--live-away-brand": teamBrandColor(away?.tricode ?? null, season) ?? awayAccent,
    "--live-home-brand": teamBrandColor(home?.tricode ?? null, season) ?? h ?? "var(--color-text-secondary)",
  });
}



/**
 * Follow-up 22: ESPN's scorecard. Big logos at the edges on a wash of each team's colour, the full
 * name with its record and venue record beside the score, and the status over a compact line score
 * in the middle. An arrow points at the winner's score; the loser's dims.
 */
export function GameBanner({ game, index, backHref }: { game: LiveGame; index: number; backHref: string }) {
  const [away, home] = awayFirst(game.teams);
  const season = seasonOf(game.slate_date);
  const played = game.status === "in_progress" || game.status === "final";
  const periods = Math.max(4, ...game.teams.map(t => t.linescores?.length ?? 0));
  const won = (team: LiveTeam) => game.status === "final" && team.winner === true;
  const lost = (team: LiveTeam) => game.status === "final" && team.winner === false;
  const side = (team: LiveTeam) => {
    const venue = formatRecord(team.venue_record);
    const label = team.side === "home" ? "Home" : "Away";
    return <div className="live-banner-team" data-side={team.side} data-lost={lost(team) || undefined}>
      <span className="live-banner-logo"><TeamLogo team={logoTeam(team)} season={season} size={64} /></span>
      <span className="live-banner-name">
        <span className="live-banner-full">{team.name}</span>
        <span className="live-banner-code">{teamCode(team)}</span>
        <span className="live-banner-meta">
          {team.record && <span className="live-banner-record"><span className="sr-only">Record </span>{formatRecord(team.record)}</span>}
          {team.record && <span aria-hidden="true">, </span>}
          {venue ? <span><span className="live-banner-record">{venue}</span> {label}</span> : <span>{label}</span>}
        </span>
      </span>
      {played && <strong className="live-banner-score">
        {won(team) && <span className="live-banner-win" aria-hidden="true" />}
        {team.score ?? "—"}
        {won(team) && <span className="sr-only"> (winner)</span>}
      </strong>}
    </div>;
  };
  return <header className="live-banner">
    <div className="sr-only"><PageHeader title={`${away.name} at ${home.name}`} subtitle={`${gameStatus(game)} · ${game.slate_date}`} /></div>
    <ButtonLink href={backHref} size="sm" variant="secondary" icon="back" className="live-banner-back">All Games</ButtonLink>
    <span className="live-banner-hotkey"><HotkeyBadge n={index + 1} label="Hotkey:" /></span>
    <div className="live-banner-board">
      {side(away)}
      <div className="live-banner-center">
        <p className="live-banner-status">{game.status === "in_progress" && <span className="live-dot" aria-hidden="true" />}{gameStatus(game)}</p>
        {played && <table className="live-banner-lines">
          <caption className="sr-only">Points by period</caption>
          <thead><tr><th scope="col"><span className="sr-only">Team</span></th>{Array.from({ length: periods }, (_, i) => <th scope="col" key={i}>{i < 4 ? i + 1 : periodLabel(i + 1)}</th>)}<th scope="col">T</th></tr></thead>
          <tbody>{[away, home].map(team => <tr key={team.source_id} data-dim={lost(team) || undefined}>
            <th scope="row">{teamCode(team)}</th>
            {Array.from({ length: periods }, (_, i) => <td key={i}>{team.linescores?.[i] ?? "—"}</td>)}
            <td className="live-banner-lines-total">{team.score ?? "—"}</td>
          </tr>)}</tbody>
        </table>}
      </div>
      {side(home)}
    </div>
  </header>;
}

// ---------------------------------------------------------------- Summary (X's game summary)

/** Follow-up 21: the player page's photo, the season team's logo behind the headshot in a team-colour ring. */
function RingPhoto({ playerId, name, team, season }: { playerId?: string; name: string; team: LiveTeam; season: string }) {
  const tint = teamBrandColor(team.tricode ?? null, season);
  const art = teamRecord(team.tricode ?? undefined, season);
  return <span className="live-ring" style={tint ? vars({ "--team-tint": tint }) : undefined}>
    {art && <TeamWatermark asset={art.asset} />}
    <PlayerPortrait playerId={playerId} name={name} size="md" className="live-ring-portrait" era={{ season, team: team.tricode ?? null }} />
  </span>;
}

/** One team's leader in a category: photo, name with team and position, the value. */
/** Follow-up 24: ESPN's line under a leader (points: FG and FT; rebounds: DREB and OREB; assists: TO and MIN). */
export function leaderLine(category: string, stats: Record<string, string | null> | undefined): string | null {
  if (!stats) return null;
  const slash = (key: string) => stats[key]?.replace("-", "/") ?? null;
  const parts = category === "points" ? [slash(STAT_KEYS.fg) && `${slash(STAT_KEYS.fg)} FG`, slash(STAT_KEYS.ft) && `${slash(STAT_KEYS.ft)} FT`]
    : category === "rebounds" ? [stats.defensiveRebounds != null && `${stats.defensiveRebounds} DREB`, stats[STAT_KEYS.oreb] != null && `${stats[STAT_KEYS.oreb]} OREB`]
    : category === "assists" ? [stats[STAT_KEYS.to] != null && `${stats[STAT_KEYS.to]} TO`, stats[STAT_KEYS.min] != null && `${stats[STAT_KEYS.min]} MIN`]
    : [];
  const text = parts.filter(Boolean).join(", ");
  return text || null;
}

function LeaderLine({ leader, season, team, top, player }: { leader?: LiveLeader; season: string; team: LiveTeam; top: boolean; player?: LivePlayer }) {
  const meta = [teamCode(team), leader?.position, player?.jersey && `#${player.jersey}`].filter(Boolean).join(" · ");
  const line = leader ? leaderLine(leader.category, player?.statistics) : null;
  if (!leader) return <li className="live-leader"><span className="live-leader-photo"><TeamLogo team={logoTeam(team)} season={season} size={20} /></span><span className="live-leader-text"><span className="live-leader-name live-muted">No leader listed</span><span className="live-leader-meta">{teamCode(team)}</span></span><span className="live-leader-value live-muted">—</span></li>;
  const name = leader.canonical_id ? <Link href={`/players/${leader.canonical_id}?season=${season}`}>{leader.name}</Link> : leader.name;
  return <li className="live-leader" data-top={top || undefined}>
    <RingPhoto playerId={leader.canonical_id ?? undefined} name={leader.name} team={team} season={season} />
    <span className="live-leader-text">
      <span className="live-leader-name">{name}</span>
      <span className="live-leader-meta">{meta}</span>
      {line && <span className="live-leader-line">{line}</span>}
    </span>
    <strong className="live-leader-value">{leader.value}</strong>
  </li>;
}

/** Follow-up 9: three equal category tiles, each listing both teams' leaders, the higher one first in weight. */
function Leaders({ data }: { data: LiveGameData }) {
  const [away, home] = awayFirst(data.game.teams);
  const season = seasonOf(data.game.slate_date);
  const categories = [["points", "Points"], ["rebounds", "Rebounds"], ["assists", "Assists"]] as const;
  const find = (team: LiveTeam, category: string) => data.leaders?.find(l => l.team_source_id === team.source_id && l.category === category);
  const value = (leader?: LiveLeader) => Number(leader?.value ?? Number.NaN);
  const player = (leader?: LiveLeader) => leader ? data.players?.find(p => p.source_id === leader.source_id) : undefined;
  return <Panel title="Game Leaders" icon="crown">
    <div className="live-leaders">
      {categories.map(([key, label]) => {
        const a = find(away, key), h = find(home, key);
        const top = Math.max(value(a), value(h));
        return <section className="live-leaders-tile" key={key} role="group" aria-label={label}>
          <h3 className="live-leaders-label">{label}</h3>
          <ol className="live-leaders-list">
            <LeaderLine leader={a} season={season} team={away} top={value(a) === top} player={player(a)} />
            <LeaderLine leader={h} season={season} team={home} top={value(h) === top} player={player(h)} />
          </ol>
        </section>;
      })}
    </div>
  </Panel>;
}

type TeamStatRow = { label: string; name?: string; made?: string; suffix?: string };

const TEAM_STATS: TeamStatRow[] = [
  { label: "Field Goals", made: "fieldGoalsMade-fieldGoalsAttempted" },
  { label: "3-Pointers", made: "threePointFieldGoalsMade-threePointFieldGoalsAttempted" },
  { label: "Free Throws", made: "freeThrowsMade-freeThrowsAttempted" },
  { label: "Rebounds", name: "totalRebounds" },
  { label: "Assists", name: "assists" },
  { label: "Steals", name: "steals" },
  { label: "Blocks", name: "blocks" },
  { label: "Turnovers", name: "totalTurnovers" },
  { label: "Points in the Paint", name: "pointsInPaint" },
  { label: "Fast Break Points", name: "fastBreakPoints" },
  { label: "Largest Lead", name: "largestLead" },
];

/** Follow-up 27: the rest of ESPN's Team Stats tab, behind "Show all". */
const MORE_TEAM_STATS: (TeamStatRow & { name: string })[] = [
  { label: "Offensive Rebounds", name: "offensiveRebounds" },
  { label: "Defensive Rebounds", name: "defensiveRebounds" },
  { label: "Points Conceded Off Turnovers", name: "turnoverPoints" },
  { label: "Fouls", name: "fouls" },
  { label: "Technical Fouls", name: "totalTechnicalFouls" },
  { label: "Flagrant Fouls", name: "flagrantFouls" },
  { label: "Percent Led", name: "leadPercentage", suffix: "%" },
];

function TeamStats({ data }: { data: LiveGameData }) {
  const [all, setAll] = useState(false);
  const [away, home] = awayFirst(data.game.teams);
  const season = seasonOf(data.game.slate_date);
  const stat = (team: LiveTeam, name: string) => data.team_sections?.find(s => String(s.team.id) === team.source_id)?.statistics?.find(s => s.name === name)?.displayValue ?? null;
  const rows = [...TEAM_STATS, ...(all ? MORE_TEAM_STATS : [])].map(row => {
    const value = (team: LiveTeam) => {
      if (row.made) {
        // ESPN rounds its percentages to whole numbers; makes and attempts give the decimal.
        const ma = madeAttempted(stat(team, row.made));
        const pct = ma && ma[1] ? 100 * ma[0] / ma[1] : ma ? 0 : null;
        return { text: ma && pct != null ? `${pct.toFixed(1)}% (${ma[0]}/${ma[1]})` : null, n: pct };
      }
      const raw = stat(team, row.name!);
      return { text: raw != null ? `${raw}${row.suffix ?? ""}` : null, n: raw != null && Number.isFinite(Number(raw)) ? Number(raw) : null };
    };
    return { label: row.label, away: value(away), home: value(home) };
  }).filter(row => row.away.text != null || row.home.text != null);
  if (!rows.length) return null;
  const more = MORE_TEAM_STATS.some(row => stat(away, row.name) != null || stat(home, row.name) != null);
  return <Panel title="Team Stats" icon="chart-column"
    action={more ? <button type="button" className="live-link" aria-expanded={all} onClick={() => setAll(v => !v)}>{all ? "Show less" : "Show all"}<Icon name={all ? "chevron-up" : "chevron-down"} size={14} /></button> : undefined}>
    <div className="live-teamstats">
      <div className="live-leaders-teams" aria-hidden="true">
        <span><TeamLogo team={logoTeam(away)} season={season} size={20} />{teamCode(away)}</span>
        <span>{teamCode(home)}<TeamLogo team={logoTeam(home)} season={season} size={20} /></span>
      </div>
      <dl className="live-teamstats-list">{rows.map(row => {
        const total = (row.away.n ?? 0) + (row.home.n ?? 0);
        const share = total > 0 ? (row.away.n ?? 0) / total : 0.5;
        return <div key={row.label} className="live-teamstat">
          <dt>{row.label}</dt>
          <dd className="live-teamstat-values"><span>{row.away.text ?? "—"}</span><span>{row.home.text ?? "—"}</span></dd>
          <dd className="live-teamstat-bar" aria-hidden="true" style={vars({ "--share": `${(share * 100).toFixed(2)}%` })}><span data-side="away" /><span data-side="home" /></dd>
        </div>;
      })}</dl>
    </div>
  </Panel>;
}

/** Follow-up 31: ESPN's Game Information, an icon on every line and the venue photo under Where. */
function GameInfo({ data, className = "" }: { data: LiveGameData; className?: string }) {
  const info = data.info;
  const when = data.game.event_time ? new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short" }).format(new Date(data.game.event_time)) : null;
  const [away, home] = awayFirst(data.game.teams);
  const season = seasonOf(data.game.slate_date);
  // Follow-up 11: every game says who is home and away; the venue carries the home team's logo.
  const team = (t: LiveTeam) => <span className="live-info-team"><TeamLogo team={logoTeam(t)} season={season} size={20} />{t.name}</span>;
  const place = [info?.city, info?.state].filter(Boolean).join(", ");
  const rows: { label: string; icon: IconName; value: ReactNode | null; wide?: boolean }[] = [
    { label: "When", icon: "calendar", value: when },
    { label: "Where", icon: "map-pin", wide: true, value: info?.venue ? <span className="live-info-venue">
      <span className="live-info-team"><TeamLogo team={logoTeam(home)} season={season} size={20} />{info.venue}{place && <span className="live-muted"> · {place}</span>}</span>
      {info.venue_image && /* eslint-disable-next-line @next/next/no-img-element -- ESPN's venue photo */
        <img className="live-info-photo" src={info.venue_image} alt={`${info.venue}`} loading="lazy" />}
    </span> : null },
    { label: "Away", icon: "users", value: away ? team(away) : null },
    { label: "Home", icon: "home", value: home ? team(home) : null },
    { label: "Attendance", icon: "users", value: info?.attendance ? info.attendance.toLocaleString("en-US") : null },
    { label: "Where to Watch", icon: "tv", value: info?.broadcasts.length ? <span className="live-info-chips">{info.broadcasts.map(b => <span key={b} className="live-chip">{b}</span>)}</span> : null },
    { label: "Officials", icon: "flag", wide: true, value: info?.officials.length ? info.officials.join(", ") : null },
  ];
  const shown = rows.filter(row => row.value != null && row.value !== "");
  if (!shown.length) return null;
  return <Panel title="Game Information" icon="info" className={className}>
    <dl className="live-info">{shown.map(row => <div key={row.label} data-wide={row.wide || undefined}>
      <dt><Icon name={row.icon} size={16} />{row.label}</dt><dd>{row.value}</dd>
    </div>)}</dl>
  </Panel>;
}

/**
 * Follow-up 35: ESPN Gamecast's three columns. Each column stacks its panels at their natural
 * height, so no panel stretches to match a neighbour and none holds dead space: leaders and team
 * stats; recap, probabilities, the shot chart and news; matchups, standings and game information
 * (balanced so the columns end close together). Tablets keep the middle column on top; phones
 * stack all three.
 */
export function SummaryTab({ data }: { data: LiveGameData }) {
  const played = data.game.status === "in_progress" || data.game.status === "final";
  const periods = Math.max(4, ...data.game.teams.map(t => t.linescores?.length ?? 0));
  const season = seasonOf(data.game.slate_date);
  if (!played) return <div className="live-summary">
    <div className="live-col" data-col="left"><GameInfo data={data} /></div>
    <div className="live-col" data-col="center">
      <p className="live-empty live-panel">The game summary starts at tipoff. Injuries and the line are on Pre-Game.</p>
      <NewsPanel data={data} part="stories" />
    </div>
    <div className="live-col" data-col="right"><Matchups data={data} /><DivisionStandings data={data} /></div>
  </div>;
  const shots = data.plays?.some(p => p.shot === "field_goal" && p.x != null);
  return <div className="live-summary">
    <div className="live-col" data-col="left"><Leaders data={data} /><TeamStats data={data} /></div>
    <div className="live-col" data-col="center">
      <NewsPanel data={data} part="recap" />
      <GameFlow data={data} />
      {shots && <Panel title="Shot Chart" icon="scatter"><ShotChart plays={data.plays!} teams={data.game.teams} periods={periods} players={data.players ?? []} season={season} /></Panel>}
      <NewsPanel data={data} part="stories" />
    </div>
    <div className="live-col" data-col="right"><Matchups data={data} /><DivisionStandings data={data} /><GameInfo data={data} /></div>
  </div>;
}

// ---------------------------------------------------------------- Box Score (Databallr, split as on X)

const BOX_COLUMNS: { key: string; label: ReactNode; title: string }[] = [
  { key: "min", label: "MIN", title: "Minutes" },
  { key: "pts", label: "PTS", title: "Points" },
  { key: "ts", label: "TS%", title: "True shooting %" },
  { key: "reb", label: <>REB<br /><span className="live-box-sub">(OFF)</span></>, title: "Rebounds (offensive)" },
  { key: "ast", label: "AST", title: "Assists" },
  { key: "stl", label: "STL", title: "Steals" },
  { key: "blk", label: "BLK", title: "Blocks" },
  { key: "pf", label: "PF", title: "Personal fouls" },
  { key: "to", label: "TO", title: "Turnovers" },
  { key: "two", label: "2P", title: "Two-point makes / attempts" },
  { key: "three", label: "3PT", title: "Three-point makes / attempts" },
  { key: "ft", label: "FT", title: "Free throw makes / attempts" },
  { key: "pm", label: "+/-", title: "Plus-minus" },
];

function cells(stats: Record<string, string | null>, total = false): Record<string, ReactNode> {
  const ts = trueShooting(stats);
  const slash = (v: string | null) => v?.replace("-", "/") ?? "—";
  const pm = stats[STAT_KEYS.pm];
  return {
    min: stats[STAT_KEYS.min] ?? "—",
    pts: <strong>{stats[STAT_KEYS.pts] ?? "—"}</strong>,
    ts: <span data-tone={shootingTone(ts)}>{ts == null ? "—" : ts.toFixed(1)}</span>,
    reb: <><strong>{stats[STAT_KEYS.reb] ?? "—"}</strong>{stats[STAT_KEYS.oreb] != null && <span className="live-box-sub"> ({stats[STAT_KEYS.oreb]})</span>}</>,
    ast: stats[STAT_KEYS.ast] ?? "—", stl: stats[STAT_KEYS.stl] ?? "—", blk: stats[STAT_KEYS.blk] ?? "—",
    pf: stats[STAT_KEYS.pf] ?? "—", to: stats[STAT_KEYS.to] ?? "—",
    two: twoPoint(stats) ?? "—", three: slash(stats[STAT_KEYS.tp]), ft: slash(stats[STAT_KEYS.ft]),
    pm: total || pm == null ? "" : <span data-tone={pm.startsWith("+") && pm !== "+0" ? "positive" : pm.startsWith("-") ? "negative" : undefined}>{pm}</span>,
  };
}

function PlayerRow({ player, season }: { player: LivePlayer; season: string }) {
  const dnp = player.reported_nonappearance === true;
  const name = player.short_name ?? player.name;
  const values = cells(player.statistics);
  return <tr data-dnp={dnp || undefined}>
    <th scope="row" title={player.name}>
      <span className="live-box-player">
        {player.canonical_id ? <Link href={`/players/${player.canonical_id}?season=${season}`}>{name}</Link> : <span>{name}</span>}
        {player.position && <span className="live-box-position">{player.position}</span>}
      </span>
    </th>
    {dnp
      ? <td colSpan={BOX_COLUMNS.length} className="live-box-dnp">{player.dnp_reason ? `DNP · ${player.dnp_reason}` : "Did not play"}</td>
      : BOX_COLUMNS.map(c => <td key={c.key}>{values[c.key]}</td>)}
  </tr>;
}

function teamPlayers(data: LiveGameData, team: LiveTeam) {
  const players = (data.players ?? []).filter(p => p.team_source_id === team.source_id);
  return { players, starters: players.filter(p => p.starter === true), bench: players.filter(p => p.starter !== true) };
}

/** Follow-up 16: blank rows that pad the shorter team's section so both tables end level. */
function FillerRows({ count }: { count: number }) {
  return Array.from({ length: Math.max(0, count) }, (_, i) => <tr key={`filler-${i}`} className="live-box-filler" aria-hidden="true"><th />{BOX_COLUMNS.map(c => <td key={c.key} />)}</tr>);
}

function TeamBox({ data, team, hotkey, rows: target }: { data: LiveGameData; team: LiveTeam; hotkey: string; rows?: { starters: number; bench: number } }) {
  const season = seasonOf(data.game.slate_date);
  const { players, starters, bench } = teamPlayers(data, team);
  const totals = data.team_totals?.[team.source_id];
  const group = (label: string, rows: LivePlayer[], pad: number) => rows.length ? <tbody key={label}>
    <tr className="live-box-group"><th scope="rowgroup" colSpan={BOX_COLUMNS.length + 1}>{label}</th></tr>
    {rows.map(p => <PlayerRow key={p.source_id} player={p} season={season} />)}
    <FillerRows count={pad - rows.length} />
  </tbody> : null;
  return <section className="live-box-team" aria-label={`${team.name} box score`} id={`live-box-${team.side}`} tabIndex={-1}>
    <h2 className="live-box-title"><TeamLogo team={logoTeam(team)} season={season} size={20} />{team.name.toUpperCase()}<span className="live-box-press">Press <kbd>{hotkey}</kbd></span></h2>
    {players.length ? <div className="live-table-scroll" role="region" aria-label={`${team.name} player box table`} tabIndex={0}>
      <table className="live-box">
        <colgroup><col className="live-box-col-player" />{BOX_COLUMNS.map(c => <col key={c.key} className={`live-box-col-${c.key}`} />)}</colgroup>
        <thead><tr><th scope="col">Player</th>{BOX_COLUMNS.map(c => <th scope="col" key={c.key} title={c.title}>{c.label}</th>)}</tr></thead>
        {group("Starters", starters, target?.starters ?? 0)}
        {group(starters.length ? "Bench" : "Players", bench, target?.bench ?? 0)}
        {totals && <tfoot><tr className="live-box-total"><th scope="row">Team</th>{BOX_COLUMNS.map(c => <td key={c.key}>{cells(totals, true)[c.key]}</td>)}</tr></tfoot>}
      </table>
    </div> : <p className="live-empty">No player box yet. Missing rows don&apos;t mean a player sat out.</p>}
  </section>;
}

function PlayRow({ play, game }: { play: LivePlay; game: LiveGame }) {
  const [away, home] = awayFirst(game.teams);
  const team = game.teams.find(t => t.source_id === play.team_source_id);
  const season = seasonOf(game.slate_date);
  return <li className="live-play" data-scoring={play.scoring || undefined}>
    <span className="live-play-clock">{play.clock ?? ""}</span>
    <span className="live-play-logo">{team && <TeamLogo team={logoTeam(team)} season={season} size={16} />}</span>
    <span className="live-play-score">
      <span data-lit={(play.scoring && play.side === "away") || undefined}>{teamCode(away)} <b>{play.away_score ?? "—"}</b></span>
      <span aria-hidden="true">·</span>
      <span data-lit={(play.scoring && play.side === "home") || undefined}><b>{play.home_score ?? "—"}</b> {teamCode(home)}</span>
    </span>
    <span className="live-play-text">{play.text}</span>
  </li>;
}

export function BoxScoreTab({ data, onAllPlays }: { data: LiveGameData; onAllPlays: () => void }) {
  const [away, home] = awayFirst(data.game.teams);
  const recent = [...(data.plays ?? [])].reverse().slice(0, 5);
  const a = teamPlayers(data, away), h = teamPlayers(data, home);
  // Side by side, the shorter team's sections pad to the longer's so the tables share a height.
  const rows = a.players.length && h.players.length && (a.starters.length > 0) === (h.starters.length > 0)
    ? { starters: Math.max(a.starters.length, h.starters.length), bench: Math.max(a.bench.length, h.bench.length) }
    : undefined;
  return <div className="live-boxscore">
    <div className="live-box-pair">
      <TeamBox data={data} team={away} hotkey="Q" rows={rows} />
      <TeamBox data={data} team={home} hotkey="W" rows={rows} />
    </div>
    {recent.length > 0 && <section className="live-recent" aria-label="Recent plays">
      <header className="live-recent-head"><h2>Recent Plays</h2><button type="button" className="live-link" onClick={onAllPlays}>View all plays <Icon name="right" size={14} /></button></header>
      <ol className="live-plays">{recent.map(p => <PlayRow key={p.id} play={p} game={data.game} />)}</ol>
    </section>}
  </div>;
}

// ---------------------------------------------------------------- Play-by-Play

export function PlaysTab({ data }: { data: LiveGameData }) {
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState("all");
  const term = useDeferredValue(query.trim().toLowerCase());
  const plays = data.plays ?? [];
  const periods = Math.max(0, ...plays.map(p => p.period ?? 0));
  const shown = [...plays].reverse().filter(p => (period === "all" || String(p.period) === period) && (!term || p.text.toLowerCase().includes(term)));
  if (!plays.length) return <p className="live-empty">{data.game.status === "scheduled" ? "Plays start at tipoff." : "No plays reported yet."}</p>;
  return <div className="live-pbp">
    <div className="live-pbp-tools">
      <SearchField aria-label="Search play-by-play" placeholder="Search play-by-play" value={query} onChange={e => setQuery(e.target.value)} />
      <span className="live-pbp-count" role="status">{shown.length} of {plays.length} plays</span>
    </div>
    <Segmented label="Period" options={[{ value: "all", label: "All" }, ...Array.from({ length: periods }, (_, i) => ({ value: String(i + 1), label: periodLabel(i + 1) }))]} value={period} onChange={setPeriod} size="sm" />
    <ol className="live-plays live-plays-all" tabIndex={0} aria-label="Plays, newest first">{shown.map(p => <PlayRow key={p.id} play={p} game={data.game} />)}</ol>
    {data.play_scores === "source" && <p className="live-note">The running score is ESPN&apos;s own: its scoring plays don&apos;t add up to the final.</p>}
  </div>;
}

// ---------------------------------------------------------------- Pre-Game

function InjuryList({ team, players, season }: { team: LiveTeam; players: LiveInjury[] | null; season: string }) {
  // Round 3: logo, full name and each player's photo (the season's headshot for that team).
  return <div className="live-injury-team" data-side={team.side}>
    <h3><TeamLogo team={logoTeam(team)} season={season} size={32} />{teamFullName(team, season)}<span className="live-muted">({players?.length ?? "?"})</span></h3>
    {players == null ? <p className="live-muted">Injury report unknown.</p> : players.length ? <ul>{players.map(p => <li key={p.source_id}>
      <PlayerPortrait playerId={p.canonical_id ?? undefined} name={p.name} size="sm" era={seasonEra(season, logoTeam(team))} />
      <span className="live-injury-name">{p.canonical_id ? <Link href={`/players/${p.canonical_id}?season=${season}`}>{p.name}</Link> : p.name}
        <span className="live-muted live-injury-detail">{[p.position, p.detail].filter(Boolean).join(" · ")}</span></span>
      <span className="live-injury-status" data-status={p.status?.toLowerCase().replace(/\s+/g, "-")}>{p.status ?? "Unknown"}</span>
    </li>)}</ul> : <p className="live-muted live-italic">No injuries reported</p>}
  </div>;
}

function Lines({ odds, game }: { odds: LiveOdds; game: LiveGame }) {
  const [away, home] = awayFirst(game.teams);
  // Follow-up 8: every number names its team, with a plain-language line under it.
  const spread = lineFavourite(odds, game.teams);
  const winner = odds.home_moneyline != null && odds.away_moneyline != null && odds.home_moneyline !== odds.away_moneyline ? (odds.home_moneyline < odds.away_moneyline ? home : away) : null;
  const season = seasonOf(game.slate_date);
  const logo = (team: LiveTeam) => <TeamLogo team={logoTeam(team)} season={season} size={24} />;
  const tiles: { label: string; value: ReactNode; note: string | null }[] = [
    {
      label: "Spread",
      value: spread === "even" ? "Even" : spread ? <>{logo(spread.team)}{teamCode(spread.team)} −{spread.points}</> : null,
      note: spread === "even" ? "An even game: no favorite" : spread ? `${spread.team.name} favored by ${spread.points} points` : null,
    },
    {
      label: "Moneyline",
      value: odds.home_moneyline != null || odds.away_moneyline != null ? <>{logo(home)}{teamCode(home)} {moneyline(odds.home_moneyline) ?? "—"}{" · "}{logo(away)}{teamCode(away)} {moneyline(odds.away_moneyline) ?? "—"}</> : null,
      note: winner ? `${winner.name} favored to win` : null,
    },
    {
      label: "Total",
      value: odds.over_under != null ? `O/U ${odds.over_under}` : null,
      note: odds.over_under != null ? `About ${odds.over_under} points combined` : null,
    },
  ];
  return <>
    <div className="live-lines">{tiles.map(tile => <div key={tile.label} className="live-line-tile">
      <span className="live-line-label">{tile.label}</span>
      <strong className="live-line-value">{tile.value ?? "—"}</strong>
      {tile.note && <span className="live-line-note">{tile.note}</span>}
    </div>)}</div>
    <p className="live-note">{odds.provider ?? "Sportsbook"} via ESPN{game.status === "scheduled" ? ", as last read" : ", the line ESPN kept for this game"}. Market prices, not a CourtLens forecast.</p>
  </>;
}

export function PreGameTab({ data }: { data: LiveGameData }) {
  const [away, home] = awayFirst(data.game.teams);
  const season = seasonOf(data.game.slate_date);
  const list = (team: LiveTeam) => data.injuries ? data.injuries.find(t => t.team_source_id === team.source_id)?.players ?? [] : null;
  return <div className="live-pregame">
    <PredictionPanel game={data.game} />
    <Panel title="Injury Report" icon="alert" className="live-pregame-injuries">
      <InjuryList team={away} players={list(away)} season={season} />
      <InjuryList team={home} players={list(home)} season={season} />
      <p className="live-note">ESPN&apos;s report when this game was last read.</p>
    </Panel>
    <Panel title="Betting Lines" icon="scale" className="live-pregame-lines">
      {data.odds ? <Lines odds={data.odds} game={data.game} /> : <p className="live-muted">No line reported for this game.</p>}
    </Panel>
  </div>;
}

export function GameTabs({ tab, onTab, data }: { tab: GameTab; onTab: (tab: GameTab) => void; data: LiveGameData }) {
  return <Tabs value={tab} onChange={value => onTab(value as GameTab)} className="live-tabs">
    <div className="live-tabs-bar">
      <TabsList aria-label="Game views">{GAME_TABS.map(t => <TabTrigger key={t.value} value={t.value}>{t.label}</TabTrigger>)}</TabsList>
      <p className="live-hotkeys">
        <span>Hotkeys:</span><kbd>1–9</kbd><span>Game</span><kbd>Q</kbd><span>Left</span><kbd>W</kbd><span>Right</span><kbd>Esc</kbd><span>Back</span><kbd>Tab</kbd><span>Next</span><kbd>Shift+Tab</kbd><span>Prev</span>
      </p>
    </div>
    <TabsContent value="summary"><SummaryTab data={data} /></TabsContent>
    <TabsContent value="box"><BoxScoreTab data={data} onAllPlays={() => onTab("plays")} /></TabsContent>
    <TabsContent value="plays"><PlaysTab data={data} /></TabsContent>
    <TabsContent value="pregame"><PreGameTab data={data} /></TabsContent>
  </Tabs>;
}
