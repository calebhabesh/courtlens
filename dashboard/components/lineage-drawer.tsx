"use client";

import { useEffect, useState } from "react";
import { getLineage } from "@/lib/workbench-api";
import type { LineageResponse } from "@/lib/types";

interface LineageDrawerProps {
  factType: string;
  factId: string;
  releaseId?: string;
  onClose: () => void;
}

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

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      active = false;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [factType, factId, releaseId, onClose]);

  return (
    <div className="drawer-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="lineage-title">
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <span className="drawer-kicker">Data Integrity & Traceability</span>
            <h2 id="lineage-title" className="drawer-title">
              Source Lineage
            </h2>
          </div>
          <button
            type="button"
            className="drawer-close-btn"
            onClick={onClose}
            aria-label="Close lineage drawer"
          >
            ✕
          </button>
        </div>

        <div className="drawer-content">
          <div className="lineage-meta-box">
            <div className="meta-row">
              <span className="meta-label">Fact Target</span>
              <span className="meta-value font-mono">{factType}:{factId}</span>
            </div>
            {data && (
              <>
                <div className="meta-row">
                  <span className="meta-label">Dataset ID</span>
                  <span className="meta-value font-mono">{data.dataset_id}</span>
                </div>
                <div className="meta-row">
                  <span className="meta-label">Semantic Signature</span>
                  <span className="meta-value font-mono text-accent" title={data.semantic_signature ?? ""}>
                    {data.semantic_signature ? `${data.semantic_signature.slice(0, 16)}...` : "—"}
                  </span>
                </div>
                <div className="meta-row">
                  <span className="meta-label">Source Namespace</span>
                  <span className="meta-value">{data.source_namespace}</span>
                </div>
              </>
            )}
          </div>

          {loading && <div className="loading-spinner">Resolving cryptographic lineage...</div>}
          {error && <div className="error-box">{error}</div>}

          {data && (
            <>
              <h3 className="section-subtitle">Transform Pipeline</h3>
              <ol className="lineage-flow-list">
                {data.transform_path.map((step, idx) => (
                  <li key={idx} className="lineage-step">
                    <span className="step-num">{idx + 1}</span>
                    <span className="step-text">{step}</span>
                  </li>
                ))}
              </ol>

              <h3 className="section-subtitle">Contributing Raw Observations</h3>
              {data.contributing_facts.length === 0 ? (
                <p className="text-muted text-sm">No raw observations registered for this item.</p>
              ) : (
                <div className="lineage-facts-table-wrapper">
                  <table className="lineage-facts-table">
                    <thead>
                      <tr>
                        <th>Game Date</th>
                        <th>Fact ID</th>
                        <th>Source Version</th>
                        <th>Raw Observation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.contributing_facts.map((fact) => (
                        <tr key={fact.fact_id ?? fact.game_id}>
                          <td>{fact.game_date}</td>
                          <td className="font-mono text-xs">{fact.fact_id ? `${fact.fact_id.slice(0, 8)}...` : "—"}</td>
                          <td className="font-mono text-xs">{fact.source_version_id ? `${fact.source_version_id.slice(0, 8)}...` : "—"}</td>
                          <td className="font-mono text-xs">{fact.source_observation_id ? `${fact.source_observation_id.slice(0, 8)}...` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
