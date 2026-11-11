"use client";

import { Fragment, Suspense, useMemo, useState, type CSSProperties } from "react";
import { Glossary, MethodBlock, ResearchCard, ResearchCards, ResearchDisclosure, ResearchIntro, ResearchSection, type GlossaryGroup } from "./research/research-page";
import { GridPlayer, GridSearch, GridValue, StatsGrid, type GridColumn } from "./research/stats-grid";
import { usePhone } from "./points-forecasts-research";
import { FeedFailure, FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { TeamLogo } from "./team-logo";
import { GatedNote } from "./ui/gated-note";
import { ButtonSummary, Segmented, Select } from "./ui/kit";
import { PageShell } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { formatDate } from "@/lib/format-date";
import { seasonEra } from "@/lib/portrait-source";
import {
  band, clearPhases, DRIFT_COPY, gapTone, listOf, metric, PHASE_LABELS, PHASE_ORDER, signed, sortWpa, verdictOf, WPA_DEFAULT_SORT, wpaRows,
  type CurvePoint, type Interval, type RecentGame, type ScoreGroup, type WinProbabilityAdded, type WinProbabilityPage, type WpaRow, type WpaSort, type WpaSortKey,
} from "@/lib/win-probability";
import { getWinProbabilityAdded, getWinProbabilityPage } from "@/lib/workbench-api";

/**
 * Research → Win Probability (R15b model, designed in F03 / RD14). Presentation only: every number is the frozen card's, the nightly
 * scorecard's or the WPA table's as served, with exact values on `data-*` for the real-data check. Green and red appear only on a gap
 * against ESPN whose 95% interval excludes zero; everything else is neutral, and pass and fail are words.
 */

const vars = (props: Record<string, string>) => props as CSSProperties;
const whole = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString("en-US");
const PHASE_PROSE: Record<string, string> = {
  overall: "all game states", first_half: "the first half", third_quarter: "the third quarter",
  fourth_early: "the fourth quarter before the last two minutes", last_two: "the last two minutes", overtime: "overtime",
};
const lower = (phase: string) => PHASE_PROSE[phase] ?? phase;

// ---- Hero ---------------------------------------------------------------------------------------------------------------

function Frame({ meta, children }: { meta: string[] | null; children: React.ReactNode }) {
  return <PageShell template="research">
    <div className="rs-column wp-page">
      <PageHeader className="sq-hero research-hero" icon="activity" title="Win Probability" subtitle="Every game's live win chance, tested against ESPN's on games played after the model was frozen." />
      <ResearchIntro tagline={meta ? <span data-field="hero-meta">{meta.map((item, i) => <Fragment key={item}>{i > 0 ? " · " : ""}<span className="wp-meta-item">{item}</span></Fragment>)}</span> : null}
        links={[{ label: "Live games", href: "/live", icon: "activity" }, { label: "How CourtLens tests models", href: "/methodology", icon: "book" }]} />
      {children}
    </div>
  </PageShell>;
}

// ---- A gap to scale: both log losses from zero and the gap with its interval on one axis (RD12) -------------------------------

function GapStrip({ courtlens, espn, gap }: { courtlens: number; espn: number; gap: Interval }) {
  const right = Math.ceil(Math.max(courtlens, espn, gap.high) * 10) / 10;
  const left = Math.min(0, gap.low);
  const at = (value: number) => `${((value - left) / (right - left)) * 100}%`;
  const ticks = [0, right / 2, right];
  const tone = gapTone(gap);
  const tiny = (gap.high - gap.low) / (right - left) < 0.03;
  const rows = [{ key: "courtlens", name: "CourtLens", value: courtlens }, { key: "espn", name: "ESPN Analytics", value: espn }];
  return <figure className="wp-figure" data-chart="gap" data-left={left} data-right={right}>
    <figcaption className="wp-figure-title">Log loss on the same game states, and the gap with its 95% interval</figcaption>
    <div className="wp-strip-axis" aria-hidden="true"><span /><span className="wp-strip-scale">{ticks.map((t, i) => <span key={t} style={vars({ "--wp-at": at(t) })} data-edge={i === ticks.length - 1 ? "end" : undefined}>{t.toFixed(2)}</span>)}</span><span /></div>
    <ul className="wp-strip">
      {rows.map(r => <li key={r.key} className="wp-strip-row" data-row={r.key} data-value={r.value}>
        <span className="wp-strip-label"><span className="wp-name">{r.name}</span></span>
        <span className="wp-track" aria-hidden="true"><span className="wp-track-zero" style={vars({ "--wp-at": at(0) })} /><span className="wp-track-bar" data-series={r.key} style={vars({ "--wp-low": at(0), "--wp-high": at(r.value) })} /></span>
        <span className="wp-strip-value"><strong>{metric(r.value)}</strong></span>
      </li>)}
      <li className="wp-strip-row" data-row="gap" data-value={gap.mean} data-low={gap.low} data-high={gap.high} data-tone={tone ?? ""}>
        <span className="wp-strip-label"><span className="wp-name">Gap</span><span className="wp-name-sub">ESPN minus CourtLens; above zero, CourtLens did better</span></span>
        <span className="wp-track" aria-hidden="true" data-tone={tone}><span className="wp-track-zero" style={vars({ "--wp-at": at(0) })} /><span className="wp-track-span" style={vars({ "--wp-low": at(gap.low), "--wp-high": at(gap.high) })} /><span className="wp-track-dot" style={vars({ "--wp-at": at(gap.mean) })} /></span>
        <span className="wp-strip-value"><strong data-tone={tone}>{signed(gap.mean)}</strong><small>{band(gap)}</small></span>
      </li>
    </ul>
    <ul className="wp-key">
      <li><span className="wp-key-mark" data-mark="courtlens" aria-hidden="true" />CourtLens</li>
      <li><span className="wp-key-mark" data-mark="espn" aria-hidden="true" />ESPN Analytics</li>
      <li><span className="wp-key-mark" data-mark="gap" aria-hidden="true" />Gap, with its 95% interval{tone ? "" : ", which includes zero"}</li>
    </ul>
    {tiny && <p className="wp-note wp-figure-note" data-field="gap-scale-note">The gap is drawn to the same scale as the log losses; its whole interval spans {(gap.high - gap.low).toFixed(4)}.</p>}
  </figure>;
}

// ---- Calibration chart (RD13: 12 px axes, centred key; points on hover) -------------------------------------------------------

const pct = (value: number) => `${value * 100}%`;
const pathOf = (curve: CurvePoint[]) => curve.map(p => `${(p.predicted * 100).toFixed(2)},${(100 - p.observed * 100).toFixed(2)}`).join(" L ");

/** Predicted win chance against how often that side won: measured bins only, nothing drawn past them. The plot is square, with HTML axes so the labels stay 12 px at every width. */
export function CalibrationChart({ label, series }: { label: string; series: { name: string; key: string; curve: CurvePoint[] }[] }) {
  if (!series.some(s => s.curve.length)) return <p className="wp-note" data-field="calibration-empty">No game states to draw yet.</p>;
  const ticks = [0, .25, .5, .75, 1];
  return <figure className="wp-figure wp-calibration" aria-label={label} data-chart="calibration">
    <div className="wp-cal">
      <span className="wp-cal-ytitle" aria-hidden="true">How often that team won</span>
      <span className="wp-cal-y" aria-hidden="true">{ticks.map(t => <span key={t} style={vars({ "--wp-at": pct(1 - t) })}>{t * 100}%</span>)}</span>
      <div className="wp-cal-plot">
        <svg className="wp-plot" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`${label}: predicted win chance against how often that team won`}>
          {ticks.map(t => <line key={t} className="wp-plot-grid" x1="0" x2="100" y1={100 - t * 100} y2={100 - t * 100} vectorEffect="non-scaling-stroke" />)}
          <line className="wp-plot-ideal" x1="0" y1="100" x2="100" y2="0" vectorEffect="non-scaling-stroke" />
          {series.map(s => s.curve.length > 0 && <g key={s.key} data-series={s.key} data-points={s.curve.length}>
            <path className="wp-plot-line" data-series={s.key} d={`M ${pathOf(s.curve)}`} vectorEffect="non-scaling-stroke" />
            {s.curve.map(p => <circle key={p.predicted} className="wp-plot-dot" data-series={s.key} cx={p.predicted * 100} cy={100 - p.observed * 100} r="1.6" data-predicted={p.predicted} data-observed={p.observed}>
              <title>{`${s.name}: predicted ${(p.predicted * 100).toFixed(1)}%, won ${(p.observed * 100).toFixed(1)}%, ${(p.share * 100).toFixed(1)}% of states`}</title>
            </circle>)}
          </g>)}
        </svg>
      </div>
      <span className="wp-cal-x" aria-hidden="true">{ticks.map(t => <span key={t} style={vars({ "--wp-at": pct(t) })}>{t * 100}%</span>)}</span>
      <span className="wp-cal-xtitle" aria-hidden="true">Predicted win chance</span>
    </div>
    <ul className="wp-key">
      {series.map(s => <li key={s.key}><span className="wp-key-mark" data-mark={s.key} aria-hidden="true" />{s.name}</li>)}
      <li><span className="wp-key-mark" data-mark="ideal" aria-hidden="true" />Predicted equals observed</li>
    </ul>
  </figure>;
}

