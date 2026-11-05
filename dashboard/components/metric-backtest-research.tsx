"use client";

import { ChartData, ChartFrame } from "./charts/chart-frame";
import { chartVars, toneColor } from "./charts/semantics";
import { FeedFailure, FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { Field } from "./ui/field";
import { GatedNote } from "./ui/gated-note";
import { Chip, Select } from "./ui/kit";
import { PageShell, ResearchLayout } from "./ui/page-shell";
import { PageHeader, Section } from "./ui/panel";
import { StatTile } from "./ui/stat-tile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import {
  bandText, fixed, gainText, gainTone, getMetricBacktest, pairOf, percent, SCORE_DIGITS, SCORE_LABELS, SCORES, seasonRange, signed,
  VERDICT_TEXT, verdictSentences, type MetricBacktestPage, type Pair, type ProspectiveGroup, type Score
} from "@/lib/metric-backtest";

/**
 * Research → Impact → Metric Backtest (R08). A plain build-phase page: verdict, one chart of
 * error by metric by season, pooled scores, paired differences, the 2026-27 score, what each metric
 * is and the caveats. Every number is the frozen courtlens-metric-backtest-v1 results' or the
 * 2026-27 scorer's; exact values sit on `data-value`.
 */

// Shown first: the registered baseline, the common one-season RAPM, monthly time decay and
// CourtLens's own Projected Impact. The reader can add or remove any metric.
const DEFAULT_SHOWN = ["team_net", "rapm_1y", "time_decay", "projected_impact"];
const COLORS: Record<string, string> = {
  team_net: "var(--color-text-secondary)",
  plus_minus: toneColor("category-5"),
  on_off: toneColor("category-6"),
  rapm_1y: toneColor("category-1"),
  rapm_3y: toneColor("category-2"),
  box_prior_rapm: toneColor("category-3"),
  time_decay: toneColor("identity-a"),
  time_decay_opener: toneColor("category-4"),
  projected_impact: toneColor("identity-b"),
};
const short = (season: string) => season.slice(2);

function Swatch({ name }: { name: string }) {
  return <span className="chart-key" style={chartVars({ "--chart-tone": COLORS[name] })} aria-hidden="true" />;
}

// ---- Chart -------------------------------------------------------------------------------------

function ErrorChart({ page, shown }: { page: MetricBacktestPage; shown: string[] }) {
  const { results, metrics } = page;
  const seasons = results.registration.parameters.test_seasons;
  const series = results.registration.parameters.candidates.filter(n => shown.includes(n));
  const bands = series.flatMap(n => Object.values(results.candidates[n].seasons).map(s => s.intervals.rmse));
  const low = Math.floor((Math.min(...bands.map(b => b.low)) - 0.1) * 2) / 2;
  const high = Math.ceil((Math.max(...bands.map(b => b.high)) + 0.1) * 2) / 2;
  const left = 52, right = 628, top = 16, bottom = 280;
  const slot = (right - left) / seasons.length;
  const x = (i: number, k: number) => left + slot * (i + 0.5) + (k - (series.length - 1) / 2) * Math.min(7, slot / (series.length + 1));
  const y = (v: number) => bottom - ((v - low) / (high - low)) * (bottom - top);
  const ticks = Array.from({ length: Math.round((high - low) / 0.5) + 1 }, (_, i) => low + i * 0.5);
  return <svg className="chart-graphic chart-reliability" viewBox="0 0 640 308" role="img"
    aria-label={`Margin RMSE by season for ${series.map(n => metrics[n].short).join(", ")}, with 95% intervals. Lower is better.`}>
    {ticks.map(t => <g key={t}>
      <line x1={left} x2={right} y1={y(t)} y2={y(t)} stroke="var(--color-hairline-strong)" />
      <text x={left - 8} y={y(t)} dy="0.35em" textAnchor="end">{t.toFixed(1)}</text>
    </g>)}
    {seasons.map((s, i) => <text key={s} x={left + slot * (i + 0.5)} y={bottom + 20} textAnchor="middle">{short(s)}</text>)}
    {series.map((name, k) => {
      const rows = seasons.map((s, i) => ({ s, i, row: results.candidates[name].seasons[s] })).filter(p => p.row);
      return <g key={name} data-series={name} stroke={COLORS[name]} fill={COLORS[name]}>
        <polyline fill="none" strokeWidth="1.5" points={rows.map(p => `${x(p.i, k)},${y(p.row.rmse)}`).join(" ")} />
        {rows.map(p => <g key={p.s}>
          <line x1={x(p.i, k)} x2={x(p.i, k)} y1={y(p.row.intervals.rmse.low)} y2={y(p.row.intervals.rmse.high)} strokeWidth="1.5" />
          <circle cx={x(p.i, k)} cy={y(p.row.rmse)} r="3.5" data-candidate={name} data-season={p.s} data-value={p.row.rmse}
            data-low={p.row.intervals.rmse.low} data-high={p.row.intervals.rmse.high}>
            <title>{`${metrics[name].label}, ${p.s}: RMSE ${fixed(p.row.rmse)} points (95% ${bandText(p.row.intervals.rmse)}), ${p.row.games} games`}</title>
          </circle>
        </g>)}
      </g>;
    })}
  </svg>;
}

