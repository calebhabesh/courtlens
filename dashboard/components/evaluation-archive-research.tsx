"use client";

import { useState } from "react";
import { MethodBlock, ResearchDisclosure, ResearchIntro, ResearchLinks, ResearchSection, type GlossaryGroup } from "./research/research-page";
import { GridValue, StatsGrid, type GridColumn } from "./research/stats-grid";
import { FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { GatedNote } from "./ui/gated-note";
import { ButtonLink, Segmented } from "./ui/kit";
import {
  CoverageStrip, ForecastsFrame, GatesGrid, MetaLine, MissStrip, ModelLabel, possessive, Reading, SelectionDisclosure, SliceSelect, SplitsGrid, usePhone, type CoverageRow, type GateRow,
} from "./points-forecasts-research";
import { browserApi, getAnalyticsEvaluation } from "@/lib/api";
import { formatDate } from "@/lib/format-date";
import {
  ARCHIVE_PROTOCOL, archiveDecision, archiveSelectionRows, archiveGates, archiveSlices, archiveValidation, dimensionLabel, estimandModels, fixed, gainBand, gainFromDifference, gainTone,
  modelName, orderedDimensions, orderedSubgroups, pct, selectedValidationMae, subgroupLabel, visitorText, whole, type ArchiveSliceMetric, type Gain,
} from "@/lib/points-forecasts";
import { evidenceUrl } from "@/lib/research-facts";
import { signed } from "@/lib/research-values";
import type { AnalyticsEvaluation } from "@/lib/types";

/**
 * Research → Points Forecasts → Evaluation Archive (workbench M6, designed in RD16). The frozen reference-points experiment, final test 2023-24,
 * served by `/api/analytics/evaluations?archive=true`. Its paired 95% interval excludes zero, so that gain takes red. Today's database builds are
 * not part of the experiment and are not shown (RD16 Q3).
 */

const UNIT = "reference points";

function archiveGain(report: AnalyticsEvaluation): { gain: Gain; models: [string, string] } | null {
  const g = archiveGates(report).final_paired_superiority;
  const u = report.final_test.paired_uncertainty as { lower: number; upper: number; estimand?: string };
  const models = estimandModels(g?.estimand ?? u.estimand);
  const finalist = archiveValidation(report).challenger_finalist, baseline = report.serving_policy.historical_s3_primary;
  const pair = models ?? (finalist && baseline ? [finalist, baseline] as [string, string] : null);
  const a = pair ? report.final_test.metrics[pair[0]] : undefined, b = pair ? report.final_test.metrics[pair[1]] : undefined;
  const difference = g?.mae_difference ?? (a && b ? a.mae - b.mae : null);
  if (!pair || difference == null) return null;
  return { gain: gainFromDifference(difference, u.lower, u.upper), models: pair };
}

const ORDER = (report: AnalyticsEvaluation) => {
  const keys = Object.keys(report.final_test.metrics);
  const first = [report.serving_policy.historical_s3_primary, archiveValidation(report).challenger_finalist].filter((k): k is string => Boolean(k && keys.includes(k)));
  return [...first, ...keys.filter(k => !first.includes(k))];
};

function Answer({ report }: { report: AnalyticsEvaluation }) {
  const paired = archiveGain(report);
  const served = report.serving_policy.historical_s3_primary;
  const order = ORDER(report);
  const tone = gainTone(paired?.gain);
  const test = ARCHIVE_PROTOCOL.splits.at(-1)!;
  return <ResearchSection id="answer" icon="target" title="Did adding context beat a simple average?">
    <div className="fc-answer" data-field="answer" data-decision={archiveDecision(report) ?? ""}>
      {paired && <p className="fc-headline" data-field="headline" data-value={paired.gain.value} data-low={paired.gain.low} data-high={paired.gain.high}>
        {paired.gain.value < 0 ? "No. " : "Yes. "}On {test.season}, a season none of them saw, the {modelName(paired.models[0]).toLowerCase()} missed by <strong>{fixed(Math.abs(paired.gain.value), 2)}</strong> {UNIT} a game {paired.gain.value < 0 ? "more" : "less"} than {modelName(paired.models[1])}, a weighted average of the last 20 games {tone
          ? <>(95% interval <strong>{fixed(Math.min(Math.abs(paired.gain.low), Math.abs(paired.gain.high)), 2)}</strong> to <strong>{fixed(Math.max(Math.abs(paired.gain.low), Math.abs(paired.gain.high)), 2)}</strong> {paired.gain.value < 0 ? "more" : "less"}, so the gap is real)</>
          : <>(95% interval <strong>{signed(paired.gain.low, 2)}</strong> to <strong>{signed(paired.gain.high, 2)}</strong>, which includes zero)</>}.
      </p>}
      <p className="fc-lead" data-field="answer-served">{report.serving_policy.challenger_is_serving ? "The challenger was promoted." : `No challenger was promoted, and ${modelName(served)} stayed the replay estimator.`}</p>
      <p className="fc-note" data-field="target">This experiment forecast reference points, a box-score total ({ARCHIVE_PROTOCOL.target}), not points. Its numbers can&apos;t be compared with the points test.</p>
    </div>
    {paired && <MissStrip unit={UNIT} rows={order.map(m => ({ model: m, mae: report.final_test.metrics[m].mae }))} gain={paired.gain} gainLabel={`${possessive(modelName(paired.models[0]))} gain over ${modelName(paired.models[1])}`} />}
  </ResearchSection>;
}

interface ModelRow { model: string }

function ModelsSection({ report }: { report: AnalyticsEvaluation }) {
  const paired = archiveGain(report);
  const served = report.serving_policy.historical_s3_primary;
  const validation = archiveValidation(report);
  const metrics = report.final_test.metrics as Record<string, { forecast_rows: number; mae: number; rmse: number; player_balanced_mae?: number }>;
  const intervals = report.final_test.intervals;
  const phone = usePhone();
  const [view, setView] = useState<"errors" | "ranges">("errors");
  const valMae = (m: string) => m === validation.baseline ? validation.baseline_validation?.pooled?.mae ?? null : selectedValidationMae(validation, m);
  const showErrors = !phone || view === "errors", showRanges = !phone || view === "ranges";
  // On a phone the validation error joins the ranges view, so each view has three columns and nothing scrolls sideways (RD13).
  const validationColumn: GridColumn<ModelRow> = { key: "validation", label: "Validation", title: "Typical miss on the two validation folds pooled, before the test opened", group: phone ? "Before and after" : "Reference points a game", width: "sm",
    data: r => ({ field: "validation", value: valMae(r.model) ?? "" }), cell: r => <GridValue text={fixed(valMae(r.model), 3)} /> };
  const columns: GridColumn<ModelRow>[] = [
    ...(showErrors ? [
      { key: "gain", label: "Gain, 95%", title: `${possessive(modelName(served))} typical miss minus this model's. Above zero, this model missed by less`, group: "Reference points a game", width: "md" as const,
        data: (r: ModelRow) => paired && r.model === paired.models[0] ? { field: "gain", value: paired.gain.value, low: paired.gain.low, high: paired.gain.high } : { field: "gain", value: "" },
        cell: (r: ModelRow) => paired && r.model === paired.models[0]
          ? <GridValue text={signed(paired.gain.value, 3)} sub={gainBand(paired.gain)} tone={gainTone(paired.gain)} title={gainTone(paired.gain) ? "95% interval excludes zero" : "95% interval includes zero"} />
          : <GridValue text={r.model === served ? "Served" : "Not paired"} muted /> },
      { key: "mae", label: "Typical miss", group: "Reference points a game", width: "sm" as const, data: (r: ModelRow) => ({ field: "mae", value: metrics[r.model]?.mae ?? "" }), cell: (r: ModelRow) => <GridValue text={fixed(metrics[r.model]?.mae, 3)} /> },
      { key: "rmse", label: "RMSE", group: "Reference points a game", width: "sm" as const, data: (r: ModelRow) => ({ field: "rmse", value: metrics[r.model]?.rmse ?? "" }), cell: (r: ModelRow) => <GridValue text={fixed(metrics[r.model]?.rmse, 3)} /> },
      ...(phone ? [] : [validationColumn]),
    ] : []),
    ...(showRanges ? [
      ...(phone ? [validationColumn] : []),
      { key: "coverage", label: "Inside 80%", group: phone ? "Before and after" : "80% range", width: "sm" as const, data: (r: ModelRow) => ({ field: "coverage", value: intervals[r.model]?.coverage ?? "" }), cell: (r: ModelRow) => <GridValue text={intervals[r.model]?.coverage == null ? null : pct(intervals[r.model].coverage)} /> },
      { key: "width", label: "Width", group: phone ? "Before and after" : "80% range", width: "sm" as const, data: (r: ModelRow) => ({ field: "width", value: intervals[r.model]?.mean_width ?? "" }), cell: (r: ModelRow) => <GridValue text={intervals[r.model]?.mean_width == null ? null : fixed(intervals[r.model].mean_width, 1)} /> },
      ...(phone ? [] : [{ key: "rows", label: "Forecasts", group: "80% range", width: "sm" as const, data: (r: ModelRow) => ({ field: "rows", value: metrics[r.model]?.forecast_rows ?? "" }), cell: (r: ModelRow) => <GridValue text={whole(metrics[r.model]?.forecast_rows)} /> }]),
    ] : []),
  ];
  return <ResearchSection id="models" icon="table" title="The three models, side by side">
    <p className="fc-lead">Every model forecast the same {whole(metrics[served]?.forecast_rows)} player-games. Validation is the error each had on the two folds used to choose them, before the test opened.</p>
    {phone && <Segmented size="sm" label="Model columns" value={view} onChange={setView} options={[{ value: "errors", label: "Misses" }, { value: "ranges", label: "Validation, ranges" }]} />}
    <StatsGrid<ModelRow> label="Models on the archive test" name="models" density="compact" height="auto" leadWidth="lg" className={phone ? "fc-grid fc-models fc-phone" : "fc-grid fc-models"} rows={ORDER(report).map(model => ({ model }))} rowKey={r => r.model}
      rowData={r => ({ model: r.model })} lead={{ label: "Model", cell: r => <ModelLabel model={r.model} /> }} columns={columns} />
  </ResearchSection>;
}

function CoverageSection({ report }: { report: AnalyticsEvaluation }) {
  const rows: CoverageRow[] = ORDER(report).filter(m => report.final_test.intervals[m]).map(m => ({ key: m, model: m, coverage: report.final_test.intervals[m].coverage, width: report.final_test.intervals[m].mean_width, rows: report.final_test.intervals[m].rows }));
  const shares = rows.map(r => r.coverage).filter((v): v is number => v != null);
  return <ResearchSection id="coverage" icon="gauge" title="Did the 80% ranges hold?">
    {shares.length > 0 && <p className="fc-lead" data-field="coverage-line" data-low={Math.min(...shares)} data-high={Math.max(...shares)}>The ranges held the real total in <strong>{pct(Math.min(...shares))}</strong>{shares.length > 1 ? <> to <strong>{pct(Math.max(...shares))}</strong></> : null} of games, against a target of 80%. They are about <strong>{fixed(rows[0]?.width, 0)}</strong> {UNIT} wide, because a box-score total moves more than points alone.</p>}
    <CoverageStrip rows={rows} nominal={0.8} unit={UNIT} />
  </ResearchSection>;
}

function gateRows(report: AnalyticsEvaluation): GateRow[] {
  const g = archiveGates(report);
  const paired = archiveGain(report);
  const folds = g.validation_improvement?.fold_absolute_improvements;
  const over = g.supported_slices?.regressions_over_limit ?? [];
  const rows: GateRow[] = [];
  if (g.validation_improvement) rows.push({ key: "validation", name: "Validation", needed: "A lower typical miss than the served model by a set margin, pooled and in both folds",
    observed: [g.validation_improvement.pooled_relative_improvement != null ? `${signed(g.validation_improvement.pooled_relative_improvement * 100, 1)}% pooled` : null, folds ? `folds ${Object.values(folds).map(v => signed(v, 3)).join(" and ")} reference points` : null].filter(Boolean).join("; ") || "—", passed: g.validation_improvement.passed });
  if (g.final_paired_superiority) rows.push({ key: "final", name: "Final test", needed: "The gain's 95% interval wholly above zero", observed: paired ? `${signed(paired.gain.value, 3)}, ${gainBand(paired.gain)}` : "—", passed: g.final_paired_superiority.passed });
  if (g.supported_slices) rows.push({ key: "slices", name: "Slices", needed: "No slice with enough games more than the set limit worse",
    observed: over.length ? over.map(o => `${dimensionLabel(o.dimension)} ${subgroupLabel(o.dimension, o.value).toLowerCase()}: ${(o.relative_mae_regression * 100).toFixed(1)}% worse`).join("; ") : `${whole(g.supported_slices.supported?.length)} slices tested, none over`, passed: g.supported_slices.passed });
  if (g.interval_guardrails) rows.push({ key: "intervals", name: "80% ranges", needed: "Coverage and width within set limits of the served model's",
    observed: g.interval_guardrails.challenger_coverage != null ? `${pct(g.interval_guardrails.challenger_coverage)} coverage, width ${pct(g.interval_guardrails.width_ratio)}` : "—", passed: g.interval_guardrails.passed });
  return rows;
}

function GatesSection({ report }: { report: AnalyticsEvaluation }) {
  const rows = gateRows(report);
  if (!rows.length) return null;
  const passed = rows.filter(r => r.passed).length;
  return <ResearchSection id="gates" icon="shield" title="The rule fixed before the test">
    <p className="fc-lead" data-field="gates-line" data-passed={passed}>A challenger needed all four. It cleared {passed} of {rows.length}.</p>
    <GatesGrid rows={rows} label="Promotion rules" />
  </ResearchSection>;
}

interface SliceRow { key: string; models: Record<string, ArchiveSliceMetric> }

function SlicesSection({ report }: { report: AnalyticsEvaluation }) {
  const { get, set } = useUrlState();
  const slices = archiveSlices(report);
  const dimensions = orderedDimensions(Object.keys(slices));
  const dimension = dimensions.includes(get("slice") ?? "") ? get("slice")! : dimensions[0];
  const phone = usePhone();
  const [view, setView] = useState<"misses" | "coverage">("misses");
  if (!dimension) return null;
  const groups = slices[dimension] ?? {};
  const models = ORDER(report).filter(m => Object.values(groups).some(g => g[m]));
  const rows: SliceRow[] = orderedSubgroups(dimension, Object.keys(groups)).map(key => ({ key, models: groups[key] }));
  const columns: GridColumn<SliceRow>[] = [
    ...(!phone || view === "misses" ? models.map(m => ({ key: `mae-${m}`, label: modelName(m), group: "Typical miss", width: "sm" as const,
      data: (r: SliceRow) => ({ field: `mae-${m}`, value: r.models[m]?.mae ?? "" }), cell: (r: SliceRow) => <GridValue text={fixed(r.models[m]?.mae, 2)} /> })) : []),
    ...(!phone || view === "coverage" ? models.map(m => ({ key: `cov-${m}`, label: modelName(m), group: "Inside the 80% range", width: "sm" as const,
      data: (r: SliceRow) => ({ field: `coverage-${m}`, value: r.models[m]?.interval?.coverage ?? "" }), cell: (r: SliceRow) => <GridValue text={r.models[m]?.interval?.coverage == null ? null : pct(r.models[m].interval!.coverage)} /> })) : []),
  ];
  return <ResearchSection id="slices" icon="layers" title={`Where the misses differ: ${dimensionLabel(dimension).toLowerCase()}`}
    aside={<SliceSelect dimensions={dimensions} value={dimension} onChange={key => set({ slice: key === dimensions[0] ? null : key })} />}>
    <p className="fc-lead">The test split {dimensions.length} ways chosen before it opened. No interval is served for a slice, so nothing here is coloured.</p>
    {phone && <Segmented size="sm" label="Slice columns" value={view} onChange={setView} options={[{ value: "misses", label: "Misses" }, { value: "coverage", label: "80% range" }]} />}
    <StatsGrid<SliceRow> label={`Archive test by ${dimensionLabel(dimension).toLowerCase()}`} name="slices" density="compact" height="auto" leadWidth="md" className={phone ? "fc-grid fc-slices fc-phone" : "fc-grid fc-slices"} rows={rows} rowKey={r => r.key}
      rowData={r => ({ dimension, subgroup: r.key })} lead={{ label: dimensionLabel(dimension), cell: r => <><span className="fc-name">{subgroupLabel(dimension, r.key)}</span><span className="fc-name-sub">{whole(r.models[models[0]]?.forecast_rows)} forecasts</span></> }} columns={columns} />
  </ResearchSection>;
}

const GLOSSARY: GlossaryGroup[] = [
  { label: "This experiment", icon: "history", items: [
    { term: "Reference points", text: `A box-score total, ${ARCHIVE_PROTOCOL.target}, used before the points experiment.` },
    { term: "EWMA-20", text: "A weighted average of a player's last 20 games, recent games counting more (half-life five games)." },
    { term: "Typical miss", text: "Mean absolute error, in reference points." },
    { term: "Gain", text: "One model's typical miss minus another's on the same games. Above zero, the model named first missed by less." },
    { term: "95% interval", text: "From 1,000 resamples of week-long blocks of game days." },
    { term: "Historical reconstruction", text: "Teams and next games rebuilt from records gathered after the season, not as they were known at the time." },
  ] },
];

function About({ report }: { report: AnalyticsEvaluation }) {
  const c = report.final_test.counts;
  return <ResearchDisclosure id="about" icon="info" title="About this page">
    <MethodBlock title="Method">
      <dl className="fc-defs">
        <dt>Target</dt><dd>Reference points ({ARCHIVE_PROTOCOL.target}) in a player&apos;s next team game, given that the player plays.</dd>
        <dt>Models</dt><dd data-field="about-models">{ORDER(report).map(m => `${modelName(m)} (${m})`).join(", ")}.</dd>
        <dt>The test</dt><dd data-field="about-counts">{whole(c.candidate_rows)} candidate forecasts in {ARCHIVE_PROTOCOL.splits.at(-1)!.season}; {whole(c.label_scored)} were played and scored, {whole(c.core_rows)} of them for established players. {whole(c.label_explicit_nonappearance)} were recorded non-appearances and {whole(c.label_unmatched_or_unknown)} unknown; {whole(c.insufficient_history_rows)} had too little history. None counts as zero.</dd>
        <dt>Coverage</dt><dd data-field="about-coverage">Archive records from {formatDate(report.coverage_start)} to {formatDate(report.coverage_end)}.</dd>
        <dt>Limits</dt><dd>{[...report.warnings, ...report.limitations].map(l => <span key={l} className="fc-limit">{visitorText(l)} </span>)}</dd>
        <dt>Fixed in advance</dt><dd>Protocol frozen on {formatDate(ARCHIVE_PROTOCOL.frozenOn)}, before the test season was opened.</dd>
        <dt>Identifiers</dt><dd>Run <code data-field="run-id">{report.run_id}</code> · report <code>{report.report_sha256.slice(0, 16)}</code> · snapshot <code>{report.snapshot_id}</code>.</dd>
        <dt>Source</dt><dd>{report.source.replace(/@[0-9a-f]+$/, "")}</dd>
      </dl>
      <ResearchLinks label="Evidence" links={[
        { label: "The full report as served", href: `${browserApi}/api/analytics/evaluations?runId=${report.run_id}&snapshotId=${report.snapshot_id}`, icon: "external" },
        { label: "Model card", href: evidenceUrl("docs/evidence/model-evaluation.md"), icon: "external" },
      ]} />
    </MethodBlock>
    <MethodBlock title="Splits"><SplitsGrid splits={ARCHIVE_PROTOCOL.splits} /></MethodBlock>
  </ResearchDisclosure>;
}

async function load(snapshotId: string | null) {
  try { return { report: await getAnalyticsEvaluation(snapshotId ?? undefined) }; } catch { return { report: null }; }
}

export function EvaluationArchiveResearch() {
  const { get } = useUrlState();
  const snapshotId = get("snapshotId");
  const { data, loading } = useFeed([snapshotId], () => load(snapshotId));
  const report = data?.report ?? null;
  const metrics = report?.final_test.metrics as Record<string, { forecast_rows: number; players?: number }> | undefined;
  const served = report?.serving_policy.historical_s3_primary;
  return <ForecastsFrame intro={<ResearchIntro
    tagline={report && served && metrics?.[served] ? <MetaLine items={[`${whole(metrics[served].forecast_rows)} test forecasts`, ...(metrics[served].players ? [`${whole(metrics[served].players)} players`] : []), `${ARCHIVE_PROTOCOL.splits.at(-1)!.season} season`, `fixed ${formatDate(ARCHIVE_PROTOCOL.frozenOn)}, before the test`]} /> : null}
    links={[{ label: "How CourtLens tests models", href: "/methodology", icon: "book" }]} />}>
    {loading && <FeedSkeleton label="Loading the Evaluation Archive" />}
    {data && !report && <div role="alert"><GatedNote action={<ButtonLink size="lg" href={snapshotId ? "/evaluation" : "/forecasts"}>{snapshotId ? "Open Evaluation Archive" : "Points Forecasts"}</ButtonLink>}
      why={<p>{snapshotId ? "The requested snapshot has no matching, verified evaluation. Its selection is kept; the archive uses the frozen experiment's own inputs." : "The frozen experiment's report is unavailable. Points Forecasts has the separate points experiment."}</p>}>
      {snapshotId ? "Evaluation unavailable for the selected snapshot." : "Evaluation archive is unavailable."}</GatedNote></div>}
    {report && <>
      <Answer report={report} />
      <ModelsSection report={report} />
      <CoverageSection report={report} />
      <GatesSection report={report} />
      <SelectionDisclosure rows={archiveSelectionRows(archiveValidation(report))} unit={UNIT}
        folds={[`to ${formatDate(ARCHIVE_PROTOCOL.splits[1].end)}`, `from ${formatDate(ARCHIVE_PROTOCOL.splits[2].start)}`]} />
      <SlicesSection report={report} />
      {/* RD16 round 2: the same reading cards and glossary as the points tab (owner). */}
      <Reading glossary={GLOSSARY} />
      <About report={report} />
    </>}
  </ForecastsFrame>;
}
