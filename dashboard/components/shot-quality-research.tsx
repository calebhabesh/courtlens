"use client";

import { useMemo } from "react";
import { ReliabilityPlot } from "./charts";
import { EntityField } from "./entity-picker";
import { FeedFailure, FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { DECOMPOSITION_LATEST, openMethodology, ShotDecompositionTab } from "./shot-decomposition-tab";
import { SqPanel, Tiles, Toned } from "./shot-quality-figures";
import { TeamLogo } from "./team-logo";
import { GatedNote } from "./ui/gated-note";
import { PlayerAvatar, PlayerIdentity } from "./ui/identity";
import { Button, Segmented, Select } from "./ui/kit";
import { PageShell } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { MethodBlock, ResearchCard, ResearchCards, ResearchDisclosure, ResearchSection } from "./research/research-page";
import { ResearchTable, type ResearchColumn } from "./research/research-table";
import { GridValue, StatsGrid, type GridColumn } from "./research/stats-grid";
import { seasonEra } from "@/lib/portrait-source";
import { getDecompositionBoard, TARGETS, type DecompositionBoard, type DecompositionRow, type UnknownSeason } from "@/lib/shot-decomposition";
import {
  formatFixed, formatInterval, formatPercentSigned, formatShare, formatSigned, formatWhole, GATE_LABELS, getPlayers,
  getPlayerShots, getShotQuality, reliabilityBins, SLICE_FAMILIES,
  type MetricBlock, type ModelName, type PlayerRow, type ShotQualitySummary
} from "@/lib/shot-quality";

/*
 * Research → Shot Quality (R05 and R06 analyses; RD04 design after Databallr's ShotQuality RAPM page). Databallr's centred
 * hero through `PageHeader`, a 1352 px column (Databallr's measured width), then four views: Decomposition (the reference
 * page, default), Shot-making (R05's per-player view on the same table), Player and Model (no reference: CourtLens's own
 * design on the Research pattern). Colour: green/red only where a served interval excludes zero. Every number is the frozen
 * courtlens-expected-shot-v2 and courtlens-shot-decomposition-v1 results'; exact values sit on `data-*` for checks.
 */

type Tab = "decomposition" | "shot-making" | "player" | "model";
const TABS = [
  { value: "decomposition", label: "Decomposition", icon: "split" },
  { value: "shot-making", label: "Shot-making", icon: "target" },
  { value: "player", label: "Player", icon: "search" },
  { value: "model", label: "Model", icon: "chart-line" },
] as const;
const LEGACY_TABS: Record<string, Tab> = { players: "shot-making" };
const LATEST = "2025-26";
const NO_PLAYER = "none";
const MODEL_ORDER: ModelName[] = ["baseline", "reference", "logistic_spline", "lightgbm_31", "lightgbm_127"];
const pct = (v: number | null | undefined) => formatPercentSigned(v, 2);
const known = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
/** A served definition without its leading "Term: " (the card's kicker names it). */
const definition = (text: string) => { const body = text.replace(/^[^:]{1,24}: /, ""); return body.charAt(0).toUpperCase() + body.slice(1); };

function TeamCodes({ teams, season }: { teams: PlayerRow["teams"]; season: string }) {
  return <span className="sq-teams">{teams.map(t => <span key={t.team_id} className="sq-team">{t.tricode && <TeamLogo team={t.tricode} season={season} size={16} />}{t.tricode ?? t.team_id}</span>)}</span>;
}

// ---- Shot-making (R05 players, Databallr's table look) ---------------------------------------------

function ShotMaking({ summary }: { summary: ShotQualitySummary }) {
  const { get, set } = useUrlState();
  const season = get("season") ?? LATEST;
  const minFga = summary.players.min_attempts;
  const { data, error, loading, retry } = useFeed([season], signal => getPlayers(season, "shot_making", null, minFga, signal));
  const league = summary.players.league[season];
  const columns = useMemo<ResearchColumn<PlayerRow>[]>(() => [
    { key: "fga", label: "FGA", title: "Field-goal attempts", value: r => r.fga },
    { key: "fg_pct", label: "FG%", title: "Field-goal percentage", value: r => r.fg_pct, format: v => formatShare(v), width: "text" },
    { key: "three_share", label: "3PA share", title: "Share of attempts from three", value: r => r.three_share, format: v => formatShare(v), width: "text" },
    { key: "pps", label: "PPS", title: summary.definitions.pps, value: r => r.pps, format: v => formatFixed(v), width: "text" },
    { key: "xpps", label: "xPPS", title: summary.definitions.xpps, value: r => r.xpps, format: v => formatFixed(v), width: "text" },
    { key: "shot_making", label: "Shot-making /100", title: summary.definitions.shot_making, signedValue: true, digits: 1, value: r => r.shot_making,
      interval: r => ({ low: r.interval?.[0] ?? null, high: r.interval?.[1] ?? null }), unknown: r => r.reason ?? undefined },
  ], [summary]);
  const seasonSelect = <Select size="md" aria-label="Season" value={season} onChange={event => set({ season: event.target.value === LATEST ? null : event.target.value })}>
    {[...summary.players.seasons].reverse().map(s => <option key={s} value={s}>{s}</option>)}</Select>;
  return <>
    <section className="sq-board-section" aria-label="Player shot-making">
      {error && <FeedFailure error={error} retry={retry} what="Player shot-making" />}
      {loading && <FeedSkeleton label="Loading player shot-making" />}
      {data?.status === "unknown" && <SqPanel className="sq-unknown" label="Season"><div className="sq-control-row">{seasonSelect}</div><GatedNote>{data.reason}</GatedNote></SqPanel>}
      {data?.status === "available" && <ResearchTable label={`Shot-making ${data.season}`} className="sq-board sq-players" rows={data.rows} rowKey={r => r.player_id} name={r => r.player_name}
        team={r => r.tricode} teamPicker season={data.season} views={[{ value: "shot-making", label: "Shot-making", columns }]} defaultSort="shot_making" noun="players" intervalLevel={95}
        player={r => { const [, ...others] = r.teams; return <PlayerIdentity playerId={r.player_id} name={r.player_name} team={r.tricode} size="sm" era={seasonEra(data.season, r.tricode)}
          href={`/players/${r.player_id}?season=${data.season}`} subtitle={others.length ? <TeamCodes teams={others} season={data.season} /> : undefined} />; }}
        minimum={{ label: "Min FGA", value: r => r.fga, initial: minFga, step: 50 }}
        csv={{ filename: `courtlens-shot-making-${data.season}.csv`, columns: [
          { header: "player_id", value: r => r.player_id }, { header: "player", value: r => r.player_name }, { header: "team", value: r => r.tricode },
          { header: "fga", value: r => r.fga }, { header: "fg_pct", value: r => r.fg_pct }, { header: "three_share", value: r => r.three_share },
          { header: "pps", value: r => r.pps }, { header: "xpps", value: r => r.xpps }, { header: "shot_making", value: r => r.shot_making },
          { header: "shot_making_p2_5", value: r => r.interval?.[0] ?? null }, { header: "shot_making_p97_5", value: r => r.interval?.[1] ?? null },
        ] }}
        actions={<>{seasonSelect}<Button size="md" icon="book" onClick={() => openMethodology("shot-making-method")}>Methodology</Button></>}
        footnote={league && <span data-league={season} data-value={league.league_term} data-count={data.rows.length} data-unknown={data.unknown.length}>
          Points per 100 shots above the expected value of the same shots, net of the league ({formatFixed(league.league_pps)} points per shot against
          {" "}{formatFixed(league.league_xpps)} expected in {season}, a league term of {formatSigned(league.league_term * 100)}). xPPS has no colour: easier
          shots are not better or worse play by themselves. {formatWhole(data.unknown.length)} players with fewer than {minFga} attempts have no value.
        </span>} />}
    </section>
    <ResearchSection icon="book" title="How to Read the Numbers">
      <ResearchCards columns={3}>
        <ResearchCard kicker="Shot-making" tone="a"><p className="sq-text">{definition(summary.definitions.shot_making)}</p></ResearchCard>
        <ResearchCard kicker="xPPS"><p className="sq-text">{definition(summary.definitions.xpps)}</p></ResearchCard>
        <ResearchCard kicker="PPS"><p className="sq-text">{definition(summary.definitions.pps)}</p></ResearchCard>
      </ResearchCards>
      <p className="sq-note">{summary.definitions.interval} This is the shooter&apos;s own making; the Decomposition tab&apos;s oMake is the lineup&apos;s, adjusted for everyone on the floor.</p>
    </ResearchSection>
    <ResearchDisclosure id="shot-making-method" icon="layers" title="Caveats & Methodology">
      <MethodBlock title="The expected value of a shot"><ul className="sq-list"><li>{summary.definitions.target}</li><li>{summary.definitions.features}</li></ul></MethodBlock>
      <MethodBlock title="Seasons">
        <p className="sq-text">Served for {summary.players.seasons[0]} to {summary.players.seasons.at(-1)}, the seasons no model was trained on, from the
          {" "}{summary.model_labels[summary.players.model]} model calibrated on {summary.calibration.season}. A player needs {minFga} field-goal attempts in the season.</p>
      </MethodBlock>
      <MethodBlock title="Data & credits">
        <p className="sq-text">{summary.credit}</p>
        <p className="sq-text">{summary.reference_note} Design reference: Databallr&apos;s ShotQuality RAPM page.</p>
      </MethodBlock>
    </ResearchDisclosure>
  </>;
}

// ---- Model (no reference) --------------------------------------------------------------------------

interface MetricRow { key: string; label: string; name: ModelName; block: MetricBlock }
function metricColumns(): GridColumn<MetricRow>[] {
  const metric = (key: "brier" | "log_loss" | "points_mae" | "ece", label: string): GridColumn<MetricRow> => ({
    key, label, width: "sm", cell: r => <GridValue text={formatFixed(r.block.models[r.name]?.[key], 4)} />, data: r => ({ field: key, value: r.block.models[r.name]?.[key] }) });
  return [
    metric("brier", "Brier"), metric("log_loss", "Log loss"), metric("points_mae", "Points MAE"), metric("ece", "ECE"),
    { key: "relative_brier", label: "Brier vs baseline", width: "md", cell: r => { const d = r.block.versus_baseline[r.name]?.relative_brier;
      return d ? <><Toned text={pct(d.value)} value={d.value} low={d.interval[0]} high={d.interval[1]} level={95} field="relative_brier" /><span className="rs-grid-sub">{formatInterval(d.interval, pct)}</span></> : <GridValue text="Reference" muted />; } },
    { key: "relative_log_loss", label: "Log loss vs baseline", width: "md", cell: r => { const d = r.block.versus_baseline[r.name]?.relative_log_loss;
      return d ? <><Toned text={pct(d.value)} value={d.value} low={d.interval[0]} high={d.interval[1]} level={95} field="relative_log_loss" /><span className="rs-grid-sub">{formatInterval(d.interval, pct)}</span></> : <GridValue text="—" />; } },
  ];
}

function MetricGrid({ label, name, rows }: { label: string; name: string; rows: MetricRow[] }) {
  return <StatsGrid label={label} name={name} density="compact" height="auto" leadWidth="xl" rows={rows} rowKey={r => r.key} rowData={r => ({ metrics: r.key })}
    lead={{ label: "Model", cell: r => <span className="sq-cell-strong">{r.label}</span> }} columns={metricColumns()} />;
}

function Model({ summary }: { summary: ShotQualitySummary }) {
  const { selection: sel, test, calibration } = summary;
  const labels = summary.model_labels;
  const chosen = sel.chosen;
  const gates = test.gates;
  const testNames = MODEL_ORDER.filter(n => test.pooled.models[n]);
  const families = [...new Set(test.slices.map(s => s.family))];
  const p = summary.players.persistence;
  const platt = calibration.platt[chosen];
  const slices = families.flatMap(f => test.slices.filter(s => s.family === f));
  type SliceRow = (typeof slices)[number];
  const gateRows = [
    gates.relative_brier && { key: "relative_brier", label: GATE_LABELS.relative_brier, text: pct(gates.relative_brier.value), value: gates.relative_brier.value,
      interval: gates.relative_brier.brier_difference_interval, intervalText: `Brier difference ${formatInterval(gates.relative_brier.brier_difference_interval, v => formatFixed(v, 4))}`, passed: gates.relative_brier.passed },
    gates.log_loss && { key: "log_loss", label: GATE_LABELS.log_loss, text: formatFixed(gates.log_loss.difference, 4), value: gates.log_loss.difference,
      interval: gates.log_loss.interval, intervalText: formatInterval(gates.log_loss.interval, v => formatFixed(v, 4)), passed: gates.log_loss.passed },
    gates.ece && { key: "ece", label: GATE_LABELS.ece, text: formatFixed(gates.ece.value, 4), value: gates.ece.value, interval: null, intervalText: "No interval: a threshold", passed: gates.ece.passed },
  ].filter((g): g is NonNullable<typeof g> => Boolean(g));
  type GateRow = (typeof gateRows)[number];
  return <>
    <section className="sq-model-head" aria-label="Test results">
      <Tiles label="Key findings" tiles={[
        { key: "brier", label: "Test: Brier vs baseline", value: gates.relative_brier ? <Toned text={pct(gates.relative_brier.value)} value={gates.relative_brier.value}
          low={gates.relative_brier.brier_difference_interval[0]} high={gates.relative_brier.brier_difference_interval[1]} level={95} /> : "—",
          foot: `${test.seasons.join(" and ")}, ${labels[chosen]}` },
        { key: "ece", label: "Test: calibration error", value: gates.ece ? <span data-value={gates.ece.value}>{formatFixed(gates.ece.value, 4)}</span> : "—", foot: "ECE, ten bins; gate at most 0.02" },
        { key: "outcome", label: "Outcome", value: <span data-outcome={summary.outcome}>{summary.outcome === "accepted" ? "Accepted" : "Negative result"}</span>,
          foot: `Selection ${pct(sel.relative_brier)} on ${sel.season}` },
      ]} />
      <p className="sq-text sq-lead">{summary.outcome_text}</p>
    </section>

    <ResearchSection icon="info" title="Model Card">
      <p className="sq-note">No Databallr counterpart: Databallr reads ShotQuality&apos;s paid tracking model, which publishes no model card. This one is built from the registration.</p>
      <ResearchCards columns={2} label="Model card">
        <ResearchCard kicker="What it predicts"><p className="sq-text">{summary.definitions.target}</p></ResearchCard>
        <ResearchCard kicker="What it reads"><p className="sq-text">{summary.definitions.features}</p></ResearchCard>
        <ResearchCard kicker="Candidates"><p className="sq-text">Fixed before any fit: {(["logistic_spline", "lightgbm_31", "lightgbm_127"] as const).map(n => labels[n]).join("; ")}.
          Baseline: {labels.baseline}. Reference: {labels.reference}.</p></ResearchCard>
        <ResearchCard kicker="Seasons"><p className="sq-text">Train 2014-15 to 2021-22 ({formatWhole(sel.training_attempts)} shots), select on {sel.season}, calibrate on
          {" "}{calibration.season}, test on {test.seasons.join(" and ")}. Whole seasons; the models are never refitted.</p></ResearchCard>
        <ResearchCard kicker="Chosen" tone="a"><p className="sq-text">Selected on {sel.season}: <strong>{labels[chosen]}</strong>, the lowest Brier score.
          Platt scaling on {calibration.season}{platt ? ` (a = ${formatFixed(platt.a, 4)}, b = ${formatFixed(platt.b, 4)})` : ""}.</p></ResearchCard>
        <ResearchCard kicker="Scores"><p className="sq-text">{summary.definitions.metrics}</p></ResearchCard>
      </ResearchCards>
    </ResearchSection>

    <ResearchSection icon="check" title={`Test Gates, ${test.seasons.join(" and ")}`}>
      <p className="sq-text">Seasons never used for any choice: {formatWhole(test.pooled.attempts)} shots in {formatWhole(test.pooled.games)} games, calibrated.
        Intervals are 95% game bootstraps (2,000 replicates); a value is green only when its interval clears zero.</p>
      <StatsGrid label="Test gates" name="gates" density="compact" height="auto" leadWidth="xl" rows={gateRows} rowKey={g => g.key} rowData={g => ({ gate: g.key })}
        lead={{ label: "Gate", cell: g => <span className="sq-cell-text">{g.label}</span> }}
        columns={[
          { key: "value", label: "Value", width: "sm", cell: (g: GateRow) => <Toned text={g.text} value={g.value} low={g.interval?.[0]} high={g.interval?.[1]} level={95} field="value" /> },
          { key: "interval", label: "95% interval", width: "xl", cell: (g: GateRow) => <span className="sq-cell-text" data-value={g.interval?.[0]} data-high={g.interval?.[1]}>{g.intervalText}</span> },
          { key: "result", label: "Result", width: "sm", cell: (g: GateRow) => <GridValue text={g.passed ? "Passed" : "Failed"} />, data: (g: GateRow) => ({ passed: String(g.passed) }) },
        ]} />
      <MetricGrid label="Test metrics" name="test" rows={testNames.map(n => ({ key: `test:${n}`, label: labels[n], name: n, block: test.pooled }))} />
    </ResearchSection>

    <ResearchSection icon="chart-line" title="Calibration on the Test Seasons">
      <SqPanel className="sq-chart" label="Calibration chart">
        <ReliabilityPlot title="Predicted against observed make rate" label="Test calibration: predicted make probability against observed make rate"
          source={`Frozen ${summary.registration.identity} results`} sample={`${formatWhole(test.pooled.attempts)} test shots, 20 equal-count bins per model`}
          note="Dashed line: observed = predicted. Exact bins in Caveats & Methodology."
          series={[{ name: labels.baseline, bins: reliabilityBins(test.curves.baseline) }, { name: labels[chosen], bins: reliabilityBins(test.curves[chosen]) }]} />
      </SqPanel>
    </ResearchSection>

    <ResearchSection icon="crosshair" title="Where the Model Gains">
      <p className="sq-text">Brier improvement of {labels[chosen]} over the baseline by shot type and situation, pooled test seasons. Reported, no gate; slices
        under 200 shots are not scored.</p>
      <StatsGrid label="Test slices" name="slices" density="compact" height="auto" leadWidth="xl" rows={slices} rowKey={s => `${s.family}:${s.label}`} rowData={s => ({ slice: `${s.family}:${s.label}` })}
        lead={{ label: "Slice", cell: s => <span className="sq-cell-text"><span className="sq-muted">{SLICE_FAMILIES[s.family] ?? s.family}</span> {s.label}</span> }}
        columns={[
          { key: "shots", label: "Shots", width: "sm", cell: (s: SliceRow) => <GridValue text={formatWhole(s.attempts)} />, data: (s: SliceRow) => ({ value: s.attempts }) },
          { key: "baseline", label: "Baseline Brier", width: "sm", cell: (s: SliceRow) => <GridValue text={formatFixed(s.metrics?.models.baseline?.brier, 4)} />, data: (s: SliceRow) => ({ value: s.metrics?.models.baseline?.brier }) },
          { key: "selected", label: "Selected Brier", width: "sm", cell: (s: SliceRow) => <GridValue text={formatFixed(s.metrics?.models[chosen]?.brier, 4)} />, data: (s: SliceRow) => ({ value: s.metrics?.models[chosen]?.brier }) },
          { key: "relative", label: "Brier vs baseline", width: "md", cell: (s: SliceRow) => { const d = s.metrics?.versus_baseline[chosen]?.relative_brier;
            return d ? <><Toned text={pct(d.value)} value={d.value} low={d.interval[0]} high={d.interval[1]} level={95} field="relative_brier" /><span className="rs-grid-sub">{formatInterval(d.interval, pct)}</span></> : <GridValue text="Too few shots" muted />; } },
        ]} />
    </ResearchSection>

    <ResearchSection icon="activity" title="Is Shot-making Persistent?">
      <p className="sq-text">Weighted correlation of a player&apos;s value in consecutive served seasons: {formatWhole(p.pairs)} pairs, {formatWhole(p.players)} players with
        {" "}{summary.players.min_attempts} attempts in both, weighted by the harmonic mean of attempts, with 95% player-cluster bootstrap intervals. Reported, no gate.</p>
      <StatsGrid label="Persistence" name="persistence" density="compact" height="auto" leadWidth="xl" rows={(["shot_making", "pps_minus_league", "xpps"] as const).map(k => k)} rowKey={k => k} rowData={k => ({ persistence: k })}
        lead={{ label: "Measure", cell: k => <span className="sq-cell-text">{{ shot_making: "Shot-making (PPS − xPPS − league term)", pps_minus_league: "PPS minus league PPS", xpps: "xPPS (shot quality)" }[k]}</span> }}
        columns={[
          { key: "r", label: "r, season to season", width: "md", cell: k => <GridValue text={formatFixed(p[k].r)} />, data: k => ({ value: p[k].r }) },
          { key: "interval", label: "95% interval", width: "md", cell: k => <GridValue text={formatInterval(p[k].interval, v => formatFixed(v))} />, data: k => ({ value: p[k].interval[0], high: p[k].interval[1] }) },
        ]} />
    </ResearchSection>

    <ResearchDisclosure id="model-method" icon="layers" title="Caveats & Methodology">
      <MethodBlock title={`Selection, ${sel.season} (uncalibrated)`}>
        <p className="sq-text">Gate, unchanged from v1: the selected candidate improves Brier by at least {formatShare(sel.gate, 0)} over the baseline. Result
          {" "}{pct(sel.relative_brier)}, {sel.passed ? "passed" : "failed"}. {formatWhole(sel.metrics.attempts)} shots in {formatWhole(sel.metrics.games)} games.</p>
        <MetricGrid label="Selection metrics" name="selection" rows={MODEL_ORDER.filter(n => sel.metrics.models[n]).map(n => ({ key: `selection:${n}`, label: labels[n], name: n, block: sel.metrics }))} />
      </MethodBlock>
      <MethodBlock title="Test metrics by season">
        <MetricGrid label="Test metrics by season" name="test-seasons" rows={Object.entries(test.by_season).flatMap(([season, block]) => testNames.map(n => ({ key: `test-${season}:${n}`, label: `${season}: ${labels[n]}`, name: n, block })))} />
        <p className="sq-text" data-uncalibrated={chosen} data-value={test.uncalibrated.versus_baseline[chosen]?.relative_brier.value}>Before calibration the selected model improved test Brier
          by {pct(test.uncalibrated.versus_baseline[chosen]?.relative_brier.value)} (ECE {formatFixed(test.uncalibrated.models[chosen]?.ece, 4)}); the baseline&apos;s ECE was
          {" "}{formatFixed(test.uncalibrated.models.baseline?.ece, 4)}. The gates are registered on calibrated values.</p>
      </MethodBlock>
      <MethodBlock title="Calibration bins">
        <StatsGrid label="Calibration bins" name="curve" density="compact" height="auto" leadWidth="sm" rows={test.curves[chosen] ?? test.curves.baseline ?? []} rowKey={b => String(b.bin)} rowData={b => ({ bin: b.bin })}
          lead={{ label: "Bin", cell: b => <span className="sq-cell-strong">{b.bin}</span> }}
          columns={[
            { key: "count", label: "Shots", width: "sm", cell: b => <GridValue text={formatWhole(b.count)} />, data: b => ({ value: b.count }) },
            { key: "bp", label: "Baseline predicted", width: "md", cell: b => <GridValue text={formatShare(test.curves.baseline?.[b.bin - 1]?.mean_predicted)} />, data: b => ({ value: test.curves.baseline?.[b.bin - 1]?.mean_predicted }) },
            { key: "bo", label: "Baseline observed", width: "md", cell: b => <GridValue text={formatShare(test.curves.baseline?.[b.bin - 1]?.observed)} />, data: b => ({ value: test.curves.baseline?.[b.bin - 1]?.observed }) },
            { key: "sp", label: "Selected predicted", width: "md", cell: b => <GridValue text={formatShare(b.mean_predicted)} />, data: b => ({ value: b.mean_predicted }) },
            { key: "so", label: "Selected observed", width: "md", cell: b => <GridValue text={formatShare(b.observed)} />, data: b => ({ value: b.observed }) },
          ]} />
      </MethodBlock>
      <MethodBlock title="Data check">
        <p className="sq-text">Every field-goal attempt in the NBA shot chart, joined to its play-by-play event by game and event number. A shot without a join keeps its
          location and shot type; its game context is unknown, never zero.</p>
        <StatsGrid label="Data check" name="data" density="compact" height="auto" leadWidth="sm" rows={Object.keys(summary.data)} rowKey={s => s} rowData={s => ({ season: s })}
          lead={{ label: "Season", cell: s => <span className="sq-cell-strong">{s}</span> }}
          columns={[
            { key: "rows", label: "Shots", width: "sm", cell: s => <GridValue text={formatWhole(summary.data[s].rows)} />, data: s => ({ value: summary.data[s].rows }) },
            { key: "games", label: "Games", width: "xs", cell: s => <GridValue text={formatWhole(summary.data[s].games)} />, data: s => ({ value: summary.data[s].games }) },
            { key: "join", label: "Joined", width: "sm", cell: s => <GridValue text={formatShare(summary.data[s].join_rate, 3)} />, data: s => ({ value: summary.data[s].join_rate }) },
            { key: "poss", label: "Possession known", width: "md", cell: s => <GridValue text={formatShare(summary.data[s].possession_known_rate, 2)} />, data: s => ({ value: summary.data[s].possession_known_rate }) },
            { key: "and1", label: "And-ones (not modelled)", width: "md", cell: s => <GridValue text={formatWhole(summary.data[s].and_ones)} />, data: s => ({ value: summary.data[s].and_ones }) },
            { key: "assist", label: "Missed shots with an assist", width: "md", cell: s => <GridValue text={formatWhole(summary.data[s].assist_in_description.missed_True ?? 0)} />, data: s => ({ value: summary.data[s].assist_in_description.missed_True ?? 0 }) },
          ]} />
      </MethodBlock>
      <MethodBlock title="Data & credits">
        <p className="sq-text">{summary.credit}</p>
        <p className="sq-note">Registration <code>{summary.registration.content_sha256.slice(0, 16)}</code> · results <code>{summary.results_sha256.slice(0, 16)}</code>. Two runs from the seed give the same hash.</p>
      </MethodBlock>
    </ResearchDisclosure>
  </>;
}

// ---- Player (no reference; RD03 pattern) -----------------------------------------------------------

type History = NonNullable<Awaited<ReturnType<typeof getPlayerShots>>["seasons"]>[number];
interface SplitRow { season: string; row: DecompositionRow | null; reason: string | null }

/** The player's offensive split per decomposition season, from the season boards (no per-player endpoint). */
async function getSplits(playerId: string, seasons: readonly string[], signal: AbortSignal): Promise<SplitRow[]> {
  const boards = await Promise.all(seasons.map(s => getDecompositionBoard(s, "offense", "ts", null, 1000, signal)));
  return boards.map((b: DecompositionBoard | UnknownSeason, i) => {
    if (b.status !== "available") return { season: seasons[i], row: null, reason: b.reason };
    const row = b.rows.find(r => r.player_id === playerId) ?? null;
    const unknown = b.unknown.find(r => r.player_id === playerId);
    return { season: seasons[i], row, reason: row ? null : unknown ? unknown.reason : "Not on the floor enough this season to be rated." };
  });
}
const DECOMPOSITION_SEASONS = ["2022-23", "2023-24", "2024-25", DECOMPOSITION_LATEST];

function PlayerTab({ summary }: { summary: ShotQualitySummary }) {
  const { get, set } = useUrlState();
  const chosen = get("player");
  const cleared = chosen === NO_PLAYER;
  const { data, error, loading, retry } = useFeed([cleared ? NO_PLAYER : chosen], signal => cleared ? Promise.resolve(null) : getPlayerShots(chosen, signal));
  const playerId = data?.player_id ?? null;
  const splits = useFeed([playerId], signal => playerId ? getSplits(playerId, DECOMPOSITION_SEASONS, signal) : Promise.resolve(null));
  const history = data?.seasons ?? [];
  const latest = [...history].reverse().find(r => r.status === "served") ?? history.at(-1);
  const team = latest?.tricode ?? null;
  return <div className="sq-player" data-section="player">
    <SqPanel className="sq-controls" label="Player">
      <div className="sq-control-row sq-player-pick">
        <EntityField label="Player" value={cleared ? "" : playerId ?? chosen ?? ""} season={latest?.season ?? LATEST} phase="regular_season"
          initialName={cleared ? undefined : data?.player_name} onChange={next => set({ player: next || NO_PLAYER })} />
      </div>
    </SqPanel>
    {cleared && <GatedNote action={<Button size="lg" variant="secondary" onClick={() => set({ player: null })}>Open the default player</Button>}>
      No player chosen. Search for one above, or open the default: the most field-goal attempts in {LATEST}.</GatedNote>}
    {error && <FeedFailure error={error} retry={retry} what="The player's shot-making" />}
    {loading && <FeedSkeleton label="Loading the player's shot-making" />}
    {data && <>
      <div className="sq-hero-card" data-player={data.player_id}>
        <PlayerAvatar playerId={data.player_id} name={data.player_name} team={team} size="lg" era={latest ? seasonEra(latest.season, team) : undefined} className="sq-avatar" />
        <span className="sq-hero-text">
          <a className="sq-hero-name" href={`/players/${data.player_id}${latest ? `?season=${latest.season}` : ""}`}>{data.player_name}</a>
          <span className="sq-hero-sub">{team && <TeamLogo team={team} season={latest?.season} size={16} />}{team ?? ""}{team ? " · " : ""}{latest ? `${latest.season} regular season` : "No served season"}</span>
        </span>
      </div>
      {data.selection_rule && <p className="sq-note" data-rule="default">{data.selection_rule}</p>}
      {data.status === "unknown" && <GatedNote>{data.reason}</GatedNote>}
      {latest && <PlayerTiles row={latest} />}
      {history.length > 0 && <ResearchSection icon="target" title="Shot-making by Season">
        <StatsGrid label="Shot-making by season" name="history" density="compact" height="auto" leadWidth="sm" rows={history} rowKey={r => r.season} rowData={r => ({ season: r.season })}
          lead={{ label: "Season", cell: r => <span className="sq-cell-strong">{r.season}</span> }}
          columns={[
            { key: "team", label: "Team", width: "md", align: "left", cell: (r: History) => <TeamCodes teams={r.teams} season={r.season} /> },
            { key: "fga", label: "FGA", width: "xs", cell: (r: History) => <GridValue text={formatWhole(r.fga)} />, data: (r: History) => ({ field: "fga", value: r.fga }) },
            { key: "fg_pct", label: "FG%", width: "xs", cell: (r: History) => <GridValue text={formatShare(r.fg_pct)} />, data: (r: History) => ({ field: "fg_pct", value: r.fg_pct }) },
            { key: "three_share", label: "3PA share", width: "sm", cell: (r: History) => <GridValue text={formatShare(r.three_share)} />, data: (r: History) => ({ field: "three_share", value: r.three_share }) },
            { key: "pps", label: "PPS", width: "xs", cell: (r: History) => <GridValue text={formatFixed(r.pps)} />, data: (r: History) => ({ field: "pps", value: r.pps }) },
            { key: "xpps", label: "xPPS", width: "xs", cell: (r: History) => <GridValue text={formatFixed(r.xpps)} />, data: (r: History) => ({ field: "xpps", value: r.xpps }) },
            { key: "shot_making", label: "Shot-making /100", width: "md", cell: (r: History) => known(r.shot_making)
              ? <><Toned text={formatSigned(r.shot_making)} value={r.shot_making} low={r.interval?.[0]} high={r.interval?.[1]} level={95} field="shot_making" /><span className="rs-grid-sub">{formatInterval(r.interval, v => formatSigned(v))}</span></>
              : <GridValue text={null} /> },
            { key: "status", label: "Status", width: "lg", align: "left", cell: (r: History) => <GridValue text={r.status === "served" ? "Served" : `Unknown: ${r.reason}`} muted={r.status !== "served"} />, data: (r: History) => ({ status: r.status }) },
          ]} />
        <p className="sq-note">{summary.definitions.interval}</p>
      </ResearchSection>}
      <ResearchSection icon="split" title="Lineup Split by Season">
        <p className="sq-text">The same player&apos;s offensive decomposition: how lineups shot with this player on the floor, split into the looks, the making and the free throws.
          Points per 100 shots against the average player, 80% intervals.</p>
        {splits.error && <FeedFailure error={splits.error} retry={splits.retry} what="The player's decomposition" />}
        {splits.loading && <FeedSkeleton label="Loading the player's decomposition" />}
        {splits.data && <StatsGrid label="Lineup split by season" name="splits" density="compact" height="auto" leadWidth="sm" rows={splits.data} rowKey={r => r.season} rowData={r => ({ season: r.season })}
          lead={{ label: "Season", cell: r => <span className="sq-cell-strong">{r.season}</span> }}
          columns={[
            ...TARGETS.map((t): GridColumn<SplitRow> => ({ key: t, label: { ts: "oTS", sq: "oSQ", make: "oMake", ft: "oFT" }[t], width: "md",
              cell: r => r.row ? <><Toned text={formatSigned(r.row.values[t])} value={r.row.values[t]} low={r.row.intervals[t][0]} high={r.row.intervals[t][1]} level={80} field={t} /><span className="rs-grid-sub">{formatInterval(r.row.intervals[t], v => formatSigned(v))}</span></> : <GridValue text={null} /> })),
            { key: "shots", label: "Shots", width: "sm", cell: r => <GridValue text={r.row ? formatWhole(r.row.shots) : null} />, data: r => ({ field: "shots", value: r.row?.shots }) },
            { key: "status", label: "Status", width: "lg", align: "left", cell: r => <GridValue text={r.row ? "Rated" : `Unknown: ${r.reason}`} muted={!r.row} /> },
          ]} />}
      </ResearchSection>
    </>}
  </div>;
}

function PlayerTiles({ row }: { row: History }) {
  return <Tiles label={`Shot-making, ${row.season}`} tiles={[
    { key: "shot_making", label: `Shot-making /100, ${row.season}`, value: known(row.shot_making)
      ? <Toned text={formatSigned(row.shot_making)} value={row.shot_making} low={row.interval?.[0]} high={row.interval?.[1]} level={95} field="shot_making" /> : "—",
      foot: row.interval ? `95% interval ${formatInterval(row.interval, v => formatSigned(v))}` : row.reason ?? undefined },
    { key: "xpps", label: "xPPS", value: <span data-field="xpps" data-value={row.xpps}>{formatFixed(row.xpps)}</span>, foot: "Expected points per shot" },
    { key: "pps", label: "PPS", value: <span data-field="pps" data-value={row.pps}>{formatFixed(row.pps)}</span>, foot: `${formatShare(row.fg_pct)} FG` },
    { key: "fga", label: "FGA", value: <span data-field="fga" data-value={row.fga}>{formatWhole(row.fga)}</span>, foot: `${formatShare(row.three_share)} from three` },
  ]} />;
}

// ---- Page ------------------------------------------------------------------------------------------

export function ShotQualityResearch() {
  const { get, set } = useUrlState();
  const raw = get("tab") ?? "decomposition";
  const tab = (TABS.find(t => t.value === raw)?.value ?? LEGACY_TABS[raw] ?? "decomposition") as Tab;
  const needsSummary = tab !== "decomposition";
  const { data, error, loading, retry } = useFeed([needsSummary ? "summary" : "none"], signal => needsSummary ? getShotQuality(signal) : Promise.resolve(null));
  return <PageShell template="research" className="sq-shell">
    <div className="rs-column sq-page" data-tab={tab}>
      <PageHeader className="sq-hero research-hero" icon="target" title="Shot Quality"
        subtitle="Every player's shooting impact split into the quality of the looks, the making and the free throws, on both ends, from CourtLens's own expected-points model on free NBA data." />
      <nav className="sq-tabs" aria-label="Shot Quality views">
        <span className="sq-tabs-wide"><Segmented label="Shot Quality view" size="lg" value={tab} onChange={next => set({ tab: next === "decomposition" ? null : next })} options={TABS} /></span>
        <span className="sq-tabs-phone"><Segmented label="Shot Quality view" size="md" dense stretch value={tab} onChange={next => set({ tab: next === "decomposition" ? null : next })}
          options={TABS.map(({ value, label }) => ({ value, label }))} /></span>
      </nav>
      {tab === "decomposition" && <ShotDecompositionTab />}
      {needsSummary && error && <FeedFailure error={error} retry={retry} what="Shot Quality" />}
      {needsSummary && loading && <FeedSkeleton label="Loading Shot Quality" />}
      {data && tab === "shot-making" && <ShotMaking summary={data} />}
      {data && tab === "player" && <PlayerTab summary={data} />}
      {data && tab === "model" && <Model summary={data} />}
    </div>
  </PageShell>;
}