function ChartSection({ page }: { page: MetricBacktestPage }) {
  const { get, set } = useUrlState();
  const all = page.results.registration.parameters.candidates;
  const raw = get("show");
  const shown = raw ? raw.split(",").filter(n => all.includes(n)) : DEFAULT_SHOWN;
  const toggle = (name: string) => {
    const next = shown.includes(name) ? shown.filter(n => n !== name) : [...shown, name];
    const same = next.length === DEFAULT_SHOWN.length && DEFAULT_SHOWN.every(n => next.includes(n));
    set({ show: same ? null : next.join(",") || "none" });
  };
  const seasons = page.results.registration.parameters.test_seasons;
  return <Section title="Margin error by metric and season"
    description="Root mean squared error of the predicted home margin, in points, with 95% game-bootstrap intervals. Lower is better. Each metric is scored only in seasons where it existed before the games and has an earlier season to set its scale.">
    <div role="group" aria-label="Metrics shown" className="chart-legend-inline">
      {all.map(name => <Chip key={name} size="sm" pressed={shown.includes(name)} onClick={() => toggle(name)}>
        <Swatch name={name} />{page.metrics[name].short}
      </Chip>)}
    </div>
    <ChartFrame title="Margin RMSE, points" source="Frozen courtlens-metric-backtest-v1 results; retained box scores"
      sample={`Regular-season games ${seasonRange(seasons)}; every metric on the same games within a season`}
      state={shown.length ? "ready" : "empty"} action={<span>Choose a metric above.</span>}>
      <ChartData fingerprint={shown.join(",")}><ErrorChart page={page} shown={shown} /></ChartData>
    </ChartFrame>
    <Table aria-label="Margin RMSE by season" density="compact" data-table="by-season">
      <TableHeader><TableRow hoverable={false}>
        <TableHead>Metric</TableHead>
        {seasons.map(s => <TableHead key={s} align="right">{short(s)}</TableHead>)}
      </TableRow></TableHeader>
      <TableBody>{all.map(name => <TableRow key={name} data-row={name}>
        <TableCell><Swatch name={name} /> {page.metrics[name].short}</TableCell>
        {seasons.map(s => {
          const row = page.results.candidates[name].seasons[s];
          return row
            ? <TableCell key={s} numeric data-season={s} data-value={row.rmse} data-low={row.intervals.rmse.low} data-high={row.intervals.rmse.high}
              title={`95% ${bandText(row.intervals.rmse)}`}>{fixed(row.rmse)}<br /><small>{bandText(row.intervals.rmse, 1)}</small></TableCell>
            : <TableCell key={s} numeric data-season={s} data-value="">—</TableCell>;
        })}
      </TableRow>)}</TableBody>
    </Table>
  </Section>;
}

// ---- Tables ------------------------------------------------------------------------------------

