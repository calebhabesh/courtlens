import type { Metadata } from "next";
import Link from "next/link";
import { getPointsForecastEvaluation, getProspectiveForecasts, getWorkbenchStatus } from "@/lib/workbench-api";
import { formatDate } from "@/lib/format-date";
import { humanLabel } from "@/lib/route-availability";
import { TeamLogo } from "@/components/team-logo";
import { CountChip, FilterBar } from "@/components/ui/filter-bar";
import { DataDetailsButton } from "@/components/ui/data-details";
import { GatedNote } from "@/components/ui/gated-note";
import { PageShell, ResearchLayout } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/ui/panel";
import { StatTile } from "@/components/ui/stat-tile";

export const metadata: Metadata = { title: "Points Forecasts" };
export const dynamic = "force-dynamic";

const SLICE_DIMENSION_NAMES: Record<string, string> = {
  current_appearances_slice: "Current Appearances",
  lead_days_slice: "Lead Horizon",
  opponent_context_slice: "Opponent Context",
  prior_minutes_slice: "Prior Minutes Volume",
  season_slice: "Season Holdout",
  team_changed_slice: "Team Association",
  team_rest_slice: "Schedule Rest",
};

const SUBGROUP_NAMES: Record<string, string> = {
  "1_to_4": "1–4 appearances (early season)",
  "5_to_9": "5–9 appearances (early season)",
  "10_to_19": "10–19 appearances (core)",
  "20_to_39": "20–39 appearances (core)",
  "40_plus": "40+ appearances (core)",
  "0": "0 days (game-day issuance)",
  "1_to_3": "1–3 days ahead",
  "4_to_6": "4–6 days ahead",
  "missing": "No historical opponent context",
  "present": "Opponent context available",
  "less_15": "Under 15 min per game",
  "15_<28": "15–28 min per game",
  "28_<35": "28–35 min per game",
  "35_plus": "35+ min per game",
  "changed": "Traded or changed team",
  "same": "Same team",
  "1_day": "1 day rest",
  "2_to_3_days": "2–3 days rest",
  "4_plus_days": "4+ days rest",
  "back_to_back": "Back-to-back",
  "2025-26": "2025-26 Regular Season",
};

/** Frozen chronological splits of the registered protocol (basketball-points-v1). */
const SPLITS = [
  ["T", "2021-10-19", "2023-04-09", "Initial training fit (2021-22 and 2022-23)", "Executed"],
  ["V1", "2023-10-24", "2024-01-15", "Fold 1 validation and tuning (2023-24 before Jan 15)", "Executed"],
  ["V2", "2024-01-16", "2024-04-14", "Fold 2 validation and model selection (2023-24 after Jan 15)", "Executed"],
  ["C", "2024-10-22", "2025-04-13", "Empirical interval calibration (2024-25)", "Executed"],
  ["F", "2025-10-21", "2026-04-12", "Final out-of-time test holdout (2025-26)", "Evaluated"],
] as const;