// ---- 1. The answer ------------------------------------------------------------------------------------------------------

function Answer({ data }: { data: WinProbabilityPage }) {
  const p = data.scorecard?.prospective;
  const same = p?.same_events;
  const gap = same?.log_loss_gap ?? null;
  const verdict = verdictOf(gap);
  const test = data.card.espn.comparison.overall?.log_loss.espn_minus_courtlens;
  const testVerdict = verdictOf(test);
  return <ResearchSection id="answer" icon="target" title="Does CourtLens beat ESPN's win probability?">
    <div className="wp-answer" data-field="answer" data-verdict={verdict ?? "none"}>
      {!p?.games || !same ? <p className="wp-headline" data-field="headline">Not known yet: no game played since the freeze has been scored.</p>
        : !gap ? <p className="wp-headline" data-field="headline">Not known yet: {whole(p.games)} games since the freeze, too few for an interval.</p>
          : <p className="wp-headline" data-field="headline" data-value={gap.mean} data-low={gap.low} data-high={gap.high} data-games={gap.games}>
            {verdict === "tied" ? "Not so far. " : verdict === "better" ? "So far, yes. " : "Not so far: ESPN is ahead. "}
            On the <strong>{whole(p.games)}</strong> games played since the freeze, CourtLens&apos;s log loss was <strong>{metric(Math.abs(gap.mean))}</strong> {gap.mean <= 0 ? "higher" : "lower"} than ESPN&apos;s
            (95% interval <strong>{band(gap)}</strong>){verdict === "tied" ? <>: the two can&apos;t be told apart.</> : "."}
          </p>}
      {test && <p className="wp-lead" data-field="answer-test" data-value={test.mean} data-low={test.low} data-high={test.high}>
        On the final test, {whole(test.games)} games of {data.card.test_seasons.join(" and ")}, the gap was {signed(test.mean)} ({band(test)}){testVerdict === "tied" ? ", which can't be told from zero either" : ""}. ESPN&apos;s numbers there were read after the games, which is why the 2026-27 season is the real test.
      </p>}
      {p?.games && gap ? <p className="wp-note" data-field="answer-sample">{whole(p.games)} games is an early sample; the interval narrows as the season is scored each night.</p> : null}
    </div>
    {same && gap && <GapStrip courtlens={same.courtlens_log_loss} espn={same.espn_log_loss} gap={gap} />}
  </ResearchSection>;
}

