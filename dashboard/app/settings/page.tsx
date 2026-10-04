import type { Metadata } from "next";
import Link from "next/link";
import { InstallInterface } from "@/components/install-interface";
import { WorkbenchPortraitSettings } from "@/components/workbench-portrait-settings";
import { getAssistantStatus, getWorkbenchStatus } from "@/lib/workbench-api";
import type { AssistantStatusResponse, WorkbenchStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Workbench Settings · CourtLoad" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  let status: WorkbenchStatus | null = null;
  let assistantStatus: AssistantStatusResponse | null = null;
  let loadError: string | null = null;

  try {
    status = await getWorkbenchStatus();
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Status unreachable";
  }

  try {
    assistantStatus = await getAssistantStatus();
  } catch {
    // Graceful fallback
  }

  const portraits = status?.capabilities?.portraits;
  const isKeyConfigured = assistantStatus?.configured ?? false;

  return (
    <div className="workbench-content">
      <div className="page-header">
        <div>
          <span className="text-xs text-muted font-mono uppercase">System Configuration</span>
          <h1 className="page-title">Settings & Operational Health</h1>
          <p className="page-subtitle">
            Local daemon worker status, credentials, portrait asset coverage, and data source configurations.
          </p>
        </div>
      </div>

      {loadError && (
        <div className="notice-box" style={{ borderLeftColor: "var(--warning)" }}>
          <strong>Notice:</strong> {loadError}. Live configuration and health values are unavailable.
        </div>
      )}

      <div className="page-actions"><Link href="/data-status">Source lineage, freshness and jobs</Link><Link href="/methodology">Definitions</Link><Link href="/investigations">Saved evidence</Link><Link href="/patch-notes">Dated changes</Link></div>
      <div className="panel"><h2>Reported local worker state</h2><p>Scheduled refresh: {status?.worker.scheduled_refresh_utc ?? "Unavailable"}</p><p>Active job: {status?.worker.active_job ? `${status.worker.active_job.job_type} · ${status.worker.active_job.stage ?? "stage unavailable"}` : status ? "No active job reported" : "Unavailable"}</p><p>Latest job: {status?.worker.latest_job ? `${status.worker.latest_job.job_type} · ${status.worker.latest_job.status}` : "Unavailable"}</p><p>An idle job queue does not establish worker liveness. Inspect job heartbeats and source coverage in Data status.</p></div>
      <InstallInterface />
      {/* Player Portrait Cache Coverage */}
      <WorkbenchPortraitSettings
        totalCached={portraits?.total_cached ?? 0}
        active={portraits?.active ?? 0}
        totalPlayers={portraits?.total_players ?? 0}
        storagePath={portraits?.storage_path ?? "data/cache/portraits"}
      />

      {/* Optional Assistant Configuration */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Optional AI Assistant (Gemini Adapter)</h2>
            <p className="text-muted text-xs" style={{ margin: "0.2rem 0 0" }}>
              Optional language planning over validated read-only analytical operations. Configuration alone does not establish real-provider language accuracy.
            </p>
          </div>
          <span className={`badge ${isKeyConfigured ? "badge-positive" : ""}`}>
            {assistantStatus ? isKeyConfigured ? "API Key Configured" : "Disabled (No Key Required)" : "Configuration unavailable"}
          </span>
        </div>

        <div className="notice-box" style={{ borderLeftColor: "var(--series-secondary)" }}>
          <strong>Zero-cost core guarantee:</strong> CourtLoad requires no paid subscription, cloud service, or API key for complete operation. The assistant is entirely optional and remains disabled until an explicit user key is provided.
        </div>

        <div className="lineage-meta-box">
          <div className="meta-row">
            <span className="meta-label">Assistant Status</span>
            <span className="meta-value font-semibold">
              {assistantStatus ? isKeyConfigured ? "Configured; provider evaluation remains separate" : "Disabled; manual research available" : "Configuration status unavailable"}
            </span>
          </div>
          <div className="meta-row">
            <span className="meta-label">Configured Model</span>
            <span className="meta-value font-mono text-xs">{assistantStatus?.model ?? "Unavailable"}</span>
          </div>
          <div className="meta-row">
            <span className="meta-label">Setup Environment Variable</span>
            <span className="meta-value font-mono text-xs">COURTLOAD_GEMINI_API_KEY</span>
          </div>
          <div className="meta-row">
            <span className="meta-label">Allowlisted Tools ({assistantStatus?.allowed_tools.length ?? 0})</span>
            <span className="meta-value text-xs font-mono">
              {assistantStatus?.allowed_tools.join(", ") ?? "Unavailable"}
            </span>
          </div>
          <div className="meta-row">
            <span className="meta-label">Execution Guardrails</span>
            <span className="meta-value text-xs">
              {assistantStatus?.limits
                ? `Max ${assistantStatus.limits.max_question_length} chars, ≤${assistantStatus.limits.max_rounds} rounds, ≤${assistantStatus.limits.max_total_tool_calls} calls, ${assistantStatus.limits.timeout_seconds}s deadline`
                : "Unavailable"}
            </span>
          </div>
        </div>
      </div>

      {/* Admitted Source Licenses & Attribution */}
      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Admitted Source Attribution & Terms</h2>
        </div>
        <div className="text-sm text-muted" style={{ lineHeight: 1.6 }}>
          <p>
            <strong>SportsDataverse NBA Stats:</strong> Historical and recent regular-season and playoff box score data acquired from open, zero-cost public release archives.
          </p>
          <p>
            <strong>NBA CDN Media:</strong> Player headshots fetched from the public CDN and cached locally by cryptographic SHA-256 digest. Unofficial and not affiliated with the National Basketball Association.
          </p>
        </div>
      </div>
    </div>
  );
}
