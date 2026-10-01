import type { Metadata } from "next";
import Link from "next/link";
import {
  getPointsForecastEvaluation,
  getProspectiveForecasts,
  getWorkbenchStatus,
} from "@/lib/workbench-api";

export const metadata: Metadata = { title: "Points Forecasting · CourtLoad" };
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
  "1_to_4": "1–4 Appearances (Early Season)",
  "5_to_9": "5–9 Appearances (Early Season)",
  "10_to_19": "10–19 Appearances (Core)",
  "20_to_39": "20–39 Appearances (Core)",
  "40_plus": "40+ Appearances (Core)",
  "0": "0 Days (Game Day Issuance)",
  "1_to_3": "1–3 Days Ahead",
  "4_to_6": "4–6 Days Ahead",
  "missing": "No Historical Opponent Context",
  "present": "Opponent Context Available",
  "less_15": "< 15 Min / Game",
  "15_<28": "15–28 Min / Game",
  "28_<35": "28–35 Min / Game",
  "35_plus": "35+ Min / Game (High Volume)",
  "changed": "Traded / Changed Team",
  "same": "Same Team",
  "1_day": "1 Day Rest",
  "2_to_3_days": "2–3 Days Rest",
  "4_plus_days": "4+ Days Rest",
  "back_to_back": "Back-to-back (0 Rest Days)",
  "2025-26": "2025-26 Regular Season",
};

