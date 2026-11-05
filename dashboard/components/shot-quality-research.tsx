"use client";

import { ReliabilityPlot } from "./charts";
import { EntityField } from "./entity-picker";
import { FeedFailure, FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { TeamLogo } from "./team-logo";
import { Field } from "./ui/field";
import { GatedNote } from "./ui/gated-note";
import { PlayerIdentity } from "./ui/identity";
import { Segmented, Select } from "./ui/kit";
import { PageHeader, Section } from "./ui/panel";
import { PageShell, ResearchLayout } from "./ui/page-shell";
import { StatTile } from "./ui/stat-tile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { seasonEra } from "@/lib/portrait-source";
import {
  formatFixed, formatInterval, formatPercentSigned, formatShare, formatSigned, formatWhole, GATE_LABELS, getPlayers,
  getPlayerShots, getShotQuality, MIN_FGA, reliabilityBins, SLICE_FAMILIES, SORT_OPTIONS, signTone,
  type Leaderboard, type MetricBlock, type ModelName, type PlayerRow, type ShotQualitySummary, type Sort
} from "@/lib/shot-quality";

/**
 * Research → Shot Quality (R05). A deliberately plain build-phase page (D13). The Players tab follows the
 * saved Databallr ShotQuality RAPM page (filters, ranked table in points per 100 shots, how to read,
 * methodology); the Model and Player tabs have no reference. Every number is the frozen
 * courtlens-expected-shot-v2 results'; exact values sit on `data-value` for the browser check.
 */
type Tab = "players" | "model" | "player";
const TABS = [
  { value: "players", label: "Players", icon: "trophy" },
  { value: "model", label: "Model", icon: "chart-line" },
  { value: "player", label: "Player", icon: "search" },
] as const;
const LATEST = "2025-26";
const MODEL_ORDER: ModelName[] = ["baseline", "reference", "logistic_spline", "lightgbm_31", "lightgbm_127"];
const value = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : "");
const pct = (v: number) => formatPercentSigned(v, 2);

function TeamCodes({ teams, season }: { teams: PlayerRow["teams"]; season: string }) {
  return <>{teams.map(t => <span key={t.team_id}>{t.tricode && <TeamLogo team={t.tricode} season={season} size={16} />} {t.tricode ?? t.team_id} </span>)}</>;
}

function PlayerCell({ row, season }: { row: PlayerRow; season: string }) {
  const [, ...others] = row.teams;
  return <TableCell data-player={row.player_id}>
    <PlayerIdentity playerId={row.player_id} name={row.player_name} team={row.tricode} size="sm" era={seasonEra(season, row.tricode)}
      href={`/players/${row.player_id}?season=${season}`}
      subtitle={others.length ? <TeamCodes teams={others} season={season} /> : undefined} />
  </TableCell>;
}

function ShotMaking({ row }: { row: Pick<PlayerRow, "shot_making" | "interval"> }) {
  return <>
    <TableCell numeric tone={signTone(row.shot_making)} data-value={value(row.shot_making)} data-field="shot_making">{formatSigned(row.shot_making)}</TableCell>
    <TableCell numeric data-value={value(row.interval?.[0])} data-high={value(row.interval?.[1])} data-field="interval">
      {formatInterval(row.interval, v => formatSigned(v))}</TableCell>
  </>;
}

function ShotCells({ row }: { row: PlayerRow | (Omit<PlayerRow, "player_name"> & { season: string }) }) {
  return <>
    <TableCell numeric data-value={row.fga} data-field="fga">{formatWhole(row.fga)}</TableCell>
    <TableCell numeric data-value={row.fg_pct} data-field="fg_pct">{formatShare(row.fg_pct)}</TableCell>
    <TableCell numeric data-value={row.three_share} data-field="three_share">{formatShare(row.three_share)}</TableCell>
    <TableCell numeric data-value={row.pps} data-field="pps">{formatFixed(row.pps)}</TableCell>
    <TableCell numeric data-value={row.xpps} data-field="xpps">{formatFixed(row.xpps)}</TableCell>
  </>;
}

