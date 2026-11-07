"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { EntityField } from "./entity-picker";
import { FeedFailure, FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { TeamLogo } from "./team-logo";
import { GatedNote } from "./ui/gated-note";
import { PlayerAvatar } from "./ui/identity";
import { Input } from "./ui/input";
import { Button, ButtonLink, Segmented, Select } from "./ui/kit";
import { PageShell } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { FormulaLine, MethodBlock, ResearchDisclosure, ResearchProse, ResearchSection } from "./research/research-page";
import { GridPlayer, GridValue, StatsGrid, type GridColumn } from "./research/stats-grid";
import {
  AXES, Code, CompareCard, ExpectedPanel, Explorer, GlossaryLabel, Histogram, LeagueTypes, PairMix, Panel, Spread, TestBars,
  type Axis, type CompareSide, type PairSide,
} from "./zts-figures";
import { seasonEra } from "@/lib/portrait-source";
import {
  DEFAULT_PAIR_RULE, EXTREMES_RULE, STATUS_LABELS, VERDICT_LABELS, defaultPair, difficultyBands, difficultyHistogram, extremes,
  formatNumber, formatPoints, formatShare, formatSigned, formatTs, formatWhole, getLeaderboard, getPlayerZts, getRoleMoves, getTeams,
  getZts, pearson, signTone,
  type Leaderboard, type PlayerZts, type RoleMoves, type TeamBoard, type TeamPlayer, type ValidationBlock, type ZtsRow, type ZtsStatus,
  type ZtsSummary, type ZtsTeam,
} from "@/lib/zts";

/*
 * Research → zTS (R04 analysis; RD03 design after Databallr's zTS explainer). Databallr's layout: an article hero, one
 * 768 px essay column in its section order, figures on light panels one level deep, and About / Top 200 / Player in a
 * floating pill dock. The prose is CourtLens's own and every number is CourtLens's: the frozen
 * courtlens-zts-validation-v1 results, the served impact bundle's volume and the descriptive team file. Databallr's
 * add-stat R² study, SV/100 and its other studies are not reproduced. Exact values sit on `data-*` for checks.
 */

type Tab = "about" | "top" | "player";
const TABS = [
  { value: "about", label: "About", icon: "info" },
  { value: "top", label: "Top 200", icon: "trophy" },
  { value: "player", label: "Player", icon: "search" },
] as const;
const LATEST = "2025-26";
const MINUTES = ["200", "300", "500", "750", "1000"] as const;
const UNKNOWN_ORDER: ZtsStatus[] = ["no_rts", "small_sample", "no_play_types", "source_rows_missing", "low_coverage"];
const NO_PLAYER = "none";
const known = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
const year = (season: string) => `'${season.slice(5)}`;
const int = (n: number) => n.toLocaleString("en-US");

// ---- Shared cells --------------------------------------------------------------------------------

function Player({ row, season }: { row: Pick<ZtsRow, "player_id" | "player_name" | "teams">; season: string }) {
  const [main, ...others] = row.teams;
  const team = main?.tricode ?? null;
  return <GridPlayer playerId={row.player_id} name={row.player_name} team={team} season={season} era={seasonEra(season, team)}
    href={`/players/${row.player_id}?season=${season}`}
    subtitle={others.length ? <>{[main, ...others].map(t => t.tricode ?? t.team_id).join(" · ")}</> : team ?? undefined} />;
}

function pointsColumn(key: "rts" | "difficulty" | "zts", label: string, sortable = false): GridColumn<ZtsRow> {
  return {
    key, label, width: "xs",
    sort: sortable ? (r: ZtsRow) => r[key] : undefined,
    cell: r => <GridValue text={formatPoints(r[key])} identity={signTone(r[key])} />,
    data: r => ({ field: key, value: r[key] ?? undefined }),
  };
}
const usageColumn: GridColumn<ZtsRow> = { key: "scoring_usage", label: "USG", width: "xs", sort: r => r.scoring_usage,
  cell: r => <GridValue text={formatNumber(r.scoring_usage)} />, data: r => ({ field: "scoring_usage", value: r.scoring_usage ?? undefined }) };
const addColumn: GridColumn<ZtsRow> = { key: "zts_add", label: "zTS add/100", title: "2 × scoring usage × zTS, points per 100 offensive possessions (CourtLens's; Databallr's SV/100 formula is not published)",
  width: "sm", sort: r => r.zts_add, cell: r => <GridValue text={formatSigned(r.zts_add)} identity={signTone(r.zts_add, 1, 1)} />,
  data: r => ({ field: "zts_add", value: r.zts_add ?? undefined }) };

function SmallTable({ label, rows, season }: { label: string; rows: readonly ZtsRow[]; season: string }) {
  return <StatsGrid label={label} name="zts-small" density="compact" height="auto" leadWidth="md" minWidth="narrow" rows={rows} rowKey={r => r.player_id}
    lead={{ label: "Player", cell: r => <Player row={r} season={season} /> }}
    columns={[usageColumn, pointsColumn("rts", "rTS"), pointsColumn("difficulty", "Role"), pointsColumn("zts", "zTS")]} />;
}

// ---- About ----------------------------------------------------------------------------------------

function Intro() {
  return <ResearchProse>
    <p>Scoring efficiency has been refined one step at a time. <Code>FG%</Code> counted makes. <Code>eFG%</Code> gave threes their extra point. <Code>TS%</Code> folded in free throws, so every scoring attempt counts.{" "}
      <Code>rTS</Code> measured that against the league, because scoring environments change from season to season.</p>
    <p>Each step kept the same question and answered it more completely. None of them asks what kind of possession produced the attempt.</p>
    <p>A cut and an isolation count the same in every one of those numbers. They are not equally hard.</p>
  </ResearchProse>;
}

function Signals({ summary, season }: { summary: ZtsSummary; season: string }) {
  const ref = summary.references[season];
  const sorted = [...(ref?.types ?? [])].sort((a, b) => a.ts - b.ts);
  return <>
    <ResearchProse>
      <p>A player&apos;s efficiency mixes two things: how well he scored, and the kind of possessions he was asked to score on. Move a player into easier finishing chances and his <Code>TS%</Code> rises
        without him becoming a better scorer. Hand him more creation and it can fall while his scoring barely changes.</p>
      <p>Box-score efficiency keeps the results of those possessions and drops the role that produced them.</p>
    </ResearchProse>
    {ref && <ResearchProse>
      <p>The gap between roles is large. In <Code>{season}</Code>, {sorted[0]?.label.toLowerCase()} possessions converted at {formatTs(sorted[0]?.ts)} play-type TS and {sorted.at(-1)?.label.toLowerCase()}s at {formatTs(sorted.at(-1)?.ts)}, against a league average of {formatTs(ref.ts)}.</p>
      <p><Code>zTS</Code> makes the role explicit. It looks at a player&apos;s play-type mix and asks what a league-average scorer would shoot on exactly that mix. A low expectation means a hard role; a high one, an easy role.
        The gap between the league average and that expectation is the <Code>playtype difficulty</Code>, and <Code>zTS</Code> adds it to <Code>rTS</Code>.</p>
      <p>Here are the {season} league marks for the eleven Synergy play types.</p>
    </ResearchProse>}
  </>;
}

function Calculation({ board }: { board: Leaderboard | null }) {
  const usage = board ? pearson(board.rows.map(r => [r.difficulty, r.scoring_usage] as const)) : null;
  return <>
    <ResearchProse><p>The calculation is short:</p></ResearchProse>
    <Panel className="zt-formulas" label="The calculation">
      <div className="zt-well zt-formula-well"><p className="zt-kicker">Expected TS</p><p className="zt-formula">Expected TS = Σ (play-type share × league TS for that play type)</p></div>
      <div className="zt-well zt-formula-well" data-emphasis="true"><p className="zt-kicker">Playtype Difficulty (Role)</p><p className="zt-formula zt-formula-big">Playtype Difficulty = League TS − Expected TS</p>
        <p className="zt-formula-note">A harder role is positive, so it adds to <Code>rTS</Code>.</p></div>
    </Panel>
    <blockquote className="zt-quote">zTS = rTS + Playtype Difficulty (Role)</blockquote>
    <ResearchProse>
      <p>The scale stays the one readers already know. <Code>rTS</Code> is points of true shooting above or below the league; <Code>zTS</Code> keeps those units and adds what the role made easier or harder.</p>
      <p>This is not a shot-quality model. A shot-quality model grades how makeable each final shot was. The role adjustment asks a different question: what scoring job the player was doing. It can credit a creator and mark down an easy finisher even when the final shots look alike.</p>
      {usage && <p>Difficulty is related to scoring usage without being a copy of it: in {board?.season}, among {int(usage.n)} players with a served zTS, the correlation between the two is <Code>{usage.r.toFixed(2)}</Code>.</p>}
    </ResearchProse>
  </>;
}

/** The worked example: the season's default pair and their play-type rows. */
function usePair(board: Leaderboard) {
  const fallback = defaultPair(board.rows);
  const a = fallback?.[0] ?? null, b = fallback?.[1] ?? null;
  const { data: da } = useFeed([a?.player_id ?? null, board.season], signal => getPlayerZts(a?.player_id ?? null, board.season, signal));
  const { data: db } = useFeed([b?.player_id ?? null, board.season], signal => getPlayerZts(b?.player_id ?? null, board.season, signal));
  const types = (d: typeof da, row: ZtsRow | null) => d?.status === "available" && d.player_id === row?.player_id ? d.play_types : d && d.player_id === row?.player_id ? [] : null;
  return { a, b, sideA: a ? { row: a, types: types(da, a) } as PairSide : null, sideB: b ? { row: b, types: types(db, b) } as PairSide : null };
}

/**
 * One compared side: its season (URL `as`/`bs`, the page season by default), that season's served players, its row, and the
 * seasons this player has a served zTS (from the player's history), which are the only ones its season select offers.
 */
function useCompareSide(key: "a" | "b", board: Leaderboard, seasons: readonly string[], fallback: ZtsRow | null): CompareSide {
  const { get } = useUrlState();
  const asked = get(`${key}s`);
  const season = asked && seasons.includes(asked) ? asked : board.season;
  const other = season !== board.season;
  const { data, error } = useFeed([other ? season : null], signal => other ? getLeaderboard(season, "zts_add", 1000, signal) : Promise.resolve(null));
  const players = !other ? board.rows : data?.status === "available" ? (data as Leaderboard).rows : data || error ? [] : null;
  const id = get(key) ?? fallback?.player_id ?? null;
  // The history is the same whichever season is asked, so it is keyed by the player alone.
  const { data: player } = useFeed([id], signal => getPlayerZts(id, season, signal));
  const served = player && player.player_id === id ? player.history.filter(h => known(h.zts) && seasons.includes(h.season)).map(h => h.season) : [];
  const playerSeasons = [...new Set([...served, season])].sort().reverse();
  return { season, id, players, row: players?.find(r => r.player_id === id) ?? null, seasons: playerSeasons };
}

function InPractice({ board, summary, pair }: { board: Leaderboard; summary: ZtsSummary; pair: ReturnType<typeof usePair> }) {
  const ref = summary.references[board.season];
  const { a, b, sideA, sideB } = pair;
  if (!a || !b || !sideA || !sideB || !ref) return <GatedNote>Too few players meet the default pair rule in {board.season}.</GatedNote>;
  const order = [...ref.types].sort((x, y) => x.ts - y.ts);
  const gap = known(a.difficulty) && known(b.difficulty) ? Math.abs(a.difficulty - b.difficulty) : null;
  return <>
    <ResearchProse>
      <p>{a.player_name} and {b.player_name} carried scoring usage of <Code>{formatNumber(a.scoring_usage)}</Code> and <Code>{formatNumber(b.scoring_usage)}</Code> in <Code>{board.season}</Code>, with <Code>rTS</Code> of {formatPoints(a.rts)} and {formatPoints(b.rts)}.
        Their play-type mixes describe two different scoring jobs.</p>
    </ResearchProse>
    <PairMix season={board.season} order={order} a={sideA} b={sideB} />
    <ExpectedPanel leagueTs={ref.ts} a={a} b={b} />
    {gap !== null && <ResearchProse><p>The difference in playtype difficulty is about <Code>{(gap * 100).toFixed(1)}</Code> points: invisible in <Code>rTS</Code>, counted by <Code>zTS</Code>.</p></ResearchProse>}
  </>;
}

function Distribution({ board, summary, season, setSeason }: { board: Leaderboard; summary: ZtsSummary; season: string; setSeason: (s: string) => void }) {
  const { get, set } = useUrlState();
  const minutes = (MINUTES as readonly string[]).includes(get("minutes") ?? "") ? get("minutes")! : "500";
  const [usage, setUsage] = useState<{ min: string; max: string }>({ min: "", max: "" });
  const [bin, setBin] = useState<number | null>(null);
  const lo = usage.min.trim() === "" ? null : Number(usage.min), hi = usage.max.trim() === "" ? null : Number(usage.max);
  const rows = board.rows.filter(r => (r.minutes ?? 0) >= Number(minutes)
    && (lo === null || !Number.isFinite(lo) || (r.scoring_usage ?? -Infinity) >= lo) && (hi === null || !Number.isFinite(hi) || (r.scoring_usage ?? Infinity) <= hi));
  const bands = difficultyBands(rows);
  const bins = difficultyHistogram(rows);
  const inBin = bin === null ? [] : rows.filter(r => known(r.difficulty) && r.difficulty * 100 >= bin && r.difficulty * 100 < bin + 1)
    .sort((x, y) => (y.difficulty ?? 0) - (x.difficulty ?? 0));
  return <>
    <Panel className="zt-controls" label="Distribution filters" aside={<span className="zt-count" data-count={bands.players}>{int(bands.players)} players</span>}>
      <div className="zt-control-row">
        <Select size="sm" aria-label="Season" value={season} onChange={e => { setBin(null); setSeason(e.target.value); }}>{[...summary.seasons].reverse().map(s => <option key={s} value={s}>{s}</option>)}</Select>
        <Select size="sm" aria-label="Minimum minutes" value={minutes} onChange={e => { setBin(null); set({ minutes: e.target.value === "500" ? null : e.target.value }); }}>{MINUTES.map(m => <option key={m} value={m}>{m}+ min</option>)}</Select>
      </div>
    </Panel>
    <Panel className="zt-dist" label={`Playtype Difficulty distribution, ${board.season}`}>
      <div className="zt-tiles" data-bands="true">
        <div className="zt-well zt-tile" data-field="hard"><span className="zt-kicker">Hard role +2</span><span className="zt-tile-value" data-identity="a" data-value={bands.hard}>{bands.hard}</span></div>
        <div className="zt-well zt-tile" data-field="easy"><span className="zt-kicker">Easy role −2</span><span className="zt-tile-value" data-identity="b" data-value={bands.easy}>{bands.easy}</span></div>
        <div className="zt-well zt-tile" data-field="middle"><span className="zt-kicker">Middle band ±1</span><span className="zt-tile-value" data-value={bands.middle}>{bands.middle}</span></div>
        <div className="zt-well zt-tile" data-field="mean"><span className="zt-kicker">Mean difficulty</span><span className="zt-tile-value" data-identity={known(bands.mean) ? signTone(bands.mean, 1, 1) : undefined} data-value={bands.mean ?? undefined}>{formatSigned(bands.mean)}</span></div>
      </div>
      <Histogram bins={bins} median={bands.median} selected={bin} onSelect={setBin} />
      <div className="zt-bin-pick">
        <Select size="sm" aria-label="Players in a difficulty range" value={bin === null ? "" : String(bin)} onChange={e => setBin(e.target.value === "" ? null : Number(e.target.value))}>
          <option value="">Tap a bar, or pick a range</option>
          {bins.map(b => <option key={b.from} value={b.from}>{formatSigned(b.from, 0)} to {formatSigned(b.to, 0)} ({b.count})</option>)}
        </Select>
      </div>
      {bin !== null && <StatsGrid label={`Players with difficulty ${bin} to ${bin + 1}`} name="zts-bin" density="compact" height="scroll" leadWidth="md" minWidth="narrow"
        rows={inBin} rowKey={r => r.player_id} empty="No players in this range." lead={{ label: "Player", cell: r => <Player row={r} season={board.season} /> }}
        columns={[usageColumn, pointsColumn("rts", "rTS"), pointsColumn("difficulty", "Role"), pointsColumn("zts", "zTS")]} />}
    </Panel>
    <Panel className="zt-controls" label="Scoring usage filter">
      <div className="zt-control-row">
        <span className="zt-kicker">Scoring usage</span>
        <Input inputSize="sm" type="number" inputMode="decimal" aria-label="Minimum scoring usage" placeholder="Min" value={usage.min} onChange={e => { setBin(null); setUsage(u => ({ ...u, min: e.target.value })); }} />
        <span className="zt-kicker">to</span>
        <Input inputSize="sm" type="number" inputMode="decimal" aria-label="Maximum scoring usage" placeholder="Max" value={usage.max} onChange={e => { setBin(null); setUsage(u => ({ ...u, max: e.target.value })); }} />
      </div>
    </Panel>
  </>;
}

function Moves({ season }: { season: string }) {
  const { data, error, loading, retry } = useFeed([season], signal => getRoleMoves(season, signal));
  const [chosen, setChosen] = useState<string | null>(null);
  if (error) return <FeedFailure error={error} retry={retry} what="Role moves" />;
  if (loading || !data) return <FeedSkeleton label="Loading role moves" />;
  if (data.status !== "available") return <GatedNote>{data.reason}</GatedNote>;
  const moves = data as RoleMoves;
  if (!moves.players.length) return <GatedNote>No player meets the role-moves rule for {moves.window[0]} to {moves.window.at(-1)}.</GatedNote>;
  const active = moves.players.find(p => p.player_id === chosen) ?? moves.players[0];
  const surname = (name: string) => name.split(" ").slice(-1)[0];
  return <div className="zt-moves" data-moves="true">
    <Segmented size="md" label="Player" value={active.player_id} onChange={setChosen} options={moves.players.map(p => ({ value: p.player_id, label: surname(p.player_name) }))} />
    <StatsGrid label={`${active.player_name}: playtype difficulty by season`} name="zts-moves" density="compact" height="auto" leadWidth="sm" minWidth="narrow"
      rows={active.history} rowKey={r => r.season} lead={{ label: "Season", cell: r => <span className="zt-season-cell">{r.season}</span> }}
      columns={[usageColumn, pointsColumn("rts", "rTS"), pointsColumn("difficulty", "Role"), pointsColumn("zts", "zTS")]} />
  </div>;
}

function Teams({ season }: { season: string }) {
  const { data, error, loading, retry } = useFeed([season], signal => getTeams(season, signal));
  const [open, setOpen] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: string; direction: "asc" | "desc" }>({ key: "difficulty", direction: "desc" });
  if (error) return <FeedFailure error={error} retry={retry} what="Team playtype difficulty" />;
  if (loading || !data) return <FeedSkeleton label="Loading team playtype difficulty" />;
  if (data.status !== "available") return <GatedNote>{data.reason}</GatedNote>;
  const board = data as TeamBoard;
  const value = (t: ZtsTeam) => sort.key === "synergy_ts" ? t.synergy_ts : t.difficulty;
  const teams = [...board.teams].sort((x, y) => (sort.direction === "desc" ? value(y) - value(x) : value(x) - value(y)) || x.team_id.localeCompare(y.team_id));
  const team = board.teams.find(t => t.team_id === open) ?? null;
  const top = board.teams[0], bottom = board.teams.at(-1)!;
  return <>
    <ResearchProse>
      <p>Team difficulty sits in a narrow band. Summing every team&apos;s player rows, {board.season} runs from {formatPoints(bottom.difficulty, 2)} ({bottom.tricode}) to {formatPoints(top.difficulty, 2)} ({top.tricode}) TS points.
        Player difficulty is spread several times wider.</p>
    </ResearchProse>
    <Spread players={board.spread.players} teams={board.spread.teams} seasons={board.spread.seasons} />
    <ResearchProse>
      <p>A positive <Code>PT diff</Code> or <Code>Role</Code> means a harder mix. Sort by <Code>PT diff</Code> or <Code>TS</Code>, and open a team to see its players&apos; roles.</p>
    </ResearchProse>
    <StatsGrid<ZtsTeam> label={`Team playtype difficulty, ${board.season}`} name="zts-teams" density="compact" height="scroll" leadWidth="sm" minWidth="narrow"
      rows={teams} rowKey={t => t.team_id} rowData={t => ({ team: t.tricode ?? t.team_id, open: open === t.team_id })}
      sort={{ ...sort, onSort: key => setSort(s => ({ key, direction: s.key === key && s.direction === "desc" ? "asc" : "desc" })) }}
      lead={{ label: "Team", cell: t => <Button size="sm" variant="text" pressed={open === t.team_id} iconAfter={open === t.team_id ? "chevron-up" : "chevron-down"}
        aria-label={`${t.tricode ?? t.team_id} player roles`} onClick={() => setOpen(o => o === t.team_id ? null : t.team_id)}>
        <span className="zt-team-cell"><span className="zt-rank">{t.rank}</span>{t.tricode && <TeamLogo team={t.tricode} season={board.season} size={20} />}{t.tricode ?? t.team_id}</span></Button> }}
      columns={[
        { key: "difficulty", label: "PT diff", width: "sm", sort: t => t.difficulty, cell: t => <GridValue text={formatPoints(t.difficulty, 2)} identity={signTone(t.difficulty, 2)} />, data: t => ({ field: "difficulty", value: t.difficulty }) },
        { key: "synergy_ts", label: "TS", title: "Play-type TS over the team's listed rows (CourtLens's definition)", width: "sm", sort: t => t.synergy_ts, cell: t => <GridValue text={formatTs(t.synergy_ts)} />, data: t => ({ field: "synergy_ts", value: t.synergy_ts }) },
      ]} />
    {team && <StatsGrid<TeamPlayer> label={`${team.tricode ?? team.team_id} player roles, ${board.season}`} name="zts-team-players" density="compact" height="scroll" leadWidth="md" minWidth="narrow"
      rows={team.players} rowKey={p => p.player_id}
      lead={{ label: "Player", cell: p => <GridPlayer playerId={p.player_id} name={p.player_name} team={team.tricode} season={board.season} era={seasonEra(board.season, team.tricode)}
        href={`/players/${p.player_id}?season=${board.season}`} subtitle={p.multi_team ? "Season Role, all teams" : undefined} /> }}
      columns={[
        { key: "share", label: "Share", title: "Share of the team's listed scoring possessions", width: "xs", cell: p => <GridValue text={formatShare(p.share)} />, data: p => ({ field: "share", value: p.share }) },
        { key: "difficulty", label: "Role", width: "xs", cell: p => <GridValue text={p.zts_status === "known" || known(p.difficulty) ? formatPoints(p.difficulty) : "—"} identity={signTone(p.difficulty)} />, data: p => ({ field: "difficulty", value: p.difficulty ?? undefined }) },
      ]} />}
  </>;
}

