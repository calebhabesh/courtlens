"use client";

import { useEffect, useState } from "react";
import { DataDetails } from "@/components/ui/data-details";
import { formatDate } from "@/lib/format-date";
import { getLineage } from "@/lib/workbench-api";
import type { LineageResponse } from "@/lib/types";

interface LineageDrawerProps {
  factType: string;
  factId: string;
  releaseId?: string;
  onClose: () => void;
}

/** Fact-level source lineage, presented inside Data details (frontend overhaul D5). */
export function LineageDrawer({
  factType,
  factId,
  releaseId,
  onClose
}: LineageDrawerProps) {
  const [data, setData] = useState<LineageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getLineage(factType, factId, releaseId)
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Failed to load lineage");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [factType, factId, releaseId]);

  const rows = [
    { label: "Fact", value: `${factType}:${factId}`, mono: true },
    ...(data ? [
      { label: "Dataset", value: data.dataset_id, mono: true },
      { label: "Semantic signature", value: data.semantic_signature ?? "—", mono: true },
      { label: "Source namespace", value: data.source_namespace }
    ] : [])
  ];

  return (
    <DataDetails open onClose={onClose} kicker="Source Lineage" scope={{ releaseId }} rows={rows}>
      {loading && <p className="ui-data-details-status" role="status">Resolving lineage…</p>}
      {error && <p className="ui-data-details-status" role="alert">{error}</p>}
      {data && (
        <>
          <section className="ui-data-details-section" aria-label="Transform pipeline">
            <h3 className="ui-data-details-heading">Transform pipeline</h3>
            <ol className="lineage-flow-list">
              {data.transform_path.map((step, idx) => (
                <li key={idx} className="lineage-step">
                  <span className="step-num">{idx + 1}</span>
                  <span className="step-text">{step}</span>
                </li>
              ))}
            </ol>
          </section>
          <section className="ui-data-details-section" aria-label="Contributing raw observations">
            <h3 className="ui-data-details-heading">Contributing raw observations</h3>
            {data.contributing_facts.length === 0 ? (
              <p className="text-muted text-sm">No raw observations registered for this item.</p>
            ) : (
              <div className="lineage-facts-table-wrapper">
                <table className="lineage-facts-table">
                  <thead>
                    <tr>
                      <th>Game date</th>
                      <th>Fact ID</th>
                      <th>Source version</th>
                      <th>Raw observation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.contributing_facts.map((fact) => (
                      <tr key={fact.fact_id ?? fact.game_id}>
                        <td>{formatDate(fact.game_date)}</td>
                        <td className="font-mono text-xs" title={fact.fact_id ?? undefined}>{fact.fact_id ? `${fact.fact_id.slice(0, 8)}…` : "—"}</td>
                        <td className="font-mono text-xs" title={fact.source_version_id ?? undefined}>{fact.source_version_id ? `${fact.source_version_id.slice(0, 8)}…` : "—"}</td>
                        <td className="font-mono text-xs" title={fact.source_observation_id ?? undefined}>{fact.source_observation_id ? `${fact.source_observation_id.slice(0, 8)}…` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </DataDetails>
  );
}