// ---- 2. The live scorecard -----------------------------------------------------------------------------------------------

interface ScoreRow { key: "prospective" | "pre_freeze_replay"; group: ScoreGroup }

function ScoreGrid({ rows, label, name }: { rows: ScoreRow[]; label: string; name: string }) {
  const phone = usePhone();
  const [view, setView] = useState<"log" | "other">("log");
  const showLog = !phone || view === "log", showOther = !phone || view === "other";
  const s = (r: ScoreRow) => r.group.same_events;
  const replay = (r: ScoreRow) => r.key === "pre_freeze_replay";
  const num = (key: string, label: string, group: string, value: (r: ScoreRow) => number | null | undefined, digits = 4): GridColumn<ScoreRow> => ({
    key, label, group, width: "sm", data: r => ({ field: key, value: value(r) ?? undefined }), cell: r => <GridValue text={metric(value(r), digits)} muted={replay(r)} />,
  });
  const columns: GridColumn<ScoreRow>[] = [
    ...(showLog ? [
      { key: "gap", label: "Gap, 95%", title: "ESPN's log loss minus CourtLens's on the same states. Above zero, CourtLens did better", group: "Log loss", width: "md" as const,
        data: (r: ScoreRow) => { const g = s(r)?.log_loss_gap; return g ? { field: "gap", value: g.mean, low: g.low, high: g.high } : { field: "gap", value: "" }; },
        cell: (r: ScoreRow) => { const g = s(r)?.log_loss_gap; return g ? <GridValue text={signed(g.mean)} sub={band(g)} tone={replay(r) ? undefined : gapTone(g)} muted={replay(r)} /> : <GridValue text={r.group.games ? "Under 20 games" : "—"} muted />; } },
      num("courtlens_log_loss", "CourtLens", "Log loss", r => s(r)?.courtlens_log_loss),
      num("espn_log_loss", "ESPN", "Log loss", r => s(r)?.espn_log_loss),
    ] : []),
    ...(showOther ? [
      num("courtlens_brier", "CourtLens", "Brier", r => s(r)?.courtlens_brier),
      num("espn_brier", "ESPN", "Brier", r => s(r)?.espn_brier),
      num("courtlens_calibration_error", "CourtLens", "Calibration error", r => s(r)?.courtlens_calibration_error),
      num("espn_calibration_error", "ESPN", "Calibration error", r => s(r)?.espn_calibration_error),
    ] : []),
  ];
  return <>
    {phone && <Segmented size="sm" label={`${label} columns`} value={view} onChange={setView} options={[{ value: "log", label: "Log loss" }, { value: "other", label: "Brier, calibration" }]} />}
    <StatsGrid<ScoreRow> label={label} name={name} density="compact" height="auto" leadWidth="md" className={phone ? "wp-grid wp-phone" : "wp-grid"} rows={rows} rowKey={r => r.key}
      rowData={r => ({ group: r.key, games: r.group.games })}
      lead={{ label: "Games", cell: r => <><span className="wp-name">{replay(r) ? "Replayed" : "Since the freeze"}</span><span className="wp-name-sub">{whole(r.group.games)} games{r.group.first_date ? `, ${formatDate(r.group.first_date, "compact")} to ${formatDate(r.group.last_date, "compact")}` : ""}</span></> }}
      columns={columns} />
  </>;
}

function LedgerGrid({ games }: { games: RecentGame[] }) {
  const phone = usePhone();
  const season = "2026-27";
  const columns: GridColumn<RecentGame>[] = [
    ...(phone ? [] : [{ key: "final", label: "Final", width: "sm" as const, data: (g: RecentGame) => ({ field: "final", away: g.away_score, home: g.home_score }), cell: (g: RecentGame) => <GridValue text={`${g.away_score}–${g.home_score}`} /> }]),
    { key: "courtlens", label: "CourtLens", group: "Log loss", width: "sm", data: g => ({ field: "courtlens", value: g.espn?.courtlens_log_loss ?? undefined }), cell: g => <GridValue text={metric(g.espn?.courtlens_log_loss)} /> },
    { key: "espn", label: "ESPN", group: "Log loss", width: "sm", data: g => ({ field: "espn", value: g.espn?.log_loss ?? undefined }), cell: g => <GridValue text={metric(g.espn?.log_loss)} /> },
    ...(phone ? [] : [{ key: "counted", label: "Counted as", width: "md" as const, data: (g: RecentGame) => ({ field: "counted", value: g.prospective ? "prospective" : "replay" }), cell: (g: RecentGame) => <GridValue text={g.prospective ? "Since the freeze" : "Replay"} muted={!g.prospective} /> }]),
  ];
  return <StatsGrid<RecentGame> label="Scored games" name="ledger" density="compact" height="auto" leadWidth="lg" className={phone ? "wp-grid wp-ledger wp-phone" : "wp-grid wp-ledger"} rows={games} rowKey={g => g.game_id}
    rowData={g => ({ game: g.game_id, prospective: g.prospective })}
    lead={{ label: "Game", cell: g => <>
      <span className="wp-matchup" data-field="matchup"><span className="wp-team"><TeamLogo team={g.away} season={season} size={16} />{g.away}</span><span className="wp-at">at</span><span className="wp-team"><TeamLogo team={g.home} season={season} size={16} />{g.home}</span></span>
      <span className="wp-name-sub">{formatDate(g.date)}{phone ? ` · ${g.away_score}–${g.home_score}${g.prospective ? "" : " · replay"}` : ""}</span>
    </> }}
    columns={columns} />;
}