function LeaderboardBlock({ board, summary }: { board: Leaderboard; summary: ZtsSummary }) {
  const [shown, setShown] = useState(50);
  const [query, setQuery] = useState("");
  const [glossary, setGlossary] = useState(false);
  const q = query.trim().toLowerCase();
  const matches = q ? board.rows.filter(r => r.player_name.toLowerCase().includes(q)) : board.rows;
  const rows = matches.slice(0, shown);
  return <div className="zt-board">
    <div className="zt-board-bar">
      <Button size="sm" variant="text" pressed={glossary} onClick={() => setGlossary(g => !g)}><GlossaryLabel /></Button>
      <span className="zt-count" data-count={board.rows.length}>{int(board.rows.length)} players</span>
    </div>
    {glossary && <Glossary summary={summary} />}
    <Input inputSize="md" prefixIcon="search" aria-label="Search players" placeholder="Search players..." value={query} onChange={e => setQuery(e.target.value)} />
    <StatsGrid label={`Full leaderboard ${board.season}`} name="zts-board" rows={rows} rowKey={r => r.player_id} height="scroll" leadWidth="md"
      lead={{ label: "Player", cell: r => <Player row={r} season={board.season} /> }}
      columns={[{ ...usageColumn, label: "Scoring usage", width: "sm" }, pointsColumn("rts", "rTS"), pointsColumn("difficulty", "Role"), pointsColumn("zts", "zTS"), addColumn]}
      className="zt-board-grid" />
    {shown < matches.length && <Button variant="secondary" size="md" stretch onClick={() => setShown(matches.length)}>Show more ({int(matches.length - shown)} remaining)</Button>}
  </div>;
}