function PooledTable({ page }: { page: MetricBacktestPage }) {
  const { results, metrics } = page;
  return <Table aria-label="Pooled scores" density="compact" data-table="pooled">
    <TableHeader><TableRow hoverable={false}>
      <TableHead>Metric</TableHead><TableHead>Seasons</TableHead><TableHead align="right">Games</TableHead>
      <TableHead align="right">Margin RMSE, 95%</TableHead><TableHead align="right">Winner picked</TableHead>
      <TableHead align="right">Brier</TableHead><TableHead align="right">Log loss</TableHead>
      <TableHead align="right">Calibration error</TableHead><TableHead align="right">Minutes replaced</TableHead>
    </TableRow></TableHeader>
    <TableBody>{results.registration.parameters.candidates.map(name => {
      const c = results.candidates[name];
      const p = c.pooled;
      const seasons = Object.values(c.seasons);
      const replaced = seasons.reduce((sum, s) => sum + s.replaced_minutes_share * s.games, 0) / Math.max(1, p.games);
      return <TableRow key={name} data-row={name}>
        <TableCell><Swatch name={name} /> {metrics[name].short}</TableCell>
        <TableCell>{seasonRange(c.test_seasons)} ({c.test_seasons.length})</TableCell>
        <TableCell numeric data-field="games" data-value={p.games}>{p.games.toLocaleString("en-US")}</TableCell>
        <TableCell numeric data-field="rmse" data-value={p.rmse} data-low={p.intervals.rmse.low} data-high={p.intervals.rmse.high}>{fixed(p.rmse)}<br /><small>{bandText(p.intervals.rmse)}</small></TableCell>
        <TableCell numeric data-field="accuracy" data-value={p.accuracy}>{percent(p.accuracy)}</TableCell>
        <TableCell numeric data-field="brier" data-value={p.brier}>{fixed(p.brier, 4)}</TableCell>
        <TableCell numeric data-field="log_loss" data-value={p.log_loss}>{fixed(p.log_loss, 4)}</TableCell>
        <TableCell numeric data-field="ece" data-value={c.calibration_curve.ece}>{fixed(c.calibration_curve.ece, 4)}</TableCell>
        <TableCell numeric data-field="replaced" data-value={replaced}>{percent(replaced)}</TableCell>
      </TableRow>;
    })}</TableBody>
  </Table>;
}

function GainCell({ pair, score, season }: { pair: Pair; score: Score; season: string }) {
  const g = season === "pooled" ? pair.pooled[score] : pair.per_season[season]?.[score];
  if (!g) return <TableCell numeric data-field={score} data-value="">—</TableCell>;
  const digits = score === "accuracy" ? 3 : SCORE_DIGITS[score];
  return <TableCell numeric tone={gainTone(g)} data-field={score} data-value={g.gain} data-low={g.low} data-high={g.high}>
    {signed(g.gain, digits)}<br /><small>{signed(g.low, digits)} to {signed(g.high, digits)}</small>
  </TableCell>;
}

function PairsSection({ page }: { page: MetricBacktestPage }) {
  const { get, set } = useUrlState();
  const { results, metrics } = page;
  const all = results.registration.parameters.candidates;
  const baseline = results.registration.parameters.baseline;
  const reference = all.includes(get("against") ?? "") ? get("against")! : baseline;
  const season = get("pairSeason") ?? "pooled";
  const rows = all.filter(n => n !== reference).map(n => pairOf(results.pairs, n, reference)).filter((p): p is Pair => p !== null)
    .filter(p => season === "pooled" || p.seasons.includes(season));
  return <Section title="Paired differences"
    description="Each metric against the one chosen, on the games of the seasons both were scored. Gain is the chosen metric's error minus this metric's (positive means this metric did better; for winner picked, this metric's share minus the other's). Green or red only when the whole 95% interval is on one side of zero. The verdict uses margin RMSE alone and needs the pooled interval to exclude zero and the lower error in more than half of the shared seasons."
    actions={<>
      <Field label="Against" layout="inline"><Select aria-label="Compare against" value={reference}
        onChange={event => set({ against: event.target.value === baseline ? null : event.target.value })}>
        {all.map(n => <option key={n} value={n}>{metrics[n].short}</option>)}
      </Select></Field>
      <Field label="Seasons" layout="inline"><Select aria-label="Seasons compared" value={season}
        onChange={event => set({ pairSeason: event.target.value === "pooled" ? null : event.target.value })}>
        <option value="pooled">Pooled</option>
        {results.registration.parameters.test_seasons.map(s => <option key={s} value={s}>{s}</option>)}
      </Select></Field>
    </>}>
    <Table aria-label={`Paired differences against ${metrics[reference].short}`} density="compact" data-table="pairs" data-reference={reference} data-season={season}>
      <TableHeader><TableRow hoverable={false}>
        <TableHead>Metric</TableHead><TableHead>Shared seasons</TableHead><TableHead align="right">Games</TableHead>
        {SCORES.map(s => <TableHead key={s} align="right">{SCORE_LABELS[s]} gain</TableHead>)}
        <TableHead align="right">Lower RMSE in</TableHead><TableHead>Verdict, pooled</TableHead>
      </TableRow></TableHeader>
      <TableBody>{rows.map(p => <TableRow key={p.candidate} data-row={p.candidate}>
        <TableCell><Swatch name={p.candidate} /> {metrics[p.candidate].short}</TableCell>
        <TableCell>{seasonRange(p.seasons)}</TableCell>
        <TableCell numeric data-field="games" data-value={season === "pooled" ? p.games : results.candidates[p.candidate].seasons[season]?.games}>
          {(season === "pooled" ? p.games : results.candidates[p.candidate].seasons[season]?.games ?? 0).toLocaleString("en-US")}</TableCell>
        {SCORES.map(s => <GainCell key={s} pair={p} score={s} season={season} />)}
        <TableCell numeric data-field="lower" data-value={p.seasons_candidate_lower_rmse}>{p.seasons_candidate_lower_rmse} of {p.seasons.length}</TableCell>
        <TableCell data-field="verdict" data-value={p.verdict}>{VERDICT_TEXT[p.verdict]}</TableCell>
      </TableRow>)}</TableBody>
    </Table>
    {rows.length === 0 && <GatedNote>No metric shares {season} with {metrics[reference].short}.</GatedNote>}
  </Section>;
}