function Scorecard({ data }: { data: WinProbabilityPage }) {
  const sc = data.scorecard;
  if (!sc) return <ResearchSection id="scorecard" icon="gauge" title="Scored every night, 2026-27"><GatedNote>No games have been scored yet.</GatedNote></ResearchSection>;
  const drift = sc.drift.latest;
  const copy = DRIFT_COPY[drift?.status ?? "insufficient"];
  const curves = sc.prospective.games ? sc.prospective : sc.pre_freeze_replay;
  const replay = sc.pre_freeze_replay;
  return <ResearchSection id="scorecard" icon="gauge" title="Scored every night, 2026-27">
    <p className="wp-lead">After each night&apos;s games, CourtLens and ESPN are scored on the same game states. Only games that tipped off after the freeze, with inputs sealed before tip-off, count. Lower log loss, Brier and calibration error are better.</p>
    <ScoreGrid rows={[{ key: "prospective", group: sc.prospective }]} label="Games since the freeze" name="scorecard" />
    <p className="wp-lead" data-field="drift-line" data-status={drift?.status ?? "insufficient"} data-value={drift?.calibration_error ?? ""} data-low={drift?.interval?.low ?? ""} data-high={drift?.interval?.high ?? ""}>
      <strong>Drift:</strong> {drift && drift.status !== "insufficient" && drift.interval
        ? <>the last 30 days&apos; calibration error is {metric(drift.calibration_error)} on {whole(drift.games)} games, {drift.status === "within" ? "inside" : drift.status === "above" ? "above" : "below"} the test seasons&apos; 95% range for a window that size ({metric(drift.interval.low)} to {metric(drift.interval.high)}){sc.drift.basis === "prospective" ? "" : ", from replayed games, not prospective ones"}.</>
        : <>{copy.label.toLowerCase()} (at least {drift?.minimum_games ?? 25} games are needed).</>}
    </p>
    <CalibrationChart label={`Calibration on ${whole(curves.games)} 2026-27 games`} series={[{ name: "CourtLens", key: "courtlens", curve: curves.curve_courtlens ?? [] }, { name: "ESPN Analytics", key: "espn", curve: curves.curve_espn ?? [] }]} />
    {replay.games > 0 && <>
      <p className="wp-note" data-field="replay-line" data-games={replay.games}>A further {whole(replay.games)} games from before the freeze were replayed with hindsight on who played. They test the nightly pipeline, not the model, and are never coloured.</p>
      <details className="wp-toggle" id="replay">
        <ButtonSummary size="sm" variant="ghost" iconAfter="chevron-down">Show the replayed games&apos; scores</ButtonSummary>
        <div className="wp-toggle-body"><ScoreGrid rows={[{ key: "pre_freeze_replay", group: replay }]} label="Replayed games" name="replay" /></div>
      </details>
    </>}
    {sc.recent_games.length > 0 && <details className="wp-toggle" id="ledger">
      <ButtonSummary size="sm" variant="ghost" iconAfter="chevron-down">{`Show the ${whole(sc.recent_games.length)} most recent scored games`}</ButtonSummary>
      <div className="wp-toggle-body">
        <p className="wp-note">Each game&apos;s log loss over its scored states. One game says little: a blowout is easy for both models.</p>
        <LedgerGrid games={sc.recent_games} />
      </div>
    </details>}
  </ResearchSection>;
}

// ---- 3. The final test ---------------------------------------------------------------------------------------------------

interface TestRow { key: "courtlens" | "espn" | "gap" }