function Glossary({ summary }: { summary: ZtsSummary }) {
  const items: [string, string][] = [
    ["Scoring usage", "100 × true-shooting attempts per offensive possession, from the served impact bundle."],
    ["rTS", summary.definitions.rts],
    ["Role", summary.definitions.difficulty],
    ["zTS", summary.definitions.zts],
    ["zTS add/100", "2 × scoring usage × zTS, points per 100 offensive possessions. CourtLens's figure in place of Databallr's SV/100, whose formula is not published."],
  ];
  return <dl className="zt-glossary">{items.map(([t, d]) => <div key={t} className="zt-well"><dt>{t}</dt><dd>{d}</dd></div>)}</dl>;
}

function Caveats({ summary, season, board }: { summary: ZtsSummary; season: string; board: Leaderboard | null }) {
  const fta = summary.fta_check;
  const v = summary.validation;
  const ref = summary.references[season];
  type VRow = { name: string; block: ValidationBlock };
  const vrows = (target: "predictive" | "tracking"): VRow[] => [
    { name: `Test, pooled (${v[target].test.seasons[0]} to ${v[target].test.seasons.at(-1)})`, block: v[target].test.pooled },
    ...Object.entries(v[target].test.by_season).map(([s, block]) => ({ name: `Test ${s}`, block })),
    { name: `Choice, pooled (${v[target].choice.seasons[0]} to ${v[target].choice.seasons.at(-1)})`, block: v[target].choice.pooled },
  ];
  const ci = (i?: { value: number; low: number; high: number }, d = 3) => i ? `${formatSigned(i.low, d)} to ${formatSigned(i.high, d)}` : null;
  const vcols = (target: "predictive" | "tracking"): GridColumn<VRow>[] => [
    { key: "rows", label: "Rows / players", width: "md", cell: r => <GridValue text={`${int(r.block.rows)} / ${int(r.block.players)}`} /> },
    { key: "r_rts", label: "r, rTS", width: "xs", cell: r => <GridValue text={r.block.metrics.r_rts.value.toFixed(3)} />, data: r => ({ value: r.block.metrics.r_rts.value }) },
    { key: "r_zts", label: "r, zTS", width: "xs", cell: r => <GridValue text={r.block.metrics.r_zts.value.toFixed(3)} />, data: r => ({ value: r.block.metrics.r_zts.value }) },
    { key: "delta_r", label: "zTS − rTS in r", width: "md", cell: r => <GridValue text={formatSigned(r.block.metrics.delta_r.value, 3)} sub={`95% ${ci(r.block.metrics.delta_r)}`} />,
      data: r => ({ value: r.block.metrics.delta_r.value, low: r.block.metrics.delta_r.low, high: r.block.metrics.delta_r.high }) },
    ...(target === "predictive" ? [{ key: "delta_mse", label: "MSE gain ×10⁴", width: "md", cell: (r: VRow) => <GridValue text={formatSigned(r.block.metrics.delta_mse?.value, 2)} sub={`95% ${ci(r.block.metrics.delta_mse, 2)}`} /> } as GridColumn<VRow>] : []),
    { key: "verdict", label: "Verdict", width: "md", cell: r => <GridValue text={VERDICT_LABELS[r.block.verdict_r]} /> },
  ];
  const coverage = Object.entries(summary.coverage).map(([s, c]) => ({ season: s, ...c }));
  return <ResearchDisclosure id="caveats" icon="info" title="Caveats & Methodology">
    <MethodBlock title="Definitions">
      <ul className="zt-list" data-definitions="true">
        {(["play_type_ts", "expected_ts", "difficulty", "zts", "rts", "league"] as const).map(key => <li key={key}>{summary.definitions[key]}</li>)}
        <li>{summary.volume_note}</li>
        <li>{summary.no_interval}</li>
      </ul>
    </MethodBlock>
    <MethodBlock title="Coverage and unknowns">
      <ul className="zt-list">
        <li>Seasons {summary.seasons[0]} to {summary.seasons.at(-1)}, regular season only: Synergy play types start in 2015-16, 2026-27 has no play-type rows or sealed rTS yet, and playoffs are outside the registration (Post is disabled on Top 200).</li>
        <li>FTA cannot be derived from the play-type rows: they count free-throw trips and and-ones, not attempts. On {int(fta.player_seasons)} single-team player-seasons the best estimate is {(fta.ratio_proxy_to_box_fta.p50 * 100).toFixed(1)}% of box FTA at the median ({(fta.ratio_proxy_to_box_fta.p05 * 100).toFixed(1)}% to {(fta.ratio_proxy_to_box_fta.p95 * 100).toFixed(1)}%, 5th to 95th percentile), so play-type TS is CourtLens&apos;s own definition, not Databallr&apos;s.</li>
        <li>The source omits a play type a player used fewer than {summary.parameters.source_min_possessions} times, and some seasons miss whole rows. Databallr estimates the missing frequencies; CourtLens does not: a player-season with a missing row, under {summary.parameters.min_coverage * 100}% coverage or under {summary.parameters.min_tsa} TSA has no zTS and says why.</li>
      </ul>
      <StatsGrid label="Coverage by season" name="zts-coverage" density="compact" height="auto" leadWidth="sm" rows={coverage} rowKey={r => r.season}
        lead={{ label: "Season", cell: r => <span className="zt-season-cell">{r.season}</span> }}
        rowData={r => ({ season: r.season })}
        columns={[
          { key: "seasons", label: "Player-seasons", width: "sm", cell: r => <GridValue text={int(r.player_seasons)} /> },
          { key: "known", label: "Served zTS", width: "sm", cell: r => <GridValue text={int(r.status.known ?? 0)} />, data: r => ({ value: r.status.known ?? 0 }) },
          ...UNKNOWN_ORDER.map(s => ({ key: s, label: STATUS_LABELS[s], width: "sm" as const, cell: (r: (typeof coverage)[number]) => <GridValue text={int(r.status[s] ?? 0)} />, data: (r: (typeof coverage)[number]) => ({ value: r.status[s] ?? 0 }) })),
        ]} />
    </MethodBlock>
    <MethodBlock title="Rules on this page">
      <ul className="zt-list">
        <li>{DEFAULT_PAIR_RULE}</li>
        <li>The Finishing-Big Effect and High-Burden Perimeter Scorers: {EXTREMES_RULE}</li>
        <li>Distribution bands: hard role +2 or more, easy role −2 or less, middle band within ±1 TS point; one-point bins; the minutes and scoring-usage filters apply to the chart and the tiles.</li>
        <li>The X/Y explorer colours a player gold at Role +1 or more and blue at −1 or less (a sign, not a judgement); the dashed line is x = y when both axes are in TS points.</li>
        <li>Playtype Difficulty Moves: players with a served zTS and 1,000+ minutes in each of the (up to) five seasons ending in the chosen season, ranked by the size of their Role change from the first season to the last; the six largest.</li>
        <li>Team playtype difficulty: every listed Synergy offensive row a team&apos;s players logged for it, summed, then Expected TS and difficulty as for a player, against the same league references. Rows under the source&apos;s 10-possession floor are absent, so team totals run slightly low. A traded player&apos;s Role in a team&apos;s list is his season value over all teams. The spread chart pools every season (Gaussian kernel density, Silverman&apos;s bandwidth; σ is the population standard deviation). Descriptive, not part of the registered test.</li>
        <li>The correlation with scoring usage is a plain Pearson r over the chosen season&apos;s served players.</li>
      </ul>
    </MethodBlock>
    <MethodBlock title="The registered test, by season">
      <p className="zt-method-text">Registered test {summary.registration.identity}, committed before any zTS existed. Weighted correlations; 95% intervals from a paired player-cluster bootstrap (2,000 replicates, seed 4004). Only the test seasons decide the verdict.</p>
      {(["predictive", "tracking"] as const).map(target => <StatsGrid key={target} label={target === "predictive" ? "Predicting next season's rTS" : "Tracking oTS RAPM"} name={`zts-test-${target}`}
        density="compact" height="auto" leadWidth="lg" minWidth="wide" rows={vrows(target)} rowKey={r => r.name} rowData={r => ({ validation: `${target}-${r.name}` })}
        lead={{ label: target === "predictive" ? "Next season's rTS" : "Same-season oTS RAPM", cell: r => <span className="zt-season-cell">{r.name}</span> }} columns={vcols(target)} />)}
    </MethodBlock>
    {ref && <MethodBlock title={`League play-type totals, ${season}`}>
      <StatsGrid label={`${season} league play-type TS`} name="zts-league" density="compact" height="auto" leadWidth="sm" rows={ref.types} rowKey={t => t.play_type}
        rowData={t => ({ type: t.play_type })} lead={{ label: "Play type", cell: t => <span className="zt-season-cell">{t.label}</span> }}
        columns={[
          { key: "ts", label: "League TS", width: "sm", cell: t => <GridValue text={formatTs(t.ts)} />, data: t => ({ value: t.ts }) },
          { key: "share", label: "Share", width: "sm", cell: t => <GridValue text={formatShare(t.share)} />, data: t => ({ value: t.share }) },
          { key: "points", label: "Points", width: "sm", cell: t => <GridValue text={formatWhole(t.points)} /> },
          { key: "sp", label: "Scoring poss.", width: "md", cell: t => <GridValue text={formatWhole(t.scoring_possessions)} /> },
        ]} />
    </MethodBlock>}
    <MethodBlock title="Data & Credits">
      <p className="zt-method-text">{summary.credit}</p>
      <p className="zt-method-text">Registration <code>{summary.registration.content_sha256.slice(0, 16)}</code> · results <code>{summary.results_sha256.slice(0, 16)}</code> · impact bundle <code>{summary.inputs.impact_bundle_sha256.slice(0, 16)}</code>{board ? ` · ${int(board.known)} served zTS in ${board.season}` : ""}.</p>
    </MethodBlock>
  </ResearchDisclosure>;
}

