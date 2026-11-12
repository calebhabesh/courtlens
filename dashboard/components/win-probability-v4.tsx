"use client";

import Link from "next/link";
import { Suspense, type CSSProperties } from "react";
import { awayFirst, easternToday, formatRecord, gameStatus, lineFavourite, liveRead, nearestGameDate, predictionCall, seasonOf, teamCode, validSlate, type LiveGame, type LiveSlateData, type LiveTeam } from "@/lib/live";
import { formatDate } from "@/lib/format-date";
import { band, metric, signed, type HeadToHead, type TrialRead, type WinProbabilityPage, type WorkedExample } from "@/lib/win-probability";
import { DateStrip } from "./live-board";
import { teamColors } from "./live-game";
import { TeamLogo } from "./team-logo";
import { Icon } from "./ui/icon";
import { PredictionBody } from "./live-prediction";
import { ResearchSection } from "./research/research-page";
import { useFeed, useUrlState } from "./stats-feed-ui";
import { GatedNote } from "./ui/gated-note";
import { ButtonSummary } from "./ui/kit";
import { CalibrationChart } from "./win-probability-research";

/**
 * W5: the v4 sections above the evidence. Every number is served: the head-to-head summary the
 * nightly job writes, its calibration, the worked example the rule picked and the do-no-harm check.
 * Before the first scored game, and in the offseason, each section says what it is waiting for.
 */

const vars = (values: Record<`--${string}`, string>) => values as CSSProperties;
const whole = (n: number) => n.toLocaleString("en-US");
const pct = (right: number, games: number) => games ? `${Math.round((right / games) * 100)}%` : "—";
const RESULT_WORDS: Record<string, string> = { better: "better", worse: "worse", inconclusive: "no clear difference" };

// ---- 2. The prediction board: a date strip and one card per game, the call first --------------------------------------

type Board = { day: string; games: LiveGame[]; calendar: string[]; today: boolean; fallback: boolean };

async function loadBoard(wanted: string | null, signal: AbortSignal): Promise<Board> {
  const today = easternToday();
  const day = wanted ?? today;
  const first = await liveRead<LiveSlateData>(`?slate_date=${day}`, signal);
  const calendar = first.data?.calendar ?? [];
  const games = first.data?.games ?? [];
  if (games.length || wanted) return { day, games, calendar, today: day === today, fallback: false };
  // No games today: the latest earlier slate, so its calls and results show.
  const earlier = nearestGameDate(calendar.filter(d => d < today), today);
  if (!earlier) return { day, games: [], calendar, today: true, fallback: false };
  const read = await liveRead<LiveSlateData>(`?slate_date=${earlier}`, signal);
  return { day: earlier, games: read.data?.games ?? [], calendar, today: false, fallback: true };
}

function TeamSide({ team, season, game, favoured }: { team: LiveTeam; season: string; game: LiveGame; favoured: boolean }) {
  const played = game.status === "in_progress" || game.status === "final";
  return <span className="wpc-team" data-side={team.side} data-favoured={favoured || undefined} data-lost={(game.status === "final" && team.winner === false) || undefined}>
    <TeamLogo team={team.tricode ?? team.canonical_id ?? teamCode(team)} season={season} size={40} />
    <span className="wpc-team-text">
      <strong className="wpc-code">{teamCode(team)}</strong>
      <span className="wpc-sub">{played ? <strong className="wpc-score">{team.score ?? "—"}</strong> : formatRecord(team.record) ?? (team.side === "home" ? "Home" : "Away")}</span>
    </span>
  </span>;
}