function FinalTest({ data }: { data: WinProbabilityPage }) {
  const card = data.card;
  const phases = PHASE_ORDER.filter(name => card.espn.comparison[name] && card.phases[name]);
  const [phase, setPhase] = useState(phases[0] ?? "overall");
  const phone = usePhone();
  const cmp = card.espn.comparison[phase];
  const block = card.phases[phase];
  const clear = clearPhases(card);
  const rows: TestRow[] = [{ key: "courtlens" }, { key: "espn" }, { key: "gap" }];
  const value = (r: TestRow, measure: "log_loss" | "brier") => r.key === "courtlens" ? cmp[measure].courtlens : r.key === "espn" ? cmp[measure].espn : cmp[measure].espn_minus_courtlens;
  const columns: GridColumn<TestRow>[] = [
    { key: "log_loss", label: "Log loss", group: "95% interval below", width: "md", data: r => { const v = value(r, "log_loss"); return { field: "log_loss", value: v.mean, low: v.low, high: v.high }; },
      cell: r => { const v = value(r, "log_loss"); return <GridValue text={r.key === "gap" ? signed(v.mean) : metric(v.mean)} sub={r.key === "gap" ? band(v) : `${metric(v.low)} to ${metric(v.high)}`} tone={r.key === "gap" ? gapTone(v) : undefined} />; } },
    { key: "brier", label: "Brier", group: "95% interval below", width: "md", data: r => { const v = value(r, "brier"); return { field: "brier", value: v.mean, low: v.low, high: v.high }; },
      cell: r => { const v = value(r, "brier"); return <GridValue text={r.key === "gap" ? signed(v.mean) : metric(v.mean)} sub={r.key === "gap" ? band(v) : `${metric(v.low)} to ${metric(v.high)}`} tone={r.key === "gap" ? gapTone(v) : undefined} />; } },
    ...(phone ? [] : [{ key: "ece", label: "Calibration error", width: "sm" as const, data: (r: TestRow) => ({ field: "ece", value: r.key === "courtlens" ? block.calibration_error : r.key === "espn" ? cmp.ece?.espn ?? "" : "" }),
      cell: (r: TestRow) => <GridValue text={r.key === "courtlens" ? metric(block.calibration_error) : r.key === "espn" ? metric(cmp.ece?.espn) : "—"} muted={r.key === "gap"} /> }]),
  ];
  const label = (r: TestRow) => r.key === "courtlens" ? "CourtLens" : r.key === "espn" ? "ESPN Analytics" : "Gap";
  const sub = (r: TestRow) => r.key === "gap" ? "ESPN minus CourtLens; above zero, CourtLens did better" : r.key === "courtlens" ? `${whole(cmp.log_loss.courtlens.games)} games` : "Read after the games";
  const gates = card.gates ?? {};
  return <ResearchSection id="final-test" icon="scale" title={`The final test, ${card.test_seasons.join(" and ")}`}
    aside={phone
      ? <Select size="sm" aria-label="Phase" value={phase} onChange={event => setPhase(event.target.value)}>{phases.map(value => <option key={value} value={value}>{PHASE_LABELS[value] ?? value}</option>)}</Select>
      : <Segmented size="sm" label="Phase" value={phase} onChange={setPhase} options={phases.map(value => ({ value, label: PHASE_LABELS[value] ?? value }))} />}>
    <p className="wp-lead" data-field="test-line" data-better={clear.better.join(",")} data-worse={clear.worse.join(",")}>
      Fitted on earlier seasons and read once, after every choice was fixed, on {whole(card.test_games)} games.
      {clear.better.length > 0 && <> Against ESPN, CourtLens did clearly better in {listOf(clear.better.map(lower))}</>}
      {clear.better.length > 0 && clear.tied.length > 0 && <>; {listOf(clear.tied.map(lower))} can&apos;t be told apart</>}
      {clear.better.length > 0 ? "." : null}
      {clear.worse.length > 0 && <> ESPN did clearly better in {listOf(clear.worse.map(lower))}.</>}
    </p>
    <StatsGrid<TestRow> label={`Final test: ${PHASE_LABELS[phase] ?? phase}`} name="final-test" density="compact" height="auto" leadWidth="lg" className={phone ? "wp-grid wp-phone" : "wp-grid"} rows={rows} rowKey={r => r.key}
      rowData={r => ({ row: r.key, phase })} lead={{ label: PHASE_LABELS[phase] ?? phase, cell: r => <><span className="wp-name">{label(r)}</span><span className="wp-name-sub">{sub(r)}</span></> }} columns={columns} />
    <CalibrationChart label={`Calibration on the final test: ${PHASE_LABELS[phase] ?? phase}`}
      series={[{ name: "CourtLens", key: "courtlens", curve: block.curve }, ...(phase === "overall" ? [{ name: "Baseline (score and time only)", key: "baseline", curve: card.baseline_curve }] : [])]} />
    {gates.A1 && gates.A2 && <div className="wp-rules" data-field="rules">
      <p className="wp-lead">The two rules fixed before the test:</p>
      <ul className="wp-rule-list">
        <li data-rule="A1" data-passed={gates.A1.passed} data-value={gates.A1.improvement.mean} data-low={gates.A1.improvement.low} data-high={gates.A1.improvement.high}>
          <span className="wp-rule-name">Beat the score-and-time baseline, interval above zero</span><span className="wp-rule-observed">{signed(gates.A1.improvement.mean)} ({band(gates.A1.improvement)})</span><span className="wp-result" data-passed={gates.A1.passed}>{gates.A1.passed ? "Passed" : "Not passed"}</span></li>
        <li data-rule="A2" data-passed={gates.A2.passed} data-value={gates.A2.ece}>
          <span className="wp-rule-name">Calibration error at most {gates.A2.limit}</span><span className="wp-rule-observed">{metric(gates.A2.ece)}</span><span className="wp-result" data-passed={gates.A2.passed}>{gates.A2.passed ? "Passed" : "Not passed"}</span></li>
      </ul>
    </div>}
  </ResearchSection>;
}

// ---- 4. What didn't help -------------------------------------------------------------------------------------------------

const STEP_NAMES: Record<string, string> = {
  S0g: "A flexible model, no new information", S1: "Possession, free throws, timeouts, fouls", S2: "Player ratings and pregame context",
  S3: "Volatility", S4: "Rotation, exits, foul trouble, lineups", S5: "Runs and shooting luck", E: "End-game specialist",
};
const REF_NAMES: Record<string, string> = { S0: "the score-and-time baseline", S0g: "the flexible model", S1: "the possession step", S2: "the player-ratings step" };
// R15a: each step's selection gain (2022-23, 90% interval) and its test pair (95%) are against different references.
const SELECTION_REFS: Record<string, string> = { S0g: "S0", S1: "S0", S2: "S1", S3: "S2", S4: "S2", S5: "S2" };
const TEST_REFS: Record<string, string> = { S0g: "S0", S1: "S0g", S2: "S1", S3: "S2", S4: "S2", S5: "S2", E: "S2" };
type StepResult = "kept" | "not-kept" | "diagnostic";
interface StepRow { key: string; selection: Interval | null; test: Interval | null; result: StepResult }
const RESULT_TEXT: Record<StepResult, string> = { kept: "Kept", "not-kept": "Not kept", diagnostic: "Diagnostic" };