function About({ summary }: { summary: ZtsSummary }) {
  const { get, set } = useUrlState();
  const season = summary.seasons.includes(get("season") ?? "") ? get("season")! : LATEST;
  const setSeason = (s: string) => set({ season: s === LATEST ? null : s, a: null, b: null, as: null, bs: null });
  const { data, error, loading, retry } = useFeed([season], signal => getLeaderboard(season, "zts_add", 1000, signal));
  const board = data?.status === "available" ? data as Leaderboard : null;
  const ref = summary.references[season];
  const x = (AXES.find(a => a.value === get("x"))?.value ?? "rts") as Axis;
  const y = (AXES.find(a => a.value === get("y"))?.value ?? "difficulty") as Axis;
  const v = summary.validation;
  const ext = board ? extremes(board.rows) : null;
  const every = (t: "tracking" | "predictive") => Object.values(v[t].test.by_season).every(b => b.verdict_r === v[t].test.pooled.verdict_r);
  return <>
    <Intro />
    <ResearchSection className="zt-section" title="Two Signals in One Number"><Signals summary={summary} season={season} />
      {ref && <LeagueTypes season={season} ts={ref.ts} types={ref.types} />}
      <Calculation board={board} />
    </ResearchSection>
    {error && <FeedFailure error={error} retry={retry} what="The season's zTS" />}
    {loading && <FeedSkeleton label="Loading the season's zTS" />}
    {data?.status === "unknown" && <GatedNote>{data.reason}</GatedNote>}
    {board && <BoardSections board={board} summary={summary} season={season} setSeason={setSeason} x={x} y={y} ext={ext!} setAxes={(nx, ny) => set({ x: nx === "rts" ? null : nx, y: ny === "difficulty" ? null : ny })} />}
    <ResearchSection className="zt-section" title="What the Test Measures">
      <ResearchProse>
        <p>A scoring-efficiency number should line up with how much a player actually moves his team&apos;s shooting. The cleanest lineup-level measure is <Code>oTS RAPM</Code>, the true-shooting slice of <a className="zt-link" href="/research/rapm/six-factor">Six-Factor RAPM</a>: how much a team&apos;s points per shot change with the player on the floor, after teammates and opponents.</p>
        <p>CourtLens registered the comparison before any zTS existed, with a second target alongside it: next season&apos;s <Code>rTS</Code>. One asks whether zTS describes the season better; the other, whether it forecasts the next one better.</p>
      </ResearchProse>
    </ResearchSection>
    <ResearchSection className="zt-section" title="What the Test Found">
      <div className="zt-tests">
        <TestBars title={`Tracks same-season oTS RAPM, ${v.tracking.test.seasons[0]} to ${v.tracking.test.seasons.at(-1)}`} block={v.tracking.test.pooled} />
        <TestBars title={`Predicts next season's rTS, ${v.predictive.test.seasons[0]} to ${v.predictive.test.seasons.at(-1)}`} block={v.predictive.test.pooled} />
      </div>
      <ResearchProse>
        <p>The verdict splits. <Code>zTS</Code> tracks same-season shooting impact better than <Code>rTS</Code> (&ldquo;{VERDICT_LABELS[v.tracking.test.pooled.verdict_r]}&rdquo;{every("tracking") ? " in every test season" : " pooled"}).
          It predicts next season&apos;s raw <Code>rTS</Code> worse (&ldquo;{VERDICT_LABELS[v.predictive.test.pooled.verdict_r]}&rdquo;{every("predictive") ? " in every test season" : " pooled"}).</p>
        <p className="zt-lead">A hard role tends to persist, and next season&apos;s raw efficiency still carries the penalty that zTS removed. zTS is the better description of the season; rTS is the better forecast of next season&apos;s rTS.</p>
        <p>This is the registered comparison of the efficiency terms alone. Databallr&apos;s own test, of add stats against oTS RAPM, is not reproduced here.</p>
      </ResearchProse>
    </ResearchSection>
    {board && <ResearchSection className="zt-section" title="Playtype Difficulty Moves">
      <ResearchProse><p>A player&apos;s role is not fixed. The same player can take on a harder job or hand one off from one season to the next, and his raw efficiency moves with it.</p></ResearchProse>
      <Moves season={season} />
      <ResearchProse><p>A year-to-year change in efficiency is often a change in the job as much as in the player, and frequently both at once.</p></ResearchProse>
    </ResearchSection>}
    <ResearchSection className="zt-section" title="What About Team Scheme?">
      <ResearchProse>
        <p>A team&apos;s play-type mix comes from its scheme, pace, roster and playmaking. Some offenses manufacture easy looks; others ask their scorers to create. zTS is measured against the league, so it describes what a scorer did inside whatever environment his team built.</p>
        <p>That leaves a fair question: how much of a role player&apos;s easy mix is his team&apos;s doing? Two layers are worth separating: <strong>generation</strong>, how an offense creates its chances, and <strong>conversion</strong>, how well those chances become points. Team mix lives mostly on the first; zTS works on the second.</p>
      </ResearchProse>
      <Teams season={season} />
      <ResearchProse><p>Most of the spread in playtype difficulty lives inside teams, not between them. Centring a player on his team instead of the league would remove shared context, but it would also take away credit from the players who create that context. The league-centred zTS keeps the narrower question.</p></ResearchProse>
    </ResearchSection>
    <ResearchSection className="zt-section" title="The Point">
      <ResearchProse>
        <p><Code>rTS</Code> already gives a familiar scale for scoring efficiency. What it mixes together is how well the player scored and how hard his possessions were. <Code>zTS</Code> separates the two and keeps the scale.</p>
      </ResearchProse>
      <FormulaLine>observed efficiency = scoring performance + playtype difficulty</FormulaLine>
      <ol className="zt-progression" aria-label="The progression of scoring metrics">
        <li><Code>FG%</Code> asked whether the shot went in.</li>
        <li><Code>eFG%</Code> admitted some shots are worth more.</li>
        <li><Code>TS%</Code> counted free throws.</li>
        <li><Code>rTS</Code> added the league&apos;s context.</li>
        <li data-emphasis="true"><Code>zTS</Code> adds the difficulty of the scoring role itself.</li>
      </ol>
    </ResearchSection>
    {board && <ResearchSection className="zt-section" title="Full Leaderboard"><LeaderboardBlock key={board.season} board={board} summary={summary} /></ResearchSection>}
    <ResearchSection className="zt-section" title="Conclusion">
      <ResearchProse>
        <p>Volume and efficiency are the two numbers that matter most about a scorer, and both should carry as much context as possible. <Code>rTS</Code> says a player scored efficiently, not on what. A diet heavy in cuts and transition flatters it, and it cannot tell.</p>
        <p>Playtype difficulty is the context &ldquo;role&rdquo; always gestured at. <Code>zTS</Code> folds it in: how efficient was this player on the possessions he actually used?</p>
        <p className="zt-lead">On CourtLens&apos;s registered test, that makes zTS the better account of a season&apos;s shooting impact, and the worse forecast of next season&apos;s raw efficiency.</p>
      </ResearchProse>
      <div><ButtonLink size="md" variant="secondary" href="/research/zts?tab=top" iconAfter="right">Top 200 seasons since {summary.seasons[0]}</ButtonLink></div>
    </ResearchSection>
    <Caveats summary={summary} season={season} board={board} />
  </>;
}

