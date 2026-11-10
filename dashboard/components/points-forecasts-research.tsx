"use client";

import { Fragment, Suspense, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import {
  Glossary, MethodBlock, ResearchCard, ResearchCards, ResearchDisclosure, ResearchIntro, ResearchSection, type GlossaryGroup,
} from "./research/research-page";
import { GridPlayer, GridValue, StatsGrid, type GridColumn } from "./research/stats-grid";
import { FeedFailure, FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { TeamLogo } from "./team-logo";
import { GatedNote } from "./ui/gated-note";
import { ButtonLink, ButtonSummary, Segmented, Select } from "./ui/kit";
import { PageShell } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { RouteTabs } from "./ui/route-tabs";
import { formatDate } from "@/lib/format-date";
import { seasonEra } from "@/lib/portrait-source";
import {
  chosenByLowestPooled, dimensionLabel, eligibilityText, estimandModels, fixed, gainBand, gainFromDifference, gainTone, insideSplit, issueTiming, ledgerSpan, modelName, modelOrder, modelSub,
  orderedDimensions, orderedSubgroups, OUTCOME_TEXT, outcomeOf, pct, POINTS_PROTOCOL, pointsSelectionRows, seasonOf, slicePattern, subgroupLabel, timingCounts, whole, type Gain,
  type PointsValidationResults, type SelectionRow,
} from "@/lib/points-forecasts";
import { signed } from "@/lib/research-values";
import type { ForecastIssuanceItem, ForecastsListResponse, PointsForecastEvaluation } from "@/lib/types";
import { getPointsForecastEvaluation, getProspectiveForecasts } from "@/lib/workbench-api";

/**
 * Research → Methods → Points Forecasts (workbench P7, designed in RD16), with the Evaluation Archive as its second route tab. Every number is
 * the frozen basketball-points-v1 run's or the issuance ledger's as served; exact values sit on `data-*` for the real-data check. Only one paired
 * interval is served (the finalist against the served model), so it is the only value that can take green or red, and only where its 95%
 * interval excludes zero.
 */

/** "Player trees" → "Player trees'", "EWMA-20" → "EWMA-20's". */
export const possessive = (name: string) => name.endsWith("s") ? `${name}'` : `${name}'s`;
export const vars = (props: Record<string, string>) => props as CSSProperties;
const PHONE = "(max-width: 767px)";
/** Phone layout for tables whose columns switch at phone width (RD13); the server renders the desktop table. */
export function usePhone() {
  return useSyncExternalStore(
    notify => { const query = window.matchMedia(PHONE); query.addEventListener("change", notify); return () => query.removeEventListener("change", notify); },
    () => window.matchMedia(PHONE).matches,
    () => false,
  );
}

export const TABS = [{ label: "Points Forecasts", href: "/forecasts" }, { label: "Evaluation Archive", href: "/evaluation" }] as const;

/** One centred hero over both tabs (RD16 Q4): the Research hero, then route tabs, then the tab's own sections in the 992 px column. */
export function ForecastsFrame({ intro, children }: { intro: ReactNode; children: ReactNode }) {
  return <PageShell template="research">
    <div className="rs-column fc-page">
      <PageHeader className="sq-hero research-hero" icon="chart-line" title="Points Forecasts" subtitle="Next-game points for every player, tested on a season no model saw." />
      <Suspense fallback={<div className="ui-route-tabs" aria-hidden="true" />}>
        <RouteTabs tabs={TABS} aria-label="Points Forecasts sections" className="fc-tabs" />
      </Suspense>
      {intro}
      {children}
    </div>
  </PageShell>;
}

export function MetaLine({ items }: { items: readonly string[] }) {
  return <span data-field="hero-meta">{items.map((item, i) => <Fragment key={item}>{i > 0 ? " · " : ""}<span className="fc-meta-item">{item}</span></Fragment>)}</span>;
}

export function ModelLabel({ model }: { model: string }) {
  return <><span className="fc-name" data-model={model}>{modelName(model)}</span><span className="fc-name-sub">{modelSub(model)}</span></>;
}

// ---- The miss strip: typical misses and the paired gain on one axis that includes zero ------------------------------------

export interface MissRow { model: string; mae: number }

/**
 * Each model's typical miss as a bar from zero, then the served gain with its 95% interval, all on one points axis (RD12: a gap is
 * drawn to scale beside what it is a gap in, so a negligible difference looks negligible).
 */
export function MissStrip({ rows, gain, gainLabel, unit }: { rows: readonly MissRow[]; gain: Gain | null; gainLabel: string; unit: string }) {
  const top = Math.max(...rows.map(r => r.mae), gain?.high ?? 0);
  const right = Math.ceil(top);
  const left = Math.min(0, gain?.low ?? 0);
  const at = (value: number) => `${((value - left) / (right - left)) * 100}%`;
  const ticks = Array.from({ length: right + 1 }, (_, i) => i).filter(t => right <= 6 || t % 2 === 0 || t === right);
  const tone = gainTone(gain);
  // RD12: the gain stays on the misses' scale; when that makes it too small to see, one line says so (owner, RD16 round 2).
  const tiny = gain ? (gain.high - gain.low) / (right - left) < 0.03 : false;
  return <figure className="fc-figure" data-chart="miss" data-left={left} data-right={right}>
    <figcaption className="fc-figure-title">Typical miss per game, in {unit}, and the gain with its 95% interval</figcaption>
    <div className="fc-strip-axis" aria-hidden="true">
      <span />
      <span className="fc-strip-scale">{ticks.map(t => <span key={t} style={vars({ "--fc-at": at(t) })} data-edge={t === right ? "end" : undefined}>{t}</span>)}</span>
      <span />
    </div>
    <ul className="fc-strip">
      {rows.map(r => <li key={r.model} className="fc-strip-row" data-row="miss" data-model={r.model} data-value={r.mae}>
        <span className="fc-strip-label"><ModelLabel model={r.model} /></span>
        <span className="fc-track" aria-hidden="true"><span className="fc-track-zero" style={vars({ "--fc-at": at(0) })} /><span className="fc-track-bar" style={vars({ "--fc-low": at(0), "--fc-high": at(r.mae) })} /></span>
        <span className="fc-strip-value"><strong>{fixed(r.mae)}</strong><small>{unit}</small></span>
      </li>)}
      {gain && <li className="fc-strip-row" data-row="gain" data-value={gain.value} data-low={gain.low} data-high={gain.high} data-tone={tone}>
        <span className="fc-strip-label"><span className="fc-name">{gainLabel}</span><span className="fc-name-sub">Above zero, it missed by less</span></span>
        <span className="fc-track" aria-hidden="true" data-tone={tone}>
          <span className="fc-track-zero" style={vars({ "--fc-at": at(0) })} />
          <span className="fc-track-span" style={vars({ "--fc-low": at(gain.low), "--fc-high": at(gain.high) })} />
          <span className="fc-track-dot" style={vars({ "--fc-at": at(gain.value) })} />
        </span>
        <span className="fc-strip-value"><strong data-tone={tone}>{signed(gain.value, 3)}</strong><small>{gainBand(gain)}</small></span>
      </li>}
    </ul>
    <ul className="fc-key">
      <li><span className="fc-key-mark" data-mark="bar" aria-hidden="true" />Typical miss (mean absolute error)</li>
      {gain && <li><span className="fc-key-mark" data-mark="gain" aria-hidden="true" />Gain, with its 95% interval{tone ? "" : ", which includes zero"}</li>}
    </ul>
    {gain && tiny && <p className="fc-note fc-figure-note" data-field="miss-scale-note" data-span={gain.high - gain.low}>The gain is drawn to the same scale as the misses. Its whole interval spans {fixed(gain.high - gain.low, 3)} {unit}, too small to see beside a miss of about {fixed(Math.min(...rows.map(r => r.mae)), 1)}.</p>}
  </figure>;
}

// ---- Coverage: does the 80% range hold 8 games in 10? ---------------------------------------------------------------------

export interface CoverageRow { key: string; model: string; group?: string; coverage: number | null; width: number | null; rows: number }

export function CoverageStrip({ rows, nominal, unit }: { rows: readonly CoverageRow[]; nominal: number; unit: string }) {
  const at = (value: number) => `${Math.max(0, Math.min(1, value)) * 100}%`;
  const first = rows.find(r => r.coverage != null)?.coverage;
  const example = first == null ? null : (first - nominal) * 100;
  return <figure className="fc-figure" data-chart="coverage" data-nominal={nominal}>
    <figcaption className="fc-figure-title">Share of games inside the {Math.round(nominal * 100)}% range</figcaption>
    <div className="fc-strip-axis" aria-hidden="true">
      <span />
      <span className="fc-strip-scale">{[0, 0.25, 0.5, 0.75, 1].map(t => <span key={t} style={vars({ "--fc-at": at(t) })} data-edge={t === 1 ? "end" : undefined} data-minor={t === 0.25 || t === 0.75 || undefined}>{Math.round(t * 100)}%</span>)}</span>
      <span />
    </div>
    <ul className="fc-strip">{rows.map(r => <li key={r.key} className="fc-strip-row" data-row="coverage" data-key={r.key} data-model={r.model} data-group={r.group ?? ""} data-value={r.coverage ?? ""} data-width={r.width ?? ""} data-rows={r.rows}>
      <span className="fc-strip-label"><span className="fc-name">{modelName(r.model)}</span><span className="fc-name-sub">{r.group ?? `${whole(r.rows)} forecasts`}</span></span>
      <span className="fc-track" aria-hidden="true">
        <span className="fc-track-target" style={vars({ "--fc-at": at(nominal) })} />
        {r.coverage != null && <span className="fc-track-bar" data-series="share" style={vars({ "--fc-low": at(0), "--fc-high": at(r.coverage) })} />}
      </span>
      <span className="fc-strip-value"><strong>{pct(r.coverage)}</strong>
        {r.coverage != null && <small data-field="target-gap" data-value={(r.coverage - nominal) * 100}>{signed((r.coverage - nominal) * 100, 1)} pts from {Math.round(nominal * 100)}%</small>}
        <small>{r.width == null ? "Width unknown" : `${fixed(r.width, 1)} ${unit} wide`}</small></span>
    </li>)}</ul>
    <ul className="fc-key">
      <li><span className="fc-key-mark" data-mark="share" aria-hidden="true" />Observed share</li>
      <li><span className="fc-key-mark" data-mark="target" aria-hidden="true" />The {Math.round(nominal * 100)}% target</li>
    </ul>
    {example != null && <p className="fc-note fc-figure-note" data-field="target-gap-note">Points are percentage points: {signed(example, 1)} pts means the range held the real total in {fixed(Math.abs(example), 1)} {example >= 0 ? "more" : "fewer"} games of every 100 than the target.</p>}
  </figure>;
}

// ---- Gates --------------------------------------------------------------------------------------------------------------

export interface GateRow { key: string; name: string; needed: string; observed: string; passed: boolean }

export function GatesGrid({ rows, label }: { rows: readonly GateRow[]; label: string }) {
  // On a phone the rule's requirement moves under its name, so three columns fit without scrolling sideways (RD13).
  const phone = usePhone();
  return <StatsGrid<GateRow> label={label} name="gates" density="compact" height="auto" leadWidth="lg" className={phone ? "fc-grid fc-gates fc-wrap fc-phone" : "fc-grid fc-gates fc-wrap"} rows={rows} rowKey={r => r.key}
    rowData={r => ({ gate: r.key, passed: r.passed })}
    lead={{ label: phone ? "Rule, needed" : "Rule", cell: r => <><span className="fc-name">{r.name}</span>{phone && <span className="fc-name-sub" data-field="needed">{r.needed}</span>}</> }}
    columns={[
      ...(phone ? [] : [{ key: "needed", label: "Needed", width: "fill" as const, align: "left" as const, data: (r: GateRow) => ({ field: "needed", value: r.needed }), cell: (r: GateRow) => <span className="fc-cell-text">{r.needed}</span> }]),
      { key: "observed", label: "Observed", width: "lg", align: "left", data: r => ({ field: "observed", value: r.observed }), cell: r => <span className="fc-cell-text" data-field="observed">{r.observed}</span> },
      { key: "result", label: "Result", width: "sm", data: r => ({ field: "result", value: r.passed ? "passed" : "not-passed" }), cell: r => <span className="fc-result" data-passed={r.passed}>{r.passed ? "Passed" : "Not passed"}</span> },
    ]} />;
}

// ---- How the models were chosen (RD16 round 2) ---------------------------------------------------------------------------

/** Every candidate on both validation folds, the chosen ones marked in words (no colour: these errors carry no interval). */
export function SelectionDisclosure({ rows, folds, unit }: { rows: readonly SelectionRow[]; folds: readonly [string, string]; unit: string }) {
  const phone = usePhone();
  if (!rows.length) return null;
  const rule = chosenByLowestPooled(rows);
  const averages = rows.filter(r => r.group === "averages").length;
  const columns: GridColumn<SelectionRow>[] = [
    { key: "v1", label: phone ? "Fold 1" : `Fold 1, ${folds[0]}`, group: phone ? "Typical miss" : `Typical miss, ${unit}`, width: phone ? "sm" : "md", data: r => ({ field: "v1", value: r.v1 ?? "" }), cell: r => <GridValue text={fixed(r.v1, 3)} /> },
    { key: "v2", label: phone ? "Fold 2" : `Fold 2, ${folds[1]}`, group: phone ? "Typical miss" : `Typical miss, ${unit}`, width: phone ? "sm" : "md", data: r => ({ field: "v2", value: r.v2 ?? "" }), cell: r => <GridValue text={fixed(r.v2, 3)} /> },
    { key: "pooled", label: "Pooled", group: phone ? "Typical miss" : `Typical miss, ${unit}`, width: "sm", data: r => ({ field: "pooled", value: r.pooled ?? "" }), cell: r => <GridValue text={fixed(r.pooled, 3)} /> },
    ...(phone ? [] : [{ key: "rows", label: "Forecasts", width: "sm" as const, data: (r: SelectionRow) => ({ field: "rows", value: r.rows ?? "" }), cell: (r: SelectionRow) => <GridValue text={whole(r.rows)} /> }]),
  ];
  return <ResearchDisclosure id="selection" icon="list-ordered" title="How the models were chosen">
    <p className="fc-lead" data-field="selection-line" data-rule={rule}>
      Before the test opened, every candidate was scored on two validation folds: {averages > 1 ? `${averages} simple averages` : averages === 1 ? "the served simple average" : "no simple average"} and {rows.length - averages} tree settings.
      {rule ? ` ${averages > 1 ? "The average with the lowest pooled typical miss became the served model, e" : "E"}ach tree type kept its best setting, and the better of the two became the finalist.` : " The chosen ones are marked."}
    </p>
    <p className="fc-note">Typical misses in {unit}. No interval is served for these errors, so nothing is coloured; a few thousandths apart is no practical difference.</p>
    <StatsGrid<SelectionRow> label="Validation results" name="selection" density="compact" height="auto" leadWidth="lg" className={phone ? "fc-grid fc-selection fc-phone" : "fc-grid fc-selection"} rows={rows} rowKey={r => r.key}
      rowData={r => ({ key: r.key, model: r.model, chosen: r.chosen, finalist: r.finalist })}
      lead={{ label: "Candidate", cell: r => <><span className="fc-name">{modelName(r.model)}{r.setting ? <span className="fc-setting">, {r.setting}</span> : null}</span>
        <span className="fc-name-sub" data-field="chosen">{r.group === "averages" ? (r.chosen ? "Chosen: the served model" : "Simple average") : r.finalist ? "Chosen: the finalist" : r.chosen ? "Best setting of its type" : "Tree setting"}</span></> }}
      columns={columns} />
  </ResearchDisclosure>;
}

// ---- Slices: a grouped select and one compact grid ------------------------------------------------------------------------

export const SLICE_GROUPS: { label: string; keys: readonly string[] }[] = [
  { label: "The player", keys: ["current_appearances_slice", "prior_history", "prior_season_eligibility", "prior_minutes_slice", "prior_minutes", "team_changed_slice", "days_since_appearance"] },
  { label: "The schedule", keys: ["team_rest_slice", "lead_days_slice", "opponent_context_slice", "opponent_context", "season_slice"] },
];

export function SliceSelect({ dimensions, value, onChange }: { dimensions: readonly string[]; value: string; onChange: (key: string) => void }) {
  const grouped = SLICE_GROUPS.map(g => ({ ...g, keys: g.keys.filter(k => dimensions.includes(k)) })).filter(g => g.keys.length);
  const rest = dimensions.filter(d => !SLICE_GROUPS.some(g => g.keys.includes(d)));
  return <Select size="sm" aria-label="Slice" value={value} onChange={event => onChange(event.target.value)}>
    {grouped.map(g => <optgroup key={g.label} label={g.label}>{g.keys.map(k => <option key={k} value={k}>{dimensionLabel(k)}</option>)}</optgroup>)}
    {rest.length > 0 && <optgroup label="Other">{rest.map(k => <option key={k} value={k}>{dimensionLabel(k)}</option>)}</optgroup>}
  </Select>;
}

// ---- The Points Forecasts tab --------------------------------------------------------------------------------------------

function pairedGain(evaluation: PointsForecastEvaluation): { gain: Gain; models: [string, string] } | null {
  const g = evaluation.promotion?.gates.final_paired_superiority;
  const models = estimandModels(g?.estimand) ?? (evaluation.validation ? [evaluation.validation.challenger_finalist, evaluation.validation.baseline] as [string, string] : null);
  if (!g || g.lower == null || g.upper == null || !models) return null;
  return { gain: gainFromDifference(g.mae_difference, g.lower, g.upper), models };
}

function Answer({ evaluation }: { evaluation: PointsForecastEvaluation }) {
  const metrics = evaluation.final_test?.metrics ?? {};
  const order = modelOrder(evaluation);
  const served = evaluation.validation?.baseline ?? order[0];
  const paired = pairedGain(evaluation);
  const gates = evaluation.promotion?.gates;
  const maes = order.map(m => metrics[m]?.mae).filter((v): v is number => typeof v === "number");
  const promote = evaluation.promotion?.decision === "promote";
  const season = evaluation.final_test?.split.season ?? "the test season";
  const tone = gainTone(paired?.gain);
  return <ResearchSection id="answer" icon="target" title="Does a smarter model forecast points better?">
    <div className="fc-answer" data-field="answer" data-decision={evaluation.promotion?.decision ?? ""}>
      <p className="fc-headline" data-field="headline">
        {promote ? "Yes. " : "Not by enough to matter. "}On {season}, a season none of them saw, all {order.length} models missed a player&apos;s points by about <strong data-field="typical-miss" data-low={Math.min(...maes)} data-high={Math.max(...maes)}>{fixed(Math.min(...maes), 1)}</strong>{Math.max(...maes).toFixed(1) !== Math.min(...maes).toFixed(1) ? <> to <strong>{fixed(Math.max(...maes), 1)}</strong></> : null} a game.
      </p>
      {paired && <p className="fc-lead" data-field="answer-gain" data-value={paired.gain.value} data-low={paired.gain.low} data-high={paired.gain.high}>
        {modelName(paired.models[0])} missed by <strong>{fixed(Math.abs(paired.gain.value), 3)}</strong> points a game {paired.gain.value >= 0 ? "less" : "more"} than the {modelName(paired.models[1]).toLowerCase()}, and the 95% interval for that gain runs from <strong>{signed(paired.gain.low, 3)}</strong> to <strong>{signed(paired.gain.high, 3)}</strong>
        {tone ? "." : <>: it can&apos;t be told from zero.</>} {promote ? `${modelName(paired.models[0])} replaces it.` : `The ${modelName(served).toLowerCase()} stays.`}
      </p>}
      {gates && <p className="fc-note" data-field="answer-rule">The rule fixed before the test needed a 5% gain in validation and a test interval wholly above zero; {gates.validation_improvement.passed || gates.final_paired_superiority.passed ? "it met only part of that" : "it got neither"}.</p>}
    </div>
    {paired && <MissStrip unit="points" rows={order.filter(m => metrics[m]).map(m => ({ model: m, mae: metrics[m].mae }))} gain={paired.gain} gainLabel={`${possessive(modelName(paired.models[0]))} gain over the ${modelName(paired.models[1]).toLowerCase()}`} />}
  </ResearchSection>;
}

interface ModelRow { model: string }

function ModelsSection({ evaluation }: { evaluation: PointsForecastEvaluation }) {
  const metrics = evaluation.final_test?.metrics ?? {};
  const intervals = evaluation.final_test?.intervals ?? {};
  const paired = pairedGain(evaluation);
  const served = evaluation.validation?.baseline;
  const phone = usePhone();
  const [view, setView] = useState<"errors" | "ranges">("errors");
  const rows = modelOrder(evaluation).map(model => ({ model }));
  const showErrors = !phone || view === "errors", showRanges = !phone || view === "ranges";
  const columns: GridColumn<ModelRow>[] = [
    ...(showErrors ? [
      { key: "gain", label: "Gain, 95%", title: `Typical miss of the ${served ? modelName(served).toLowerCase() : "served model"} minus this model's, with its 95% interval. Above zero, this model missed by less`, group: "Points a game", width: "md" as const,
        data: (r: ModelRow) => paired && r.model === paired.models[0] ? { field: "gain", value: paired.gain.value, low: paired.gain.low, high: paired.gain.high } : { field: "gain", value: "" },
        cell: (r: ModelRow) => paired && r.model === paired.models[0]
          ? <GridValue text={signed(paired.gain.value, 3)} sub={gainBand(paired.gain)} tone={gainTone(paired.gain)} title={gainTone(paired.gain) ? "95% interval excludes zero" : "95% interval includes zero"} />
          : <GridValue text={r.model === served ? "Served" : "Not paired"} muted /> },
      { key: "mae", label: "Typical miss", title: "Mean absolute error", group: "Points a game", width: "sm" as const, data: (r: ModelRow) => ({ field: "mae", value: metrics[r.model]?.mae ?? "" }), cell: (r: ModelRow) => <GridValue text={fixed(metrics[r.model]?.mae, 3)} /> },
      { key: "rmse", label: "RMSE", title: "Root mean squared error: large misses count for more", group: "Points a game", width: "sm" as const, data: (r: ModelRow) => ({ field: "rmse", value: metrics[r.model]?.rmse ?? "" }), cell: (r: ModelRow) => <GridValue text={fixed(metrics[r.model]?.rmse, 3)} /> },
      { key: "balanced", label: "Per player", title: "Typical miss with every player weighted equally", group: "Points a game", width: "sm" as const, data: (r: ModelRow) => ({ field: "player-balanced", value: metrics[r.model]?.player_balanced_mae ?? "" }), cell: (r: ModelRow) => <GridValue text={fixed(metrics[r.model]?.player_balanced_mae, 3)} /> },
    ] : []),
    ...(showRanges ? [
      { key: "core", label: "10+ games", title: "Share of games inside the 80% range, players with 10 or more games this season", group: "Inside the 80% range", width: "sm" as const, data: (r: ModelRow) => ({ field: "coverage-core", value: intervals[r.model]?.core.coverage ?? "" }), cell: (r: ModelRow) => <GridValue text={pct(intervals[r.model]?.core.coverage)} sub={intervals[r.model] ? `${fixed(intervals[r.model].core.mean_width, 1)} wide` : null} /> },
      { key: "early", label: "1 to 9 games", title: "Share of games inside the 80% range, players with 1 to 9 games this season", group: "Inside the 80% range", width: "sm" as const, data: (r: ModelRow) => ({ field: "coverage-early", value: intervals[r.model]?.early_season.coverage ?? "" }), cell: (r: ModelRow) => <GridValue text={pct(intervals[r.model]?.early_season.coverage)} sub={intervals[r.model] ? `${fixed(intervals[r.model].early_season.mean_width, 1)} wide` : null} /> },
      { key: "rows", label: "Forecasts", group: "Inside the 80% range", width: "sm" as const, data: (r: ModelRow) => ({ field: "rows", value: metrics[r.model]?.forecast_rows ?? "" }), cell: (r: ModelRow) => <GridValue text={whole(metrics[r.model]?.forecast_rows)} /> },
    ] : []),
  ];
  return <ResearchSection id="models" icon="table" title="The three models, side by side">
    <p className="fc-lead">Each model forecast the same {whole(metrics[rows[0]?.model]?.forecast_rows)} player-games. Only the gain of {paired ? modelName(paired.models[0]).toLowerCase() : "the finalist"} over the served model was tested in pairs, so it is the only one with an interval.</p>
    {phone && <Segmented size="sm" label="Model columns" value={view} onChange={setView} options={[{ value: "errors", label: "Misses" }, { value: "ranges", label: "80% ranges" }]} />}
    <StatsGrid<ModelRow> label="Models on the test season" name="models" density="compact" height="auto" leadWidth="lg" className={phone ? "fc-grid fc-models fc-phone" : "fc-grid fc-models"} rows={rows} rowKey={r => r.model}
      rowData={r => ({ model: r.model })} lead={{ label: "Model", cell: r => <ModelLabel model={r.model} /> }} columns={columns} />
  </ResearchSection>;
}

function CoverageSection({ evaluation }: { evaluation: PointsForecastEvaluation }) {
  const intervals = evaluation.final_test?.intervals ?? {};
  const served = evaluation.validation?.baseline ?? modelOrder(evaluation)[0];
  const order = modelOrder(evaluation).filter(m => intervals[m]);
  const rows: CoverageRow[] = order.flatMap(model => [
    { key: `${model}-core`, model, group: "Established players", coverage: intervals[model].core.coverage, width: intervals[model].core.mean_width, rows: intervals[model].core.rows },
    { key: `${model}-early`, model, group: "Early season", coverage: intervals[model].early_season.coverage, width: intervals[model].early_season.mean_width, rows: intervals[model].early_season.rows },
  ]);
  const s = intervals[served];
  return <ResearchSection id="coverage" icon="gauge" title="Are the 80% ranges honest?">
    {s && <p className="fc-lead" data-field="coverage-line">Each forecast comes with a range meant to hold the real total in 8 games of 10. On the test season the {modelName(served).toLowerCase()}&apos;s range held it in <strong data-value={s.core.coverage}>{pct(s.core.coverage)}</strong> of games for established players and <strong data-value={s.early_season.coverage}>{pct(s.early_season.coverage)}</strong> early in the season, and it was about <strong data-value={s.core.mean_width}>{fixed(s.core.mean_width, 1)}</strong> points wide.</p>}
    <p className="fc-note">The range is set from how far forecasts missed in {POINTS_PROTOCOL.splits[3].season}, a season before the test. It is a spread of past misses, not a confidence score, and it says nothing about whether a player will play.</p>
    <CoverageStrip rows={rows} nominal={POINTS_PROTOCOL.thresholds.nominal} unit="points" />
  </ResearchSection>;
}

function gateRows(evaluation: PointsForecastEvaluation): GateRow[] {
  const g = evaluation.promotion?.gates;
  if (!g) return [];
  const t = POINTS_PROTOCOL.thresholds;
  const paired = pairedGain(evaluation);
  const folds = g.validation_improvement.fold_differences;
  return [
    { key: "validation", name: "Validation", needed: `${Math.round(t.validationImprovement * 100)}% lower typical miss pooled, and lower in both folds`,
      observed: `${signed(g.validation_improvement.pooled_relative_improvement * 100, 1)}% pooled; fold 1 ${signed(folds.v1, 3)}, fold 2 ${signed(folds.v2, 3)} points`, passed: g.validation_improvement.passed },
    { key: "final", name: "Final test", needed: "The gain's 95% interval wholly above zero",
      observed: paired ? `${signed(paired.gain.value, 3)} points, ${gainBand(paired.gain)}` : "—", passed: g.final_paired_superiority.passed },
    { key: "slices", name: "Slices", needed: `No slice with enough games more than ${Math.round(t.sliceRegression * 100)}% worse`,
      observed: `${whole(g.supported_slices.supported_count)} slices tested, ${g.supported_slices.regressions_over_limit.length === 0 ? "none" : whole(g.supported_slices.regressions_over_limit.length)} over`, passed: g.supported_slices.passed },
    { key: "intervals", name: "80% ranges", needed: `Coverage at least ${Math.round(t.coverage * 100)}%, width at most ${Math.round(t.widthRatio * 100)}% of the served model's`,
      observed: `${pct(g.interval_guardrails.challenger_coverage)} coverage, width ${pct(g.interval_guardrails.width_ratio)}`, passed: g.interval_guardrails.passed },
  ];
}

function GatesSection({ evaluation }: { evaluation: PointsForecastEvaluation }) {
  const rows = gateRows(evaluation);
  if (!rows.length) return null;
  const passed = rows.filter(r => r.passed).length;
  const finalist = evaluation.validation?.challenger_finalist;
  const served = evaluation.validation?.baseline;
  return <ResearchSection id="gates" icon="shield" title="The rule fixed before the test">
    <p className="fc-lead" data-field="gates-line" data-passed={passed}>A new model replaces the served one only if it clears all four. {finalist ? modelName(finalist) : "The finalist"} cleared {passed} of {rows.length}, so {evaluation.promotion?.decision === "promote" ? "it was promoted" : `the ${served ? modelName(served).toLowerCase() : "served model"} stays`}.</p>
    <GatesGrid rows={rows} label="Promotion rules" />
  </ResearchSection>;
}

interface SliceRow { key: string; models: Record<string, { mae: number; forecast_rows: number }> }

function SlicesSection({ evaluation }: { evaluation: PointsForecastEvaluation }) {
  const { get, set } = useUrlState();
  const slices = evaluation.final_test?.prespecified_slices ?? {};
  const dimensions = orderedDimensions(Object.keys(slices));
  const dimension = dimensions.includes(get("slice") ?? "") ? get("slice")! : dimensions[0];
  const phone = usePhone();
  const [view, setView] = useState<"misses" | "change">("misses");
  const served = evaluation.validation?.baseline ?? "";
  const finalist = evaluation.validation?.challenger_finalist ?? "";
  if (!dimension) return null;
  const groups = slices[dimension] ?? {};
  const models = modelOrder(evaluation).filter(m => Object.values(groups).some(g => g[m]));
  const rows: SliceRow[] = orderedSubgroups(dimension, Object.keys(groups)).map(key => ({ key, models: groups[key] }));
  const total = evaluation.final_test?.metrics[served]?.forecast_rows;
  const opponent = slices.opponent_context_slice;
  const allMissing = opponent && Object.keys(opponent).length === 1 && opponent.missing?.[served]?.forecast_rows === total;
  const change = (r: SliceRow) => r.models[finalist] && r.models[served] ? r.models[finalist].mae - r.models[served].mae : null;
  const pattern = slicePattern(rows.map(r => ({ key: r.key, change: change(r) })));
  const columns: GridColumn<SliceRow>[] = [
    ...(!phone || view === "misses" ? models.map(m => ({ key: m, label: modelName(m), group: "Typical miss, points", width: "sm" as const,
      data: (r: SliceRow) => ({ field: `mae-${m}`, value: r.models[m]?.mae ?? "" }), cell: (r: SliceRow) => <GridValue text={fixed(r.models[m]?.mae, 3)} /> })) : []),
    ...(!phone || view === "change" ? [
      { key: "change", label: "Change", title: `${possessive(modelName(finalist))} typical miss minus the ${modelName(served).toLowerCase()}'s. Below zero, it missed by less. No interval is served for a slice`, group: "Trees against the blend", width: "sm" as const,
        data: (r: SliceRow) => ({ field: "change", value: change(r) ?? "" }), cell: (r: SliceRow) => <GridValue text={signed(change(r), 3)} /> },
      { key: "rows", label: "Forecasts", group: "Trees against the blend", width: "sm" as const, data: (r: SliceRow) => ({ field: "rows", value: r.models[served]?.forecast_rows ?? "" }), cell: (r: SliceRow) => <GridValue text={whole(r.models[served]?.forecast_rows)} /> },
    ] : []),
  ];
  return <ResearchSection id="slices" icon="layers" title={`Where the misses differ: ${dimensionLabel(dimension).toLowerCase()}`}
    aside={<SliceSelect dimensions={dimensions} value={dimension} onChange={key => set({ slice: key === dimensions[0] ? null : key })} />}>
    <p className="fc-lead">Every forecast in the test, split {dimensions.length} ways chosen before it opened. Players who play more score more, so their misses are larger in points.</p>
    <p className="fc-note">Change is {modelName(finalist).toLowerCase()} minus the {modelName(served).toLowerCase()}; below zero, the trees missed by less.{pattern ? "" : " No interval is served for a slice, so no change is coloured."}</p>
    {pattern && <p className="fc-lead" data-field="slice-pattern" data-best={pattern.best.key} data-worst={pattern.worst.key}>
      {pattern.allBetter ? <>The trees missed by less in every group here, most at <strong>{subgroupLabel(dimension, pattern.best.key).toLowerCase()}</strong> ({signed(pattern.best.change, 3)} points).</>
        : pattern.allWorse ? <>The trees missed by more in every group here, most at <strong>{subgroupLabel(dimension, pattern.worst.key).toLowerCase()}</strong> ({signed(pattern.worst.change, 3)} points).</>
          : <>The trees did best at <strong>{subgroupLabel(dimension, pattern.best.key).toLowerCase()}</strong> ({signed(pattern.best.change, 3)} points) and worst at <strong>{subgroupLabel(dimension, pattern.worst.key).toLowerCase()}</strong> ({signed(pattern.worst.change, 3)}).</>}
      {" "}No interval is served for a slice, so this is a pattern, not a result, and nothing is coloured.
    </p>}
    {allMissing && <p className="fc-note" data-field="opponent-missing">Opponent data were missing for all {whole(total)} test forecasts, so the context model&apos;s opponent inputs were empty throughout.</p>}
    {phone && <Segmented size="sm" label="Slice columns" value={view} onChange={setView} options={[{ value: "misses", label: "Misses" }, { value: "change", label: "Change" }]} />}
    <StatsGrid<SliceRow> label={`Test forecasts by ${dimensionLabel(dimension).toLowerCase()}`} name="slices" density="compact" height="auto" leadWidth="md" className={phone ? "fc-grid fc-slices fc-phone" : "fc-grid fc-slices"} rows={rows} rowKey={r => r.key}
      rowData={r => ({ dimension, subgroup: r.key })} lead={{ label: dimensionLabel(dimension), cell: r => <span className="fc-name">{subgroupLabel(dimension, r.key)}</span> }} columns={columns} />
  </ResearchSection>;
}

// ---- The issuance ledger ------------------------------------------------------------------------------------------------

function LedgerGrid({ items, phone }: { items: readonly ForecastIssuanceItem[]; phone: boolean }) {
  const [view, setView] = useState<"forecast" | "result" | "basis">("forecast");
  const right = Math.max(10, Math.ceil(Math.max(...items.map(i => i.interval_upper)) / 10) * 10);
  const at = (value: number) => `${Math.max(0, Math.min(1, value / right)) * 100}%`;
  const showForecast = !phone || view === "forecast", showResult = !phone || view === "result", showBasis = !phone || view === "basis";
  const columns: GridColumn<ForecastIssuanceItem>[] = [
    ...(showForecast ? [
      { key: "game", label: "Game", group: "Forecast", width: "md" as const, align: "left" as const, data: (i: ForecastIssuanceItem) => ({ field: "game", value: i.target_game_date, opponent: i.target_opponent_tricode }),
        cell: (i: ForecastIssuanceItem) => <span className="fc-game"><span>{formatDate(i.target_game_date)}</span><span className="fc-team" data-team={i.target_opponent_tricode}>vs <TeamLogo team={i.target_opponent_tricode} season={seasonOf(i.target_game_date)} size={16} />{i.target_opponent_tricode}</span></span> },
      { key: "estimate", label: "Points, 80% range", title: "The forecast and its 80% range, drawn on one scale for every row", group: "Forecast", width: "fill" as const,
        headerAfter: <span className="fc-ledger-scale" aria-hidden="true" data-field="ledger-axis" data-right={right}><span data-end="left">0</span><span data-end="right">{right}</span></span>,
        data: (i: ForecastIssuanceItem) => ({ field: "estimate", value: i.point_estimate, low: i.interval_lower, high: i.interval_upper }),
        cell: (i: ForecastIssuanceItem) => <span className="fc-ledger-estimate">
          <span className="fc-ledger-value"><GridValue text={fixed(i.point_estimate, 1)} sub={`${fixed(i.interval_lower, 1)} to ${fixed(i.interval_upper, 1)}`} /></span>
          <span className="fc-range" aria-hidden="true">
            <span className="fc-range-span" style={vars({ "--fc-low": at(i.interval_lower), "--fc-high": at(i.interval_upper) })} />
            <span className="fc-range-dot" style={vars({ "--fc-at": at(i.point_estimate) })} />
            {i.latest_score?.observed_points != null && <span className="fc-range-actual" style={vars({ "--fc-at": at(i.latest_score.observed_points) })} />}
          </span>
        </span> },
    ] : []),
    ...(showResult ? [
      { key: "actual", label: "Scored", group: "Result", width: "md" as const, data: (i: ForecastIssuanceItem) => ({ field: "actual", outcome: outcomeOf(i), value: i.latest_score?.observed_points ?? "" }),
        cell: (i: ForecastIssuanceItem) => outcomeOf(i) === "scored" ? <GridValue text={String(i.latest_score?.observed_points)} /> : <GridValue text={OUTCOME_TEXT[outcomeOf(i)]} muted /> },
      { key: "miss", label: "Miss", group: "Result", width: "sm" as const, data: (i: ForecastIssuanceItem) => ({ field: "miss", value: i.latest_score?.absolute_error ?? "", hit: i.latest_score?.interval_hit == null ? "" : String(i.latest_score.interval_hit) }),
        cell: (i: ForecastIssuanceItem) => i.latest_score?.absolute_error == null ? <GridValue text={null} /> : <GridValue text={fixed(i.latest_score.absolute_error, 1)} sub={i.latest_score.interval_hit ? "Inside the range" : "Outside the range"} /> },
    ] : []),
    ...(showBasis ? [
      { key: "basis", label: "Basis", title: "What the forecast was built from", group: "Result", width: "lg" as const, align: "left" as const, data: (i: ForecastIssuanceItem) => ({ field: "basis", value: i.availability_reason ?? "" }),
        cell: (i: ForecastIssuanceItem) => <span className="fc-cell-text">{eligibilityText(i.availability_reason)}</span> },
    ] : []),
  ];
  return <>
    {phone && <Segmented size="sm" label="Ledger columns" value={view} onChange={setView} options={[{ value: "forecast", label: "Forecast" }, { value: "result", label: "Result" }, { value: "basis", label: "Basis" }]} />}
    <StatsGrid<ForecastIssuanceItem> label="Issued forecasts" name="ledger" density="compact" height="auto" leadWidth="lg" className={phone ? "fc-grid fc-ledger fc-phone" : "fc-grid fc-ledger"} rows={items} rowKey={i => i.id}
      rowData={i => ({ id: i.id, player: i.player_id, timing: issueTiming(i) })}
      lead={{ label: "Player", cell: i => { const season = seasonOf(i.target_game_date); return <GridPlayer playerId={i.player_id} name={i.player_name} team={i.team_tricode} season={season} era={seasonEra(season, i.team_tricode)} subtitle={i.team_tricode} href={`/players/${i.player_id}?season=${season}`} />; } }}
      columns={columns} />
    <ul className="fc-key">
      <li><span className="fc-key-mark" data-mark="dot" aria-hidden="true" />Forecast</li>
      <li><span className="fc-key-mark" data-mark="range" aria-hidden="true" />80% range</li>
      <li><span className="fc-key-mark" data-mark="actual" aria-hidden="true" />Points scored</li>
    </ul>
  </>;
}

function LedgerSection({ ledger, evaluation }: { ledger: ForecastsListResponse; evaluation: PointsForecastEvaluation }) {
  const phone = usePhone();
  const items = ledger.items;
  const s = ledger.summary;
  const counts = timingCounts(items);
  const span = ledgerSpan(items);
  const backDated = items.length > 0 && counts.after === items.length;
  const inTest = insideSplit(span.games, evaluation.final_test?.split);
  const shown = items.length < ledger.total_items ? `The ${whole(items.length)} newest of ${whole(ledger.total_items)}` : `All ${whole(items.length)}`;
  const totals = <p className="fc-note" data-field="ledger-totals" data-issued={s.total_issued} data-scored={s.total_scored} data-unscored={s.total_unscored_dnp} data-pending={s.total_pending}>
    {whole(s.total_issued)} issued: {whole(s.total_scored)} scored, {whole(s.total_unscored_dnp)} where the player did not play or was not in the box score (unknown, not zero){s.total_pending ? `, ${whole(s.total_pending)} waiting for the game` : ""}{s.total_unscored_cancelled ? `, ${whole(s.total_unscored_cancelled)} cancelled` : ""}.
  </p>;
  if (!items.length) return <ResearchSection id="ledger" icon="list-ordered" title="Forecasts issued so far">
    <p className="fc-lead" data-field="ledger-line">No forecast has been issued yet. Forecasts are logged before tipoff and scored once the box score is final.</p>
  </ResearchSection>;
  if (backDated) return <ResearchSection id="ledger" icon="list-ordered" title="Forecasts issued so far">
    <p className="fc-lead" data-field="ledger-line" data-timing="after" data-newest={span.games?.[1] ?? ""}>
      None yet for a game still to come. The newest of the {whole(ledger.total_items)} on record is for a game on <strong>{formatDate(span.games?.[1])}</strong>. The {whole(items.length)} newest were issued on <strong>{formatDate(span.issued?.[0])}</strong>{span.issued && span.issued[0] !== span.issued[1] ? ` to ${formatDate(span.issued[1])}` : ""}, after their games{inTest ? ", which fall inside the test season" : ""}: a back-dated test of the issuing and scoring steps, not forecasts made before the games.
    </p>
    <details className="fc-ledger-list" id="ledger-list">
      <ButtonSummary size="sm" variant="ghost" iconAfter="chevron-down">{items.length < ledger.total_items ? `Show the ${whole(items.length)} newest of ${whole(ledger.total_items)} forecasts` : `Show all ${whole(items.length)} forecasts`}</ButtonSummary>
      <div className="fc-ledger-body">
      {totals}
      {s.accuracy_metrics?.mae != null && <p className="fc-note" data-field="ledger-accuracy" data-mae={s.accuracy_metrics.mae} data-coverage={s.accuracy_metrics.interval_coverage ?? ""}>Their typical miss was {fixed(s.accuracy_metrics.mae)} points and {pct(s.accuracy_metrics.interval_coverage)} landed inside the range. {inTest ? "These games are part of the test above, so this is not new evidence." : "Too few games to judge the model."}</p>}
      <LedgerGrid items={items} phone={phone} />
      </div>
    </details>
  </ResearchSection>;
  return <ResearchSection id="ledger" icon="list-ordered" title="Forecasts issued so far">
    <p className="fc-lead" data-field="ledger-line" data-timing={counts.after ? "mixed" : "before"}>
      Each forecast is logged before tipoff with the served model and scored once the box score is final. {shown} are below{counts.after ? `; ${whole(counts.after)} of them were issued after their game, as a back-dated test, and are not forecasts made before the games` : ""}.
    </p>
    {totals}
    <LedgerGrid items={items} phone={phone} />
  </ResearchSection>;
}

// ---- Reading and About -------------------------------------------------------------------------------------------------

const GLOSSARY: GlossaryGroup[] = [
  { label: "Errors", icon: "target", items: [
    { term: "Typical miss", text: "Mean absolute error: how far a forecast lands from the points scored, on average, in points." },
    { term: "RMSE", text: "Root mean squared error, in points. Large misses count for more than in the typical miss." },
    { term: "Per player", text: "The typical miss with every player weighted equally, so heavy-minute players don't dominate." },
    { term: "Gain", text: "One model's typical miss minus another's on the same games. Above zero, the model named first missed by less." },
    { term: "95% interval", text: "From 1,000 resamples of week-long blocks of game days, so games played close together stay together." },
  ] },
  { label: "Ranges and rules", icon: "shield", items: [
    { term: "80% range", text: "Forecast plus or minus the size of miss that 80% of forecasts stayed within in the calibration season." },
    { term: "Coverage", text: "The share of test games whose points landed inside the range. The target is 80%." },
    { term: "Established", text: "A player with 10 or more games this season. Early season is 1 to 9 games, with last season's average filling in." },
    { term: "Out of time", text: "Every model is fitted and tuned on earlier seasons only, then scored once on a season it never saw." },
    { term: "Promotion", text: "Replacing the served model. It needs all four rules fixed before the test opened." },
  ] },
];

export function Reading({ glossary = GLOSSARY }: { glossary?: GlossaryGroup[] }) {
  return <>
    <ResearchSection id="reading" icon="book" title="How to read">
      <ResearchCards columns={3}>
        <ResearchCard kicker="Typical miss"><p className="fc-card-text">How far off a forecast lands, in the units forecast. Lower is better. A difference of a few hundredths is no practical difference.</p></ResearchCard>
        <ResearchCard kicker="Range"><p className="fc-card-text">The 80% range should hold the real total in 8 games of 10. It describes past misses for a player who plays; it never says whether a player will.</p></ResearchCard>
        <ResearchCard kicker="Colour"><p className="fc-card-text">Green or red only where a gain&apos;s 95% interval is wholly on one side of zero. Everything else stays neutral.</p></ResearchCard>
      </ResearchCards>
    </ResearchSection>
    <ResearchDisclosure id="glossary" icon="list-ordered" title="Terms, defined"><Glossary groups={glossary} /></ResearchDisclosure>
  </>;
}

interface SplitRow { key: string; role: string; season: string; start: string; end: string }
export function SplitsGrid({ splits }: { splits: readonly SplitRow[] }) {
  // On a phone the season goes under the step's name and the dates keep the one column (RD13: no sideways scroll).
  const phone = usePhone();
  return <StatsGrid<SplitRow> label="Chronological splits" name="splits" density="compact" height="auto" leadWidth="md" className={phone ? "fc-grid fc-wrap fc-splits fc-phone" : "fc-grid fc-wrap fc-splits"} rows={splits} rowKey={s => s.key}
    lead={{ label: "Step", cell: s => <><span className="fc-name">{s.role}</span>{phone && <span className="fc-name-sub">{s.season}</span>}</> }}
    columns={[
      ...(phone ? [] : [{ key: "season", label: "Season", width: "md" as const, data: (s: SplitRow) => ({ field: "season", value: s.season }), cell: (s: SplitRow) => <GridValue text={s.season} /> }]),
      { key: "dates", label: "Dates", width: "lg", data: s => ({ field: "dates", start: s.start, end: s.end }), cell: s => phone ? <GridValue text={formatDate(s.start)} sub={`to ${formatDate(s.end)}`} /> : <GridValue text={`${formatDate(s.start)} to ${formatDate(s.end)}`} /> },
    ]} />;
}

function About({ evaluation }: { evaluation: PointsForecastEvaluation }) {
  const policy = evaluation.active_policy;
  const c = evaluation.final_test?.counts ?? {};
  const served = evaluation.validation?.baseline ?? "";
  const cal = evaluation.calibration?.[served];
  return <ResearchDisclosure id="about" icon="info" title="About this page">
    <MethodBlock title="Method">
      <dl className="fc-defs">
        <dt>Target</dt><dd>Points in a player&apos;s next team game within six days, given that the player plays. Whether a player plays is not forecast.</dd>
        <dt>Models</dt><dd data-field="about-models">{modelOrder(evaluation).map(m => `${modelName(m)} (${m})`).join(", ")}. The prior blend is a weighted average of recent games (20 games, half-life 5); with fewer than 10 games this season it is blended with last season&apos;s average, weighted as 10 games. The trees are histogram gradient boosting on the player&apos;s recent and last-season scoring, minutes and shots; the context version adds home, team rest, back-to-backs and the opponent&apos;s recent points allowed.</dd>
        <dt>Selection</dt><dd>The served model was chosen among three simple averages on two validation folds; the trees&apos; settings were tuned on the same folds{evaluation.validation?.selected_configs ? ` (chosen: ${Object.entries(evaluation.validation.selected_configs).map(([k, v]) => `${modelName(k)} ${v}`).join("; ")})` : ""}.</dd>
        <dt>Ranges</dt><dd data-field="about-calibration">{cal ? `The ${modelName(served).toLowerCase()}'s 80% range is the forecast ± ${fixed(cal.core.absolute_residual_quantile, 2)} points for established players and ± ${fixed(cal.early_season.absolute_residual_quantile, 2)} early in the season, from ${whole(cal.core.rows)} and ${whole(cal.early_season.rows)} calibration-season forecasts.` : "Set from the calibration season's misses."}</dd>
        <dt>The test</dt><dd data-field="about-counts">{whole(c.potential_player_cutoffs)} player-dates were considered; {whole(c.candidate_rows)} had a next game in range and enough history, and {whole(c.label_scored)} of those were played and scored. {whole(c.label_explicit_nonappearance)} were recorded non-appearances and {whole(c.label_unmatched_or_unknown)} unknown; none counts as zero.</dd>
        <dt>Limits</dt><dd>{(evaluation.limitations ?? []).map(l => <span key={l} className="fc-limit">{l} </span>)}</dd>
        <dt>Fixed in advance</dt><dd>Protocol frozen on {formatDate(POINTS_PROTOCOL.frozenOn)}, before the test season was opened.{policy ? ` Served as ${policy.policy_name} from ${formatDate(policy.activated_at.slice(0, 10))}.` : ""}</dd>
        <dt>Identifiers</dt><dd>Run <code data-field="run-id">{evaluation.run_id}</code>{policy ? <> · calibration <code>{policy.calibration_identity}</code></> : null}.</dd>
      </dl>
    </MethodBlock>
    <MethodBlock title="Splits"><SplitsGrid splits={POINTS_PROTOCOL.splits} /></MethodBlock>
    {evaluation.model_card_markdown && <MethodBlock title="Model card, as served"><pre className="fc-document" data-field="model-card">{evaluation.model_card_markdown}</pre></MethodBlock>}
  </ResearchDisclosure>;
}

export function PointsForecastsResearch() {
  const { data: evaluation, error, loading, retry } = useFeed([], () => getPointsForecastEvaluation());
  const { data: ledger, error: ledgerError, retry: ledgerRetry } = useFeed(["ledger"], () => getProspectiveForecasts({ pageSize: 50 }));
  const metrics = evaluation?.final_test?.metrics;
  const served = evaluation?.validation?.baseline;
  const m = served ? metrics?.[served] : undefined;
  return <ForecastsFrame intro={<ResearchIntro
    tagline={evaluation && m ? <MetaLine items={[`${whole(m.forecast_rows)} test forecasts`, `${whole(m.players)} players`, `${evaluation.final_test?.split.season ?? ""} season`, `fixed ${formatDate(POINTS_PROTOCOL.frozenOn)}, before the test`]} /> : null}
    links={[{ label: "How CourtLens tests models", href: "/methodology", icon: "book" }]} />}>
    {error && <FeedFailure error={error} retry={retry} what="Points Forecasts" />}
    {loading && <FeedSkeleton label="Loading Points Forecasts" />}
    {evaluation && !evaluation.available && <GatedNote>{evaluation.message ?? "No points experiment has been evaluated yet."}</GatedNote>}
    {evaluation?.available && <>
      <Answer evaluation={evaluation} />
      <ModelsSection evaluation={evaluation} />
      <CoverageSection evaluation={evaluation} />
      <GatesSection evaluation={evaluation} />
      <SelectionDisclosure rows={pointsSelectionRows((evaluation.validation as { validation_results?: PointsValidationResults } | null | undefined)?.validation_results)}
        folds={[`to ${formatDate(POINTS_PROTOCOL.splits[1].end)}`, `from ${formatDate(POINTS_PROTOCOL.splits[2].start)}`]} unit="points" />
      <SlicesSection evaluation={evaluation} />
      {ledgerError && <FeedFailure error={ledgerError} retry={ledgerRetry} what="The forecast ledger" />}
      {ledger && <LedgerSection ledger={ledger} evaluation={evaluation} />}
      <ArchiveLink />
      <Reading />
      <About evaluation={evaluation} />
    </>}
  </ForecastsFrame>;
}

function ArchiveLink() {
  return <ResearchSection id="archive" icon="history" title="An earlier experiment">
    <p className="fc-lead">Before this one, CourtLens tested the same kind of models on a box-score total instead of points, with 2023-24 as the test season. The simple average stayed there too.</p>
    <div className="fc-actions"><ButtonLink size="sm" variant="secondary" href="/evaluation" iconAfter="arrow-right">Evaluation Archive</ButtonLink></div>
  </ResearchSection>;
}