function Negative({ data }: { data: WinProbabilityPage }) {
  const card = data.card;
  const phone = usePhone();
  const steps = card.steps ?? {};
  const rows: StepRow[] = Object.keys(STEP_NAMES).filter(k => steps[k] || card.pairs.some(p => p.model === k && p.reference === TEST_REFS[k])).map(key => ({
    key, selection: steps[key]?.selection_gain ?? null,
    test: card.pairs.find(p => p.model === key && p.reference === TEST_REFS[key])?.overall.log_loss ?? null,
    result: key === "S0g" ? "diagnostic" : key === "E" ? (/end-game/i.test(data.model.selected) ? "kept" : "not-kept") : steps[key]?.accepted ? "kept" : "not-kept",
  }));
  const rejected = rows.filter(r => r.result === "not-kept");
  const nothing = rejected.filter(r => r.selection && r.selection.low <= 0 && r.selection.high >= 0);
  const columns: GridColumn<StepRow>[] = [
    { key: "selection", label: phone ? "Selection, 90%" : "On selection, 90%", title: "Log-loss gain on the 2022-23 selection season, with its 90% interval; a step was kept only if the interval was above zero. Above zero, the step helped", width: "md",
      data: r => ({ field: "selection", value: r.selection?.mean ?? "", low: r.selection?.low ?? "", high: r.selection?.high ?? "" }),
      cell: r => r.selection ? <GridValue text={signed(r.selection.mean)} sub={band(r.selection)} /> : <GridValue text="Late game only" muted title="Judged on the last two minutes and overtime" /> },
    ...(phone ? [] : [{ key: "test", label: "On the test, 95%", title: "The paired log-loss gain on the final test seasons, read afterwards, with its 95% interval", width: "md" as const,
      data: (r: StepRow) => ({ field: "test", value: r.test?.mean ?? "", low: r.test?.low ?? "", high: r.test?.high ?? "" }), cell: (r: StepRow) => <GridValue text={signed(r.test?.mean)} sub={band(r.test)} /> }]),
    { key: "kept", label: "Result", width: "sm", data: r => ({ field: "kept", value: r.result }), cell: r => <span className="wp-result" data-passed={r.result === "kept"}>{RESULT_TEXT[r.result]}</span> },
  ];
  const sub = (r: StepRow) => phone || !r.selection
    ? `Against ${REF_NAMES[TEST_REFS[r.key]] ?? TEST_REFS[r.key]}`
    : SELECTION_REFS[r.key] === TEST_REFS[r.key] ? `Against ${REF_NAMES[TEST_REFS[r.key]]}` : `Selection against ${REF_NAMES[SELECTION_REFS[r.key]]}; test against ${REF_NAMES[TEST_REFS[r.key]]}`;
  const m = card.market, tip = card.espn.tipoff.log_loss.espn_minus_courtlens, ot = card.phases.overtime;
  const up = data.upgrade, gain = up?.comparisons.v3_vs_v2_frozen ?? { mean: 0, low: 0, high: 0, games: 0 };
  return <ResearchSection id="negative" icon="layers" title="What didn't help">
    <p className="wp-lead" data-field="negative-line" data-rejected={rejected.map(r => r.key).join(",")} data-nothing={nothing.map(r => r.key).join(",")}>The model was built in steps, each kept only if it lowered log loss on the 2022-23 selection season with a 90% interval above zero.{nothing.length > 0 && <> {listOf(nothing.map(r => STEP_NAMES[r.key].toLowerCase())).replace(/^./, c => c.toUpperCase())}: no gain that clears zero, so {nothing.length === 1 ? "it was" : "they were"} left out{nothing.some(r => r.key === "S4") ? " and the frozen model has no live lineup tracker" : ""}.</>}</p>
    <p className="wp-note">Above zero, a step helped. Values have no colour: whether a step was kept is the result, in words. The flexible model added no information and was kept only as a diagnostic.{phone ? " The test gains are on a wider screen." : ""}</p>
    <StatsGrid<StepRow> label="Model steps" name="steps" density="compact" height="auto" leadWidth="lg" className={phone ? "wp-grid wp-wrap wp-phone" : "wp-grid wp-wrap"} rows={rows} rowKey={r => r.key}
      rowData={r => ({ step: r.key, result: r.result })} lead={{ label: "Step", cell: r => <><span className="wp-name">{STEP_NAMES[r.key]}</span><span className="wp-name-sub">{sub(r)}</span></> }} columns={columns} />
    <ul className="wp-findings" data-field="findings">
      <li><strong>Recalibration</strong> was fitted and not used: it made cross-validated log loss slightly worse.</li>
      <li data-field="market" data-courtlens={m.courtlens_rmse} data-market={m.market_rmse}><strong>Before tip-off, the betting market is better.</strong> Its closing spread missed the final margin by {metric(m.market_rmse, 2)} points (root mean square) against {metric(m.courtlens_rmse, 2)} for CourtLens, on {whole(m.games)} games.</li>
      <li data-field="tipoff" data-value={tip.mean} data-low={tip.low} data-high={tip.high}><strong>At tip-off, ESPN leads without a clear gap:</strong> {signed(tip.mean)} ({band(tip)}).</li>
      {ot && <li data-field="overtime" data-value={ot.calibration_error}><strong>Overtime is the weak spot:</strong> calibration error {metric(ot.calibration_error, 3)} on {whole(ot.log_loss.games)} games.</li>}
      {up && <li data-field="upgrade" data-adopted={up.adopted} data-value={gain.mean} data-low={gain.low} data-high={gain.high}>
        <strong>{up.adopted ? "A second model replaced it." : "A second model was tested and not adopted."}</strong> It added Projected Impact ratings to the pregame forecast and
        two more training seasons{up.selection.P3?.accepted ? ", with an overtime model" : "; an overtime model was tried and not kept"}. On the same {whole(up.games)} test games it lowered
        log loss by {signed(gain.mean)} ({band(gain)}){gain.low <= 0 ? ", an interval that includes zero, so the frozen model stays" : ""}. Its pregame forecast was no closer to the
        final margin: {metric(up.pregame.v3_mu0.rmse, 2)} points against {metric(up.pregame.v2_mu0.rmse, 2)} (root mean square).</li>}
    </ul>
  </ResearchSection>;
}