function BoardSections({ board, summary, season, setSeason, x, y, ext, setAxes }: {
  board: Leaderboard; summary: ZtsSummary; season: string; setSeason: (s: string) => void; x: Axis; y: Axis; ext: { easiest: ZtsRow[]; hardest: ZtsRow[] }; setAxes: (x: Axis, y: Axis) => void;
}) {
  const pair = usePair(board);
  const { set } = useUrlState();
  const compareA = useCompareSide("a", board, summary.seasons, pair.a);
  const compareB = useCompareSide("b", board, summary.seasons, pair.b);
  const big = ext.easiest[0], burden = ext.hardest[0];
  return <>
    <ResearchSection className="zt-section" title="The Calculation in Practice"><InPractice board={board} summary={summary} pair={pair} /></ResearchSection>
    {pair.a && pair.b && <ResearchSection className="zt-section" title="Compare Players Side by Side">
      <ResearchProse><p>Pick any two players, each in any of his seasons with a served zTS (from <span className="zt-nowrap">{summary.seasons[0]}</span>), to see the four core scoring fields side by side. <Code>rTS</Code>, Role and <Code>zTS</Code> are each measured against their own season&apos;s league, so different seasons compare directly.</p></ResearchProse>
      <Panel className="zt-compare-panel" label="Side by side"><CompareCard a={compareA} b={compareB}
        onPick={(s, id) => set({ [s]: id })} onSeason={(s, season) => set({ [`${s}s`]: season === board.season ? null : season })} /></Panel>
    </ResearchSection>}
    <ResearchSection className="zt-section" title="How Big the Adjustments Are">
      <ResearchProse>
        <p>The question is whether these adjustments are rounding errors or real across the player pool. Positive values mean a harder than average role; negative, an easier one.</p>
      </ResearchProse>
      <Distribution board={board} summary={summary} season={season} setSeason={setSeason} />
      <ResearchProse><p>Most players sit near the middle. The tails are what matter: plenty of rotation players work in roles meaningfully harder or easier than average, and players with similar scoring volume can land at opposite ends.</p></ResearchProse>
    </ResearchSection>
    <ResearchSection className="zt-section" title="The Finishing-Big Effect">
      <ResearchProse><p>The adjustment is largest for players who score almost entirely on rolls, putbacks and cuts.</p></ResearchProse>
      <p className="zt-season-tag">{board.season}</p>
      <SmallTable label="The finishing-big effect" rows={ext.easiest} season={board.season} />
      {big && <ResearchProse>
        <p>These are efficient scorers, and they score in the most favourable environments in basketball, which is why their <Code>Role</Code> numbers are so negative: {big.player_name}&apos;s is {formatPoints(big.difficulty)}.</p>
        <p className="zt-lead"><Code>zTS</Code> adjusts for that.</p>
      </ResearchProse>}
    </ResearchSection>
    <ResearchSection className="zt-section" title="High-Burden Scorers">
      <ResearchProse><p>The adjustment runs the other way for players whose mix leans on creation.</p></ResearchProse>
      <SmallTable label="High-burden scorers" rows={ext.hardest} season={board.season} />
      {burden && <ResearchProse>
        <p>These players are solving harder scoring problems, which shows directly in the positive <Code>Role</Code> column: {burden.player_name}&apos;s is {formatPoints(burden.difficulty)}.</p>
        <p className="zt-lead"><Code>zTS</Code> gives that burden credit.</p>
      </ResearchProse>}
      <Explorer season={board.season} rows={board.rows} x={x} y={y} onAxes={setAxes} />
    </ResearchSection>
    <ResearchSection className="zt-section" title="Turning Efficiency Into Scoring Value">
      <ResearchProse>
        <p>Efficiency alone does not measure scoring value; it has to be scaled by how much scoring the player carried. An add stat does that: a rate times scoring usage. It is not a full model of offense (no playmaking, no spacing). It is the arithmetic that relative efficiency implies.</p>
      </ResearchProse>
      <FormulaLine>TS add = 2 × scoring usage × rTS (points per 100 offensive possessions)</FormulaLine>
      <FormulaLine>zTS add = 2 × scoring usage × zTS</FormulaLine>
      <ResearchProse><p>The factor of 2 puts the result in points. The leaderboard below ranks by <Code>zTS add/100</Code>, CourtLens&apos;s figure in the place of Databallr&apos;s SV/100, whose formula is not published.</p></ResearchProse>
    </ResearchSection>
  </>;
}

