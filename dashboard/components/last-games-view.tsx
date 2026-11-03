"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import { getPlayerGameLog, getPlayerSeasons, getTeamSchedule, getTeamsResearch, WorkbenchApiError } from "@/lib/workbench-api";
import { landing } from "@/lib/landing-season";
import type { PlayerGameLogItem } from "@/lib/types";
import {
  LAST_GAMES_STATS, DEFAULT_LAST_GAMES_STATS, changeTone, chosenStats, clampWindow, formatChange, formatStat, gamesCsv,
  phaseLabel, playedChronological, splitWindow, totals, stretchVerdict, sinceAnchors, gamesSince, contextSummary,
  type Exposure, type LastGamesStat, type StatGroup, type GameContext, type OpponentDefence, type SinceAnchor,
} from "@/lib/last-games";
import { formatDate } from "@/lib/format-date";
import { teamBrandColor } from "@/lib/team-colors";
import { copyCanonicalQueryUrl } from "@/lib/image-export";
import { FeedFailure, FeedSkeleton, useFeed, ExampleNote } from "./stats-feed-ui";
import { LookupInput } from "./lookup-input";
import { PlayerPortrait } from "./player-portrait";
import { TeamLogo } from "./team-logo";
import { TeamWatermark } from "./team-watermark";
import { teamRecord } from "./compare-player-slot";
import { CourtLensWordmark } from "./courtlens-wordmark";
import { LastGamesTrend, MAX_TREND_STATS, trendStats } from "./last-games-trend";
import { PageHeader } from "./ui/panel";
import { FilterBar } from "./ui/filter-bar";
import { DataDetailsButton } from "./ui/data-details";
import { Modal } from "./ui/modal";
import { Menu, MenuItem } from "./ui/menu";
import { Checkbox } from "./ui/checkbox";
import { DatePicker } from "./ui/date-picker";
import { ControlScope } from "./ui/control-scope";
import { Icon } from "./ui/icon";
import { Button, IconButton, RemovableChip, Segmented, Select } from "./ui/kit";

export type LastGamesScope = { season: string; phase: string; beforeDate: string };
type Phase = "all" | "regular_season" | "playoffs";
type View = "table" | "cards";
type Loaded = {
  season: string; name: string | null; position: string | null; releaseId: string | null; games: PlayerGameLogItem[]; through: Record<string, string>;
  /** Follow-up 25: result, score, venue and rest per game, from the team schedules. */
  context: Record<string, GameContext>;
  /** Follow-up 28: each team's regular-season defensive rating and rank, by team id and tricode. */
  defence: Record<string, OpponentDefence>;
};

const BLURB = "Track player performance trends over their most recent games";
const DEFAULT_WINDOW = 5;
const ADD_LIMIT = 4;

/** Every page of one phase's prior-only log. A phase the player has no games in is empty, not an error. */
async function loadPhase(player: string, season: string, phase: string, beforeDate: string, releaseId: string | null) {
  const games: PlayerGameLogItem[] = [];
  let cursor: string | undefined, name: string | null = null, release: string | null = null, position: string | null = null;
  try {
    for (let page = 0; page < 4; page++) {
      const response = await getPlayerGameLog(player, { season, phase, beforeDate, releaseId: releaseId ?? undefined, limit: 100, cursor });
      games.push(...response.games);
      name = response.player.name; position = response.player.position ?? position; release = typeof response.context.release_id === "string" ? response.context.release_id : null;
      if (!response.has_more || !response.next_cursor) break;
      cursor = response.next_cursor;
    }
  } catch (error) {
    if (!(error instanceof WorkbenchApiError && error.status === 404)) throw error;
  }
  return { games, name, release, position };
}

function seasonPhases(scopes: LastGamesScope[], season: string, phase: Phase) {
  return scopes.filter(s => s.season === season && (phase === "all" || s.phase === phase))
    .sort((a, b) => (a.phase === "playoffs" ? 1 : 0) - (b.phase === "playoffs" ? 1 : 0));
}

async function loadSeason(player: string, season: string, phase: Phase, scopes: LastGamesScope[], cutoff: string | null, releaseId: string | null): Promise<Loaded> {
  const parts = seasonPhases(scopes, season, phase);
  // A requested cutoff only ever narrows a phase's own coverage (prior-only).
  const through = Object.fromEntries(parts.map(p => [p.phase, cutoff && cutoff < p.beforeDate ? cutoff : p.beforeDate]));
  const results = await Promise.all(parts.map(p => loadPhase(player, season, p.phase, through[p.phase], releaseId)));
  const games = playedChronological(results.flatMap(r => r.games));
  // Context is optional: a failed schedule or ratings read leaves those columns "—", never the log.
  const schedules = await Promise.all(parts.flatMap(p => [...new Set(games.filter(g => g.phase === p.phase).map(g => g.team_id))]
    .map(team => getTeamSchedule(team, { season, phase: p.phase, beforeDate: through[p.phase], releaseId: releaseId ?? undefined }).catch(() => null))));
  const context: Record<string, GameContext> = {};
  for (const schedule of schedules) for (const g of schedule?.games ?? []) {
    context[g.game_id] = { result: g.result === "W" || g.result === "L" ? g.result : null, teamPoints: g.team_points ?? null,
      opponentPoints: g.opponent_points ?? null, side: g.side ?? null, restDays: g.rest_days ?? null, backToBack: g.is_back_to_back };
  }
  const regular = scopes.find(s => s.season === season && s.phase === "regular_season");
  const teams = regular ? await getTeamsResearch({ season, phase: "regular_season", beforeDate: cutoff && cutoff < regular.beforeDate ? cutoff : regular.beforeDate, releaseId: releaseId ?? undefined }).catch(() => null) : null;
  const rated = (teams?.teams ?? []).filter(t => typeof t.ratings?.def_rating === "number").sort((a, b) => a.ratings!.def_rating! - b.ratings!.def_rating!);
  const defence: Record<string, OpponentDefence> = {};
  rated.forEach((t, i) => { const entry = { rating: t.ratings!.def_rating!, rank: i + 1 }; defence[t.team_id] = entry; defence[t.tricode] = entry; });
  return { season, name: results.find(r => r.name)?.name ?? null, position: results.find(r => r.position)?.position ?? null, releaseId: results.find(r => r.release)?.release ?? null, games, through, context, defence };
}