const SHOT_HEADS = <>
  <TableHead align="right">FGA</TableHead><TableHead align="right">FG%</TableHead><TableHead align="right">3PA share</TableHead>
  <TableHead align="right">PPS</TableHead><TableHead align="right">xPPS</TableHead>
  <TableHead align="right">Shot-making /100</TableHead><TableHead align="right">95% interval</TableHead>
</>;

// ---- Players (Databallr reference: filters, ranked table, how to read, methodology) -------------

function Board({ board }: { board: Leaderboard }) {
  return <Table aria-label={`Shot-making ${board.season}`} density="compact" data-board="players">
    <TableHeader><TableRow hoverable={false}><TableHead align="right">#</TableHead><TableHead>Player</TableHead>{SHOT_HEADS}</TableRow></TableHeader>
    <TableBody>{board.rows.map((row, i) => <TableRow key={row.player_id} data-row={row.player_id}>
      <TableCell numeric>{i + 1}</TableCell>
      <PlayerCell row={row} season={board.season} />
      <ShotCells row={row} /><ShotMaking row={row} />
    </TableRow>)}</TableBody>
  </Table>;
}

function Players({ summary }: { summary: ShotQualitySummary }) {
  const { get, set } = useUrlState();
  const season = get("season") ?? LATEST;
  const sort = (get("sort") ?? "shot_making") as Sort;
  const team = get("team");
  const minFga = Number(get("minFga") ?? "300");
  const { data, error, loading, retry } = useFeed([season, sort, team, String(minFga)], signal => getPlayers(season, sort, team, minFga, signal));
  const league = summary.players.league[season];
  return <>
    <Section title="Player shot-making" description={`Points per 100 shots above or below the expected value of the same shots, relative to the league in the same season. Expected values come from the ${summary.model_labels[summary.players.model]} model, calibrated on ${summary.calibration.season}. Served for ${summary.players.seasons[0]} to ${summary.players.seasons.at(-1)}, the seasons no model was trained on, with at least ${summary.players.min_attempts} field-goal attempts.`}
      actions={<>
        <Field label="Season" layout="inline"><Select aria-label="Season" value={season} onChange={event => set({ season: event.target.value === LATEST ? null : event.target.value, team: null })}>
          {[...summary.players.seasons].reverse().map(s => <option key={s} value={s}>{s}</option>)}</Select></Field>
        <Field label="Team" layout="inline"><Select aria-label="Team" value={team ?? ""} onChange={event => set({ team: event.target.value || null })}>
          <option value="">All teams</option>
          {data?.status === "available" && data.teams.map(t => <option key={t.team_id} value={t.tricode ?? t.team_id}>{t.tricode ?? t.team_id}</option>)}</Select></Field>
        <Field label="Min FGA" layout="inline"><Select aria-label="Minimum field-goal attempts" value={String(minFga)} onChange={event => set({ minFga: event.target.value === "300" ? null : event.target.value })}>
          {MIN_FGA.map(m => <option key={m} value={m}>{m}+</option>)}</Select></Field>
        <Segmented label="Rank by" size="sm" value={sort} onChange={next => set({ sort: next === "shot_making" ? null : next })} options={SORT_OPTIONS} />
      </>}>
      {error && <FeedFailure error={error} retry={retry} what="Player shot-making" />}
      {loading && <FeedSkeleton label="Loading player shot-making" />}
      {data?.status === "unknown" && <GatedNote>{data.reason}</GatedNote>}
      {data?.status === "available" && <>
        {league && <p data-league={season} data-value={league.league_term}>League in {season}: {formatFixed(league.league_pps)} points per shot against {formatFixed(league.league_xpps)} expected (league term {formatSigned(league.league_term * 100)} per 100 shots, subtracted from every player). {data.rows.length} players shown; {data.unknown.length} with fewer than {summary.players.min_attempts} attempts have no shot-making value.</p>}
        <Board board={data} />
      </>}
    </Section>

    <Section title="How to read the numbers">
      <ul>
        <li>{summary.definitions.shot_making}</li>
        <li>{summary.definitions.xpps}</li>
        <li>{summary.definitions.pps}</li>
        <li>{summary.definitions.interval}</li>
        <li>Green is above expectation, red below. xPPS has no colour: easier shots are not better or worse play by themselves.</li>
      </ul>
    </Section>

    <Section title="Method and data">
      <ul>
        <li>{summary.definitions.target}</li>
        <li>{summary.definitions.features}</li>
        <li>{summary.credit}</li>
        <li>{summary.reference_note}</li>
        <li>Not reproduced from the reference: the oTS / oSQ / oMake / oFT RAPM decomposition and its defensive counterparts (Research block R06), the possession filter and CSV download.</li>
      </ul>
    </Section>
  </>;
}

