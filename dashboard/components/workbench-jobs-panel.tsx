"use client";

import { useEffect, useState } from "react";
import { enqueueJob, getWorkbenchJobs } from "@/lib/workbench-api";
import type { WorkbenchJobItem } from "@/lib/types";

export function WorkbenchJobsPanel({ initialJobs }: { initialJobs: WorkbenchJobItem[] }) {
  const [jobs, setJobs] = useState<WorkbenchJobItem[]>(initialJobs);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const reloadJobs = async () => {
    try {
      const updated = await getWorkbenchJobs(undefined, 20);
      setJobs(updated);
    } catch {
      // Ignore background poll errors
    }
  };

  useEffect(() => {
    const timer = setInterval(reloadJobs, 4000);
    return () => clearInterval(timer);
  }, []);

  const handleTrigger = async (type: "refresh" | "portraits" | "bootstrap") => {
    setSubmitting(type);
    setActionMessage(null);
    try {
      const res = await enqueueJob(type);
      setActionMessage(`Job '${type}' accepted: ID ${res.job_id.slice(0, 8)}... (${res.status})`);
      await reloadJobs();
    } catch (err) {
      setActionMessage(`Error: ${err instanceof Error ? err.message : "Mutation failed"}`);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Background Worker Jobs</h2>
          <p className="text-muted text-xs jobs-panel-desc">
            Tracked executions protected by PostgreSQL advisory locking (09:00 UTC schedule & on-demand triggers).
          </p>
        </div>
        <div className="jobs-panel-actions">
          <button
            type="button"
            className="button button-small button-primary"
            onClick={() => handleTrigger("refresh")}
            disabled={submitting !== null}
          >
            {submitting === "refresh" ? "Enqueueing…" : "🔄 Refresh Workbench"}
          </button>
          <button
            type="button"
            className="button button-small"
            onClick={() => handleTrigger("portraits")}
            disabled={submitting !== null}
          >
            {submitting === "portraits" ? "Enqueueing…" : "📸 Acquire Portraits"}
          </button>
          <button
            type="button"
            className="button button-small"
            onClick={() => handleTrigger("bootstrap")}
            disabled={submitting !== null}
          >
            {submitting === "bootstrap" ? "Enqueueing…" : "⚡ Run Bootstrap"}
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="notice-box jobs-panel-notice">
          {actionMessage}
        </div>
      )}

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Job ID</th>
              <th>Type</th>
              <th>Status</th>
              <th>Stage</th>
              <th>Timings</th>
              <th>Started</th>
              <th>Finished</th>
              <th>Error / Output</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-muted table-empty-cell">
                  No jobs recorded yet.
                </td>
              </tr>
            ) : (
              jobs.map((j, idx) => (
                <tr key={j.job_id || idx}>
                  <td className="font-mono text-xs">{j.job_id ? `${j.job_id.slice(0, 8)}...` : "—"}</td>
                  <td><strong>{j.job_type}</strong></td>
                  <td>
                    <span className={`badge ${j.status === "succeeded" ? "badge-positive" : j.status === "running" ? "badge-accent" : j.status === "failed" ? "badge-warning" : ""}`}>
                      {j.status}
                    </span>
                  </td>
                  <td className="font-mono text-xs">{j.stage || "—"}</td>
                  <td className="font-mono text-xs text-muted">
                    {j.timings?.total ? `${j.timings.total}s` : "—"}
                  </td>
                  <td className="text-xs text-muted">
                    {j.started_at ? new Date(j.started_at).toLocaleTimeString() : "—"}
                  </td>
                  <td className="text-xs text-muted">
                    {j.finished_at ? new Date(j.finished_at).toLocaleTimeString() : "—"}
                  </td>
                  <td className="text-xs jobs-panel-error-cell">
                    {j.error_summary ? (
                      <span className="text-negative font-mono">{j.error_summary}</span>
                    ) : j.output_refs ? (
                      <span className="text-muted font-mono">{JSON.stringify(j.output_refs)}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