// ---- 2026-27 -----------------------------------------------------------------------------------

function GroupTable({ page, group, label }: { page: MetricBacktestPage; group: ProspectiveGroup; label: string }) {
  const { metrics, results } = page;
  const baseline = results.registration.parameters.baseline;
  if (!group.games || !group.candidates) return <GatedNote>No {label.toLowerCase()} games scored yet.</GatedNote>;
  const gain = (name: string) => group.pairs?.find(p => (p.candidate === name && p.reference === baseline));
  return <Table aria-label={`${label} 2026-27 games`} density="compact" data-table={`season-2026-27-${label.toLowerCase()}`}>
    <TableHeader><TableRow hoverable={false}>
      <TableHead>Metric</TableHead><TableHead align="right">Margin RMSE</TableHead><TableHead align="right">Winner picked</TableHead>
      <TableHead align="right">Brier</TableHead><TableHead align="right">RMSE gain over {metrics[baseline].short}, 95%</TableHead>
      <TableHead align="right">Minutes replaced</TableHead>
    </TableRow></TableHeader>
    <TableBody>{results.registration.parameters.candidates.map(name => {
      const row = group.candidates![name];
      const g = gain(name);
      return <TableRow key={name} data-row={name}>
        <TableCell><Swatch name={name} /> {metrics[name].short}</TableCell>
        <TableCell numeric data-field="rmse" data-value={row.rmse}>{fixed(row.rmse)}</TableCell>
        <TableCell numeric data-field="accuracy" data-value={row.accuracy}>{percent(row.accuracy)}</TableCell>
        <TableCell numeric data-field="brier" data-value={row.brier}>{fixed(row.brier, 4)}</TableCell>
        {name === baseline ? <TableCell numeric>Baseline</TableCell>
          : g ? <TableCell numeric tone={gainTone(g.rmse)} data-field="gain" data-value={g.rmse.gain} data-low={g.rmse.low} data-high={g.rmse.high}>{gainText(g.rmse)}</TableCell>
            : <TableCell numeric data-field="gain" data-value="">Under {page.prospective.manifest.minimum_games_for_interval} games</TableCell>}
        <TableCell numeric data-field="replaced" data-value={row.replaced_minutes_share}>{percent(row.replaced_minutes_share)}</TableCell>
      </TableRow>;
    })}</TableBody>
  </Table>;
}