const fixed = (value: number | null | undefined, digits = 3) => value == null ? "—" : value.toFixed(digits);
const share = (value: number | null | undefined) => value == null ? "—" : `${(value * 100).toFixed(1)}%`;
const signedFixed = (value: number | null | undefined) => value == null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(3)}`;

export default async function ForecastsPage() {
  const [status, evaluation, prospective] = await Promise.all([
    getWorkbenchStatus().catch(() => null),
    getPointsForecastEvaluation().catch(() => null),
    getProspectiveForecasts({ pageSize: 50 }).catch(() => null),
  ]);
  const policy = evaluation?.active_policy?.policy_name || status?.capabilities?.forecasting || "no_policy_registered";
  const promo = evaluation?.promotion;
  const gates = promo?.gates;
  const metrics = evaluation?.final_test?.metrics;
  const intervals = evaluation?.final_test?.intervals;
  const slices = evaluation?.final_test?.prespecified_slices;
  const baselineKey = evaluation?.validation?.baseline || "prior_blend";
  const challengerKey = evaluation?.validation?.challenger_finalist || "player_only";
  const baseline = metrics?.[baselineKey];
  const summary = prospective?.summary;

  const sliceRows = Object.entries(slices ?? {}).flatMap(([dimension, subgroups]) => Object.entries(subgroups).flatMap(([subgroup, estimators]) => {
    const b = estimators[baselineKey];
    const c = estimators[challengerKey];
    return b ? [{ dimension: SLICE_DIMENSION_NAMES[dimension] || humanLabel(dimension), subgroup: SUBGROUP_NAMES[subgroup] || subgroup, baseMae: b.mae, chalMae: c?.mae ?? null, delta: c ? c.mae - b.mae : null, rows: b.forecast_rows }] : [];
  }));
  const gateRows = gates ? [
    ["Gate 1: Validation Improvement >= 5%", gates.validation_improvement.passed, `Pooled ${share(gates.validation_improvement.pooled_relative_improvement)} · V1 ${signedFixed(gates.validation_improvement.fold_differences.v1)} · V2 ${signedFixed(gates.validation_improvement.fold_differences.v2)}`, "The challenger must beat the baseline by at least 5% in pooled validation and both folds."],
    ["Gate 2: Final Paired Superiority", gates.final_paired_superiority.passed, `MAE difference ${signedFixed(gates.final_paired_superiority.mae_difference)} · 95% CI ${fixed(gates.final_paired_superiority.lower)} to ${fixed(gates.final_paired_superiority.upper)}`, "The upper bound of the 95% moving-block bootstrap interval must be below zero."],
    ["Gate 3: Supported Slices", gates.supported_slices.passed, `${gates.supported_slices.supported_count} slices · ${gates.supported_slices.regressions_over_limit.length} over the limit`, "No supported slice may degrade by more than 5% relative MAE."],
    ["Gate 4: Interval Guardrails", gates.interval_guardrails.passed, `Coverage ${share(gates.interval_guardrails.challenger_coverage)} · width ratio ${fixed(gates.interval_guardrails.width_ratio)}`, "Challenger coverage must be at least 75% with width at most 110% of the baseline."],
  ] as const : [];
  const runId = evaluation?.run_id;

  return (
    <PageShell template="research" className="research-view forecasts-view">
      <PageHeader title="Points Forecasts" subtitle="Next-game points estimates, their out-of-time test and the prospective ledger." actions={<>
        <Link href="/evaluation" className="button">Evaluation Archive</Link>
        <Link href="/methodology" className="button">Evaluation Protocol</Link>
      </>} />
      <FilterBar collapsible={false} label="Forecast protocol" summary="basketball-points-v1" scope={<span className="research-scope-label">basketball-points-v1 · 2025-26 holdout</span>}
        count={metrics ? <CountChip>{(baseline?.forecast_rows ?? 0).toLocaleString("en-US")} scored forecasts</CountChip> : undefined}
        details={<DataDetailsButton rows={[
          { label: "Policy", value: policy, mono: true },
          ...(evaluation?.active_policy ? [
            { label: "Policy ID", value: evaluation.active_policy.id, mono: true },
            { label: "Calibration", value: evaluation.active_policy.calibration_identity, mono: true },
            { label: "Activated", value: formatDate(evaluation.active_policy.activated_at.slice(0, 10)) },
          ] : []),
          ...(runId ? [{ label: "Run", value: runId, mono: true }, { label: "Reproduce", value: `courtlens evaluate-points --config evaluation/config/points-v1.yaml --dataset evaluation/manifests/accepted-points-v1.json --stage validate\ncourtlens evaluate-points --config evaluation/config/points-v1.yaml --dataset evaluation/manifests/accepted-points-v1.json --stage calibrate\ncourtlens evaluate-points --registered-run ${runId} --stage final --open-final-test\ncourtlens activate-points-policy --registered-run ${runId}`, mono: true }] : []),
          { label: "Protocol rule", value: "Feature computations exclude the target date and every later outcome (game_date < replay_date)." },
        ]} />} />
      {!evaluation ? <div role="alert"><GatedNote tone="warning" action={<Link className="button" href="/forecasts">Retry</Link>}>Forecast evaluation unavailable. Restore the local API connection.</GatedNote></div> :
      <ResearchLayout findings={<>
        <StatTile label="Active Forecast Policy" value={policy === "no_policy_registered" ? "None" : (evaluation.active_policy?.estimator_identity ?? baselineKey)} footnote={policy === "no_policy_registered" ? "No policy activated" : "Calibrated 80% intervals"} />
        <StatTile label="Promotion Decision" value={promo ? (promo.decision === "promote" ? "Promote" : "Do not promote") : null} footnote={promo ? `Challenger ${challengerKey}` : undefined} />
        <StatTile label="Holdout MAE" value={fixed(baseline?.mae)} unit=" pts" footnote={`${baselineKey} · ${metrics?.[challengerKey] ? `${challengerKey} ${fixed(metrics[challengerKey].mae)}` : "no challenger"}`} />
        <StatTile label="Prospective Scored" value={summary ? summary.total_scored : 0} footnote={summary?.prospective_accuracy_status === "observed" ? "Scored after tipoff" : "Awaiting the 2026-27 season"} />
      </>}>
        <GatedNote why={<>
          <p>CourtLens strictly isolates historical reconstruction from genuine prospective forecast issuance. Out-of-time chronological validation ensures feature computations never observe future game outcomes. Absent box scores are unknown, not zeros.</p>
          <p>{policy === "no_policy_registered" ? "No policy currently activated. Execute points experiment evaluation to activate a policy." : `Serving registered policy '${policy}' for next-game points estimation conditional on appearance (target points, calibrated 80% empirical interval, appeared in at least one game).`}</p>
          {(evaluation.limitations ?? []).map(limit => <p key={limit}>{limit}</p>)}
        </>}>Estimates are conditional on appearance; intervals are calibrated empirical dispersion.</GatedNote>

        {promo && gates && <section className="panel research-section" aria-label="Promotion decision">
          <h2>Promotion Decision: {promo.decision === "promote" ? `promote challenger (${challengerKey})` : `retain the served baseline (${baselineKey})`}</h2>
          <span className={`badge ${promo.decision === "promote" ? "badge-positive" : "badge-accent"}`}>{promo.decision.toUpperCase()}</span>
          <div className="table-wrapper research-table" role="region" aria-label="Pre-registered promotion gates" tabIndex={0}>
            <table className="data-table"><caption>Pre-registered promotion gates, frozen before the holdout opened</caption>
              <thead><tr><th>Gate</th><th>Result</th><th>Observed</th></tr></thead>
              <tbody>{gateRows.map(([label, passed, observed, rule]) => <tr key={label}><th scope="row" title={rule}>{label}</th><td><span className={`badge ${passed ? "badge-positive" : "badge-accent"}`}>{passed ? "Passed" : "Failed"}</span></td><td>{observed}</td></tr>)}</tbody>
            </table>
          </div>
        </section>}

        {metrics && intervals && <section className="panel research-section" aria-label="Holdout performance">
          <h2>Out-of-Time Performance on Holdout Block F (2025-26 Regular Season)</h2>
          <div className="table-wrapper research-table" role="region" aria-label="Holdout metrics" tabIndex={0}>
            <table className="data-table">
              <thead><tr><th>Estimator</th><th>Role</th><th className="num">MAE</th><th className="num">RMSE</th><th className="num">Player-Balanced MAE</th><th className="num">Core Coverage (80%)</th><th className="num">Interval Width</th><th className="num">Forecast Rows</th></tr></thead>
              <tbody>{Object.entries(metrics).map(([name, m]) => {
                const core = intervals[name]?.core;
                return <tr key={name}>
                  <th scope="row"><strong className="font-mono">{name}</strong></th>
                  <td>{name === baselineKey ? <span className="badge badge-positive">Served baseline</span> : name === challengerKey ? <span className="badge badge-accent">Challenger finalist (not promoted)</span> : <span className="badge">Challenger variant</span>}</td>
                  <td className="num">{fixed(m.mae)}</td><td className="num">{fixed(m.rmse)}</td><td className="num">{fixed(m.player_balanced_mae)}</td>
                  <td className="num">{share(core?.coverage)}</td><td className="num">{fixed(core?.mean_width, 2)}</td><td className="num">{m.forecast_rows.toLocaleString("en-US")}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        </section>}

        <section className="panel research-section" aria-label="Error slices">
          <h2>Prespecified Out-of-Time Error Slices</h2>
          <div className="table-wrapper research-table" role="region" aria-label="Prespecified slices" tabIndex={0}>
            <table className="data-table"><caption>{sliceRows.length} protocol-mandated slices · negative change means the challenger erred less</caption>
              <thead><tr><th>Slice</th><th>Subgroup</th><th className="num">Baseline MAE</th><th className="num">Challenger MAE</th><th className="num">Change (pts)</th><th className="num">Rows</th></tr></thead>
              <tbody>{sliceRows.map((row, index) => <tr key={`${row.dimension}-${row.subgroup}-${index}`}>
                <th scope="row">{row.dimension}</th><td>{row.subgroup}</td><td className="num">{fixed(row.baseMae)}</td><td className="num">{fixed(row.chalMae)}</td>
                <td className="num">{row.delta == null ? "—" : <span className={row.delta <= 0 ? "text-positive" : "text-accent"}>{signedFixed(row.delta)}</span>}</td><td className="num">{row.rows.toLocaleString("en-US")}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <details><summary>Chronological splits</summary>
            <div className="table-wrapper research-table" role="region" aria-label="Chronological splits" tabIndex={0}>
              <table className="data-table"><thead><tr><th>Split</th><th>Dates</th><th>Purpose</th><th>Status</th></tr></thead>
                <tbody>{SPLITS.map(([split, start, end, purpose, state]) => <tr key={split}><th scope="row" className="font-mono">{split}</th><td>{formatDate(start)} – {formatDate(end)}</td><td>{purpose}</td><td>{state}</td></tr>)}</tbody>
              </table>
            </div>
          </details>
          {evaluation.model_card_markdown && <details><summary>Model card</summary><pre className="research-document">{evaluation.model_card_markdown}</pre></details>}
        </section>

        <section className="panel research-section" aria-label="Prospective issuance">
          <h2>Genuine Prospective Issuance Status</h2>
          <span className={`badge ${summary?.prospective_accuracy_status === "observed" ? "badge-positive" : "badge-warning"}`}>{summary?.prospective_accuracy_status === "observed" ? "Live Scored" : "Awaiting 2026-27 Tipoff"}</span>
          <p className="research-caption">Issued {summary?.total_issued ?? 0} · scored {summary?.total_scored ?? 0} · pending {summary?.total_pending ?? 0} · nonappearances {summary?.total_unscored_dnp ?? 0}</p>
          <GatedNote why={<p>Prospective accuracy not yet observed: the 2026-27 NBA regular season begins October 2026. Prospective forecasts are logged before tipoff using the active policy and scored after official box scores are finalized. CourtLens never fabricates unobserved live forecast accuracy.</p>}>Forecasts are logged before tipoff and scored once box scores are final.</GatedNote>
          {prospective && prospective.items.length > 0 && <>
            <h3>Prospective Forecasts Ledger</h3>
            <div className="table-wrapper research-table" role="region" aria-label="Prospective forecasts ledger" tabIndex={0}>
              <table className="data-table">
                <thead><tr><th>Player</th><th>Team</th><th>Game</th><th>Opponent</th><th className="num">Estimate</th><th className="num">80% Interval</th><th>Availability</th><th>Status</th><th className="num">Observed PTS</th><th className="num">Error</th></tr></thead>
                <tbody>{prospective.items.map(item => <tr key={item.id}>
                  <th scope="row"><Link href={`/players/${item.player_id}`}>{item.player_name}</Link></th>
                  <td><span className="research-team"><TeamLogo team={item.team_tricode} size={16} />{item.team_tricode}</span></td>
                  <td>{formatDate(item.target_game_date)}</td>
                  <td><span className="research-team"><TeamLogo team={item.target_opponent_tricode} size={16} />{item.target_opponent_tricode}</span></td>
                  <td className="num">{item.point_estimate.toFixed(1)}</td>
                  <td className="num">{item.interval_lower.toFixed(1)}–{item.interval_upper.toFixed(1)}</td>
                  <td>{humanLabel(item.availability_reason?.replace("eligible_", "") || "eligible")}</td>
                  <td><span className={`badge ${item.latest_score?.score_status === "scored" ? "badge-positive" : item.latest_score?.score_status === "unscored_dnp" ? "badge" : "badge-accent"}`}>{humanLabel(item.latest_score?.score_status || item.issuance_status)}</span></td>
                  <td className="num">{item.latest_score?.observed_points != null ? item.latest_score.observed_points : item.latest_score?.score_status === "unscored_dnp" ? "DNP" : "—"}</td>
                  <td className="num">{item.latest_score?.absolute_error != null ? item.latest_score.absolute_error.toFixed(1) : "—"}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </>}
        </section>
      </ResearchLayout>}
    </PageShell>
  );
}