// ---- Top 200 ---------------------------------------------------------------------------------------

function TopSeasons({ summary }: { summary: ZtsSummary }) {
  const { get, set } = useUrlState();
  const season = get("topSeason") ?? "all";
  const sort = (get("rank") ?? "zts_add") as "zts" | "zts_add";
  const [query, setQuery] = useState("");
  const [glossary, setGlossary] = useState(false);
  const { data, error, loading, retry } = useFeed([season, sort], signal => getLeaderboard(season, sort, 200, signal));
  const board = data?.status === "available" ? data as Leaderboard : null;
  const rows = board ? board.rows.filter(r => r.player_name.toLowerCase().includes(query.trim().toLowerCase())) : [];
  return <div className="zt-top" data-section="top">
    <div className="zt-top-bar">
      <Select size="md" aria-label="Top season" value={season} onChange={e => set({ topSeason: e.target.value === "all" ? null : e.target.value })}>
        <option value="all">All seasons</option>{[...summary.seasons].reverse().map(s => <option key={s} value={s}>{s}</option>)}</Select>
      <Button size="md" variant="text" pressed={glossary} onClick={() => setGlossary(g => !g)}><GlossaryLabel /></Button>
    </div>
    <div className="zt-top-bar">
      <Segmented label="Season type" size="md" value="reg" onChange={() => undefined}
        options={[{ value: "reg", label: "Reg" }, { value: "post", label: "Post", disabled: true, title: "No playoff zTS: playoffs are outside the registration" }]} />
      <Input inputSize="md" prefixIcon="search" aria-label="Search players" placeholder="Search..." value={query} onChange={e => setQuery(e.target.value)} />
    </div>
    {glossary && <Glossary summary={summary} />}
    {error && <FeedFailure error={error} retry={retry} what="Top 200" />}
    {loading && <FeedSkeleton label="Loading Top 200" />}
    {data?.status === "unknown" && <GatedNote>{data.reason}</GatedNote>}
    {board && <StatsGrid label="Top 200 seasons" name="zts-top" rows={rows} rowKey={r => `${r.season}:${r.player_id}`} height="scroll" leadWidth="md" className="zt-top-grid"
      sort={{ key: sort, direction: "desc", onSort: key => set({ rank: key === "zts" ? "zts" : null }) }}
      lead={{ label: "# Player", cell: r => <span className="zt-lead-rank"><span className="zt-rank" data-rank={r.rank}>{r.rank}</span><Player row={r} season={r.season} /></span> }}
      columns={[
        { key: "yr", label: "Yr", width: "xs", cell: r => <GridValue text={year(r.season)} />, data: r => ({ season: r.season }) },
        { key: "minutes", label: "MIN", width: "xs", cell: r => <GridValue text={formatWhole(r.minutes)} />, data: r => ({ field: "minutes", value: r.minutes ?? undefined }) },
        usageColumn, pointsColumn("rts", "rTS"), pointsColumn("difficulty", "Role"),
        { ...pointsColumn("zts", "zTS"), sort: r => r.zts }, addColumn,
      ]} />}
  </div>;
}