function ProspectiveSection({ page }: { page: MetricBacktestPage }) {
  const { manifest, summary } = page.prospective;
  return <Section title="2026-27, scored as the season goes"
    description={`The rules were frozen at ${manifest.frozen_at}, after the backtest, with each metric's scale fitted on 2025-26. Each completed game is added once and never rescored. A game counts as prospective only if it tipped after the freeze; earlier games are hindsight and shown apart. The backtest verdict is never updated from these games.`}>
    {!summary ? <GatedNote>No 2026-27 game has been scored yet.</GatedNote> : <>
      <p>Scored through {summary.scored_through ?? "no games"} (last run {summary.written_at.slice(0, 10)}): <strong data-field="prospective-games" data-value={summary.prospective.games}>{summary.prospective.games}</strong> prospective games, {summary.hindsight.games} hindsight games.</p>
      <h3>Prospective, after the freeze</h3>
      <GroupTable page={page} group={summary.prospective} label="Prospective" />
      <h3>Hindsight, before the freeze</h3>
      <GroupTable page={page} group={summary.hindsight} label="Hindsight" />
    </>}
  </Section>;
}

// ---- Words -------------------------------------------------------------------------------------

function MetricNotes({ page }: { page: MetricBacktestPage }) {
  const { results, metrics, omitted } = page;
  return <Section title="What each metric is" description="Every rating is fixed before the games it predicts. Season-end fits are used only for the next season's games.">
    <dl>
      {results.registration.parameters.candidates.map(name => <div key={name} data-row={name}>
        <dt><Swatch name={name} /> {metrics[name].label}</dt>
        <dd>{metrics[name].what} Ratings from: {metrics[name].source}. Scored {seasonRange(results.candidates[name].test_seasons)}. Credit: {metrics[name].credit}</dd>
      </div>)}
      {Object.entries(omitted).map(([key, text]) => <div key={key} data-row={key}><dt>Left out: DARKO</dt><dd>{text}</dd></div>)}
    </dl>
  </Section>;
}

function Caveats({ page }: { page: MetricBacktestPage }) {
  const { results } = page;
  const p = results.registration.parameters;
  const replaced = (name: string) => {
    const seasons = Object.values(results.candidates[name].seasons).map(s => s.replaced_minutes_share);
    return `${percent(Math.min(...seasons))} to ${percent(Math.max(...seasons))}`;
  };
  const checked = Object.values(results.leakage).reduce((sum, l) => sum + l.game_ratings_checked, 0);
  return <Section title="Caveats">
    <ul>
      <li><strong>Actual minutes, on purpose.</strong> Each prediction weights players by the minutes they really played, which is hindsight. It isolates how good each rating is from how well anyone guesses playing time, so this is a test of ratings, not a game forecast.</li>
      <li><strong>The same games for every metric.</strong> Every regular-season game with a box score, {results.candidates[p.baseline].pooled.games.toLocaleString("en-US")} in {seasonRange(p.test_seasons)}. Within a season all metrics are scored on the same games, so paired differences compare like with like. Pooled rows above each cover their own seasons, so compare them through the paired differences, not row against row.</li>
      <li><strong>Players without a rating</strong> (rookies, call-ups, raw metrics under {p.raw_min_controls} possessions) take the 20th percentile of that source&apos;s own ratings, never zero. Share of minutes this covers, by season: plus-minus {replaced("plus_minus")}, RAPM 1Y {replaced("rapm_1y")}, monthly time decay {replaced("time_decay")}, Projected Impact {replaced("projected_impact")}. This favours metrics that rate rookies early, which is part of what is being tested.</li>
      <li><strong>Projected Impact has two test seasons</strong>, so its intervals are wider and a ranking needs both seasons. It is never scored on 2016-17 to 2023-24, which it was trained or selected on.</li>
      <li><strong>Box-prior RAPM skips 2024-25</strong>: the sealed 2023-24 fit has no box prior. Its 2025-26 scale comes from 2023-24. The Projected Impact and box-prior pair shares only 2025-26.</li>
      <li><strong>DARKO is left out</strong> of every comparison: only hindsight ratings are stored (see above).</li>
      <li><strong>Many comparisons.</strong> 95% intervals on 36 pairs are not adjusted for multiplicity; the more-than-half-of-seasons condition guards against one season deciding a pair.</li>
      <li><strong>Neutral sites.</strong> Only the 2019-20 bubble games count as neutral; the few other neutral-site games (NBA Cup semifinals, international games) get the home term.</li>
      <li><strong>Known before registering.</strong> Projected Impact&apos;s page had already published margin errors for itself, prior-season RAPM and the opener time-decay snapshot on 2024-25 and 2025-26, and Win Probability&apos;s for team form. Nothing here was changed because of them, and no choice was made from outcomes.</li>
      <li><strong>No leakage found.</strong> For {checked.toLocaleString("en-US")} game ratings, every source&apos;s inputs end before the game; a test proves changing later seasons&apos; results changes no earlier score.</li>
    </ul>
  </Section>;
}

