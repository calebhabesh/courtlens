"use client";

import { ReliabilityPlot } from "./charts";
import { SeasonLineChart } from "./research/season-line-chart";
import {
  Glossary, MethodBlock, ResearchCard, ResearchCards, ResearchDisclosure, ResearchIntro, ResearchLinks, ResearchSection, type GlossaryGroup,
} from "./research/research-page";
import { GridValue, StatsGrid, type GridColumn } from "./research/stats-grid";
import { FeedFailure, FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { Field } from "./ui/field";
import { Select } from "./ui/kit";
import { PageShell } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import {
  bandText, fixed, gainBand, getMetricBacktest, gridTone, pairOf, percent, SCORE_DIGITS, SCORE_LABELS, SCORES, seasonRange, signed,
  verdictSentences, VERDICT_TEXT, type CurveBin, type Gain, type MetricBacktestPage, type Pair, type ProspectiveGroup, type Score,
} from "@/lib/metric-backtest";
import { formatDate } from "@/lib/format-date";
import { evidenceUrl } from "@/lib/research-facts";

/**
 * Research → Impact → Metric Backtest (R08, designed in RD10). Every number is the frozen courtlens-metric-backtest-v1 results' or the
 * 2026-27 scorer's; exact values sit on `data-*`. Rows stay in registered order: a pooled row covers its own seasons, so the page never
 * ranks metrics itself and compares them only through the served pairs.
 */

const short = (season: string) => season.slice(2);
/** The served notes name a project code in two places; visitors read the page's name instead (RD07: no repository detail). The API is unchanged. */
const visitorText = (text: string) => text.replace("R07's frozen model", "the frozen Projected Impact model").replace(" (R07)", "");
const count = (n: number) => n.toLocaleString("en-US");
/** The two calibration series are labels, not a sign: category tints, never gold and blue. */
const CALIBRATION_TONES = ["category-3", "category-4"] as const;

const candidatesOf = (page: MetricBacktestPage) => page.results.registration.parameters.candidates;
const baselineOf = (page: MetricBacktestPage) => page.results.registration.parameters.baseline;
const defaultMetric = (page: MetricBacktestPage) => page.results.verdict.best[0] ?? candidatesOf(page)[1];

function Metric({ page, name, sub }: { page: MetricBacktestPage; name: string; sub?: string }) {
  return <><span className="mb-metric">{page.metrics[name].short}</span>{sub && <span className="mb-metric-sub">{sub}</span>}</>;
}

function MetricOptions({ page, except }: { page: MetricBacktestPage; except?: string }) {
  return <>{candidatesOf(page).filter(n => n !== except).map(n => <option key={n} value={n}>{page.metrics[n].short}</option>)}</>;
}

function GainValue({ gain, digits, title }: { gain: Gain; digits: number; title?: string }) {
  return <GridValue text={signed(gain.gain, digits)} sub={gainBand(gain, digits)} tone={gridTone(gain)} title={title} />;
}

const gainData = (gain: Gain | undefined, field: string) => ({ field, value: gain?.gain ?? "", low: gain?.low ?? "", high: gain?.high ?? "" });

// ---- The answer --------------------------------------------------------------------------------

function Answer({ page }: { page: MetricBacktestPage }) {
  const { results, metrics } = page;
  const baseline = baselineOf(page);
  const best = results.verdict.best.length === 1 ? results.verdict.best[0] : null;
  const gain = best ? pairOf(results.pairs, best, baseline)?.pooled.rmse : undefined;
  const [headline, ...rest] = verdictSentences(page);
  return <ResearchSection id="answer" icon="trophy" title="Which metric predicts games best?">
    <div className="mb-answer" data-field="verdict-summary">
      <p className="mb-headline">{headline}</p>
      {best && gain && <p className="mb-lead" data-field="best-line">Its margin RMSE was <strong data-value={results.candidates[best].pooled.rmse}>{fixed(results.candidates[best].pooled.rmse)}</strong> points,{" "}
        <strong data-value={gain.gain}>{fixed(gain.gain)}</strong> lower than {metrics[baseline].short} on the same games (95% interval of the gain {gainBand(gain)}).</p>}
      {rest.map(text => <p key={text} className="mb-lead">{text}</p>)}
      <p className="mb-lead">This tests ratings, not game forecasts: each prediction uses a rating from before the game, weighted by the minutes players really went on to play.</p>
    </div>
  </ResearchSection>;
}

// ---- Head to head ------------------------------------------------------------------------------

function HeadToHead({ page }: { page: MetricBacktestPage }) {
  const { results, metrics } = page;
  const all = candidatesOf(page);
  const columns: GridColumn<string>[] = all.map(other => ({
    key: other, label: metrics[other].short, title: `Against ${metrics[other].label}`,
    data: name => name === other ? { field: "gain", self: "true" } : gainData(pairOf(results.pairs, name, other)?.pooled.rmse, "gain"),
    cell: name => {
      if (name === other) return <span role="img" aria-label="Same metric" />;
      const pair = pairOf(results.pairs, name, other);
      if (!pair) return <GridValue text={null} />;
      return <GainValue gain={pair.pooled.rmse} digits={2}
        title={`${metrics[name].short} against ${metrics[other].short}: lower error in ${pair.seasons_candidate_lower_rmse} of ${pair.seasons.length} shared seasons, ${count(pair.games)} games. ${VERDICT_TEXT[pair.verdict]}.`} />;
    },
  }));
  return <ResearchSection id="head-to-head" icon="scale" title="Head to head: RMSE gain, points">
    <p className="mb-lead">Read across a row. Each cell is how many points less error the row&apos;s metric had than the column&apos;s, over the games of the seasons both were scored. A metric is called
      better only if its whole 95% interval is above zero and it had the lower error in more than half of those seasons.</p>
    <ul className="rs-legend" aria-label="Colour key">
      <li><span className="rs-swatch" data-tone="good" aria-hidden="true" />Row metric ahead: 95% interval above zero</li>
      <li><span className="rs-swatch" data-tone="bad" aria-hidden="true" />Row metric behind: 95% interval below zero</li>
      <li><span className="rs-swatch" aria-hidden="true" />Interval includes zero: no ranking</li>
    </ul>
    <StatsGrid<string> label="Head-to-head RMSE gains" name="head-to-head" density="compact" height="auto" className="mb-matrix" rows={all} rowKey={n => n}
      lead={{ label: "Metric", cell: n => <Metric page={page} name={n} /> }} columns={columns} />
  </ResearchSection>;
}

// ---- Every score, against one metric -----------------------------------------------------------

function PairsSection({ page }: { page: MetricBacktestPage }) {
  const { get, set } = useUrlState();
  const { results, metrics } = page;
  const all = candidatesOf(page);
  const baseline = baselineOf(page);
  const reference = all.includes(get("against") ?? "") ? get("against")! : baseline;
  const seasons = results.registration.parameters.test_seasons;
  const season = seasons.includes(get("pairSeason") ?? "") ? get("pairSeason")! : "pooled";
  const rows = all.filter(n => n !== reference).map(n => pairOf(results.pairs, n, reference)).filter((p): p is Pair => p !== null)
    .filter(p => season === "pooled" || p.seasons.includes(season));
  const gameCount = (p: Pair) => season === "pooled" ? p.games : results.candidates[p.candidate].seasons[season]?.games ?? 0;
  const gainOf = (p: Pair, score: Score) => season === "pooled" ? p.pooled[score] : p.per_season[season]?.[score];
  // One answer on every row is said once, in a sentence (RD08); the column returns when the rows differ.
  const shared = new Set(rows.map(p => p.verdict)).size === 1 ? rows[0].verdict : null;
  const name = metrics[reference].short;
  const columns: GridColumn<Pair>[] = [
    ...SCORES.map((score): GridColumn<Pair> => ({
      key: score, label: `${SCORE_LABELS[score]} gain`, width: "md", data: p => gainData(gainOf(p, score), score),
      cell: p => { const g = gainOf(p, score); return g ? <GainValue gain={g} digits={SCORE_DIGITS[score]} /> : <GridValue text={null} />; },
    })),
    { key: "lower", label: "Lower RMSE in", title: "Shared seasons in which this metric had the lower RMSE", width: "sm", data: p => ({ field: "lower", value: p.seasons_candidate_lower_rmse }),
      cell: p => <GridValue text={`${p.seasons_candidate_lower_rmse} of ${p.seasons.length}`} /> },
    ...(shared ? [] : [{ key: "verdict", label: "Verdict, pooled", width: "sm" as const, data: (p: Pair) => ({ field: "verdict", value: p.verdict }),
      cell: (p: Pair) => <span className="mb-text">{VERDICT_TEXT[p.verdict]}</span> }]),
  ];
  return <ResearchSection id="scores-against" icon="target" title="Every score, against one metric">
    <p className="mb-lead">Each row is that metric&apos;s gain over the one chosen. Positive means the row&apos;s metric did better; winner picked is its share of games minus the other&apos;s.</p>
    <div className="mb-controls">
      <Field label="Against" layout="inline"><Select size="md" aria-label="Compare against" value={reference}
        onChange={event => set({ against: event.target.value === baseline ? null : event.target.value })}><MetricOptions page={page} /></Select></Field>
      <Field label="Seasons" layout="inline"><Select size="md" aria-label="Seasons compared" value={season}
        onChange={event => set({ pairSeason: event.target.value === "pooled" ? null : event.target.value })}>
        <option value="pooled">Pooled</option>
        {seasons.map(s => <option key={s} value={s}>{s}</option>)}
      </Select></Field>
    </div>
    {shared && <p className="mb-note" data-field="pairs-verdict" data-value={shared}>Pooled verdict: {shared === "candidate_better"
      ? `every metric here is ranked better than ${name}.` : shared === "reference_better" ? `every metric here is ranked worse than ${name}.` : `none of these can be ranked against ${name}.`}</p>}
    <div data-field="pairs" data-reference={reference} data-season={season}>
      <StatsGrid<Pair> label={`Paired differences against ${name}`} name="pairs" density="compact" height="auto" leadWidth="md" className="mb-pairs" rows={rows} rowKey={p => p.candidate}
        rowData={p => ({ games: gameCount(p), seasons: p.seasons.length })} empty={`No metric shares ${season} with ${name}.`}
        lead={{ label: "Metric", cell: p => <Metric page={page} name={p.candidate} sub={`${seasonRange(p.seasons)} · ${count(gameCount(p))} games`} /> }} columns={columns} />
    </div>
  </ResearchSection>;
}

// ---- Season by season --------------------------------------------------------------------------

function SeasonSection({ page }: { page: MetricBacktestPage }) {
  const { get, set } = useUrlState();
  const { results, metrics } = page;
  const all = candidatesOf(page);
  const baseline = baselineOf(page);
  const seasons = results.registration.parameters.test_seasons;
  const fallback = defaultMetric(page);
  const metric = all.includes(get("metric") ?? "") ? get("metric")! : fallback;
  const standard = metric === baseline ? all.find(n => n !== baseline)! : baseline;
  const vs = get("vs") ?? "";
  const reference = all.includes(vs) && vs !== metric ? vs : standard;
  const pair = pairOf(results.pairs, metric, reference);
  const points = seasons.map(s => {
    const g = pair?.per_season[s]?.rmse;
    return { season: short(s), value: g?.gain ?? null, low: g?.low ?? null, high: g?.high ?? null, label: `${s} · ${count(results.candidates[metric].seasons[s]?.games ?? 0)} games` };
  });
  const title = `${metrics[metric].short} against ${metrics[reference].short}: RMSE gain by season, points`;
  const only = pair?.seasons.length === 1 ? pair.seasons[0] : null;
  const onlyGain = only ? pair?.per_season[only].rmse : undefined;
  const columns: GridColumn<string>[] = seasons.map(s => ({
    key: s, label: short(s), title: s,
    data: name => { const row = results.candidates[name].seasons[s]; return { field: "rmse", season: s, value: row?.rmse ?? "", low: row?.intervals.rmse.low ?? "", high: row?.intervals.rmse.high ?? "" }; },
    cell: name => { const row = results.candidates[name].seasons[s]; return row ? <GridValue text={fixed(row.rmse)} sub={bandText(row.intervals.rmse, 1)} /> : <GridValue text={null} />; },
  }));
  return <ResearchSection id="seasons" icon="chart-line" title="Season by season">
    <p className="mb-lead">The gap between two metrics, one season at a time, on the same games. Above zero, the first metric had the lower error.</p>
    <div className="mb-controls">
      <Field label="Metric" layout="inline"><Select size="md" aria-label="Metric charted" value={metric}
        onChange={event => set({ metric: event.target.value === fallback ? null : event.target.value })}><MetricOptions page={page} /></Select></Field>
      <Field label="Against" layout="inline"><Select size="md" aria-label="Metric charted against" value={reference}
        onChange={event => set({ vs: event.target.value === baseline ? null : event.target.value })}><MetricOptions page={page} except={metric} /></Select></Field>
    </div>
    <figure className="mb-figure" data-chart="gain-by-season" data-metric={metric} data-reference={reference}>
      <figcaption className="mb-figure-title">{title} · 95% interval shaded</figcaption>
      {only
        ? <p className="mb-lead" data-field="single-season">These two share one season, {only}: {signed(onlyGain?.gain)} (95% {gainBand(onlyGain)}).</p>
        : <SeasonLineChart key={`${metric}-${reference}`} label={title} band="95%" zero points={points} format={v => signed(v)} axisFormat={v => signed(v, 1)} />}
    </figure>
    <h3 className="mb-subhead">Margin RMSE by season, points</h3>
    <p className="mb-note">Each cell is one metric&apos;s own error that season, with its 95% interval. A dash means the metric wasn&apos;t scored that season.</p>
    <StatsGrid<string> label="Margin RMSE by season" name="by-season" density="compact" height="auto" className="mb-seasons" rows={all} rowKey={n => n}
      lead={{ label: "Metric", cell: n => <Metric page={page} name={n} /> }} columns={columns} />
  </ResearchSection>;
}

// ---- Scores and calibration --------------------------------------------------------------------

function ScoresGrid({ page }: { page: MetricBacktestPage }) {
  const { results } = page;
  const baseline = baselineOf(page);
  const candidate = (name: string) => results.candidates[name];
  const replaced = (name: string) => Object.values(candidate(name).seasons).reduce((sum, s) => sum + s.replaced_minutes_share * s.games, 0) / Math.max(1, candidate(name).pooled.games);
  return <StatsGrid<string> label="Pooled scores" name="pooled" density="compact" height="auto" leadWidth="md" className="mb-scores" rows={candidatesOf(page)} rowKey={n => n}
    rowData={n => ({ games: candidate(n).pooled.games, seasons: candidate(n).test_seasons.length })}
    lead={{ label: "Metric", cell: n => <Metric page={page} name={n} sub={`${seasonRange(candidate(n).test_seasons)} · ${count(candidate(n).pooled.games)} games`} /> }}
    columns={[
      { key: "rmse", label: "Margin RMSE", width: "md", data: n => ({ field: "rmse", value: candidate(n).pooled.rmse, low: candidate(n).pooled.intervals.rmse.low, high: candidate(n).pooled.intervals.rmse.high }),
        cell: n => <GridValue text={fixed(candidate(n).pooled.rmse)} sub={bandText(candidate(n).pooled.intervals.rmse)} /> },
      { key: "accuracy", label: "Winner picked", width: "sm", data: n => ({ field: "accuracy", value: candidate(n).pooled.accuracy }), cell: n => <GridValue text={percent(candidate(n).pooled.accuracy)} /> },
      { key: "brier", label: "Brier", width: "sm", data: n => ({ field: "brier", value: candidate(n).pooled.brier }), cell: n => <GridValue text={fixed(candidate(n).pooled.brier, 4)} /> },
      { key: "log_loss", label: "Log loss", width: "sm", data: n => ({ field: "log_loss", value: candidate(n).pooled.log_loss }), cell: n => <GridValue text={fixed(candidate(n).pooled.log_loss, 4)} /> },
      { key: "ece", label: "Calibration error", width: "sm", data: n => ({ field: "ece", value: candidate(n).calibration_curve.ece }), cell: n => <GridValue text={fixed(candidate(n).calibration_curve.ece, 4)} /> },
      { key: "replaced", label: "Minutes replaced", width: "sm", data: n => ({ field: "replaced", value: n === baseline ? "" : replaced(n) }), cell: n => <GridValue text={n === baseline ? null : percent(replaced(n))} /> },
    ]} />;
}

const toBins = (bins: readonly CurveBin[]) => bins.map(b => ({ lower: b.low, upper: b.high, rows: b.games, mean_probability: b.predicted ?? null, observed_rate: b.observed ?? null }));
const binPercent = (value: number | undefined) => value === undefined ? null : percent(value);

interface BinRow { index: number; low: number; high: number; chosen: CurveBin; base: CurveBin }

function Calibration({ page }: { page: MetricBacktestPage }) {
  const { get, set } = useUrlState();
  const { results, metrics } = page;
  const baseline = baselineOf(page);
  const fallback = defaultMetric(page);
  const asked = get("cal") ?? "";
  const metric = candidatesOf(page).includes(asked) && asked !== baseline ? asked : fallback;
  const chosen = results.candidates[metric].calibration_curve, base = results.candidates[baseline].calibration_curve;
  const rows: BinRow[] = chosen.bins.map((b, index) => ({ index, low: b.low, high: b.high, chosen: b, base: base.bins[index] }));
  const a = metrics[metric].short, b = metrics[baseline].short;
  const series = (group: string, read: (r: BinRow) => CurveBin, tag: string): GridColumn<BinRow>[] => [
    { key: `${tag}-games`, label: "Games", group, data: r => ({ field: `${tag}-games`, value: read(r).games }), cell: r => <GridValue text={count(read(r).games)} /> },
    { key: `${tag}-predicted`, label: "Pred", title: "Mean predicted home win probability", group, data: r => ({ field: `${tag}-predicted`, value: read(r).predicted ?? "" }), cell: r => <GridValue text={binPercent(read(r).predicted)} /> },
    { key: `${tag}-observed`, label: "Obs", title: "Observed home win rate", group, data: r => ({ field: `${tag}-observed`, value: read(r).observed ?? "" }), cell: r => <GridValue text={binPercent(read(r).observed)} /> },
  ];
  return <div className="mb-block" data-chart="calibration" data-metric={metric}>
    <div className="mb-controls">
      <h3 className="mb-subhead">Calibration: when a metric says 60%, does the home team win 60%?</h3>
      <Field label="Metric" layout="inline"><Select size="md" aria-label="Calibration metric" value={metric}
        onChange={event => set({ cal: event.target.value === fallback ? null : event.target.value })}><MetricOptions page={page} except={baseline} /></Select></Field>
    </div>
    <p className="mb-note">Calibration error: <span data-field="ece-chosen" data-value={chosen.ece}>{a} {fixed(chosen.ece, 4)}</span>, <span data-field="ece-base" data-value={base.ece}>{b} {fixed(base.ece, 4)}</span>. It has no interval and decides no ranking.</p>
    <div className="mb-calibration">
      <div className="mb-figure">
        <ReliabilityPlot title="Predicted against observed home wins" label={`Predicted home win probability against observed home win rate for ${a} and ${b}`}
          tones={CALIBRATION_TONES} outcome={{ x: "Predicted home win probability", y: "Observed home win rate" }} unit="games"
          source="CourtLens backtest of NBA box scores" sample="Ten probability bins, each metric over its own seasons"
          series={[{ name: a, bins: toBins(chosen.bins) }, { name: b, bins: toBins(base.bins) }]} />
      </div>
      <StatsGrid<BinRow> label={`Calibration bins for ${a} and ${b}`} name="bins" density="compact" height="auto" className="mb-bins" rows={rows} rowKey={r => String(r.index)}
        lead={{ label: "Bin", cell: r => <span className="mb-metric">{Math.round(r.low * 100)}–{Math.round(r.high * 100)}%</span> }}
        columns={[...series(a, r => r.chosen, "chosen"), ...series(b, r => r.base, "base")]} />
    </div>
  </div>;
}

function ScoresSection({ page }: { page: MetricBacktestPage }) {
  return <ResearchSection id="scores" icon="list-ordered" title="Scores, each over its own seasons">
    <p className="mb-lead">Don&apos;t compare these rows against each other: seasons differ, and so does how hard they were to predict. Projected Impact, scored on two seasons, has the highest RMSE here yet beats
      most metrics on the games they share. The head-to-head table above is the fair comparison.</p>
    <ScoresGrid page={page} />
    <Calibration page={page} />
  </ResearchSection>;
}

// ---- 2026-27 -----------------------------------------------------------------------------------

function GroupGrid({ page, group, label, name }: { page: MetricBacktestPage; group: ProspectiveGroup; label: string; name: string }) {
  const { metrics } = page;
  const baseline = baselineOf(page);
  const scores = group.candidates!;
  const hasGains = (group.pairs?.length ?? 0) > 0;
  const gain = (metric: string) => group.pairs?.find(p => p.candidate === metric && p.reference === baseline)?.rmse;
  return <StatsGrid<string> label={`${label} 2026-27 games`} name={name} density="compact" height="auto" leadWidth="md" className="mb-scores" rows={candidatesOf(page)} rowKey={n => n}
    lead={{ label: "Metric", cell: n => <Metric page={page} name={n} /> }}
    columns={[
      { key: "rmse", label: "Margin RMSE", width: "sm", data: n => ({ field: "rmse", value: scores[n].rmse }), cell: n => <GridValue text={fixed(scores[n].rmse)} /> },
      { key: "accuracy", label: "Winner picked", width: "sm", data: n => ({ field: "accuracy", value: scores[n].accuracy }), cell: n => <GridValue text={percent(scores[n].accuracy)} /> },
      { key: "brier", label: "Brier", width: "sm", data: n => ({ field: "brier", value: scores[n].brier }), cell: n => <GridValue text={fixed(scores[n].brier, 4)} /> },
      ...(hasGains ? [{ key: "gain", label: `RMSE gain over ${metrics[baseline].short}`, width: "lg" as const, data: (n: string) => gainData(gain(n), "gain"),
        cell: (n: string) => { const g = gain(n); return g ? <GainValue gain={g} digits={2} /> : <GridValue text={n === baseline ? "Baseline" : null} muted />; } }] : []),
      { key: "replaced", label: "Minutes replaced", width: "sm", data: n => ({ field: "replaced", value: n === baseline ? "" : scores[n].replaced_minutes_share }), cell: n => <GridValue text={n === baseline ? null : percent(scores[n].replaced_minutes_share)} /> },
    ]} />;
}

function ProspectiveSection({ page }: { page: MetricBacktestPage }) {
  const { manifest, summary } = page.prospective;
  const frozen = formatDate(manifest.frozen_at.slice(0, 10));
  const prospective = summary?.prospective, hindsight = summary?.hindsight;
  return <ResearchSection id="season-2026-27" icon="calendar" title="2026-27, scored as the season goes">
    <p className="mb-lead">The rules were frozen on {frozen}, after the backtest, with each metric&apos;s scale fitted on 2025-26. A game counts as prospective only if it tipped after the freeze. Each is added once and never
      rescored, and none of them changes the backtest verdict above.</p>
    {!summary || !prospective || !hindsight ? <p className="mb-note">No 2026-27 game has been scored yet.</p> : <>
      <p className="mb-lead" data-field="season-status">Scored through {summary.scored_through ? formatDate(summary.scored_through) : "no games yet"} (last run {formatDate(summary.written_at.slice(0, 10))}):{" "}
        <strong data-field="prospective-games" data-value={prospective.games}>{count(prospective.games)}</strong> prospective {prospective.games === 1 ? "game" : "games"} and <strong data-field="hindsight-games" data-value={hindsight.games}>{count(hindsight.games)}</strong> hindsight.</p>
      <h3 className="mb-subhead">Prospective, after the freeze</h3>
      {prospective.games && prospective.candidates
        ? <>{!(prospective.pairs?.length) && <p className="mb-note" data-field="prospective-intervals">Gains over the baseline start at {manifest.minimum_games_for_interval} games.</p>}<GroupGrid page={page} group={prospective} label="Prospective" name="season-2026-27-prospective" /></>
        : <p className="mb-note" data-field="prospective-empty">No game has been scored since the rules were frozen, so there is no prospective result yet.</p>}
      <h3 className="mb-subhead">Hindsight, before the freeze</h3>
      {hindsight.games && hindsight.candidates
        ? <><p className="mb-note">These games tipped before the rules were frozen. They are shown apart, and are not a test of the frozen rules.</p><GroupGrid page={page} group={hindsight} label="Hindsight" name="season-2026-27-hindsight" /></>
        : <p className="mb-note">No hindsight games scored yet.</p>}
    </>}
  </ResearchSection>;
}

// ---- How to read and About -----------------------------------------------------------------------

function Reading({ page }: { page: MetricBacktestPage }) {
  const { results, metrics, omitted } = page;
  const noted = (key: string) => {
    const m = metrics[key];
    return { term: m.label, text: <>{m.what} Ratings from: {visitorText(m.source)}. Scored {seasonRange(results.candidates[key].test_seasons)}. Credit: {visitorText(m.credit)}</> };
  };
  const groups: GlossaryGroup[] = [
    { label: "Scores", icon: "target", items: [
      { term: "Margin RMSE", text: "Root mean squared error of the predicted home margin, in points. Lower is better, and the verdict uses this score alone." },
      { term: "Winner picked", text: "The share of games in which the metric's predicted winner won." },
      { term: "Brier and log loss", text: "Two penalties on the predicted home win probability. Lower is better; log loss punishes confident misses harder." },
      { term: "Calibration error", text: "How far predicted probabilities sit from the real win rate, averaged over ten probability bins. Reported only; it has no interval and decides no ranking." },
      { term: "Minutes replaced", text: "The share of minutes played by players with no rating, who take the 20th percentile of that source's ratings. Team net rates no players, so it shows a dash." },
    ] },
    { label: "Team and raw", icon: "users", items: ["team_net", "plus_minus", "on_off"].map(noted) },
    { label: "RAPM", icon: "chart-trend", items: ["rapm_1y", "rapm_3y", "box_prior_rapm"].map(noted) },
    { label: "Updated and projected", icon: "calendar", items: ["time_decay", "time_decay_opener", "projected_impact"].map(noted) },
    { label: "Left out", icon: "info", items: Object.entries(omitted).map(([key, text]) => ({ term: key === "darko" ? "DARKO" : key, text })) },
  ];
  return <ResearchSection id="reading" icon="book" title="How to read">
    <ResearchCards columns={3}>
      <ResearchCard kicker="Error"><p className="mb-card-text">Margin RMSE is how far, in points, the predicted home margin falls from the real one. Lower is better.</p></ResearchCard>
      <ResearchCard kicker="Gain"><p className="mb-card-text">The other metric&apos;s error minus this one&apos;s, on the games both were scored. Positive means this one did better.</p></ResearchCard>
      <ResearchCard kicker="Colour"><p className="mb-card-text">Green or red only where a gain&apos;s whole 95% interval is on one side of zero. Pooled scores and calibration stay neutral.</p></ResearchCard>
    </ResearchCards>
    <Glossary groups={groups} />
  </ResearchSection>;
}

function About({ page }: { page: MetricBacktestPage }) {
  const { results, prospective } = page;
  const p = results.registration.parameters;
  const replaced = (name: string) => {
    const seasons = Object.values(results.candidates[name].seasons).map(s => s.replaced_minutes_share);
    const low = percent(Math.min(...seasons)), high = percent(Math.max(...seasons));
    return low === high ? low : `${low} to ${high}`;
  };
  const checked = Object.values(results.leakage).reduce((sum, l) => sum + l.game_ratings_checked, 0);
  const frozenAt = prospective.manifest.frozen_at;
  return <ResearchDisclosure id="about" icon="info" title="About this page">
    <MethodBlock title="Caveats">
      <ul className="mb-list">
        <li><strong>Actual minutes, on purpose.</strong> Each prediction weights players by the minutes they really played, which is hindsight. It isolates how good each rating is from how well anyone guesses playing time, so this is a test of ratings, not a game forecast.</li>
        <li><strong>The same games for every metric.</strong> Every regular-season game with a box score, {count(results.candidates[p.baseline].pooled.games)} in {seasonRange(p.test_seasons)}. Within a season all metrics are scored on the same games, so paired differences compare like with like. Pooled rows each cover their own seasons, so compare them through the paired differences, not row against row.</li>
        <li><strong>Players without a rating</strong> (rookies, call-ups, raw metrics under {p.raw_min_controls} possessions) take the 20th percentile of that source&apos;s own ratings, never zero. Share of minutes this covers, by season: plus-minus {replaced("plus_minus")}, RAPM 1Y {replaced("rapm_1y")}, monthly time decay {replaced("time_decay")}, Projected Impact {replaced("projected_impact")}. This favours metrics that rate rookies early, which is part of what is being tested.</li>
        <li><strong>Projected Impact has two test seasons</strong>, so its intervals are wider and a ranking needs both seasons. It is never scored on 2016-17 to 2023-24, which it was trained or selected on.</li>
        <li><strong>Box-prior RAPM skips 2024-25</strong>: the 2023-24 fit has no box prior. Its 2025-26 scale comes from 2023-24. The Projected Impact and box-prior pair shares only 2025-26.</li>
        <li><strong>DARKO is left out</strong> of every comparison: only hindsight ratings are stored (see How to read).</li>
        <li><strong>Many comparisons.</strong> 95% intervals on 36 pairs are not adjusted for multiplicity; the more-than-half-of-seasons condition guards against one season deciding a pair.</li>
        <li><strong>Neutral sites.</strong> Only the 2019-20 bubble games count as neutral; the few other neutral-site games (NBA Cup semifinals, international games) get the home term.</li>
        <li><strong>Known before the method was fixed.</strong> Projected Impact&apos;s page had already published margin errors for itself, prior-season RAPM and the opener time-decay snapshot on 2024-25 and 2025-26, and Win Probability&apos;s for team form. Nothing here was changed because of them, and no choice was made from outcomes.</li>
        <li><strong>No leakage found.</strong> For {count(checked)} game ratings, every source&apos;s inputs end before the game; a test proves changing later seasons&apos; results changes no earlier score.</li>
      </ul>
    </MethodBlock>
    <MethodBlock title="Method">
      <dl className="mb-defs">
        <dt>Prediction</dt><dd>Margin = a × home + b × (home minus away of minutes ÷ 48 × rating). a, b and the residual SD are fitted on the latest earlier season the metric exists in. Win probability = Φ(margin ÷ SD).</dd>
        <dt>Scores</dt><dd>Margin RMSE (the verdict), winner picked, Brier, log loss, and calibration error over ten probability bins.</dd>
        <dt>Intervals</dt><dd>Paired game bootstrap within each season, {count(p.replicates)} replicates, 95%, one set of draws shared by every metric. Seed 8008.</dd>
        <dt>Rule</dt><dd>{results.verdict.rule.charAt(0).toUpperCase()}{results.verdict.rule.slice(1)}.</dd>
        <dt>Fixed in advance</dt><dd>Method registered on {formatDate(results.registration.registered_on)}, before any score was read. 2026-27 rules frozen {formatDate(frozenAt.slice(0, 10))}, {frozenAt.slice(11, 16)} UTC.</dd>
        <dt>Hashes</dt><dd>Registration <code data-field="registration-sha" data-value={results.registration.content_sha256}>{results.registration.content_sha256.slice(0, 16)}</code> · results{" "}
          <code data-field="results-sha" data-value={results.results_sha256}>{results.results_sha256.slice(0, 16)}</code> · 2026-27 rules <code data-field="manifest-sha" data-value={prospective.manifest.manifest_sha256}>{prospective.manifest.manifest_sha256.slice(0, 16)}</code>. Two runs give the same results hash.</dd>
      </dl>
      <ResearchLinks label="Evidence" links={[{ label: "How the backtest was built", href: evidenceUrl("docs/evidence/research/r08/README.md"), icon: "external" }]} />
    </MethodBlock>
  </ResearchDisclosure>;
}

// ---- Page --------------------------------------------------------------------------------------

export function MetricBacktestResearch() {
  const { data, error, loading, retry } = useFeed([], signal => getMetricBacktest(signal));
  const parameters = data?.results.registration.parameters;
  return <PageShell template="research">
    <div className="rs-column mb-page">
      <PageHeader className="sq-hero research-hero" icon="chart-trend" title="Metric Backtest" subtitle="Which impact metric best predicts real game results, using only ratings from before each game." />
      <ResearchIntro
        tagline={data && parameters ? <span data-field="hero-meta">{count(data.results.candidates[parameters.baseline].pooled.games)} games · {seasonRange(parameters.test_seasons)} · {parameters.candidates.length} metrics</span> : null}
        links={[{ label: "RAPM Ratings", href: "/research/rapm", icon: "chart-line" }, { label: "Projected Impact", href: "/research/projected-impact", icon: "target" }, { label: "Learning", href: "/methodology/learning", icon: "book" }]} />
      {error && <FeedFailure error={error} retry={retry} what="The metric backtest" />}
      {loading && <FeedSkeleton label="Loading the metric backtest" />}
      {data && <>
        <Answer page={data} />
        <HeadToHead page={data} />
        <PairsSection page={data} />
        <SeasonSection page={data} />
        <ScoresSection page={data} />
        <ProspectiveSection page={data} />
        <Reading page={data} />
        <About page={data} />
      </>}
    </div>
  </PageShell>;
}