/** Query state written with replaceState, so a toggle never re-renders the server page. */
function useQuery() {
  const params = useSearchParams();
  const set = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(updates)) { if (value) next.set(key, value); else next.delete(key); }
    window.history.replaceState(null, "", `${window.location.pathname}${next.size ? `?${next}` : ""}`);
  };
  return { get: (key: string) => params.get(key), set };
}

function download(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}

const GROUPS: StatGroup[] = ["Counting", "Scoring", "Other"];

function groupRuns(stats: LastGamesStat[]) {
  const runs: { label: StatGroup; span: number }[] = [];
  for (const stat of stats) { const last = runs.at(-1); if (last?.label === stat.group) last.span += 1; else runs.push({ label: stat.group, span: 1 }); }
  return runs;
}

const starts = (stats: LastGamesStat[], index: number) => index === 0 || stats[index - 1].group !== stats[index].group;

/** Databallr's Choose Stats dialog: grouped checkboxes, applied only on Save Changes. */
function ChooseStats({ open, current, onClose, onSave }: { open: boolean; current: string[]; onClose: () => void; onSave: (keys: string[]) => void }) {
  const [draft, setDraft] = useState(current);
  const [shown, setShown] = useState(open);
  if (open !== shown) { setShown(open); if (open) setDraft(current); }
  const toggle = (key: string, on: boolean) => setDraft(keys => on ? [...keys, key] : keys.filter(k => k !== key));
  return <Modal isOpen={open} onClose={onClose} title="Choose Stats" className="lg-dialog">
    <div className="lg-choose-groups">
      {GROUPS.map(group => <fieldset key={group} className="lg-choose-group"><legend>{group}</legend>
        {LAST_GAMES_STATS.filter(s => s.group === group).map(stat => <Checkbox key={stat.key} label={stat.label} title={stat.title}
          checked={draft.includes(stat.key)} onChange={on => toggle(stat.key, on)} />)}
      </fieldset>)}
    </div>
    <footer className="lg-choose-actions">
      <Button size="md" variant="text" onClick={() => setDraft(DEFAULT_LAST_GAMES_STATS)}>Defaults</Button>
      <Button size="md" variant="danger" onClick={() => setDraft([])}>Clear All</Button>
      <span className="lg-spacer" />
      <Button size="md" onClick={onClose}>Cancel</Button>
      <Button size="md" variant="primary" disabled={!draft.length} onClick={() => onSave(LAST_GAMES_STATS.map(s => s.key).filter(k => draft.includes(k)))}>Save Changes</Button>
    </footer>
  </Modal>;
}

function Glossary({ open, onClose, stats }: { open: boolean; onClose: () => void; stats: LastGamesStat[] }) {
  // Follow-up 36: two labelled lists instead of greying out the stats that are not shown.
  const shown = new Set(stats.map(s => s.key));
  const sections = [
    { title: "On This Page", items: LAST_GAMES_STATS.filter(s => shown.has(s.key)) },
    { title: "More in Choose Stats", items: LAST_GAMES_STATS.filter(s => !shown.has(s.key)) },
  ].filter(section => section.items.length);
  return <Modal isOpen={open} onClose={onClose} title="Glossary" description="What each stat means and how it is calculated." className="lg-dialog">
    {sections.map(section => <section key={section.title} className="lg-glossary-section">
      <h3>{section.title}</h3>
      <dl className="lg-glossary">{section.items.map(stat => <div key={stat.key}><dt>{stat.label}</dt><dd>{stat.title}</dd></div>)}</dl>
    </section>)}
  </Modal>;
}

const shortDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Photo and the games chooser, bounded by the games played (one earlier game always stays). */
function WindowCard({ playerId, name, team, season, size, played, onSize, onPick, anchors, since, dates, onSince }: {
  playerId: string; name: string; team: string | undefined; season: string; size: number; played: number;
  onSize: (n: number) => void; onPick: (id: string) => void;
  anchors: SinceAnchor[]; since: string | null; dates: string[]; onSince: (date: string | null) => void;
}) {
  const [searching, setSearching] = useState(false);
  const playable = useMemo(() => new Set(dates.slice(1)), [dates]);
  // Follow-up 31: the portrait is as tall as the chooser beside it.
  const chooserRef = useRef<HTMLDivElement>(null);
  const [photo, setPhoto] = useState<number | null>(null);
  useEffect(() => {
    const node = chooserRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => { const height = Math.round(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height); if (height > 0) setPhoto(height); });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const [query, setQuery] = useState("");
  const record = teamRecord(team, season);
  const tint = teamBrandColor(team, season);
  const max = Math.max(1, played - 1);
  const step = (delta: number) => onSize(clampWindow(size + delta, played));
  const presets = [5, 10, 15, 20].filter(n => n <= max);
  return <div className="lg-window" style={{ ...(tint ? { "--team-tint": tint } : {}), ...(photo ? { "--photo": `${photo}px` } : {}) } as CSSProperties}>
    <div className="lg-photo-frame">
      <button type="button" className="pvp-photo lg-photo" aria-haspopup="dialog" aria-label={`Change player, ${name}`} onClick={() => setSearching(true)}>
        {record && <TeamWatermark asset={record.asset} />}
        <PlayerPortrait playerId={playerId} name={name} size="xl" className="pvp-portrait" era={{ season, team: team ?? null }} />
        <span className="pvp-change" aria-hidden="true"><Icon name="user-edit" size={16} /></span>
      </button>
      {/* Follow-up 17: the search opens in its own dialog, so nothing lays over the cards. */}
      <Modal isOpen={searching} onClose={() => { setSearching(false); setQuery(""); }} title="Change Player"
        description={`Any player with games in ${season}. Currently ${name}.`} className="lg-dialog lg-player-dialog">
        <LookupInput label="Search players" placeholder="Search Players" value={query} onChange={setQuery} kinds={["player"]} season={season}
          autoFocus limit={8}
          onSelect={item => { setQuery(""); setSearching(false); onPick(item.canonical_id); }} />
      </Modal>
    </div>
    {/* Follow-up 13: say the window in words, fine-tune with − / +, drag across the season, or
        jump to a common length. */}
    <div className="lg-chooser" ref={chooserRef} role="group" aria-label="Games in the window">
      <div className="lg-chooser-line">
        <span>Last</span>
        <IconButton size="sm" variant="secondary" icon="minus" label="One game fewer" disabled={size <= 1} onClick={() => step(-1)} />
        <output className="lg-chooser-value" aria-live="polite">{size}</output>
        <IconButton size="sm" variant="secondary" icon="plus" label="One game more" disabled={size >= max} onClick={() => step(1)} />
        <span>{size === 1 ? "Game" : "Games"}</span>
      </div>
      <div className="lg-chooser-range">
        <input type="range" className="lg-range" min={1} max={max} step={1} value={size} aria-label="Games in the window" aria-valuetext={`Last ${size} of ${played} games`}
          style={{ "--fill": `${max > 1 ? (size - 1) / (max - 1) * 100 : 100}%` } as CSSProperties} onChange={event => onSize(clampWindow(Number(event.target.value), played))} />
        <p><span>1</span><span>{max} · {played} played</span></p>
      </div>
      {presets.length > 0 && <Segmented<string> size="sm" stretch label="Common windows" value={!since && presets.includes(size) ? String(size) : ""}
        onChange={value => onSize(clampWindow(Number(value), played))} options={presets.map(n => ({ value: String(n), label: `L${n}` }))} />}
      {/* Follow-ups 27 and 33: start the window at a moment from the log, or at any day he played
          on a standard month calendar (other days are disabled). */}
      <div className="lg-since">
        <Menu renderTrigger={props => <Button {...props} size="sm" variant="text" iconAfter="chevron-down">Since</Button>}>
          {anchors.slice(0, 6).map(anchor => <MenuItem key={`${anchor.kind}-${anchor.date}`} label={`${anchor.label} (${shortDate(anchor.date)})`} onClick={() => onSince(anchor.date)} />)}
          {!anchors.length && <MenuItem label="No trades, playoff start or long gaps this season" disabled />}
        </Menu>
        <ControlScope size="sm"><DatePicker label="Window starts" placeholder="Pick a Date" value={since ?? ""} min={dates[1]} max={dates.at(-1)}
          isDateDisabled={date => !playable.has(date)} onChange={date => { if (date) onSince(date); }} /></ControlScope>
        {since && <IconButton size="sm" variant="ghost" icon="close" label="Clear the Since date" onClick={() => onSince(null)} />}
      </div>
    </div>
  </div>;
}

/**
 * First K games against the last N, the change gold when better and blue when worse. Follow-up 24:
 * a change keeps its colour only when the window is outside his middle 80% of N-game stretches
 * (a dot marks the season's highest or lowest); inside it, the change is grey. Follow-up 26: a row
 * adds or removes its stat on the chart, and plotted rows show their line's colour. Follow-up 28:
 * a Context band compares opponents' defence and the record.
 */
function Comparison({ name, who, games, first, last, stats, mode, plotted, onPlot, context, defence }: {
  name: string; who?: string; games: PlayerGameLogItem[]; first: PlayerGameLogItem[]; last: PlayerGameLogItem[]; stats: LastGamesStat[]; mode: Exposure;
  plotted: string[]; onPlot: (key: string) => void; context: Record<string, GameContext>; defence: (game: PlayerGameLogItem) => OpponentDefence | null;
}) {
  const a = totals(first), b = totals(last);
  // Say when a stat (in practice +/-, from stints) is known in only some of the games.
  const partial = stats.filter(s => s.key === "pm").flatMap(s => [[first, a, "first"], [last, b, "last"]].flatMap(([list, t, side]) => {
    const known = (t as typeof a).pm.n, count = (list as PlayerGameLogItem[]).length;
    return count > 0 && known < count ? [`${s.label} known in ${known} of ${side} ${count}`] : [];
  }));
  const runs = groupRuns(stats).map((run, index, all) => ({ ...run, start: all.slice(0, index).reduce((n, r) => n + r.span, 0) }));
  const verdicts = useMemo(() => new Map(stats.map(stat => [stat.key, stretchVerdict(games, stat, last.length, mode)])), [games, stats, last.length, mode]);
  const judged = [...verdicts.values()].some(Boolean);
  const before = contextSummary(first, context, defence), now = contextSummary(last, context, defence);
  const rank = (value: number | null) => value === null ? "—" : value.toFixed(1);
  const record = (s: typeof now) => s.wins + s.losses ? `${s.wins}–${s.losses}` : "—";
  return <section className="lg-compare player-glass" aria-label={`${name}: first ${first.length} against last ${last.length} games`}>
    <h2>{name}{who && <small className="lg-compare-who" title="Team and estimated position this season">{who}</small>}</h2>
    <div className="lg-compare-frame">
    <table className="lg-compare-table">
      <thead><tr>
        <th scope="col">{first.length ? `First ${first.length} ${first.length === 1 ? "Game" : "Games"}` : "Earlier Games"}</th>
        <th scope="col">{mode === "per_36" ? "Per 36 Min" : "Per Game"}</th>
        <th scope="col">Last {last.length} {last.length === 1 ? "Game" : "Games"}</th>
      </tr></thead>
      {/* Follow-up 14: the Stats table look, one band per stat group. */}
      {runs.map(run => <tbody key={`${run.label}-${run.start}`}>
        <tr className="lg-compare-group"><th colSpan={3} scope="colgroup">{run.label}</th></tr>
        {stats.slice(run.start, run.start + run.span).map(stat => {
          const was = stat.value(a, mode), is = stat.value(b, mode);
          const change = was === null || is === null ? null : is - was;
          const tone = changeTone(stat, change);
          const verdict = verdicts.get(stat.key) ?? null;
          const series = plotted.indexOf(stat.key);
          return <tr key={stat.key}>
            <td>{formatStat(stat, was)}</td>
            <th scope="row">
              <button type="button" className="lg-plot" data-series={series >= 0 ? series + 1 : undefined} aria-pressed={series >= 0}
                title={series >= 0 ? `${stat.title}. On the chart; press to remove it.` : `${stat.title}. Press to add it to the chart.`} onClick={() => onPlot(stat.key)}>
                {stat.label}</button>
            </th>
            <td><span className="lg-now">{formatStat(stat, is)}</span>
              {change !== null && <span className="lg-change" data-tone={tone ?? undefined} data-normal={verdict && !verdict.unusual ? "" : undefined}
                title={`${stat.label}: last ${last.length} minus first ${first.length}.${verdict ? ` ${verdict.text}.` : ""}`}>
                <Icon name={change < 0 ? "trend-down" : "trend"} size={14} />({formatChange(stat, change)}){verdict?.extreme && <span className="lg-extreme" aria-hidden="true" />}
                {verdict && <span className="sr-only">. {verdict.text}</span>}</span>}
            </td>
          </tr>;
        })}
      </tbody>)}
      <tbody>
        <tr className="lg-compare-group"><th colSpan={3} scope="colgroup">Context</th></tr>
        <tr data-context="">
          <td title={`${before.known} of ${first.length} opponents rated`}>{rank(before.rank)}</td>
          <th scope="row" title="Opponents' average regular-season defensive rating rank (1 = best defence).">Opp DEF</th>
          <td title={`${now.known} of ${last.length} opponents rated`}><span className="lg-now">{rank(now.rank)}</span>
            {before.rank !== null && now.rank !== null && <span className="lg-change">{now.rank < before.rank ? "tougher" : now.rank > before.rank ? "easier" : "same"}</span>}</td>
        </tr>
        <tr data-context="">
          <td>{record(before)}</td>
          <th scope="row" title="Team record in these games">W–L</th>
          <td><span className="lg-now">{record(now)}</span></td>
        </tr>
      </tbody>
    </table>
    </div>
    {/* Follow-up 34: one short line. */}
    <p className="lg-coverage">{judged
      ? <><span className="lg-phrase"><span className="lg-key" data-tone="up">Gold:</span> better</span> · <span className="lg-phrase"><span className="lg-key" data-tone="down">Blue:</span> worse</span> · <span className="lg-phrase"><span className="lg-key">Grey:</span> his usual range</span><span className="lg-phrase lg-key-line"><span className="lg-extreme lg-extreme-inline" aria-hidden="true" /><span className="sr-only">Dot</span>: his best or worst {last.length}-game stretch this season</span></>
      : <span className="lg-phrase">Too few {last.length}-game stretches to judge</span>}
      {partial.map(note => <span key={note}> · <span className="lg-phrase">{note}</span></span>)}</p>
    <div className="lg-wordmark"><CourtLensWordmark height={16} /></div>
  </section>;
}

type Sort = { key: string; dir: "asc" | "desc" };

function sortGames(games: PlayerGameLogItem[], stats: LastGamesStat[], sort: Sort, mode: Exposure) {
  const stat = stats.find(s => s.key === sort.key);
  const keyed = games.map(game => ({ game, value: stat ? stat.value(totals([game]), mode) : null }));
  const sign = sort.dir === "asc" ? 1 : -1;
  return keyed.sort((x, y) => {
    if (!stat) return sign * (x.game.game_date.localeCompare(y.game.game_date) || x.game.game_id.localeCompare(y.game.game_id));
    if (x.value === null || y.value === null) return x.value === null ? (y.value === null ? 0 : 1) : -1;
    return sign * (x.value - y.value);
  }).map(entry => entry.game);
}

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

/** "W 118–109", "B2B" or "2 days", from the team schedule; unknown reads "—". */
function resultText(c: GameContext | undefined) {
  if (!c?.result) return "—";
  return c.teamPoints !== null && c.opponentPoints !== null ? `${c.result} ${c.teamPoints}–${c.opponentPoints}` : c.result;
}
function restText(c: GameContext | undefined) {
  if (!c) return "—";
  if (c.backToBack) return "B2B";
  return c.restDays === null ? "—" : `${c.restDays} ${c.restDays === 1 ? "day" : "days"}`;
}

type LogContext = { context: Record<string, GameContext>; defence: (game: PlayerGameLogItem) => OpponentDefence | null };

function GameLogTable({ games, stats, mode, sort, onSort, windowIds, expanded = false, context, defence, hovered, onHover }: {
  games: PlayerGameLogItem[]; stats: LastGamesStat[]; mode: Exposure; sort: Sort; onSort: (key: string) => void;
  windowIds: Set<string>; expanded?: boolean; hovered?: string | null; onHover?: (id: string | null) => void;
} & LogContext) {
  const rows = useMemo(() => sortGames(games, stats, sort, mode), [games, stats, sort, mode]);
  const header = (key: string, label: string, title?: string) => <button type="button" className="lg-sort" aria-pressed={sort.key === key} title={title} onClick={() => onSort(key)}>
    {label}{sort.key === key && <Icon name={sort.dir === "asc" ? "chevron-up" : "chevron-down"} size={14} />}</button>;
  return <div className="player-ref-grid-frame"><div className="player-ref-grid-scroll lg-log-scroll" data-expanded={expanded || undefined} role="region" aria-label="Game logs" tabIndex={0}>
    <table className="player-ref-grid lg-log" style={{ "--columns": stats.length } as CSSProperties}>
      <colgroup><col className="player-ref-grid-lead-column" /><col className="lg-opp-column" /><col className="lg-result-column" /><col className="lg-rest-column" /><col className="lg-def-column" />
        {stats.map(s => <col key={s.key} />)}</colgroup>
      <thead>
        <tr className="player-ref-grid-tier-1"><th className="player-ref-grid-lead" scope="colgroup" colSpan={1}>Game</th>
          <th colSpan={4} scope="colgroup" className="group-start">Context</th>
          {groupRuns(stats).map((run, index) => <th key={`${run.label}-${index}`} colSpan={run.span} scope="colgroup" className="group-start">{run.label}</th>)}</tr>
        <tr className="player-ref-grid-tier-2">
          <th className="player-ref-grid-lead" scope="col">{header("date", "Date")}</th>
          <th scope="col" className="group-start">Opp</th>
          <th scope="col" title="Team result and score">Result</th>
          <th scope="col" title="Days since the team's previous game; B2B is a back-to-back">Rest</th>
          <th scope="col" title="Opponent's regular-season defensive rating rank (1st = best)">Opp DEF</th>
          {stats.map((stat, index) => <th key={stat.key} scope="col" className={starts(stats, index) ? "group-start" : undefined}>{header(stat.key, stat.label, stat.title)}</th>)}
        </tr>
      </thead>
      <tbody>{rows.map(game => {
        const t = totals([game]);
        const c = context[game.game_id];
        const side = c?.side ?? game.side;
        const d = defence(game);
        return <tr key={game.game_id} data-window={windowIds.has(game.game_id) || undefined} data-linked={hovered === game.game_id || undefined}
          onMouseEnter={onHover ? () => onHover(game.game_id) : undefined} onMouseLeave={onHover ? () => onHover(null) : undefined}>
          <th scope="row" className="player-ref-grid-lead">
            {formatDate(game.game_date)}
          </th>
          <td className="group-start"><span className="lg-opp">{side === "away" ? "@" : side === "home" ? "vs" : ""}<TeamLogo team={game.opponent_tricode || game.opponent_id} season={game.season} size={18} />{game.opponent_tricode}</span></td>
          <td><span className="lg-result" data-result={c?.result ?? undefined}>{resultText(c)}</span></td>
          <td><span className="lg-rest" data-b2b={c?.backToBack || undefined}>{restText(c)}</span></td>
          <td title={d ? `Defensive rating ${d.rating.toFixed(1)}, ${ordinal(d.rank)} of 30` : "Not rated"}>{d ? ordinal(d.rank) : "—"}</td>
          {stats.map((stat, index) => <td key={stat.key} className={starts(stats, index) ? "group-start" : undefined}>
            {formatStat(stat, stat.value(t, mode), mode === "per_game")}</td>)}
        </tr>;
      })}</tbody>
    </table>
  </div></div>;
}

function GameCards({ games, stats, mode, context }: { games: PlayerGameLogItem[]; stats: LastGamesStat[]; mode: Exposure; context: Record<string, GameContext> }) {
  return <ol className="lg-cards" aria-label="Games in the window">{[...games].reverse().map(game => {
    const t = totals([game]);
    return <li key={game.game_id} className="lg-card">
      <header><span>{formatDate(game.game_date)}<small className="lg-result" data-result={context[game.game_id]?.result ?? undefined}>{resultText(context[game.game_id])}</small></span>
        <span className="lg-opp">{game.side === "away" ? "@" : game.side === "home" ? "vs" : ""}<TeamLogo team={game.opponent_tricode || game.opponent_id} season={game.season} size={18} />{game.opponent_tricode}</span></header>
      <dl>{stats.map(stat => <div key={stat.key}><dt title={stat.title}>{stat.label}</dt><dd>{formatStat(stat, stat.value(t, mode), mode === "per_game")}</dd></div>)}</dl>
    </li>;
  })}</ol>;
}

export function LastGamesView({ scopes, defaultSeason, example }: {
  scopes: LastGamesScope[]; defaultSeason: string; example: { id: string; name: string; season: string; rule: string } | null;
}) {
  const { get, set } = useQuery();
  const player = get("playerId") || get("id") || example?.id || "";
  const seasons = [...new Set(scopes.map(s => s.season))].sort().reverse();
  const season = get("season") && seasons.includes(get("season")!) ? get("season")! : defaultSeason;
  const hasPlayoffs = scopes.some(s => s.season === season && s.phase === "playoffs");
  const requested = get("phase") as Phase | null;
  const phase: Phase = requested === "regular_season" || (requested === "playoffs" && hasPlayoffs) ? requested : hasPlayoffs ? "all" : "regular_season";
  const cutoff = get("beforeDate"), releaseId = get("releaseId");
  const mode: Exposure = get("mode") === "per_36" ? "per_36" : "per_game";
  const view: View = get("view") === "cards" ? "cards" : "table";
  const stats = chosenStats(get("stats"));
  const added = (get("add") ?? "").split(",").filter(s => seasons.includes(s) && s !== season).slice(0, ADD_LIMIT);
  const sortParam = get("sort") ?? "date";
  const sort: Sort = { key: sortParam.replace(/^-/, "") || "date", dir: sortParam.startsWith("-") ? "asc" : "desc" };
  const [choosing, setChoosing] = useState(false);
  const [glossary, setGlossary] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [moved, setMoved] = useState<{ player: string; season: string } | null>(null);

  // The default subject is written into the URL, so a shared link names the player.
  useEffect(() => {
    if (example && !get("playerId") && !get("id")) set({ playerId: example.id, exampleSubject: example.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [example]);

  const main = useFeed([player, season, phase, cutoff, releaseId], () => player ? loadSeason(player, season, phase, scopes, cutoff, releaseId) : Promise.resolve(null));
  const extra = useFeed([player, added.join(","), phase, releaseId], () => Promise.all(added.map(s => loadSeason(player, s, phase, scopes, null, releaseId))));
  const data = main.data;
  // The log rows do not carry home or away; the team schedule does (follow-up 25).
  const withSide = (list: PlayerGameLogItem[], context: Record<string, GameContext> | undefined) =>
    list.map(g => context?.[g.game_id]?.side && !g.side ? { ...g, side: context[g.game_id].side } : g);
  const games = useMemo(() => withSide(data?.games ?? [], data?.context), [data]);
  const name = data?.name ?? (example?.id === player ? example.name : player);
  const sinceParam = get("since");
  const since = sinceParam && games.length > 1 && sinceParam > games[0].game_date && sinceParam <= games.at(-1)!.game_date ? sinceParam : null;
  const size = clampWindow(since ? gamesSince(games, since) : Number(get("window")) || DEFAULT_WINDOW, games.length);
  const anchors = useMemo(() => sinceAnchors(games), [games]);
  const dates = useMemo(() => games.map(g => g.game_date), [games]);
  const [hoverGame, setHoverGame] = useState<string | null>(null);
  // Context from every loaded season; each opponent rated in its own season.
  const context = useMemo(() => Object.assign({}, data?.context, ...(extra.data ?? []).map(l => l.context)) as Record<string, GameContext>, [data, extra.data]);
  const defence = useMemo(() => {
    const bySeason = new Map([data, ...(extra.data ?? [])].filter((l): l is Loaded => Boolean(l)).map(l => [l.season, l.defence]));
    return (game: PlayerGameLogItem) => bySeason.get(game.season)?.[game.opponent_id] ?? bySeason.get(game.season)?.[game.opponent_tricode] ?? null;
  }, [data, extra.data]);
  const trendParam = get("trend") ?? (get("s1") || get("s2") ? [get("s1") ?? "pts", get("s2") ?? "ast"].join(",") : null);
  const plotted = trendStats(trendParam).map(s => s.key);
  const plot = (key: string) => {
    const next = plotted.includes(key) ? (plotted.length > 1 ? plotted.filter(k => k !== key) : plotted)
      : plotted.length < MAX_TREND_STATS ? [...plotted, key] : [...plotted.slice(0, -1), key];
    set({ trend: next.join(",") === "pts,ast" ? null : next.join(","), s1: null, s2: null });
  };
  const { first, last } = splitWindow(games, size);
  const windowIds = useMemo(() => new Set(last.map(g => g.game_id)), [last]);
  const logGames = useMemo(() => [...games, ...(extra.data ?? []).flatMap(l => withSide(l.games, l.context))], [games, extra.data]);
  const trendGames = useMemo(() => [...logGames].sort((a, b) => a.game_date.localeCompare(b.game_date) || a.game_id.localeCompare(b.game_id)), [logGames]);
  const team = games.at(-1)?.team_id;
  const statKeys = stats.map(s => s.key);
  const exampleActive = example && get("exampleSubject") === player && example.id === player;
  const earlier = seasons.filter(s => s < season && !added.includes(s));

  // A picked player lands in a season with their game logs (owner, 2026-10-22): this season if
  // they played it, else their latest; logs start in 1983-84, so peak seasons do not apply.
  const pick = async (id: string) => {
    const read = await getPlayerSeasons([id], "regular_season", releaseId ?? undefined).catch(() => null);
    const landed = read ? landing((read.seasons[id] ?? []).filter(s => seasons.includes(s)), { page: season }) : null;
    const next = landed?.season ?? season;
    // Say why the season moved, for as long as this player and season stay on screen.
    setMoved(landed && landed.kind !== "kept" ? { player: id, season: next } : null);
    set({ playerId: id, id: null, exampleSubject: null, window: null, add: null, since: null, season: next === defaultSeason ? null : next });
  };
  const onSort = (key: string) => set({ sort: sort.key === key ? (sort.dir === "desc" ? `-${key}` : key === "date" ? null : key) : key === "date" ? null : key });
  const copyLink = async () => { if (await copyCanonicalQueryUrl("/last-games", Object.fromEntries(new URLSearchParams(window.location.search)))) { setCopied(true); setTimeout(() => setCopied(false), 2000); } };
  const label = (s: string) => `${s} (${phaseLabel(phase)})`;

  return <div className="lg-page" role="region" aria-label="Last X Games">
    <PageHeader className="pvp-header" icon="chart-trend" title={data?.name ? `${data.name} Last Games Stats` : "Last X Games"} subtitle={BLURB} />
    {moved && moved.player === player && moved.season === season && <p className="feed-example"><span><strong>{name}</strong></span>
      <span className="feed-example-rule">No games in the season you were viewing. Showing their latest season with game logs; change it with Season.</span></p>}
    {exampleActive && <ExampleNote name={example.name} rule={`${example.rule} Press the photo to change player.`} />}
    <div className="lg-console"><FilterBar label="Last X Games controls" summary={[season, phaseLabel(phase), mode === "per_36" ? "Per 36" : "Per Game"].join(" · ")}
      scope={<>
        <Select size="md" aria-label="Season" value={season} onChange={event => set({ season: event.target.value, window: null, add: null, since: null })}>
          {seasons.map(s => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select size="md" aria-label="Season phase" value={phase} onChange={event => set({ phase: event.target.value === (hasPlayoffs ? "all" : "regular_season") ? null : event.target.value, window: null })}>
          {hasPlayoffs && <option value="all">Regular Season + Playoffs</option>}
          <option value="regular_season">Regular Season</option>
          {hasPlayoffs && <option value="playoffs">Playoffs</option>}
        </Select>
      </>}
      modes={<>
        <Segmented<Exposure> size="md" label="Exposure" value={mode} onChange={value => set({ mode: value === "per_36" ? value : null })}
          options={[{ value: "per_game", label: "Per Game" }, { value: "per_36", label: "Per 36 Min" }]} />
        <Button size="md" variant="primary" icon="sliders" aria-haspopup="dialog" onClick={() => setChoosing(true)}>Choose Stats</Button>
        <Button size="md" icon="book" aria-haspopup="dialog" onClick={() => setGlossary(true)}>Glossary</Button>
        <Segmented<View> size="md" label="Layout" value={view} onChange={value => set({ view: value === "cards" ? value : null })}
          options={[{ value: "table", label: "Table View", icon: "table" }, { value: "cards", label: "Card View", icon: "cards" }]} />
      </>}
      details={data ? <DataDetailsButton rows={[
        { label: "Player", value: `${name} (${player})` },
        { label: "Scope", value: `${season} ${phaseLabel(phase)}` },
        ...Object.entries(data.through).map(([p, date]) => ({ label: `${phaseLabel(p)} through`, value: `Before ${formatDate(date)}` })),
        { label: "Games played", value: games.length },
        { label: "Window", value: `Last ${last.length} against the first ${first.length}` },
        ...(data.releaseId ? [{ label: "Release", value: data.releaseId, mono: true }] : []),
      ]}>
        <ul className="lg-method">
          <li>Only games before each phase&apos;s cutoff count. Regular season and playoff games are merged in date order; a game without a box-score row is unknown, not a zero or a missed game.</li>
          <li>Counting stats average the games where they are known; Per 36 Min divides their totals by those games&apos; minutes. TS%, 2P%, 3P%, FT% and FTR come from summed makes and attempts, never averaged percentages.</li>
          <li>The trend chart is a moving average over the games window; points before the window&apos;s length use the games played so far. A change is coloured only when the window is outside his middle 80% of stretches that long this season.</li>
          <li>+/- is not in the box score: it is the team&apos;s points scored minus allowed while the player was on the floor, from accepted play-by-play stints (2023-24 on). A game whose stints are incomplete reads &quot;—&quot;.</li>
        </ul>
        <Button size="md" icon="table" onClick={() => download(gamesCsv(name, [...logGames].reverse(), stats, mode), `courtlens-${name.toLowerCase().replace(/\s+/g, "-")}-last-games.csv`, "text/csv")}>Export CSV</Button>
        <Button size="md" icon={copied ? "check" : "copy"} onClick={() => void copyLink()}>{copied ? "Copied" : "Copy Link"}</Button>
      </DataDetailsButton> : undefined} /></div>

    <ChooseStats open={choosing} current={statKeys} onClose={() => setChoosing(false)}
      onSave={keys => { set({ stats: keys.join(",") === LAST_GAMES_STATS.filter(s => DEFAULT_LAST_GAMES_STATS.includes(s.key)).map(s => s.key).join(",") ? null : keys.join(",") }); setChoosing(false); }} />
    <Glossary open={glossary} onClose={() => setGlossary(false)} stats={stats} />

    {!player && <p className="lg-empty">Choose a player to begin.</p>}
    {main.error && <FeedFailure error={main.error} retry={main.retry} what="the game log" />}
    {player && main.loading && <FeedSkeleton label="Loading the game log" />}
    {data && games.length === 0 && <p className="lg-empty">{name} has no games in {season} {phaseLabel(phase)}.</p>}
    {data && games.length > 0 && <>
      <div className="lg-grid">
        <div className="lg-side">
          <WindowCard playerId={player} name={name} team={team} season={season} size={size} played={games.length}
            onSize={n => set({ window: n === DEFAULT_WINDOW ? null : String(n), since: null })} onPick={pick}
            anchors={anchors} since={since} dates={dates} onSince={date => set({ since: date, window: null })} />
          <Comparison name={name} who={[team, data?.position].filter(Boolean).join(" · ") || undefined} games={games} first={first} last={last} stats={stats} mode={mode} plotted={plotted} onPlot={plot} context={context} defence={defence} />
        </div>
        <section className="lg-logs player-glass" aria-label="Game Logs">
          <header className="lg-logs-head">
            <div><h2>Game Logs</h2><p>{name}</p></div>
            <div className="lg-logs-actions">
              <IconButton size="sm" variant="ghost" icon="expand" label="Expand the game logs" onClick={() => setExpanded(true)} />
              {earlier.length > 0 && added.length < ADD_LIMIT && <Menu align="right" renderTrigger={props => <Button {...props} size="sm" variant="text" icon="plus">Add Season Data</Button>}>
                {earlier.slice(0, 12).map(s => <MenuItem key={s} label={s} onClick={() => set({ add: [...added, s].sort().reverse().join(",") })} />)}
              </Menu>}
            </div>
          </header>
          <div className="lg-chips">
            <span className="lg-chip">{label(season)}</span>
            {added.map(s => <RemovableChip key={s} size="sm" removeLabel={`Remove ${s}`} onRemove={() => set({ add: added.filter(a => a !== s).join(",") || null })}>
              {label(s)}{extra.data && !extra.data.find(l => l.season === s)?.games.length ? " · no games" : ""}</RemovableChip>)}
            {extra.loading && added.length > 0 && <span className="lg-chip-note">Loading…</span>}
            {extra.error && <span className="lg-chip-note" role="alert">Earlier seasons failed to load</span>}
          </div>
          {view === "table"
            ? <GameLogTable games={logGames} stats={stats} mode={mode} sort={sort} onSort={onSort} windowIds={windowIds} context={context} defence={defence} hovered={hoverGame} onHover={setHoverGame} />
            : <GameCards games={last} stats={stats} mode={mode} context={context} />}
          {view === "table" && <p className="lg-note"><span className="lg-swatch" aria-hidden="true" />The last {last.length} {last.length === 1 ? "game" : "games"}, the window the comparison averages.</p>}
        </section>
      </div>
      <LastGamesTrend name={name} games={trendGames}
        windowStart={last[0]?.game_date ?? null} mode={mode} size={size} stats={trendParam} marked={hoverGame} onHover={setHoverGame}
        onChange={updates => set(updates)} />
      <Modal isOpen={expanded} onClose={() => setExpanded(false)} title="Game Logs" description={`${name} · ${[season, ...added].map(label).join(" · ")}`} className="lg-expand">
        <GameLogTable games={logGames} stats={stats} mode={mode} sort={sort} onSort={onSort} windowIds={windowIds} expanded context={context} defence={defence} />
      </Modal>
    </>}
  </div>;
}