function MethodCard({ page }: { page: MetricBacktestPage }) {
  const { results, prospective } = page;
  const p = results.registration.parameters;
  return <Section title="Method and reproducibility">
    <dl>
      <dt>Prediction</dt><dd>Margin = a × home + b × (home minus away of minutes ÷ 48 × rating). a, b and the residual SD are fitted on the latest earlier season the metric exists in. Win probability = Φ(margin ÷ SD).</dd>
      <dt>Scores</dt><dd>Margin RMSE (the verdict), winner picked, Brier, log loss, and calibration error over ten probability bins.</dd>
      <dt>Intervals</dt><dd>Paired game bootstrap within each season, {p.replicates.toLocaleString("en-US")} replicates, 95%, one set of draws shared by every metric. Seed 8008.</dd>
      <dt>Rule</dt><dd>{results.verdict.rule}.</dd>
      <dt>Registration</dt><dd><code>{results.registration.identity}</code> · <code>{results.registration.content_sha256.slice(0, 16)}</code>, committed before any score.</dd>
      <dt>Results</dt><dd><code data-field="results-sha" data-value={results.results_sha256}>{results.results_sha256.slice(0, 16)}</code>. Two runs from the seed give the same hash.</dd>
      <dt>2026-27 freeze</dt><dd>{prospective.manifest.frozen_at} · <code>{prospective.manifest.manifest_sha256.slice(0, 16)}</code></dd>
    </dl>
  </Section>;
}

// ---- Page --------------------------------------------------------------------------------------

export function MetricBacktestResearch() {
  const { data, error, loading, retry } = useFeed([], signal => getMetricBacktest(signal));
  const results = data?.results;
  const best = results?.verdict.best[0];
  const baseline = results?.registration.parameters.baseline ?? "team_net";
  const bestGain = data && best ? pairOf(data.results.pairs, best, baseline) : null;
  return <PageShell template="research">
    <PageHeader icon="chart-trend" title="Metric Backtest" subtitle="Which impact metric best predicts real game results, using only ratings from before each game." />
    {error && <FeedFailure error={error} retry={retry} what="The metric backtest" />}
    {loading && <FeedSkeleton label="Loading the metric backtest" />}
    {data && results && <ResearchLayout findings={<>
      <StatTile label="Best predictor" value={best ? data.metrics[best].short : "None"} footnote={best && bestGain ? `RMSE ${fixed(results.candidates[best].pooled.rmse)}; ${gainText(bestGain.pooled.rmse)} over the team baseline` : "No metric ranks above all others"} />
      <StatTile label="Team baseline error" value={fixed(results.candidates[baseline].pooled.rmse)} footnote={`Points RMSE, ${results.candidates[baseline].pooled.games.toLocaleString("en-US")} games`} />
      <StatTile label="Metrics ranked above the baseline" value={`${Object.values(results.verdict.against_baseline).filter(v => v === "candidate_better").length} of ${Object.keys(results.verdict.against_baseline).length}`} footnote="Under the registered rule" />
      <StatTile label="Prospective games" value={data.prospective.summary?.prospective.games ?? 0} footnote={`Since the freeze, ${data.prospective.manifest.frozen_at.slice(0, 10)}`} />
    </>}>
      <Section title="Which metric predicts games best?"
        description="For every regular-season game from 2016-17 to 2025-26, each metric predicts the home margin from players' ratings as they stood before the game, weighted by the minutes they actually played.">
        <ul data-field="verdict-summary">{verdictSentences(data).map(text => <li key={text}>{text}</li>)}</ul>
      </Section>
      <ChartSection page={data} />
      <Section title="Pooled scores" description="Each metric over its own test seasons. Errors are neutral numbers; differences between metrics are in the next table.">
        <PooledTable page={data} />
      </Section>
      <PairsSection page={data} />
      <ProspectiveSection page={data} />
      <MetricNotes page={data} />
      <Caveats page={data} />
      <MethodCard page={data} />
    </ResearchLayout>}
  </PageShell>;
}