// ---- 5. Win probability added ---------------------------------------------------------------------------------------------

function WpaSection({ seasons }: { seasons: string[] }) {
  const { get, set } = useUrlState();
  const wanted = get("wpaSeason");
  const season = wanted && seasons.includes(wanted) ? wanted : seasons[0];
  const { data: table, error, loading, retry } = useFeed([season ?? null], () => getWinProbabilityAdded(season!));
  return <ResearchSection id="wpa" icon="trend" title="Win probability added"
    aside={season ? <Segmented size="sm" label="Season" value={season} onChange={value => set({ wpaSeason: value === seasons[0] ? null : value })} options={seasons.map(value => ({ value, label: value }))} /> : null}>
    <p className="wp-lead">Each play&apos;s swing in win probability goes to its first listed player. This is credit assignment, not causal value: the swing also holds time passing since the last play, and nothing goes to the player who created the shot. Clutch means the last five minutes of the fourth quarter or overtime with the margin at five or fewer.</p>
    {!season && <GatedNote>No win probability added has been computed yet.</GatedNote>}
    {error && <FeedFailure error={error} retry={retry} what="Win probability added" />}
    {loading && <FeedSkeleton label="Loading win probability added" />}
    {table && <WpaGrid table={table} />}
  </ResearchSection>;
}