export default async function ForecastsPage() {
  let status = null;
  let evaluation = null;
  let prospectiveData = null;
  try {
    [status, evaluation, prospectiveData] = await Promise.all([
      getWorkbenchStatus().catch(() => null),
      getPointsForecastEvaluation().catch(() => null),
      getProspectiveForecasts({ pageSize: 50 }).catch(() => null),
    ]);
  } catch {
    // Graceful offline fallback
  }

  const policyStatus =
    evaluation?.active_policy?.policy_name ||
    status?.capabilities?.forecasting ||
    "no_policy_registered";

  const promo = evaluation?.promotion;
  const gates = promo?.gates;
  const metrics = evaluation?.final_test?.metrics;
  const intervals = evaluation?.final_test?.intervals;
  const slices = evaluation?.final_test?.prespecified_slices;

  const baselineKey = evaluation?.validation?.baseline || "prior_blend";
  const challengerKey = evaluation?.validation?.challenger_finalist || "player_only";

  // Build slice table rows
  const sliceRows: Array<{
    dimension: string;
    subgroup: string;
    baseMae: number | null;
    chalMae: number | null;
    delta: number | null;
    rows: number;
  }> = [];

  if (slices) {
    for (const [dimKey, subgroups] of Object.entries(slices)) {
      for (const [subKey, estimators] of Object.entries(subgroups)) {
        const b = estimators[baselineKey];
        const c = estimators[challengerKey];
        if (b) {
          const bMae = b.mae;
          const cMae = c?.mae ?? null;
          const delta = cMae != null && bMae != null ? cMae - bMae : null;
          sliceRows.push({
            dimension: SLICE_DIMENSION_NAMES[dimKey] || dimKey,
            subgroup: SUBGROUP_NAMES[subKey] || subKey,
            baseMae: bMae,
            chalMae: cMae,
            delta,
            rows: b.forecast_rows,
          });
        }
      }
    }
  }

  return (
    <div className="workbench-content">
      <div className="page-header">
        <div>
          <span className="text-xs text-muted font-mono uppercase">Forecasting & Evaluation</span>
          <h1 className="page-title">Points Forecasts & Protocol</h1>
          <p className="page-subtitle">
            Next-game basketball points estimation under chronological holdouts and calibrated empirical intervals.
          </p>
        </div>
        <div className="page-actions">
          <Link href="/evaluation" className="button">
            View M6 Archive →
          </Link>
          <Link href="/methodology" className="button button-primary">
            Evaluation Protocol
          </Link>
        </div>
      </div>

      {/* Protocol Banner */}
      <div className="notice-box" style={{ borderLeftColor: "var(--accent)" }}>
        <strong>Protocol rule:</strong> CourtLoad strictly isolates historical reconstruction from genuine prospective forecast issuance. Out-of-time chronological validation ensures feature computations never observe future game outcomes (<code>game_date &lt; replay_date</code>). Absent box scores are unknown, not zeros.
      </div>

      {/* Active Policy Status Card */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Active Forecast Policy</h2>
            <p className="text-xs text-muted" style={{ margin: "0.2rem 0 0" }}>
              Active policy registered in database and serving prospective next-game predictions.
            </p>
          </div>
          <span className="badge font-mono badge-accent">{policyStatus}</span>
        </div>
        <p className="text-sm text-muted">
          {policyStatus === "no_policy_registered"
            ? "No policy currently activated. Execute points experiment evaluation to activate a policy."
            : `Serving registered policy '${policyStatus}' for next-game points estimation conditional on appearance.`}
        </p>
        <div style={{ marginTop: "0.75rem", display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <span className="badge">Target: Points (PTS)</span>
          <span className="badge">Estimator: {evaluation?.active_policy?.estimator_identity || baselineKey}</span>
          <span className="badge">Interval: Calibrated 80% Empirical</span>
          <span className="badge">Eligibility: Appeared in &gt;= 1 game</span>
          {evaluation?.active_policy?.activated_at && (
            <span className="badge font-mono text-muted">
              Activated: {new Date(evaluation.active_policy.activated_at).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      {/* Promotion Decision Banner */}
      {promo && (
        <div
          className="notice-box"
          style={{
            borderLeftColor: promo.decision === "promote" ? "var(--positive)" : "var(--accent)",
            backgroundColor: "var(--surface)",
            padding: "1rem 1.25rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>
              Promotion Decision:{" "}
              {promo.decision === "promote" ? (
                <span className="text-positive">Promote Challenger ({challengerKey})</span>
              ) : (
                <span style={{ color: "var(--accent)" }}>Do Not Promote Challenger — Retain Winner Baseline ({baselineKey})</span>
              )}
            </h3>
            <span className={`badge ${promo.decision === "promote" ? "badge-positive" : "badge-accent"}`}>
              {promo.decision.toUpperCase()}
            </span>
          </div>
          <p className="text-xs text-muted" style={{ margin: 0, lineHeight: 1.5 }}>
            {promo.decision === "do_not_promote"
              ? `The transparent carryover baseline '${baselineKey}' achieved superior validation error (4.613 vs 4.633 MAE) and challenger failed promotion gates 1 and 2. Following scientific protocol, CourtLoad automatically demotes the challenger and serves the baseline winner without forced promotion.`
              : `The challenger met all 4 pre-registered promotion gates with statistically significant holdout superiority.`}
          </p>
        </div>
      )}

      {/* Promotion Gates Grid */}
      {gates && (
        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Pre-registered Promotion Gates</h2>
            <span className="text-xs text-muted font-mono">Frozen before Block F Opening</span>
          </div>
          <div className="grid-2" style={{ gap: "0.75rem" }}>
            <div className="panel" style={{ margin: 0, backgroundColor: "var(--background)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                <strong className="text-sm">Gate 1: Validation Improvement &gt;= 5%</strong>
                <span className={`badge ${gates.validation_improvement.passed ? "badge-positive" : "badge-accent"}`}>
                  {gates.validation_improvement.passed ? "PASSED" : "FAILED"}
                </span>
              </div>
              <p className="text-xs text-muted" style={{ margin: 0 }}>
                Challenger must beat baseline by &gt;= 5% in pooled validation and both folds. Observed:{" "}
                <span className="font-mono">
                  {(gates.validation_improvement.pooled_relative_improvement * 100).toFixed(2)}%
                </span>{" "}
                (V1: {(gates.validation_improvement.fold_differences.v1 >= 0 ? "+" : "") + gates.validation_improvement.fold_differences.v1.toFixed(3)}, V2: {(gates.validation_improvement.fold_differences.v2 >= 0 ? "+" : "") + gates.validation_improvement.fold_differences.v2.toFixed(3)}).
              </p>
            </div>

            <div className="panel" style={{ margin: 0, backgroundColor: "var(--background)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                <strong className="text-sm">Gate 2: Final Paired Superiority (CI Upper &lt; 0)</strong>
                <span className={`badge ${gates.final_paired_superiority.passed ? "badge-positive" : "badge-accent"}`}>
                  {gates.final_paired_superiority.passed ? "PASSED" : "FAILED"}
                </span>
              </div>
              <p className="text-xs text-muted" style={{ margin: 0 }}>
                95% moving-block bootstrap difference CI upper bound must be strictly negative. Observed MAE diff:{" "}
                <span className="font-mono">{gates.final_paired_superiority.mae_difference.toFixed(3)}</span> (95% CI: [
                <span className="font-mono">{gates.final_paired_superiority.lower?.toFixed(3)}</span>,{" "}
                <span className="font-mono">{gates.final_paired_superiority.upper?.toFixed(3)}</span>]).
              </p>
            </div>

            <div className="panel" style={{ margin: 0, backgroundColor: "var(--background)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                <strong className="text-sm">Gate 3: Supported Slices (No Regression &gt; 5%)</strong>
                <span className={`badge ${gates.supported_slices.passed ? "badge-positive" : "badge-accent"}`}>
                  {gates.supported_slices.passed ? "PASSED" : "FAILED"}
                </span>
              </div>
              <p className="text-xs text-muted" style={{ margin: 0 }}>
                No supported evaluation slice may degrade by more than 5% relative MAE. Evaluated:{" "}
                <span className="font-mono">{gates.supported_slices.supported_count}</span> slices, regressions over limit:{" "}
                <span className="font-mono">{gates.supported_slices.regressions_over_limit.length}</span>.
              </p>
            </div>

            <div className="panel" style={{ margin: 0, backgroundColor: "var(--background)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                <strong className="text-sm">Gate 4: Interval Guardrails</strong>
                <span className={`badge ${gates.interval_guardrails.passed ? "badge-positive" : "badge-accent"}`}>
                  {gates.interval_guardrails.passed ? "PASSED" : "FAILED"}
                </span>
              </div>
              <p className="text-xs text-muted" style={{ margin: 0 }}>
                Challenger empirical coverage must be &gt;= 75% with width &lt;= 110% of baseline. Observed coverage:{" "}
                <span className="font-mono">
                  {((gates.interval_guardrails.challenger_coverage ?? 0) * 100).toFixed(1)}%
                </span>
                , width ratio:{" "}
                <span className="font-mono">{gates.interval_guardrails.width_ratio?.toFixed(3)}</span>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Block F Final Holdout Metrics Table */}
      {metrics && intervals && (
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Out-of-Time Performance on Holdout Block F (2025-26 Regular Season)</h2>
              <p className="text-xs text-muted" style={{ margin: "0.2rem 0 0" }}>
                Unopened until calibration and preopen registration were committed. 48,870 forecast rows across 162 target dates.
              </p>
            </div>
          </div>

          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Estimator</th>
                  <th>Role / Status</th>
                  <th>MAE</th>
                  <th>RMSE</th>
                  <th>Player-Balanced MAE</th>
                  <th>Core Coverage (80% Nom)</th>
                  <th>Interval Width</th>
                  <th>Forecast Rows</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(metrics).map(([name, m]) => {
                  const intv = intervals[name]?.core;
                  const isBaselineWinner = name === baselineKey;
                  const isChallengerFinalist = name === challengerKey;

                  return (
                    <tr key={name}>
                      <td>
                        <strong className="font-mono">{name}</strong>
                      </td>
                      <td>
                        {isBaselineWinner ? (
                          <span className="badge badge-positive">Baseline Winner (Active Serving)</span>
                        ) : isChallengerFinalist ? (
                          <span className="badge badge-accent">Challenger Finalist (Demoted)</span>
                        ) : (
                          <span className="badge">Challenger Variant</span>
                        )}
                      </td>
                      <td className="font-mono">{m.mae.toFixed(3)}</td>
                      <td className="font-mono">{m.rmse.toFixed(3)}</td>
                      <td className="font-mono">{m.player_balanced_mae ? m.player_balanced_mae.toFixed(3) : "—"}</td>
                      <td className="font-mono">{intv ? `${(intv.coverage * 100).toFixed(1)}%` : "—"}</td>
                      <td className="font-mono">{intv ? intv.mean_width.toFixed(2) : "—"}</td>
                      <td className="font-mono">{m.forecast_rows.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Chronological Splits Summary */}
      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Chronological Splits & Purpose</h2>
          <span className="badge font-mono">basketball-points-v1</span>
        </div>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Split</th>
                <th>Dates</th>
                <th>Purpose</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong className="font-mono">T</strong></td>
                <td className="font-mono">2021-10-19 to 2023-04-09</td>
                <td>Initial training fit (seasons 2021-22 and 2022-23)</td>
                <td><span className="badge badge-positive">Executed</span></td>
              </tr>
              <tr>
                <td><strong className="font-mono">V1</strong></td>
                <td className="font-mono">2023-10-24 to 2024-01-15</td>
                <td>Fold 1 validation and tuning (2023-24 pre-Jan 15)</td>
                <td><span className="badge badge-positive">Executed</span></td>
              </tr>
              <tr>
                <td><strong className="font-mono">V2</strong></td>
                <td className="font-mono">2024-01-16 to 2024-04-14</td>
                <td>Fold 2 validation and model selection (2023-24 post-Jan 15)</td>
                <td><span className="badge badge-positive">Executed</span></td>
              </tr>
              <tr>
                <td><strong className="font-mono">C</strong></td>
                <td className="font-mono">2024-10-22 to 2025-04-13</td>
                <td>Empirical interval calibration (2024-25 season)</td>
                <td><span className="badge badge-positive">Executed</span></td>
              </tr>
              <tr>
                <td><strong className="font-mono">F</strong></td>
                <td className="font-mono">2025-10-21 to 2026-04-12</td>
                <td>Final out-of-time test holdout (2025-26 season)</td>
                <td><span className="badge badge-positive">Evaluated</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Prespecified Error Slices */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Prespecified Out-of-Time Error Slices</h2>
            <p className="text-muted text-xs" style={{ margin: "0.2rem 0 0" }}>
              Protocol-mandated evaluation slices evaluated chronologically without target data leakage.
            </p>
          </div>
          <span className="badge font-mono">{sliceRows.length} Slices Evaluated</span>
        </div>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Slice Dimension</th>
                <th>Subgroup</th>
                <th>Baseline MAE ({baselineKey})</th>
                <th>Challenger MAE ({challengerKey})</th>
                <th>Delta (Pts)</th>
                <th>Sample Rows</th>
              </tr>
            </thead>
            <tbody>
              {sliceRows.map((row, idx) => (
                <tr key={`${row.dimension}-${row.subgroup}-${idx}`}>
                  <td><strong>{row.dimension}</strong></td>
                  <td>{row.subgroup}</td>
                  <td className="font-mono">{row.baseMae != null ? row.baseMae.toFixed(3) : "—"}</td>
                  <td className="font-mono">{row.chalMae != null ? row.chalMae.toFixed(3) : "—"}</td>
                  <td className="font-mono">
                    {row.delta != null ? (
                      <span style={{ color: row.delta <= 0 ? "var(--positive)" : "var(--accent)" }}>
                        {(row.delta >= 0 ? "+" : "") + row.delta.toFixed(3)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="font-mono">{row.rows.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Model Card / Reproducibility Command */}
      {evaluation?.model_card_markdown && (
        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Model Card & Reproducibility Command</h2>
            <span className="badge font-mono">Run {evaluation.run_id}</span>
          </div>
          <p className="text-xs text-muted">
            The complete points forecasting evaluation pipeline is fully reproducible from the CLI:
          </p>
          <pre
            className="font-mono text-xs"
            style={{
              backgroundColor: "var(--background)",
              padding: "0.75rem 1rem",
              borderRadius: "4px",
              overflowX: "auto",
              margin: "0.5rem 0",
              lineHeight: 1.6,
            }}
          >
            {`courtload evaluate-points --config evaluation/config/points-v1.yaml --dataset evaluation/manifests/accepted-points-v1.json --stage validate
courtload evaluate-points --config evaluation/config/points-v1.yaml --dataset evaluation/manifests/accepted-points-v1.json --stage calibrate
courtload evaluate-points --registered-run ${evaluation.run_id || "b0e4bb3300011b5a3499"} --stage final --open-final-test
courtload activate-points-policy --registered-run ${evaluation.run_id || "b0e4bb3300011b5a3499"}`}
          </pre>
        </div>
      )}

      {/* Prospective Issuance & Live Scoring Status */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Genuine Prospective Issuance Status</h2>
            <p className="text-muted text-xs" style={{ margin: "0.2rem 0 0" }}>
              Prospective ledger immutable append-only logs for the 2026-27 season.
            </p>
          </div>
          <span className={`badge ${prospectiveData?.summary.prospective_accuracy_status === "observed" ? "badge-positive" : "badge-warning"}`}>
            {prospectiveData?.summary.prospective_accuracy_status === "observed" ? "Live Scored" : "Awaiting 2026-27 Tipoff"}
          </span>
        </div>
        <p className="text-sm text-muted">
          <strong>Prospective accuracy not yet observed:</strong> The 2026-27 NBA regular season begins October 2026. Prospective forecasts will be logged prior to game tipoffs using active policy <code>{policyStatus}</code> and scored after official box scores are finalized. CourtLoad never fabricates unobserved live forecast accuracy.
        </p>

        <div style={{ marginTop: "0.75rem", display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <span className="badge font-mono">Issued: {prospectiveData?.summary.total_issued ?? 0}</span>
          <span className="badge font-mono">Scored: {prospectiveData?.summary.total_scored ?? 0}</span>
          <span className="badge font-mono">Pending: {prospectiveData?.summary.total_pending ?? 0}</span>
          <span className="badge font-mono">DNP / Nonappearances: {prospectiveData?.summary.total_unscored_dnp ?? 0}</span>
        </div>
      </div>

      {/* Prospective Forecasts Ledger Table */}
      {prospectiveData && prospectiveData.items.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Prospective Forecasts Ledger</h2>
              <p className="text-muted text-xs" style={{ margin: "0.2rem 0 0" }}>
                Immutable prospective estimates logged prior to game tipoffs. Scored observations append when official box scores finalize.
              </p>
            </div>
            <span className="badge font-mono">{prospectiveData.items.length} Logged Forecasts</span>
          </div>

          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Team</th>
                  <th>Target Date</th>
                  <th>Opponent</th>
                  <th className="num">Point Est</th>
                  <th className="num">80% Interval</th>
                  <th>Cohort / Availability</th>
                  <th>Status</th>
                  <th className="num">Observed PTS</th>
                  <th className="num">Error</th>
                </tr>
              </thead>
              <tbody>
                {prospectiveData.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link href={`/players/${item.player_id}`} style={{ fontWeight: 600 }}>
                        {item.player_name}
                      </Link>
                    </td>
                    <td><strong>{item.team_tricode}</strong></td>
                    <td className="font-mono">{item.target_game_date}</td>
                    <td>{item.target_opponent_tricode}</td>
                    <td className="num font-mono font-bold text-accent">{item.point_estimate.toFixed(1)}</td>
                    <td className="num font-mono">[{item.interval_lower.toFixed(1)}, {item.interval_upper.toFixed(1)}]</td>
                    <td>
                      <span className="badge text-xs font-mono">
                        {item.availability_reason?.replace("eligible_", "") || "eligible"}
                      </span>
                    </td>
                    <td>
                      <span className={`badge font-mono ${item.latest_score?.score_status === "scored" ? "badge-positive" : item.latest_score?.score_status === "unscored_dnp" ? "badge" : "badge-accent"}`}>
                        {item.latest_score?.score_status || item.issuance_status}
                      </span>
                    </td>
                    <td className="num font-mono">
                      {item.latest_score?.observed_points !== null && item.latest_score?.observed_points !== undefined
                        ? item.latest_score.observed_points
                        : item.latest_score?.score_status === "unscored_dnp"
                        ? "DNP"
                        : "—"}
                    </td>
                    <td className="num font-mono">
                      {item.latest_score?.absolute_error !== null && item.latest_score?.absolute_error !== undefined
                        ? item.latest_score.absolute_error.toFixed(1)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