export function PredictionCard({ game }: { game: LiveGame }) {
  const [away, home] = awayFirst(game.teams);
  const season = seasonOf(game.slate_date);
  const p = game.prediction;
  const sealed = p?.status === "sealed" && p.home_win != null ? p.home_win : null;
  const call = predictionCall(game);
  const fav = sealed == null ? null : sealed >= 0.5 ? home : away;
  const line = game.status === "scheduled" ? lineFavourite(game.odds, game.teams) : null;
  const href = `/live/games/${game.source_id}?date=${game.slate_date}${game.status === "scheduled" ? "" : "&tab=pregame"}`;
  return <Link className="wpc" href={href} data-status={game.status} data-game={game.source_id} data-home-win={sealed ?? undefined}
    aria-label={`${away.name} at ${home.name}, ${gameStatus(game)}${fav && sealed != null ? `. CourtLens: ${teamCode(fav)} ${Math.round(Math.max(sealed, 1 - sealed) * 100)}% to win` : ""}. Open the game and why.`}
    style={teamColors(game.teams, season)}>
    <span className="wpc-head">
      <span className="wpc-status">{game.status === "in_progress" && <span className="live-dot" aria-hidden="true" />}{gameStatus(game)}</span>
      <span className="wpc-why">Why{fav ? ` ${teamCode(fav)}` : ""}<Icon name="right" size={14} /></span>
    </span>
    <span className="wpc-teams">
      <TeamSide team={away} season={season} game={game} favoured={fav === away} />
      {sealed != null ? <span className="wpc-pcts" aria-hidden="true">
        <span data-favoured={fav === away || undefined}>{Math.round((1 - sealed) * 100)}%</span>
        <span data-favoured={fav === home || undefined}>{Math.round(sealed * 100)}%</span>
      </span> : <span className="wpc-pcts wpc-none" aria-hidden="true">—</span>}
      <TeamSide team={home} season={season} game={game} favoured={fav === home} />
    </span>
    {sealed != null && <span className="wpc-bar" aria-hidden="true" style={vars({ "--wpc-away": `${(1 - sealed) * 100}%` })}><span data-side="away" /><span data-side="home" /></span>}
    <span className="wpc-foot">
      {call && call.kind !== "none" && fav ? <span className="wpc-call" data-call={call.kind} data-right={call.right == null ? undefined : String(call.right)} title={call.title}>
        {{ favours: "CourtLens favors", toss_up: "Toss-up, leaning", pregame: "Pregame call:", called: "Called" }[call.kind]} <strong>{teamCode(fav)}</strong>
        {call.kind === "called" && call.right != null && <span className="wpc-mark"><Icon name={call.right ? "check" : "close"} size={14} />{call.right ? "right" : "wrong"}</span>}
      </span> : <span className="wpc-call" data-call="none">{p ? "No prediction was sealed for this game" : "Before CourtLens sealed predictions"}</span>}
      {line && <span className="wpc-line" title={`The betting line (${game.odds?.provider ?? "sportsbook"})`}>Line: {line === "even" ? "even" : `${teamCode(line.team)} by ${line.points}`}</span>}
      {game.status === "scheduled" && (away.out || home.out) ? <span className="wpc-out">{[away, home].filter(t => t.out).map(t => `${teamCode(t)} ${t.out} out`).join(" · ")}</span> : null}
    </span>
  </Link>;
}

function BoardInner() {
  const { get } = useUrlState();
  const wanted = get("day");
  const day = wanted && validSlate(wanted) ? wanted : null;
  const { data, stale, error, loading } = useFeed([day], signal => loadBoard(day, signal));
  const board = data ?? stale;
  const href = (d: string) => `/research/win-probability?day=${d}`;
  const label = !board ? "Tonight's games" : board.today ? "Tonight's games" : formatDate(board.day);
  return <ResearchSection id="slate" icon="activity" title={label} aside={<Link href={board ? `/live/${board.day}` : "/live"} className="wp-link">Open on Live</Link>}>
    {board && <DateStrip slate={board.day} calendar={board.calendar} href={href} />}
    {loading && !board ? <p className="wp-note" role="status">Loading the games…</p>
      : error ? <GatedNote tone="warning">The games are unavailable right now.</GatedNote>
      : board && board.games.length ? <>
        <p className="wp-note" data-field="slate-day" data-day={board.day}>{board.fallback ? `No games today. The latest slate, ${formatDate(board.day)}: each call and whether it was right.` : board.today ? "The chance CourtLens sealed before tip-off. It does not move during the game; open a game for the live chart and the reasons." : "Each call as sealed before tip-off, and whether it was right."}</p>
        <ol className="wpc-grid" aria-label="Predictions">{board.games.map(game => <li key={game.source_id}><PredictionCard game={game} /></li>)}</ol>
      </> : <p className="wp-lead" data-field="slate-empty">{day ? "No games on this day." : "No games are scheduled. The first slate of the next season appears here with CourtLens's call for each game."}</p>}
  </ResearchSection>;
}

