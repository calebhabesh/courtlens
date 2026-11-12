"use client";

import Link from "next/link";
import { easternToday, liveRead, nearestGameDate, type LiveGame, type LiveSlateData, type LiveTeam } from "@/lib/live";
import { formatDate } from "@/lib/format-date";
import { band, metric, signed, type HeadToHead, type TrialRead, type WinProbabilityPage, type WorkedExample } from "@/lib/win-probability";
import { GameCard } from "./live-board";
import { PredictionBody } from "./live-prediction";
import { ResearchSection } from "./research/research-page";
import { useFeed } from "./stats-feed-ui";
import { GatedNote } from "./ui/gated-note";
import { ButtonSummary } from "./ui/kit";
import { CalibrationChart } from "./win-probability-research";

/**
 * W5: the v4 sections above the evidence. Every number is served: the head-to-head summary the
 * nightly job writes, its calibration, the worked example the rule picked and the do-no-harm check.
 * Before the first scored game, and in the offseason, each section says what it is waiting for.
 */

const whole = (n: number) => n.toLocaleString("en-US");
const pct = (right: number, games: number) => games ? `${Math.round((right / games) * 100)}%` : "—";
const RESULT_WORDS: Record<string, string> = { better: "better", worse: "worse", inconclusive: "no clear difference" };

// ---- 2. Latest slate ------------------------------------------------------------------------------------------------------

async function latestSlate(signal: AbortSignal): Promise<{ day: string; games: LiveGame[]; today: boolean } | null> {
  const today = easternToday();
  const first = await liveRead<LiveSlateData>(`?slate_date=${today}`, signal);
  if (first.data?.games.length) return { day: today, games: first.data.games, today: true };
  const earlier = nearestGameDate(first.data?.calendar?.filter(d => d < today), today);
  if (!earlier) return null;
  const read = await liveRead<LiveSlateData>(`?slate_date=${earlier}`, signal);
  return read.data?.games.length ? { day: earlier, games: read.data.games, today: false } : null;
}

export function LatestSlate() {
  const { data, error, loading } = useFeed([], signal => latestSlate(signal));
  const title = data?.today ? "Tonight's games" : "The latest slate";
  return <ResearchSection id="slate" icon="activity" title={title} aside={<Link href="/live" className="wp-link">All games on Live</Link>}>
    {loading ? <p className="wp-note" role="status">Loading the slate…</p>
      : error ? <GatedNote tone="warning">The slate is unavailable right now.</GatedNote>
      : !data ? <p className="wp-lead" data-field="slate-empty">No games are scheduled. The first slate of the next season appears here with CourtLens&apos;s call for each game.</p>
      : <>
        <p className="wp-note" data-field="slate-day" data-day={data.day}>{data.today ? "Each card shows the call CourtLens sealed before tip-off. It does not move during the game." : `${formatDate(data.day)}: each card shows the sealed call and whether it was right.`}</p>
        <ol className="live-grid wp-slate">{data.games.map((game, i) => <li key={game.source_id}><GameCard game={game} index={i} href={`/live/games/${game.source_id}?date=${game.slate_date}`} /></li>)}</ol>
      </>}
  </ResearchSection>;
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
      <li><strong>Its own read.</strong> Before tip-off CourtLens adds up who is available and how good they are, recent form, home court, rest and travel into a predicted margin.</li>
      <li data-field="weight" data-w={w}><strong>The market adjustment.</strong> It then moves from its own read toward the betting line by a fitted weight{w != null ? <>: <strong>{Math.round(w * 100)}%</strong>{w >= 0.995 ? ". With a line, the pregame margin is the line; the own read decides only when there is none" : ""}</> : ""}.</li>
      <li><strong>During the game.</strong> The score, time left and possession update the chance on every play, starting from that pregame number.</li>
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
