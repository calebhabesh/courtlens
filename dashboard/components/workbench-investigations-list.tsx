"use client";

import Link from "next/link";
import { useState } from "react";
import { getExportUrl, reproduceInvestigation } from "@/lib/workbench-api";
import type { InvestigationReproduce, SavedInvestigation } from "@/lib/types";

export function WorkbenchInvestigationsList({ items }: { items: SavedInvestigation[] }) {
  const [reproduceState, setReproduceState] = useState<Record<string, { loading: boolean; result?: InvestigationReproduce; error?: string }>>({});

  const handleReproduce = async (id: string) => {
    setReproduceState((prev) => ({ ...prev, [id]: { loading: true } }));
    try {
      const res = await reproduceInvestigation(id);
      setReproduceState((prev) => ({ ...prev, [id]: { loading: false, result: res } }));
    } catch (err) {
      setReproduceState((prev) => ({
        ...prev,
        [id]: { loading: false, error: err instanceof Error ? err.message : "Reproduction check failed" }
      }));
    }
  };

  if (items.length === 0) {
    return (
      <div className="panel" style={{ textAlign: "center", padding: "3rem" }}>
        <h3 className="section-title">No Saved Investigations Yet</h3>
        <p className="text-muted text-sm" style={{ margin: "0.5rem 0 1.25rem" }}>
          You can save reproducible analytical queries with cryptographic manifests from the Player Explorer.
        </p>
        <Link href="/players" className="button button-primary">
          Explore Players & Save an Analysis →
        </Link>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {items.map((item) => {
        const q = item.query as Record<string, string>;
        const rep = reproduceState[item.id];

        // Build query string for opening in explorer
        const sp = new URLSearchParams();
        for (const [k, v] of Object.entries(q || {})) {
          if (v) sp.set(k, String(v));
        }

        return (
          <div key={item.id} className="panel">
            <div className="panel-header" style={{ alignItems: "flex-start" }}>
              <div>
                <span className="text-xs text-muted font-mono uppercase">
                  Investigation · Saved {new Date(item.created_at).toLocaleDateString()}
                </span>
                <h2 className="panel-title" style={{ fontSize: "1.15rem", marginTop: "0.15rem" }}>
                  {item.title}
                </h2>
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.4rem", flexWrap: "wrap" }}>
                  <span className="badge">
                    {q?.season || "2025-26"} {q?.phase?.replace("_", " ") || "regular season"}
                  </span>
                  <span className="badge">
                    Sort: {q?.sort_metric?.toUpperCase() || "PTS"}
                  </span>
                  <span className="badge font-mono">
                    {item.total_rows} Result Rows
                  </span>
                  <span className="badge font-mono">
                    Catalog: {item.metric_version}
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="button button-small"
                  onClick={() => handleReproduce(item.id)}
                  disabled={rep?.loading}
                  title="Verify exact SHA-256 match against bound dataset"
                >
                  {rep?.loading ? "Verifying…" : "Verify Reproduction"}
                </button>
                <a
                  href={getExportUrl(item.id, "csv")}
                  download={`investigation-${item.id}.csv`}
                  className="button button-small"
                >
                  Export CSV
                </a>
                <a
                  href={getExportUrl(item.id, "json")}
                  download={`investigation-${item.id}.json`}
                  className="button button-small"
                >
                  Export JSON
                </a>
                <Link
                  href={`/players?${sp.toString()}`}
                  className="button button-small button-primary"
                >
                  Open in Explorer →
                </Link>
              </div>
            </div>

            {/* Cryptographic Hashes */}
            <div className="lineage-meta-box" style={{ marginTop: "0.75rem" }}>
              <div className="meta-row">
                <span className="meta-label">Manifest SHA-256</span>
                <span className="meta-value font-mono text-xs">{item.manifest_sha256}</span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Result Hash SHA-256</span>
                <span className="meta-value font-mono text-xs text-accent">{item.result_sha256}</span>
              </div>
            </div>

            {/* Reproduction Outcome */}
            {rep && (
              <div style={{ marginTop: "0.75rem" }}>
                {rep.error && (
                  <div className="notice-box" style={{ borderLeftColor: "var(--negative)", margin: 0 }}>
                    <strong>Reproduction verification error:</strong> {rep.error}
                  </div>
                )}
                {rep.result && (
                  <div
                    className="notice-box"
                    style={{
                      borderLeftColor: rep.result.match ? "var(--positive)" : "var(--warning)",
                      margin: 0
                    }}
                  >
                    <strong>Reproduction check:</strong>{" "}
                    {rep.result.match ? (
                      <span className="text-positive font-bold">
                        PASS · Recomputed result hash matches stored signature ({rep.result.recomputed_result_sha256.slice(0, 12)}...)
                      </span>
                    ) : (
                      <span className="text-warning">
                        MISMATCH: {rep.result.reason}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