export function PredictionBoard() {
  return <Suspense fallback={null}><BoardInner /></Suspense>;
}

// ---- 3. Track record ------------------------------------------------------------------------------------------------------

export function TrackRecord({ data }: { data: WinProbabilityPage }) {
  const h = data.head_to_head;
  const cal = data.head_to_head_calibration;
  const rec = h?.record_of_calls;
  return <ResearchSection id="track-record" icon="target" title="Track record">
    {!h || !rec || rec.games === 0 ? <p className="wp-lead" data-field="record-empty">No game has been graded yet. Each night&apos;s games are graded the next morning at 9:00 ET, and the count starts here.</p> : <>
      <p className="wp-lead" data-field="record" data-games={rec.games} data-market={rec.market_informed} data-original={rec.original}>
        On {whole(rec.games)} {rec.games === 1 ? "game" : "games"} since the freeze, CourtLens picked the winner {whole(rec.market_informed)} times ({pct(rec.market_informed, rec.games)}).
      </p>
      <dl className="wp-record" data-field="record-table">
        <div><dt>Market-informed (serving)</dt><dd>{whole(rec.market_informed)} of {whole(rec.games)}</dd></div>
        <div><dt>Original</dt><dd>{whole(rec.original)} of {whole(rec.games)}</dd></div>
        <div><dt>The betting line</dt><dd>{rec.line.games ? `${whole(rec.line.right)} of ${whole(rec.line.games)}` : "—"}</dd></div>
      </dl>
      <p className="wp-note">An even call counts as half. {rec.toss_ups ? `${whole(rec.toss_ups)} ${rec.toss_ups === 1 ? "game was a toss-up" : "games were toss-ups"} (45% to 55%), where a right or wrong call says little.` : ""}</p>
    </>}
    {cal && <>
      <CalibrationChart label="Calibration on the graded games" series={[{ name: "Market-informed", key: "courtlens", curve: cal.market_informed.curve }, { name: "Original", key: "baseline", curve: cal.original.curve }]} />
      <p className="wp-note" data-field="calibration">Picking winners rewards confidence; calibration is fairer. When CourtLens says 70%, the team should win about 70% of the time. Calibration error {metric(cal.market_informed.calibration_error, 3)} (Market-informed) and {metric(cal.original.calibration_error, 3)} (Original) on {whole(cal.games)} games.</p>
    </>}
  </ResearchSection>;
}

// ---- 4. How the model thinks ------------------------------------------------------------------------------------------------

function exampleGame(example: WorkedExample): LiveGame | null {
  const { game, why } = example;
  if (!game || !why) return null;
  const team = (side: "home" | "away"): LiveTeam => ({
    source_id: side === "home" ? why.home : why.away, canonical_id: null, tricode: side === "home" ? game.home : game.away, identity_status: "mapped",
    name: side === "home" ? game.home : game.away, side, score: side === "home" ? game.home_score : game.away_score,
  });
  return { source_id: game.game_id, canonical_id: null, identity_status: "mapped", slate_date: game.date, event_time: why.tip_off, status: "final", period: null, clock: null, teams: [team("away"), team("home")] };
}

export function HowItThinks({ data }: { data: WinProbabilityPage }) {
  const w = data.head_to_head?.model.w;
  const example = data.worked_example;
  const game = example ? exampleGame(example) : null;
  return <ResearchSection id="how" icon="layers" title="How the model thinks">
    <ol className="wp-steps" data-field="steps">
      <li><span className="wp-step-n" aria-hidden="true">1</span><strong>Its own read</strong><span>Who is available and how good they are, recent form, home court, rest and travel add up to a predicted margin.</span></li>
      <li data-field="weight" data-w={w}><span className="wp-step-n" aria-hidden="true">2</span><strong>The betting line{w != null ? `, weighted ${Math.round(w * 100)}%` : ""}</strong><span>{w != null && w >= 0.995 ? "The fitted weight is 100%: when there is a line, the pregame margin follows it, and the own read is the fallback when there is none." : "It moves from its own read toward the line by a fitted weight."}</span></li>
      <li><span className="wp-step-n" aria-hidden="true">3</span><strong>During the game</strong><span>The score, time left and possession update the chance on every play, starting from that pregame number.</span></li>
    </ol>
    <h3 className="wp-subhead">A worked example</h3>
    <p className="wp-note" data-field="example-rule">Chosen by rule, not by taste: {example?.rule.replace(/^./, c => c.toLowerCase()) ?? "—"}</p>
    {example?.why && game ? <div className="wp-example" data-field="example" data-game={game.source_id}>
      <PredictionBody why={example.why} game={game} />
      <Link className="wp-link" href={`/live/games/${game.source_id}?date=${game.slate_date}&tab=pregame`}>Open this game on Live</Link>
    </div> : <p className="wp-lead" data-field="example-empty">No graded game meets the rule yet. The first one becomes the example and stays fixed.</p>}
  </ResearchSection>;
}