// ---- Player ----------------------------------------------------------------------------------------

function PlayerTab({ summary }: { summary: ZtsSummary }) {
  const { get, set } = useUrlState();
  const chosen = get("player");
  const cleared = chosen === NO_PLAYER;
  const season = summary.seasons.includes(get("playerSeason") ?? "") ? get("playerSeason")! : LATEST;
  const { data, error, loading, retry } = useFeed([cleared ? NO_PLAYER : chosen, season], signal => cleared ? Promise.resolve(null) : getPlayerZts(chosen, season, signal));
  const team = data?.status === "available" ? data.teams[0]?.tricode ?? null : null;
  const ref = summary.references[data?.season ?? season];
  return <div className="zt-player" data-section="player">
    <Panel className="zt-controls" label="Player">
      <div className="zt-control-row zt-player-pick">
        <Select size="md" aria-label="Player season" value={data?.season ?? season}
          onChange={e => set({ playerSeason: e.target.value === LATEST ? null : e.target.value, player: cleared ? NO_PLAYER : data?.player_id ?? chosen })}>
          {[...summary.seasons].reverse().map(s => <option key={s} value={s}>{s}</option>)}</Select>
        <EntityField label="Player" value={cleared ? "" : data?.player_id ?? chosen ?? ""} season={data?.season ?? season} phase="regular_season"
          initialName={cleared ? undefined : data?.player_name} onChange={next => set({ player: next || NO_PLAYER, playerSeason: get("playerSeason") })} />
      </div>
    </Panel>
    {cleared && <GatedNote action={<Button size="lg" variant="secondary" onClick={() => set({ player: null, playerSeason: null })}>Open the default player</Button>}>
      No player chosen. Search for one above, or open the default: the highest zTS add/100 in {LATEST}.</GatedNote>}
    {error && <FeedFailure error={error} retry={retry} what="The player's zTS" />}
    {loading && <FeedSkeleton label="Loading the player's zTS" />}
    {data && <>
      <div className="zt-hero-card" data-player={data.player_id}>
        <PlayerAvatar playerId={data.player_id} name={data.player_name} team={team} size="lg" era={seasonEra(data.season, team)} className="zt-avatar" />
        <span className="zt-hero-text">
          <a className="zt-hero-name" href={`/players/${data.player_id}?season=${data.season}`}>{data.player_name}</a>
          <span className="zt-hero-sub">{team && <TeamLogo team={team} season={data.season} size={16} />}{team ?? ""}{team ? " · " : ""}{data.season} regular season</span>
        </span>
      </div>
      {data.selection_rule && <p className="zt-note">{data.selection_rule}</p>}
      {data.status === "unknown" && <GatedNote>{data.reason}</GatedNote>}
      {data.status === "available" && <PlayerBody data={data} leagueTypes={ref?.types ?? []} />}
      {data.history.length > 0 && <>
        <h3 className="zt-subhead">Playtype difficulty by season</h3>
        <StatsGrid label="Season history" name="zts-history" density="compact" height="auto" leadWidth="sm" rows={data.history} rowKey={r => r.season} rowData={r => ({ season: r.season })}
          lead={{ label: "Season", cell: r => <span className="zt-season-cell">{r.season}</span> }}
          columns={[
            { key: "team", label: "Team", width: "sm", cell: r => <span className="zt-team-cell">{r.teams.map(t => t.tricode ? <TeamLogo key={t.team_id} team={t.tricode} season={r.season} size={16} /> : null)}{r.teams.map(t => t.tricode ?? t.team_id).join(" · ")}</span> },
            { key: "minutes", label: "MIN", width: "xs", cell: r => <GridValue text={formatWhole(r.minutes)} /> },
            usageColumn, pointsColumn("rts", "rTS"), pointsColumn("difficulty", "Role"), pointsColumn("zts", "zTS"),
            { key: "status", label: "Status", width: "md", cell: r => <GridValue text={r.zts_status === "known" ? "Served" : STATUS_LABELS[r.zts_status]} muted={r.zts_status !== "known"} />, data: r => ({ status: r.zts_status }) },
          ]} />
      </>}
    </>}
  </div>;
}