// ---- Model (no reference) ------------------------------------------------------------------------

function MetricRows({ block, names, labels, scope }: { block: MetricBlock; names: ModelName[]; labels: Record<ModelName, string>; scope: string }) {
  return <>{names.filter(n => block.models[n]).map(name => {
    const m = block.models[name]!;
    const d = block.versus_baseline[name];
    return <TableRow key={name} data-metrics={`${scope}:${name}`}>
      <TableCell><strong>{labels[name]}</strong></TableCell>
      <TableCell numeric data-value={m.brier} data-field="brier">{formatFixed(m.brier, 4)}</TableCell>
      <TableCell numeric data-value={m.log_loss} data-field="log_loss">{formatFixed(m.log_loss, 4)}</TableCell>
      <TableCell numeric data-value={m.points_mae} data-field="points_mae">{formatFixed(m.points_mae, 4)}</TableCell>
      <TableCell numeric data-value={m.ece} data-field="ece">{formatFixed(m.ece, 4)}</TableCell>
      <TableCell numeric tone={d ? signTone(d.relative_brier.value) : undefined} data-value={value(d?.relative_brier.value)} data-field="relative_brier">{d ? pct(d.relative_brier.value) : "—"}</TableCell>
      <TableCell numeric data-value={value(d?.relative_brier.interval[0])} data-high={value(d?.relative_brier.interval[1])} data-field="relative_brier_interval">{d ? formatInterval(d.relative_brier.interval, pct) : "Reference"}</TableCell>
      <TableCell numeric tone={d ? signTone(d.relative_log_loss.value) : undefined} data-value={value(d?.relative_log_loss.value)} data-field="relative_log_loss">{d ? pct(d.relative_log_loss.value) : "—"}</TableCell>
    </TableRow>;
  })}</>;
}

const METRIC_HEAD = <TableHeader><TableRow hoverable={false}>
  <TableHead>Model</TableHead><TableHead align="right">Brier</TableHead><TableHead align="right">Log loss</TableHead>
  <TableHead align="right">Points MAE</TableHead><TableHead align="right">ECE</TableHead>
  <TableHead align="right">Brier vs baseline</TableHead><TableHead align="right">95% interval</TableHead><TableHead align="right">Log loss vs baseline</TableHead>
</TableRow></TableHeader>;

