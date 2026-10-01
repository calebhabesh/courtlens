import type { Metadata } from "next";
import { WorkbenchJobsPanel } from "@/components/workbench-jobs-panel";
import { getWorkbenchJobs, getWorkbenchStatus } from "@/lib/workbench-api";
import type { WorkbenchJobItem, WorkbenchStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Data & Pipelines · CourtLoad" };
export const dynamic = "force-dynamic";

export default async function DataStatusPage() {
  let status: WorkbenchStatus | null = null;
  let jobs: WorkbenchJobItem[] = [];
  let error: string | null = null;

  try {
    status = await getWorkbenchStatus();
    jobs = await getWorkbenchJobs(undefined, 20);
  } catch (err) {
    error = err instanceof Error ? err.message : "Workbench status unreachable";
  }

  return (
    <div className="workbench-content">
      <div className="page-header">
        <div>
          <span className="text-xs text-muted font-mono uppercase">Pipelines & Infrastructure</span>
          <h1 className="page-title">Data & Pipelines</h1>
          <p className="page-subtitle">
            Immutable versioned admissions, cryptographic semantic signatures, and background worker executions.
          </p>
        </div>
      </div>

      {error && (
        <div className="notice-box" style={{ borderLeftColor: "var(--warning)" }}>
          <strong>Notice:</strong> {error}. Running in local offline mode.
        </div>
      )}

      {/* Freshness & Release Overview */}
      <div className="grid-4" style={{ marginBottom: "1.25rem" }}>
        <div className="stat-card">
          <span className="stat-value text-accent font-mono">
            {status?.release?.channel ?? "public"}
          </span>
          <span className="stat-label">Published Channel</span>
          <span className="stat-subtext">Atomic pointer swap</span>
        </div>

        <div className="stat-card">
          <span className="stat-value font-mono">
            {status?.source?.namespace ?? "sportsdataverse"}
          </span>
          <span className="stat-label">Source Provider</span>
          <span className="stat-subtext">Zero-cost free ingestion</span>
        </div>

        <div className="stat-card">
          <span className="stat-value font-mono">
            {status?.source?.admitted_seasons?.length ?? 4} Seasons
          </span>
          <span className="stat-label">Admitted Coverage</span>
          <span className="stat-subtext">2023-24 to 2026-27</span>
        </div>

        <div className="stat-card">
          <span className="stat-value font-mono">09:00 UTC</span>
          <span className="stat-label">Worker Schedule</span>
          <span className="stat-subtext">Daily refresh interval</span>
        </div>
      </div>

      {/* Release Manifest & Pointer Details */}
      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Published Release Manifest</h2>
          <span className="badge badge-positive">Active Serving Pointer</span>
        </div>

        <div className="lineage-meta-box">
          <div className="meta-row">
            <span className="meta-label">Snapshot ID</span>
            <span className="meta-value font-mono">{status?.release?.snapshot_id || "Uninitialized"}</span>
          </div>
          <div className="meta-row">
            <span className="meta-label">Dataset ID</span>
            <span className="meta-value font-mono">{status?.release?.dataset_id || "—"}</span>
          </div>
          <div className="meta-row">
            <span className="meta-label">Semantic Signature</span>
            <span className="meta-value font-mono text-accent">{status?.release?.semantic_signature || "—"}</span>
          </div>
          <div className="meta-row">
            <span className="meta-label">Published Timestamp</span>
            <span className="meta-value font-mono">
              {status?.release?.published_at ? new Date(status.release.published_at).toUTCString() : "—"}
            </span>
          </div>
          <div className="meta-row">
            <span className="meta-label">Finalized Game Date</span>
            <span className="meta-value font-mono">{status?.source?.latest_finalized_date || "None before season opener"}</span>
          </div>
        </div>
      </div>

      {/* Interactive Worker Jobs Panel */}
      <WorkbenchJobsPanel initialJobs={jobs} />

      {/* Admitted Source Contracts & Limitations */}
      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Source Capabilities & Zero-Inferred Rules</h2>
        </div>
        <ul className="text-sm text-muted" style={{ lineHeight: 1.6, margin: 0, paddingLeft: "1.25rem" }}>
          <li>
            <strong>Preseason Outcomes:</strong> Preseason games are admitted as <code>schedule_only</code>; absence of preseason player box scores is treated as unobserved, not zero.
          </li>
          <li>
            <strong>Team Participation:</strong> Active team associations are derived from latest observed participation; unobserved roster transactions are not guessed.
          </li>
          <li>
            <strong>Shot Arithmetic:</strong> Every admitted player and team game enforces made shots $\le$ attempted shots. Reconciled games verify 100% score alignment.
          </li>
          <li>
            <strong>Advisory Locking:</strong> Background ingestion, dbt builds, and publication hold an exclusive PostgreSQL session lock to prevent split-brain releases.
          </li>
        </ul>
      </div>
    </div>
  );
}
