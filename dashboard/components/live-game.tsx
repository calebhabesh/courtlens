"use client";

import Link from "next/link";
import { useDeferredValue, useState, type CSSProperties, type ReactNode } from "react";
import {
  awayFirst, gameStatus, lineFavourite, madeAttempted, moneyline, periodLabel, seasonOf, shootingTone, STAT_KEYS, teamCode, trueShooting, twoPoint,
  type LiveGame, type LiveGameData, type LiveInjury, type LiveLeader, type LiveOdds, type LivePlay, type LivePlayer, type LiveTeam,
} from "@/lib/live";
import { teamAccent, teamBrandColor } from "@/lib/team-colors";
import { ShotChart } from "./live-shot-chart";
import { HotkeyBadge } from "./live-board";
import { TeamLogo } from "./team-logo";
import { Icon } from "./ui/icon";
import { PlayerAvatar } from "./ui/identity";
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

function logoTeam(team: LiveTeam) { return team.tricode ?? team.canonical_id ?? teamCode(team); }

function Panel({ title, icon, children, className = "", action }: { title: string; icon?: Parameters<typeof Icon>[0]["name"]; children: ReactNode; className?: string; action?: ReactNode }) {
  return <section className={`live-panel ${className}`} aria-label={title}>
    <header className="live-panel-head"><h2>{icon && <Icon name={icon} size={20} />}{title}</h2>{action}</header>
    {children}
  </section>;
}

/** Databallr's banner: All Games, status, both teams with the loser dimmed, the game's hotkey. */
export function GameBanner({ game, index, backHref }: { game: LiveGame; index: number; backHref: string }) {
  const [away, home] = awayFirst(game.teams);
  const season = seasonOf(game.slate_date);
  const played = game.status === "in_progress" || game.status === "final";
  const side = (team: LiveTeam, align: "start" | "end") => <span className="live-banner-team" data-align={align} data-lost={(game.status === "final" && team.winner === false) || undefined}>
    <TeamLogo team={logoTeam(team)} season={season} size={40} />
    <span className="live-banner-code">{teamCode(team)}</span>
    <strong className="live-banner-score">{played ? team.score ?? "—" : ""}</strong>
  </span>;
  return <header className="live-banner">
    <div className="sr-only"><PageHeader title={`${away.name} at ${home.name}`} subtitle={`${gameStatus(game)} · ${game.slate_date}`} /></div>
    <ButtonLink href={backHref} size="sm" variant="secondary" icon="back" className="live-banner-back">All Games</ButtonLink>
    <p className="live-banner-status">{game.status === "in_progress" && <span className="live-dot" aria-hidden="true" />}{gameStatus(game)}</p>
    <div className="live-banner-teams" aria-label={`${away.name} ${played ? away.score ?? "" : ""}, ${home.name} ${played ? home.score ?? "" : ""}`} role="group">
      <span aria-hidden="true" className="live-banner-row">{side(away, "end")}<span className="live-banner-dash">–</span>{side(home, "start")}</span>
    </div>
    <span className="live-banner-hotkey"><HotkeyBadge n={index + 1} label="Hotkey:" /></span>
  </header>;
}

// ---------------------------------------------------------------- Summary (X's game summary)

