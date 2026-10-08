"use client";

import Link from "next/link";
import { PlayerPortrait } from "./player-portrait";
import type { PlayerComparisonResponse } from "@/lib/types";

interface WorkbenchCompareViewProps {
  comparison: PlayerComparisonResponse;
}

export function WorkbenchCompareView({ comparison }: WorkbenchCompareViewProps) {
  const { player_a, player_b, aligned_metrics, no_forced_winner_notice } = comparison;

  return (
    <div className="workbench-compare-section">
      {/* Zero Forced Winner Notice */}
      <div className="notice-box notice-box-accent">
        <strong>No forced winner rule:</strong> {no_forced_winner_notice || "CourtLens displays descriptive differences and prediction intervals without declaring an automated start/sit decision or forced winner."}
      </div>

      {/* Side-by-Side Identity Cards */}
      <div className="grid-2 mb-5">
        <div className="panel compare-identity-panel">
          <PlayerPortrait playerId={player_a.id} name={player_a.name} size="md" />
          <div>
            <span className="text-xs text-muted font-mono uppercase">Player A · {player_a.teams?.join(", ") || "—"}</span>
            <h2 className="panel-title text-accent">
              <Link href={`/players/${player_a.id}`}>{player_a.name}</Link>
            </h2>
            <span className="text-xs text-muted font-mono">
              {player_a.games_played} GP · {player_a.total_minutes?.toFixed(0)} MIN
            </span>
          </div>
        </div>

        <div className="panel compare-identity-panel">
          <PlayerPortrait playerId={player_b.id} name={player_b.name} size="md" />
          <div>
            <span className="text-xs text-muted font-mono uppercase">Player B · {player_b.teams?.join(", ") || "—"}</span>
            <h2 className="panel-title text-accent">
              <Link href={`/players/${player_b.id}`}>{player_b.name}</Link>
            </h2>
            <span className="text-xs text-muted font-mono">
              {player_b.games_played} GP · {player_b.total_minutes?.toFixed(0)} MIN
            </span>
          </div>
        </div>
      </div>

      {/* Aligned Metrics Table */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Aligned Descriptive Metrics</h3>
            <p className="text-muted text-xs panel-subtitle-margin">
              Identical calculation formulas from metric catalog v1. Values formatted according to metric specification.
            </p>
          </div>
        </div>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Unit</th>
                <th className="num">{player_a.name}</th>
                <th className="num">{player_b.name}</th>
                <th className="num">Difference (A - B)</th>
                <th className="num">N (A)</th>
                <th className="num">N (B)</th>
              </tr>
            </thead>
            <tbody>
              {aligned_metrics.map((m) => {
                const diffNum = m.diff;
                return (
                  <tr key={m.metric}>
                    <td>
                      <strong>{m.display_name}</strong>
                      <span className="text-xs text-muted font-mono compare-metric-key">
                        ({m.metric})
                      </span>
                    </td>
                    <td className="text-muted text-xs">{m.unit}</td>
                    <td className="num font-mono font-semibold">
                      {typeof m.value_a === "number" ? m.value_a.toFixed(m.unit === "%" ? 3 : 1) : m.value_a ?? "—"}
                    </td>
                    <td className="num font-mono font-semibold">
                      {typeof m.value_b === "number" ? m.value_b.toFixed(m.unit === "%" ? 3 : 1) : m.value_b ?? "—"}
                    </td>
                    <td className={`num font-mono font-bold ${diffNum && diffNum > 0 ? "text-positive" : diffNum && diffNum < 0 ? "text-negative" : ""}`}>
                      {diffNum !== null ? (diffNum > 0 ? `+${diffNum.toFixed(1)}` : diffNum.toFixed(1)) : "—"}
                    </td>
                    <td className="num font-mono text-muted text-xs">{m.n_a}</td>
                    <td className="num font-mono text-muted text-xs">{m.n_b}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