function WpaGrid({ table }: { table: WinProbabilityAdded }) {
  const phone = usePhone();
  const [view, setView] = useState<"all" | "clutch">("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<WpaSort>(WPA_DEFAULT_SORT);
  const all = useMemo(() => wpaRows(table), [table]);
  const rows = useMemo(() => { const q = query.trim().toLowerCase(); return sortWpa(all.filter(r => !q || r.name.toLowerCase().includes(q)), sort); }, [all, query, sort]);
  const onSort = (key: string) => setSort(s => s.key === key ? { key: s.key, direction: s.direction === "asc" ? "desc" : "asc" } : { key: key as WpaSortKey, direction: "desc" });
  const num = (key: WpaSortKey, label: string, group: string, text: (r: WpaRow) => string, title?: string, width: "xs" | "sm" = "sm"): GridColumn<WpaRow> => ({
    key, label, group, title, width, sort: r => r[key], data: r => ({ field: key, value: r[key] }), cell: r => <GridValue text={text(r)} />,
  });
  const columns: GridColumn<WpaRow>[] = [
    ...(!phone || view === "all" ? [
      num("wpa", "WPA", "All plays", r => signed(r.wpa, 2), "Win probability added, in wins: the sum of the swings credited to the player"),
      num("events", "Plays", "All plays", r => whole(r.events), "Plays credited to the player"),
      ...(phone ? [] : [num("games", "GP", "All plays", r => whole(r.games), "Games", "xs")]),
    ] : []),
    ...(!phone || view === "clutch" ? [
      num("clutch_wpa", "Clutch WPA", "Clutch", r => signed(r.clutch_wpa, 2), "Win probability added in clutch time"),
      num("clutch_events", "Plays", "Clutch", r => whole(r.clutch_events), "Clutch plays credited to the player"),
    ] : []),
  ];
  return <div className="wp-board">
    <p className="wp-note" data-field="wpa-coverage" data-rows={all.length} data-players={table.players} data-games={table.games}>{table.season}: {whole(table.games)} games. The {whole(table.leaders.length)} highest by WPA and the {whole(table.clutch_leaders.length)} highest by clutch WPA, {whole(all.length)} of {whole(table.players)} credited players. Sorted, not ranked: no interval is served, so values have no colour.</p>
    {phone && <Segmented size="sm" label="WPA columns" value={view} onChange={setView} options={[{ value: "all", label: "All plays" }, { value: "clutch", label: "Clutch" }]} />}
    <StatsGrid<WpaRow> label={`Win probability added, ${table.season}`} name="wpa" className={phone ? "wp-grid wp-wpa wp-phone" : "wp-grid wp-wpa"} rows={rows} rowKey={r => r.player}
      columns={columns} leadWidth="lg" minWidth="narrow" height="scroll" empty="No player matches this search."
      rowData={r => ({ player: r.player_id ?? r.player })} sort={{ key: sort.key, direction: sort.direction, onSort }}
      lead={{ group: "Player", label: <GridSearch value={query} onChange={setQuery} />, cell: r => <GridPlayer playerId={r.player_id} name={r.name} team={r.team} season={table.season} era={seasonEra(table.season, r.team)} subtitle={phone ? `${r.team ?? ""} · ${whole(r.games)} GP` : r.team ?? undefined}
        href={r.player_id ? `/players/${r.player_id}?season=${table.season}` : undefined} /> }} />
  </div>;
}

// ---- 6. Reading and About ------------------------------------------------------------------------------------------------

const GLOSSARY: GlossaryGroup[] = [
  { label: "Scores", icon: "target", items: [
    { term: "Log loss", text: "How surprised a model was by what happened, averaged over game states. A confident wrong call costs most. Lower is better." },
    { term: "Brier", text: "The squared gap between the win chance and the result (1 or 0). Lower is better." },
    { term: "Calibration error", text: "How far, on average, the stated win chances sit from how often those teams won. Zero is perfect." },
    { term: "Gap", text: "ESPN's score minus CourtLens's on the same game states. Above zero, CourtLens did better." },
    { term: "95% interval", text: "From resampling whole games, so every state of one game stays together." },
  ] },
  { label: "The test", icon: "shield", items: [
    { term: "Freeze", text: "The model was fixed on Nov 4, 2026, before the 2026-27 games it is scored on. It is not refitted during the season." },
    { term: "Since the freeze", text: "Games that tipped off after the freeze, with pregame inputs sealed before tip-off: the prospective test." },
    { term: "Replayed", text: "Earlier games run through the nightly pipeline with hindsight on who played. They test the pipeline, not the model." },
    { term: "Drift", text: "The last 30 days' calibration error against the range the test seasons gave for a window that size." },
    { term: "WPA", text: "Win probability added: the sum of the swings credited to a player, in wins. Credit assignment, not causal value." },
  ] },
];

function Reading() {
  return <>
    <ResearchSection id="reading" icon="book" title="How to read">
      <ResearchCards columns={3}>
        <ResearchCard kicker="Win chance"><p className="wp-card-text">A 70% call should come true about 7 times in 10. The calibration charts put each stated chance against how often it came true; the closer to the dashed line, the better.</p></ResearchCard>
        <ResearchCard kicker="Scores"><p className="wp-card-text">Log loss, Brier and calibration error are all lower-is-better. Two models a few thousandths apart are doing about equally well.</p></ResearchCard>
        <ResearchCard kicker="Colour"><p className="wp-card-text">Green or red only on a gap against ESPN whose 95% interval sits wholly on one side of zero. Everything else stays neutral.</p></ResearchCard>
      </ResearchCards>
    </ResearchSection>
    <ResearchDisclosure id="glossary" icon="list-ordered" title="Terms, defined"><Glossary groups={GLOSSARY} /></ResearchDisclosure>
  </>;
}

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function About({ data }: { data: WinProbabilityPage }) {
  const { model, card } = data;
  return <ResearchDisclosure id="about" icon="info" title="About this page">
    <MethodBlock title="Model card">
      <dl className="wp-defs" data-field="model-card">
        <dt>Model</dt><dd>Win Probability, the frozen <code data-field="version">{model.version}</code>: {model.selected.replace(/^S2/, "the player-ratings step (S2)")}, trained through {model.trained_through}.</dd>
        <dt>Frozen</dt><dd>{formatDate(model.frozen_at.slice(0, 10))}. No refit or recalibration during the season; a new version is an offseason job.</dd>
        <dt>Player ratings</dt><dd>{sentence(model.pregame.player_rating)}. Rule: {model.pregame.rating_rule}. Holding one snapshot all season cost +0.0039 log loss on the test seasons, so ratings keep updating monthly while the model stays fixed.</dd>
        <dt>Who is available</dt><dd>{sentence(model.pregame.availability)}. Training read each game&apos;s own box, so the test numbers assume the inactive list was known. Having no injury news at all cost +0.0034 log loss on the test seasons; Live sits between the two.</dd>
        <dt>Live inputs</dt><dd>Live replays ESPN&apos;s plays through the training code. On {whole(card.test_games)} test games that changed log loss by +0.0002 and left calibration at {metric(card.models.selected.calibration_error)}.</dd>
        <dt>Scope</dt><dd>Regular season only. Other games show ESPN&apos;s line alone. Neutral sites other than the 2019-20 bubble are not identified.</dd>
        <dt>Drift flag</dt><dd>Rolling 30-day calibration error against a game-bootstrap 95% interval from the test seasons at the same window size, with at least 25 games.</dd>
        <dt>Sources</dt><dd>Play-by-play and ESPN Analytics&apos; win probability from ESPN, read after each game. Closing spreads from hoopR&apos;s public NBA data (CC BY 4.0), the consensus close.</dd>
      </dl>
    </MethodBlock>
    <MethodBlock title="Identifiers">
      <dl className="wp-defs" data-field="identifiers">
        <dt>Version</dt><dd><code>{model.version}</code></dd>
        <dt>Manifest</dt><dd><code data-field="manifest">{model.manifest_sha256}</code></dd>
        <dt>Model files</dt><dd>{Object.entries(model.models).map(([role, hash]) => <span key={role} className="wp-hash">{role.replace(/_/g, " ")}: <code>{hash}</code></span>)}</dd>
        <dt>Registration</dt><dd><code>{model.registration}</code> · <code>{model.registration_sha256.slice(0, 16)}</code></dd>
        <dt>Scorecard</dt><dd>Updated {data.scorecard ? formatDate(data.scorecard.updated_at.slice(0, 10)) : "—"}.</dd>
      </dl>
    </MethodBlock>
  </ResearchDisclosure>;
}

// ---- The page -----------------------------------------------------------------------------------------------------------

export function WinProbabilityResearch() {
  const { data, error, loading, retry } = useFeed([], () => getWinProbabilityPage());
  const meta = data ? [`frozen ${formatDate(data.model.frozen_at.slice(0, 10))}`, `${whole(data.scorecard?.prospective.games ?? 0)} games since the freeze`, "checked nightly against ESPN"] : null;
  return <Frame meta={meta}>
    {error && <FeedFailure error={error} retry={retry} what="Win Probability" />}
    {loading && <FeedSkeleton label="Loading Win Probability" />}
    {data && <>
      <Answer data={data} />
      <Scorecard data={data} />
      <FinalTest data={data} />
      <Negative data={data} />
      <Suspense fallback={null}><WpaSection seasons={data.wpa_seasons} /></Suspense>
      <Reading />
      <About data={data} />
    </>}
  </Frame>;
}