function LineScore({ game }: { game: LiveGame }) {
  const teams = awayFirst(game.teams);
  const periods = Math.max(4, ...teams.map(t => t.linescores?.length ?? 0));
  const season = seasonOf(game.slate_date);
  return <div className="live-table-scroll" role="region" aria-label="Line score" tabIndex={0}>
    <table className="live-linescore">
      <thead><tr><th scope="col"><span className="sr-only">Team</span></th>{Array.from({ length: periods }, (_, i) => <th scope="col" key={i}>{i < 4 ? i + 1 : periodLabel(i + 1)}</th>)}<th scope="col">T</th></tr></thead>
      <tbody>{teams.map(team => <tr key={team.source_id} data-lost={(game.status === "final" && team.winner === false) || undefined}>
        <th scope="row"><span className="live-team-cell"><TeamLogo team={logoTeam(team)} season={season} size={20} />{teamCode(team)}</span></th>
        {Array.from({ length: periods }, (_, i) => <td key={i}>{team.linescores?.[i] ?? "—"}</td>)}
        <td className="live-linescore-total">{team.score ?? "—"}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}

function LeaderCell({ leader, season, team, align }: { leader?: LiveLeader; season: string; team?: LiveTeam; align: "start" | "end" }) {
  if (!leader) return <span className="live-leader" data-align={align}><span className="live-muted">—</span></span>;
  const name = leader.canonical_id ? <Link href={`/players/${leader.canonical_id}?season=${season}`}>{leader.name}</Link> : leader.name;
  return <span className="live-leader" data-align={align}>
    <PlayerAvatar playerId={leader.canonical_id ?? undefined} name={leader.name} size="md" era={{ season, team: team?.tricode ?? null }} />
    <span className="live-leader-text">
      <strong className="live-leader-value">{leader.value}</strong>
      <span className="live-leader-name">{name}</span>
      {leader.position && <span className="live-leader-position">{leader.position}</span>}
    </span>
  </span>;
}

function Leaders({ data }: { data: LiveGameData }) {
  const [away, home] = awayFirst(data.game.teams);
  const season = seasonOf(data.game.slate_date);
  const categories = [["points", "Points"], ["rebounds", "Rebounds"], ["assists", "Assists"]] as const;
  const find = (team: LiveTeam, category: string) => data.leaders?.find(l => l.team_source_id === team.source_id && l.category === category);
  return <Panel title="Game Leaders" icon="crown">
    <div className="live-leaders">
      <div className="live-leaders-teams" aria-hidden="true">
        <span><TeamLogo team={logoTeam(away)} season={season} size={20} />{teamCode(away)}</span>
        <span>{teamCode(home)}<TeamLogo team={logoTeam(home)} season={season} size={20} /></span>
      </div>
      {categories.map(([key, label]) => <div className="live-leaders-row" key={key} role="group" aria-label={label}>
        <LeaderCell leader={find(away, key)} season={season} team={away} align="start" />
        <span className="live-leaders-label">{label}</span>
        <LeaderCell leader={find(home, key)} season={season} team={home} align="end" />
      </div>)}
    </div>
  </Panel>;
}

const TEAM_STATS: { label: string; name?: string; made?: string }[] = [
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

function TeamStats({ data }: { data: LiveGameData }) {
  const [away, home] = awayFirst(data.game.teams);
  const season = seasonOf(data.game.slate_date);
  const stat = (team: LiveTeam, name: string) => data.team_sections?.find(s => String(s.team.id) === team.source_id)?.statistics?.find(s => s.name === name)?.displayValue ?? null;
  const rows = TEAM_STATS.map(row => {
    const value = (team: LiveTeam) => {
      if (row.made) {
        // ESPN rounds its percentages to whole numbers; makes and attempts give the decimal.
        const ma = madeAttempted(stat(team, row.made));
        const pct = ma && ma[1] ? 100 * ma[0] / ma[1] : ma ? 0 : null;
        return { text: ma && pct != null ? `${pct.toFixed(1)}% (${ma[0]}/${ma[1]})` : null, n: pct };
      }
      const raw = stat(team, row.name!);
      return { text: raw, n: raw != null && Number.isFinite(Number(raw)) ? Number(raw) : null };
    };
    return { label: row.label, away: value(away), home: value(home) };
  }).filter(row => row.away.text != null || row.home.text != null);
  if (!rows.length) return null;
  return <Panel title="Team Stats" icon="chart-column">
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

function GameInfo({ data }: { data: LiveGameData }) {
  const info = data.info;
  const when = data.game.event_time ? new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short" }).format(new Date(data.game.event_time)) : null;
  const rows = [
    ["When", when],
    ["Where", info?.venue ? [info.venue, [info.city, info.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ") : null],
    ["Watch", info?.broadcasts.length ? info.broadcasts.join(", ") : null],
    ["Attendance", info?.attendance ? info.attendance.toLocaleString("en-US") : null],
    ["Officials", info?.officials.length ? info.officials.join(", ") : null],
  ].filter((row): row is [string, string] => row[1] != null);
  if (!rows.length) return null;
  return <Panel title="Game Info" icon="calendar">
    <dl className="live-info">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  </Panel>;
}

export function SummaryTab({ data }: { data: LiveGameData }) {
  const played = data.game.status === "in_progress" || data.game.status === "final";
  const periods = Math.max(4, ...data.game.teams.map(t => t.linescores?.length ?? 0));
  if (!played) return <div className="live-summary"><p className="live-empty">The game summary starts at tipoff. Injuries and the line are on Pre-Game.</p><GameInfo data={data} /></div>;
  return <div className="live-summary">
    <Panel title="Line Score" icon="table" className="live-summary-linescore"><LineScore game={data.game} /></Panel>
    <Leaders data={data} />
    {data.plays?.some(p => p.shot === "field_goal" && p.x != null) && <Panel title="Shot Chart" icon="scatter" className="live-summary-shots"><ShotChart plays={data.plays} teams={data.game.teams} periods={periods} /></Panel>}
    <TeamStats data={data} />
    <GameInfo data={data} />
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

function TeamBox({ data, team, hotkey }: { data: LiveGameData; team: LiveTeam; hotkey: string }) {
  const season = seasonOf(data.game.slate_date);
  const players = (data.players ?? []).filter(p => p.team_source_id === team.source_id);
  const starters = players.filter(p => p.starter === true);
  const bench = players.filter(p => p.starter !== true);
  const totals = data.team_totals?.[team.source_id];
  const group = (label: string, rows: LivePlayer[]) => rows.length ? <tbody key={label}>
    <tr className="live-box-group"><th scope="rowgroup" colSpan={BOX_COLUMNS.length + 1}>{label}</th></tr>
    {rows.map(p => <PlayerRow key={p.source_id} player={p} season={season} />)}
  </tbody> : null;
  return <section className="live-box-team" aria-label={`${team.name} box score`} id={`live-box-${team.side}`} tabIndex={-1}>
    <h2 className="live-box-title"><TeamLogo team={logoTeam(team)} season={season} size={20} />{team.name.toUpperCase()}<span className="live-box-press">Press <kbd>{hotkey}</kbd></span></h2>
    {players.length ? <div className="live-table-scroll" role="region" aria-label={`${team.name} player box table`} tabIndex={0}>
      <table className="live-box">
        <colgroup><col className="live-box-col-player" />{BOX_COLUMNS.map(c => <col key={c.key} />)}</colgroup>
        <thead><tr><th scope="col">Player</th>{BOX_COLUMNS.map(c => <th scope="col" key={c.key} title={c.title}>{c.label}</th>)}</tr></thead>
        {group("Starters", starters)}
        {group(starters.length ? "Bench" : "Players", bench)}
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
  return <div className="live-boxscore">
    <div className="live-box-pair">
      <TeamBox data={data} team={away} hotkey="Q" />
      <TeamBox data={data} team={home} hotkey="W" />
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
  return <div className="live-injury-team">
    <h3><TeamLogo team={logoTeam(team)} season={season} size={20} />{teamCode(team)}<span className="live-muted">({players?.length ?? "?"})</span></h3>
    {players == null ? <p className="live-muted">Injury report unknown.</p> : players.length ? <ul>{players.map(p => <li key={p.source_id}>
      <span className="live-injury-position">{p.position ?? ""}</span>
      <span className="live-injury-name">{p.canonical_id ? <Link href={`/players/${p.canonical_id}?season=${season}`}>{p.name}</Link> : p.name}{p.detail && <span className="live-muted"> · {p.detail}</span>}</span>
      <span className="live-injury-status" data-status={p.status?.toLowerCase().replace(/\s+/g, "-")}>{p.status ?? "Unknown"}</span>
    </li>)}</ul> : <p className="live-muted live-italic">No injuries reported</p>}
  </div>;
}

function Lines({ odds, game }: { odds: LiveOdds; game: LiveGame }) {
  const [away, home] = awayFirst(game.teams);
  // Follow-up 8: every number names its team, with a plain-language line under it.
  const spread = lineFavourite(odds, game.teams);
  const winner = odds.home_moneyline != null && odds.away_moneyline != null && odds.home_moneyline !== odds.away_moneyline ? (odds.home_moneyline < odds.away_moneyline ? home : away) : null;
  const tiles = [
    {
      label: "Spread",
      value: spread === "even" ? "Even" : spread ? `${teamCode(spread.team)} −${spread.points}` : null,
      note: spread === "even" ? "An even game: no favorite" : spread ? `${spread.team.name} favored by ${spread.points} points` : null,
    },
    {
      label: "Moneyline",
      value: odds.home_moneyline != null || odds.away_moneyline != null ? `${teamCode(home)} ${moneyline(odds.home_moneyline) ?? "—"} · ${teamCode(away)} ${moneyline(odds.away_moneyline) ?? "—"}` : null,
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