function PlayerBody({ data, leagueTypes }: { data: PlayerZts; leagueTypes: readonly { play_type: string; label: string; ts: number }[] }) {
  const types = new Map(data.play_types.map(t => [t.play_type, t]));
  const order = [...leagueTypes].sort((a, b) => a.ts - b.ts);
  const max = Math.max(0.05, ...data.play_types.flatMap(t => [t.share, t.league_share]));
  const step = Math.max(5, Math.ceil(max * 100 / 4 / 5) * 5);
  const tiles: { key: string; label: string; text: string; value: number | null; tone?: "a" | "b"; foot: ReactNode }[] = [
    { key: "scoring_usage", label: "Scoring usage", text: formatNumber(data.scoring_usage), value: data.scoring_usage, foot: `${formatWhole(data.minutes)} minutes` },
    { key: "rts", label: "rTS", text: formatPoints(data.rts), value: data.rts, tone: signTone(data.rts), foot: `${formatWhole(data.tsa)} TSA` },
    { key: "difficulty", label: "Role", text: formatPoints(data.difficulty), value: data.difficulty, tone: signTone(data.difficulty), foot: `Expected TS ${formatTs(data.expected_ts)}` },
    { key: "zts", label: "zTS", text: formatPoints(data.zts), value: data.zts, tone: signTone(data.zts), foot: `zTS add ${formatSigned(data.zts_add)}/100` },
  ];
  return <>
    {data.zts_status !== "known" && <GatedNote>No zTS for {data.season}: {data.reason}</GatedNote>}
    <Panel className="zt-dist" label="Scoring fields">
      <div className="zt-tiles" data-player-tiles="true">
        {tiles.map(t => <div key={t.key} className="zt-well zt-tile" data-field={t.key}>
          <span className="zt-kicker">{t.label}</span><span className="zt-tile-value" data-identity={t.tone} data-value={t.value ?? undefined}>{t.text}</span><span className="zt-tile-foot">{t.foot}</span></div>)}
      </div>
      <p className="zt-panel-note" data-coverage={data.coverage ?? undefined}>Play types cover {formatShare(data.coverage)} of {formatWhole(data.implied_possessions)} possessions.</p>
    </Panel>
    {data.play_types.length > 0 && <Panel title="Playtype mix" className="zt-mix" label={`Playtype mix against the league, ${data.season}`}
      aside={<ul className="zt-legend" aria-label="Series"><li data-series="a">{data.player_name.split(" ").slice(-1)[0]}</li><li data-series="league">League</li></ul>}>
      <ul className="zt-mix-rows" data-types="true">
        {order.map(lt => {
          const t = types.get(lt.play_type);
          return <li key={lt.play_type} className="zt-mix-row" data-type={lt.play_type} role="img"
            aria-label={`${lt.label}, league TS ${formatTs(lt.ts)}: ${data.player_name} ${t ? formatShare(t.share) : "not listed"}${t ? ` at ${formatTs(t.ts)} TS` : ""}, league ${formatShare(t?.league_share)}`}>
            <span className="zt-mix-label">{lt.label}</span><span className="zt-mix-league">{formatTs(lt.ts)}</span>
            <span className="zt-mix-bars" aria-hidden="true">
              <span className="zt-mix-bar" data-series="a" data-value={t?.share}><span className="zt-mix-fill" style={{ "--w": `${t ? Math.min(100, t.share * 100 / (step * 4) * 100) : 0}%` } as CSSProperties} /><span className="zt-mix-num">{t ? (t.share * 100).toFixed(1) : "—"}</span></span>
              <span className="zt-mix-bar" data-series="league" data-value={t?.league_share}><span className="zt-mix-fill" style={{ "--w": `${t ? Math.min(100, t.league_share * 100 / (step * 4) * 100) : 0}%` } as CSSProperties} /><span className="zt-mix-num">{t ? (t.league_share * 100).toFixed(1) : "—"}</span></span>
            </span>
          </li>;
        })}
      </ul>
      <div className="zt-mix-axis" aria-hidden="true">{[0, 1, 2, 3, 4].map(i => <span key={i}>{step * i}%</span>)}</div>
    </Panel>}
    <Panel className="zt-expected" label="Expected TS and Playtype Difficulty">
      <div className="zt-expected-half">
        <h3 className="zt-panel-title">Expected TS</h3>
        <p className="zt-panel-sub">Σ share × league TS</p>
        <div className="zt-wells" data-count="2">
          <div className="zt-well"><span className="zt-well-label">League</span><span className="zt-well-value" data-field="league_ts" data-value={data.league_ts}>{formatTs(data.league_ts)}</span></div>
          <div className="zt-well" data-series="a"><span className="zt-well-label">Expected</span><span className="zt-well-value" data-field="expected_ts" data-value={data.expected_ts ?? undefined}>{formatTs(data.expected_ts, 2)}</span></div>
        </div>
      </div>
      <div className="zt-expected-half">
        <h3 className="zt-panel-title">Playtype Difficulty</h3>
        <p className="zt-panel-sub">League TS − Expected TS</p>
        <div className="zt-wells" data-count="1">
          <div className="zt-well"><span className="zt-well-value zt-well-big" data-field="difficulty" data-value={data.difficulty ?? undefined} data-identity={signTone(data.difficulty)}>{formatPoints(data.difficulty)}</span>
            <span className="zt-well-label">{known(data.difficulty) && data.difficulty > 0 ? "Harder role" : known(data.difficulty) && data.difficulty < 0 ? "Easier role" : "Average role"}</span></div>
        </div>
      </div>
    </Panel>
  </>;
}

// ---- Page --------------------------------------------------------------------------------------

function Hero({ summary }: { summary: ZtsSummary | null }) {
  return <PageHeader className="zt-hero"
    title={<><span className="zt-hero-kicker" aria-hidden="true"><span className="zt-hero-pill">Research metric</span>{summary && <span>Registered {summary.registration.registered_on}</span>}</span>
      <span className="zt-hero-title"><span className="zt-hero-chip">zTS</span>: Scoring Efficiency and Playtype Difficulty</span></>}
    subtitle="Relative true shooting adjusted for the difficulty of a player's play-type mix, and what that buys." />;
}

export function ZtsResearch() {
  const { get, set } = useUrlState();
  const tab = (TABS.find(t => t.value === get("tab"))?.value ?? "about") as Tab;
  const { data, error, loading, retry } = useFeed([], signal => getZts(signal));
  return <PageShell template="research" className="zt-shell">
    <div className="rs-column zt-page" data-tab={tab}>
      <Hero summary={data ?? null} />
      {error && <FeedFailure error={error} retry={retry} what="zTS" />}
      {loading && <FeedSkeleton label="Loading zTS" />}
      {data && tab === "about" && <About summary={data} />}
      {data && tab === "top" && <TopSeasons summary={data} />}
      {data && tab === "player" && <PlayerTab summary={data} />}
    </div>
    <nav className="zt-dock" aria-label="zTS views">
      <Segmented label="zTS view" size="lg" value={tab} onChange={next => { set({ tab: next === "about" ? null : next }); window.scrollTo({ top: 0 }); }} options={TABS} />
    </nav>
  </PageShell>;
}