// ---- 5. The trial -------------------------------------------------------------------------------------------------------------

function ReadRows({ read }: { read: TrialRead }) {
  return <dl className="wp-record" data-field="trial-read" data-games={read.games}>
    <div data-field="v1" data-value={read.v1.mean} data-low={read.v1.low} data-high={read.v1.high}><dt>V1, pregame margin (squared error, points²)</dt><dd>{signed(read.v1.mean, 2)} <span className="wp-name-sub">{band(read.v1, 2)} · {RESULT_WORDS[read.v1.result] ?? read.v1.result}</span></dd></div>
    <div data-field="v2" data-value={read.v2.mean} data-low={read.v2.low} data-high={read.v2.high}><dt>V2, whole game (log loss)</dt><dd>{signed(read.v2.mean)} <span className="wp-name-sub">{band(read.v2)} · {RESULT_WORDS[read.v2.result] ?? read.v2.result}</span></dd></div>
  </dl>;
}

export function Trial({ data }: { data: WinProbabilityPage }) {
  const h: HeadToHead | null | undefined = data.head_to_head;
  const verdict = h?.reads.find(r => r.kind === "verdict");
  const final = h?.reads.find(r => r.kind === "final");
  const notes = data.protocol_notes ?? [];
  return <ResearchSection id="trial" icon="scale" title="The trial: Original against Market-informed">
    <p className="wp-lead">The Market-informed model uses the betting line, and the line was expected to make its pregame number better. The trial asks whether it also beats the Original over whole games, on games neither model had seen.</p>
    {h ? <>
      <div className="wp-progress" data-field="trial-progress" data-games={h.games} data-at={h.verdict_at_games}>
        <span className="wp-progress-label"><strong>{whole(h.games)}</strong> of {whole(h.verdict_at_games)} games</span>
        <meter className="wp-meter" min={0} max={h.verdict_at_games} value={Math.min(h.games, h.verdict_at_games)} aria-label="Games toward the verdict" />
      </div>
      {verdict ? <><p className="wp-lead" data-field="verdict">The verdict, read at {whole(verdict.games)} games on {formatDate(verdict.read_at.slice(0, 10))}:</p><ReadRows read={verdict} /></>
        : <p className="wp-lead" data-field="too-early"><strong>Too early to call.</strong> The verdict is read once, at {whole(h.verdict_at_games)} games.{h.current ? " The running numbers below can change." : ` Running numbers appear from game ${whole(h.report_from_games)}.`}</p>}
      {!verdict && h.current && <ReadRows read={h.current} />}
      {final && <><p className="wp-note">The season&apos;s final read, {formatDate(final.read_at.slice(0, 10))}:</p><ReadRows read={final} /></>}
      <p className="wp-note" data-field="serving" data-model={h.serving_model.model}>Above zero, the Market-informed model did better. The Live cards use the {h.serving_model.model === "market_informed" ? "Market-informed model" : "Original"}: {h.serving_model.reason}. If a read finds it worse, Live returns to the Original.</p>
    </> : <GatedNote>The trial starts with the first graded game.</GatedNote>}
    {notes.length > 0 && <details className="wp-toggle" id="protocol-notes">
      <ButtonSummary size="sm" variant="ghost" iconAfter="chevron-down">{`Protocol notes (${notes.length})`}</ButtonSummary>
      <ul className="wp-findings" data-field="protocol-notes">{notes.map(n => <li key={`${n.date}-${n.kind}`}><strong>{formatDate(n.date)}.</strong> {n.note}</li>)}</ul>
    </details>}
  </ResearchSection>;
}
