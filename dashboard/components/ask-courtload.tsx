"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getAssistantStatus, queryAssistant } from "@/lib/workbench-api";
import type {
  AssistantAnswer,
  AssistantStatusResponse,
} from "@/lib/types";

interface AskCourtLoadProps {
  initialSeason?: string;
  initialPhase?: string;
  initialBeforeDate?: string;
  initialWindow?: string;
}

const BENCHMARK_PROMPTS = [
  {
    label: "Raptors Defense",
    query: "Who are the best defenders on the Raptors?",
  },
  {
    label: "Scottie Barnes Forecast",
    query: "Explain the next-game points forecast for Scottie Barnes",
  },
  {
    label: "Eastern Conference Winner?",
    query: "Who will win the Eastern Conference and what are the playoff seeds?",
  },
  {
    label: "Compare Barnes & Barrett",
    query: "Compare Scottie Barnes and RJ Barrett under current season",
  },
  {
    label: "Scoring Leaders",
    query: "Who leads the league in scoring points per game?",
  },
  {
    label: "True Shooting %",
    query: "What is the formula and definition for true shooting percentage ts_pct?",
  },
];

export function AskCourtLoad({
  initialSeason,
  initialPhase,
  initialBeforeDate,
  initialWindow,
}: AskCourtLoadProps) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<AssistantAnswer | null>(null);
  const [status, setStatus] = useState<AssistantStatusResponse | null>(null);

  useEffect(() => {
    getAssistantStatus()
      .then(setStatus)
      .catch(() => {
        // Fallback default status
      });
  }, []);

  const handleAsk = async (promptQuery?: string) => {
    const q = (promptQuery ?? question).trim();
    if (!q || loading) return;

    setLoading(true);
    setError(null);
    if (promptQuery) {
      setQuestion(promptQuery);
    }

    try {
      const res = await queryAssistant({
        question: q,
        context: {
          season: initialSeason,
          phase: initialPhase,
          before_date: initialBeforeDate,
          window: initialWindow,
        },
      });
      setAnswer(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assistant query failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel" style={{ marginTop: "1rem" }}>
      <div className="panel-header" style={{ alignItems: "flex-start", gap: "0.5rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
            <span style={{ fontSize: "1.25rem" }} aria-hidden="true">💡</span>
            <h2 className="panel-title" style={{ margin: 0 }}>Ask CourtLoad</h2>
          </div>
          <p className="text-muted text-xs" style={{ margin: 0 }}>
            Analytical assistant bounded by allowlisted read-only tools, verified evidence cells, and domain discipline.
          </p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {status?.configured ? (
            <span className="badge badge-positive">
              Ready · {status.model}
            </span>
          ) : (
            <span className="badge">
              Offline Core · Optional Key
            </span>
          )}
        </div>
      </div>

      {/* Benchmark Prompt Chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", margin: "0.75rem 0" }}>
        {BENCHMARK_PROMPTS.map((bp) => (
          <button
            key={bp.label}
            type="button"
            className="button button-small"
            style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
            onClick={() => handleAsk(bp.query)}
            disabled={loading}
          >
            {bp.label}
          </button>
        ))}
      </div>

      {/* Query Input Box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleAsk();
        }}
        style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
      >
        <div style={{ position: "relative" }}>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a question (e.g. Compare Scottie Barnes and RJ Barrett, or Explain Scottie Barnes forecast)..."
            rows={2}
            maxLength={2000}
            style={{
              width: "100%",
              resize: "vertical",
              padding: "0.6rem 0.75rem",
              fontFamily: "inherit",
              fontSize: "0.875rem",
            }}
            disabled={loading}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "0.3rem",
            }}
          >
            <span className="text-xs text-muted">
              {question.length} / 2000 characters · Max 4 rounds
            </span>
            <button
              type="submit"
              className="button button-primary button-small"
              disabled={loading || !question.trim() || question.length > 2000}
            >
              {loading ? "Querying Tools..." : "Ask Assistant →"}
            </button>
          </div>
        </div>
      </form>

      {/* Error state */}
      {error && (
        <div className="notice-box" style={{ marginTop: "1rem", borderLeftColor: "var(--danger)" }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={{ padding: "1.5rem", textAlign: "center" }} className="text-muted text-sm">
          <div style={{ display: "inline-block", marginBottom: "0.5rem", fontSize: "1.5rem" }}>
            ⚙️
          </div>
          <div>Executing allowlisted analytical tools and verifying evidence ledger...</div>
        </div>
      )}

      {/* Answer Container */}
      {answer && !loading && (
        <div style={{ marginTop: "1.25rem", borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
          {/* Status & Interpretation */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: "0.75rem",
              marginBottom: "0.75rem",
            }}
          >
            <div>
              <span className="text-xs font-mono uppercase text-muted">Assistant Interpretation</span>
              <p style={{ margin: "0.2rem 0 0", fontWeight: 500, fontSize: "0.95rem" }}>
                {answer.interpretation}
              </p>
            </div>
            <div>
              {answer.status === "answered" && (
                <span className="badge badge-positive">Answered</span>
              )}
              {answer.status === "model_not_available" && (
                <span className="badge" style={{ backgroundColor: "rgba(234, 179, 8, 0.15)", color: "#ca8a04", borderColor: "#ca8a04" }}>
                  Model Not Available
                </span>
              )}
              {answer.status === "disabled" && (
                <span className="badge">Assistant Disabled</span>
              )}
            </div>
          </div>

          {/* Disabled Notice */}
          {answer.status === "disabled" && (
            <div className="notice-box" style={{ borderLeftColor: "var(--accent)" }}>
              <strong>Zero-cost core offline:</strong> {answer.interpretation} Ordinary structured search, player profiles, and prospective forecasts work without any external API key.
            </div>
          )}

          {/* Model Not Available Notice (e.g. Conference Prediction) */}
          {answer.status === "model_not_available" && (
            <div
              className="notice-box"
              style={{ borderLeftColor: "#ca8a04", backgroundColor: "rgba(234, 179, 8, 0.05)" }}
            >
              <strong>Capability Deferred:</strong> Conference placement and playoff seeding forecasting are not available in this release. Verified team production and standings figures are shown below.
            </div>
          )}

          {/* Supported Claims */}
          {answer.supported_claims.length > 0 && (
            <div style={{ marginBottom: "1rem" }}>
              <span className="text-xs font-mono uppercase text-muted">Verified Claims</span>
              <ul style={{ margin: "0.4rem 0 0 1.2rem", padding: 0, fontSize: "0.875rem" }}>
                {answer.supported_claims.map((claim, idx) => (
                  <li key={idx} style={{ marginBottom: "0.25rem" }}>
                    <span>{claim.statement}</span>
                    {claim.evidence_ref_ids.length > 0 && (
                      <span
                        className="badge"
                        style={{ marginLeft: "0.4rem", fontSize: "0.7rem", padding: "0.1rem 0.35rem" }}
                        title={`Evidence references: ${claim.evidence_ref_ids.join(", ")}`}
                      >
                        verified {claim.evidence_ref_ids.join(", ")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Result Tables */}
          {answer.result_tables.map((table, tIdx) => (
            <div key={tIdx} style={{ marginBottom: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                <span className="text-xs font-semibold">{table.title}</span>
                <span className="text-xs text-muted font-mono">{table.row_count} rows</span>
              </div>
              <div className="table-wrapper" style={{ overflowX: "auto" }}>
                <table className="data-table" style={{ width: "100%", fontSize: "0.825rem" }}>
                  <thead>
                    <tr>
                      {table.columns.map((col) => (
                        <th
                          key={col.key}
                          style={{ textAlign: col.align === "right" ? "right" : "left", padding: "0.4rem 0.6rem" }}
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row, rIdx) => (
                      <tr key={rIdx}>
                        {table.columns.map((col) => {
                          const val = row[col.key];
                          return (
                            <td
                              key={col.key}
                              style={{ textAlign: col.align === "right" ? "right" : "left", padding: "0.4rem 0.6rem" }}
                            >
                              {val !== null && val !== undefined ? String(val) : "—"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {/* Limitations & Disclaimers */}
          {answer.limitations.length > 0 && (
            <div
              style={{
                backgroundColor: "rgba(0, 0, 0, 0.02)",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                padding: "0.6rem 0.8rem",
                marginBottom: "1rem",
              }}
            >
              <span className="text-xs font-mono uppercase text-muted" style={{ display: "block", marginBottom: "0.25rem" }}>
                Analytical Limitations & Guardrails
              </span>
              <ul style={{ margin: "0.2rem 0 0 1.2rem", padding: 0, fontSize: "0.8rem", color: "var(--muted)" }}>
                {answer.limitations.map((lim, lIdx) => (
                  <li key={lIdx} style={{ marginBottom: "0.2rem" }}>
                    {lim}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action Footer: Explorer Link & Manifest */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "0.75rem",
              borderTop: "1px dashed var(--border)",
              paddingTop: "0.75rem",
            }}
          >
            {answer.explorer_query && (
              <Link
                href={answer.explorer_query.target_url}
                className="button button-primary button-small"
                style={{ textDecoration: "none" }}
              >
                Open in Workbench Explorer ({answer.explorer_query.view}) →
              </Link>
            )}

            {answer.reproducible_manifest && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <span className="text-xs text-muted font-mono">
                  SHA-256: {answer.reproducible_manifest.manifest_sha256.slice(0, 12)}…
                </span>
                <span className="badge" style={{ fontSize: "0.7rem" }}>
                  {answer.reproducible_manifest.tool_rounds} rounds · {answer.reproducible_manifest.evidence_cells_count} cells
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