function Model({ summary }: { summary: ShotQualitySummary }) {
  const { selection: sel, test, calibration } = summary;
  const labels = summary.model_labels;
  const chosen = sel.chosen;
  const testNames = MODEL_ORDER.filter(n => test.pooled.models[n]);
  const curves = test.curves;
  const families = [...new Set(test.slices.map(s => s.family))];
  const p = summary.players.persistence;
  return <>
    <Section title="Model card" description="No Databallr reference: Databallr uses ShotQuality's paid tracking model and publishes no model card. Built from the registration.">
      <ul data-model-card="true">
        <li>{summary.definitions.target}</li>
        <li>{summary.definitions.features}</li>
        <li>Candidates, fixed before any fit: {(["logistic_spline", "lightgbm_31", "lightgbm_127"] as const).map(n => labels[n]).join("; ")}. Baseline: {labels.baseline}. Reference: {labels.reference}.</li>
        <li>Seasons: train 2014-15 to 2021-22 ({formatWhole(sel.training_attempts)} shots), select {sel.season}, calibrate {calibration.season}, test {test.seasons.join(" and ")}. Whole seasons; the models are never refitted.</li>
        <li>Selected on {sel.season}: <strong>{labels[chosen]}</strong>, the lowest Brier score. Calibration: Platt scaling on {calibration.season}{calibration.platt[chosen] ? ` (a = ${formatFixed(calibration.platt[chosen]!.a, 4)}, b = ${formatFixed(calibration.platt[chosen]!.b, 4)})` : ""}.</li>
        <li>Outcome: <strong data-outcome={summary.outcome}>{summary.outcome_text}</strong></li>
        <li>{summary.definitions.metrics}</li>
      </ul>
    </Section>

    <Section title={`Selection, ${sel.season} (uncalibrated)`} description={`Gate (same as v1): the selected candidate improves Brier by at least ${formatShare(sel.gate, 0)} over the baseline. Result: ${pct(sel.relative_brier)}, ${sel.passed ? "passed" : "failed"}. ${formatWhole(sel.metrics.attempts)} shots in ${sel.metrics.games} games.`}>
      <Table aria-label="Selection metrics" density="compact" data-table="selection">{METRIC_HEAD}
        <TableBody><MetricRows block={sel.metrics} names={MODEL_ORDER} labels={labels} scope="selection" /></TableBody></Table>
    </Section>

    <Section title={`Test, ${test.seasons.join(" and ")} (calibrated)`} description={`Seasons never used for any choice. ${formatWhole(test.pooled.attempts)} shots in ${test.pooled.games} games. Intervals: 95% game bootstrap, 2,000 replicates.`}>
      <Table aria-label="Test gates" density="compact" data-table="gates">
        <TableHeader><TableRow hoverable={false}><TableHead>Gate</TableHead><TableHead align="right">Value</TableHead><TableHead align="right">95% interval</TableHead><TableHead>Result</TableHead></TableRow></TableHeader>
        <TableBody>
          {test.gates.relative_brier && <TableRow data-gate="relative_brier"><TableCell>{GATE_LABELS.relative_brier}</TableCell>
            <TableCell numeric data-value={test.gates.relative_brier.value}>{pct(test.gates.relative_brier.value)}</TableCell>
            <TableCell numeric data-value={test.gates.relative_brier.brier_difference_interval[0]} data-high={test.gates.relative_brier.brier_difference_interval[1]}>Brier difference {formatInterval(test.gates.relative_brier.brier_difference_interval, v => formatFixed(v, 4))}</TableCell>
            <TableCell>{test.gates.relative_brier.passed ? "Passed" : "Failed"}</TableCell></TableRow>}
          {test.gates.log_loss && <TableRow data-gate="log_loss"><TableCell>{GATE_LABELS.log_loss}</TableCell>
            <TableCell numeric data-value={test.gates.log_loss.difference}>{formatFixed(test.gates.log_loss.difference, 4)}</TableCell>
            <TableCell numeric data-value={test.gates.log_loss.interval[0]} data-high={test.gates.log_loss.interval[1]}>{formatInterval(test.gates.log_loss.interval, v => formatFixed(v, 4))}</TableCell>
            <TableCell>{test.gates.log_loss.passed ? "Passed" : "Failed"}</TableCell></TableRow>}
          {test.gates.ece && <TableRow data-gate="ece"><TableCell>{GATE_LABELS.ece}</TableCell>
            <TableCell numeric data-value={test.gates.ece.value}>{formatFixed(test.gates.ece.value, 4)}</TableCell><TableCell numeric>—</TableCell>
            <TableCell>{test.gates.ece.passed ? "Passed" : "Failed"}</TableCell></TableRow>}
        </TableBody>
      </Table>
      <Table aria-label="Test metrics" density="compact" data-table="test">{METRIC_HEAD}
        <TableBody>
          <MetricRows block={test.pooled} names={testNames} labels={labels} scope="test" />
          {Object.entries(test.by_season).map(([season, block]) => <MetricRows key={season} block={block} names={testNames}
            labels={Object.fromEntries(testNames.map(n => [n, `${season}: ${labels[n]}`])) as Record<ModelName, string>} scope={`test-${season}`} />)}
        </TableBody>
      </Table>
      <p data-uncalibrated={chosen} data-value={value(test.uncalibrated.versus_baseline[chosen]?.relative_brier.value)}>Before calibration the selected model improved test Brier by {pct(test.uncalibrated.versus_baseline[chosen]?.relative_brier.value ?? NaN)} (ECE {formatFixed(test.uncalibrated.models[chosen]?.ece, 4)}); the baseline&apos;s ECE was {formatFixed(test.uncalibrated.models.baseline?.ece, 4)}. The gates are registered on calibrated values.</p>
    </Section>

    <Section title="Calibration on the test seasons" description="Twenty equal-count bins of predicted make probability, calibrated predictions.">
      <ReliabilityPlot title="Predicted against observed make rate" label="Test calibration: predicted make probability against observed make rate"
        source={`Frozen ${summary.registration.identity} results`} sample={`${formatWhole(test.pooled.attempts)} test shots, 20 bins per model`}
        note="Dashed line: observed = predicted. Exact bins in the table below."
        series={[{ name: labels.baseline, bins: reliabilityBins(curves.baseline) }, { name: labels[chosen], bins: reliabilityBins(curves[chosen]) }]} />
      <Table aria-label="Calibration bins" density="compact" data-table="curve">
        <TableHeader><TableRow hoverable={false}><TableHead align="right">Bin</TableHead><TableHead align="right">Shots</TableHead>
          <TableHead align="right">Baseline predicted</TableHead><TableHead align="right">Baseline observed</TableHead>
          <TableHead align="right">Selected predicted</TableHead><TableHead align="right">Selected observed</TableHead></TableRow></TableHeader>
        <TableBody>{(curves[chosen] ?? curves.baseline ?? []).map((bin, i) => {
          const b = curves.baseline?.[i];
          return <TableRow key={bin.bin} data-bin={bin.bin}>
            <TableCell numeric>{bin.bin}</TableCell><TableCell numeric data-value={bin.count}>{formatWhole(bin.count)}</TableCell>
            <TableCell numeric data-value={value(b?.mean_predicted)}>{formatShare(b?.mean_predicted)}</TableCell>
            <TableCell numeric data-value={value(b?.observed)}>{formatShare(b?.observed)}</TableCell>
            <TableCell numeric data-value={bin.mean_predicted}>{formatShare(bin.mean_predicted)}</TableCell>
            <TableCell numeric data-value={bin.observed}>{formatShare(bin.observed)}</TableCell>
          </TableRow>;
        })}</TableBody>
      </Table>
    </Section>

    <Section title="Where the model gains" description={`Brier improvement of the selected model over the baseline by shot type and situation, pooled test seasons (reported, no gate). Slices under 200 shots are not scored.`}>
      <Table aria-label="Test slices" density="compact" data-table="slices">
        <TableHeader><TableRow hoverable={false}><TableHead>Slice</TableHead><TableHead align="right">Shots</TableHead>
          <TableHead align="right">Baseline Brier</TableHead><TableHead align="right">Selected Brier</TableHead>
          <TableHead align="right">Brier vs baseline</TableHead><TableHead align="right">95% interval</TableHead></TableRow></TableHeader>
        <TableBody>{families.flatMap(family => test.slices.filter(s => s.family === family).map(s => {
          const d = s.metrics?.versus_baseline[chosen];
          return <TableRow key={`${family}-${s.label}`} data-slice={`${family}:${s.label}`}>
            <TableCell>{SLICE_FAMILIES[family] ?? family}: {s.label}</TableCell>
            <TableCell numeric data-value={s.attempts}>{formatWhole(s.attempts)}</TableCell>
            <TableCell numeric data-value={value(s.metrics?.models.baseline?.brier)}>{formatFixed(s.metrics?.models.baseline?.brier, 4)}</TableCell>
            <TableCell numeric data-value={value(s.metrics?.models[chosen]?.brier)}>{formatFixed(s.metrics?.models[chosen]?.brier, 4)}</TableCell>
            <TableCell numeric tone={signTone(d?.relative_brier.value)} data-value={value(d?.relative_brier.value)}>{d ? pct(d.relative_brier.value) : "Too few shots"}</TableCell>
            <TableCell numeric data-value={value(d?.relative_brier.interval[0])} data-high={value(d?.relative_brier.interval[1])}>{d ? formatInterval(d.relative_brier.interval, pct) : "—"}</TableCell>
          </TableRow>;
        }))}</TableBody>
      </Table>
    </Section>

    <Section title="Is shot-making persistent?" description={`Weighted correlation of a player's value in consecutive served seasons (${p.pairs} pairs, ${p.players} players, at least ${summary.players.min_attempts} attempts in both; weight: harmonic mean of attempts). 95% player-cluster bootstrap intervals. Reported, no gate.`}>
      <Table aria-label="Persistence" density="compact" data-table="persistence">
        <TableHeader><TableRow hoverable={false}><TableHead>Measure</TableHead><TableHead align="right">r, season to season</TableHead><TableHead align="right">95% interval</TableHead></TableRow></TableHeader>
        <TableBody>{([["shot_making", "Shot-making (PPS − xPPS − league term)"], ["pps_minus_league", "PPS minus league PPS"], ["xpps", "xPPS (shot quality)"]] as const).map(([key, label]) =>
          <TableRow key={key} data-persistence={key}><TableCell>{label}</TableCell>
            <TableCell numeric data-value={p[key].r}>{formatFixed(p[key].r)}</TableCell>
            <TableCell numeric data-value={p[key].interval[0]} data-high={p[key].interval[1]}>{formatInterval(p[key].interval, v => formatFixed(v))}</TableCell></TableRow>)}</TableBody>
      </Table>
    </Section>

    <Section title="Data check" description="Every field-goal attempt in the NBA shot chart, joined to its play-by-play event by game and event number. A shot without a join keeps its location and shot type; its game context is unknown, never zero.">
      <Table aria-label="Data check" density="compact" data-table="data">
        <TableHeader><TableRow hoverable={false}><TableHead>Season</TableHead><TableHead align="right">Shots</TableHead><TableHead align="right">Games</TableHead>
          <TableHead align="right">Joined</TableHead><TableHead align="right">Possession known</TableHead><TableHead align="right">And-ones (not modelled)</TableHead>
          <TableHead align="right">Missed shots with an assist</TableHead></TableRow></TableHeader>
        <TableBody>{Object.entries(summary.data).map(([season, d]) => <TableRow key={season} data-season={season}>
          <TableCell>{season}</TableCell><TableCell numeric data-value={d.rows}>{formatWhole(d.rows)}</TableCell>
          <TableCell numeric data-value={d.games}>{formatWhole(d.games)}</TableCell>
          <TableCell numeric data-value={d.join_rate}>{formatShare(d.join_rate, 3)}</TableCell>
          <TableCell numeric data-value={d.possession_known_rate}>{formatShare(d.possession_known_rate, 2)}</TableCell>
          <TableCell numeric data-value={d.and_ones}>{formatWhole(d.and_ones)}</TableCell>
          <TableCell numeric data-value={d.assist_in_description.missed_True ?? 0}>{formatWhole(d.assist_in_description.missed_True ?? 0)}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
      <p>Registration <code>{summary.registration.content_sha256.slice(0, 16)}</code> · results <code>{summary.results_sha256.slice(0, 16)}</code>. Two runs from the seed give the same hash.</p>
    </Section>
  </>;
}

// ---- Player (no reference) -----------------------------------------------------------------------

function PlayerTab({ summary }: { summary: ShotQualitySummary }) {
  const { get, set } = useUrlState();
  const playerId = get("player");
  const { data, error, loading, retry } = useFeed([playerId], signal => getPlayerShots(playerId, signal));
  const latest = data?.seasons?.at(-1);
  return <Section title="Player" description="No Databallr reference for this view. A player's shot-making in each served season, with intervals.">
    <EntityField label="Player" value={data?.player_id ?? playerId ?? ""} season={latest?.season ?? LATEST} phase="regular_season"
      initialName={data?.player_name} onChange={next => set({ player: next || null })} />
    {error && <FeedFailure error={error} retry={retry} what="The player's shot-making" />}
    {loading && <FeedSkeleton label="Loading the player's shot-making" />}
    {data && <>
      <PlayerIdentity playerId={data.player_id} name={data.player_name} team={latest?.tricode ?? null} size="md"
        era={latest ? seasonEra(latest.season, latest.tricode) : undefined}
        href={`/players/${data.player_id}${latest ? `?season=${latest.season}` : ""}`} subtitle={latest ? `${latest.season} regular season` : undefined} />
      {data.selection_rule && <p data-rule="default">{data.selection_rule}</p>}
      {data.status === "unknown" && <GatedNote>{data.reason}</GatedNote>}
      {data.seasons && <Table aria-label="Shot-making by season" density="compact" data-table="history">
        <TableHeader><TableRow hoverable={false}><TableHead>Season</TableHead><TableHead>Team</TableHead>{SHOT_HEADS}<TableHead>Status</TableHead></TableRow></TableHeader>
        <TableBody>{data.seasons.map(row => <TableRow key={row.season} data-season={row.season}>
          <TableCell>{row.season}</TableCell><TableCell><TeamCodes teams={row.teams} season={row.season} /></TableCell>
          <ShotCells row={row} /><ShotMaking row={row} />
          <TableCell>{row.status === "served" ? "Served" : `Unknown: ${row.reason}`}</TableCell>
        </TableRow>)}</TableBody>
      </Table>}
      <p>{summary.definitions.interval}</p>
    </>}
  </Section>;
}

// ---- Page ----------------------------------------------------------------------------------------

export function ShotQualityResearch() {
  const { get, set } = useUrlState();
  const tab = (get("tab") ?? "players") as Tab;
  const { data, error, loading, retry } = useFeed([], signal => getShotQuality(signal));
  const gate = data?.test.gates;
  return <PageShell template="research">
    <PageHeader icon="scatter" title="Shot Quality" subtitle="Expected points for every field-goal attempt from free NBA shot and play-by-play data, and each player's shot-making above or below it." />
    <Segmented label="Shot Quality view" value={tab} onChange={next => set({ tab: next === "players" ? null : next })} options={TABS} />
    {error && <FeedFailure error={error} retry={retry} what="Shot Quality" />}
    {loading && <FeedSkeleton label="Loading Shot Quality" />}
    {data && <ResearchLayout findings={<>
      <StatTile label="Test: Brier vs baseline" value={gate?.relative_brier ? pct(gate.relative_brier.value) : "—"}
        footnote={`${data.test.seasons.join(" and ")}, ${data.model_labels[data.selection.chosen]}`} />
      <StatTile label="Test: calibration error" value={gate?.ece ? formatFixed(gate.ece.value, 4) : "—"} footnote="ECE, ten bins; gate at most 0.02" />
      <StatTile label="Outcome" value={data.outcome === "accepted" ? "Accepted" : "Negative result"} footnote={`Selection ${pct(data.selection.relative_brier)} on ${data.selection.season}`} />
    </>}>
      {tab === "players" && <Players summary={data} />}
      {tab === "model" && <Model summary={data} />}
      {tab === "player" && <PlayerTab summary={data} />}
    </ResearchLayout>}
  </PageShell>;
}
