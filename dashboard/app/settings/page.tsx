import type { Metadata } from "next";
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
  const isKeyConfigured = Boolean(
    assistantStatus?.configured ??
    (process.env.COURTLOAD_GEMINI_API_KEY || process.env.GEMINI_API_KEY)
  );

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
          <strong>Notice:</strong> {loadError}. Operating in local offline mode.
        </div>
      )}

      {/* Local Worker Daemon Status */}
      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Local Worker Daemon</h2>
          <span className="badge badge-positive">Active Background Service</span>
        </div>
        <div className="grid-3" style={{ marginBottom: "1rem" }}>
          <div className="stat-card">
            <span className="stat-value font-mono">09:00 UTC</span>
            <span className="stat-label">Daily Refresh</span>
            <span className="stat-subtext">Post-upstream build window</span>
          </div>
          <div className="stat-card">
            <span className="stat-value font-mono">Loopback</span>
            <span className="stat-label">Port Binding</span>
            <span className="stat-subtext">127.0.0.1 (Strict local)</span>
          </div>
          <div className="stat-card">
            <span className="stat-value font-mono">Configured</span>
            <span className="stat-label">Operator Token</span>
            <span className="stat-subtext">Server-side mutation guard</span>
          </div>
        </div>
        <p className="text-xs text-muted">
          The background worker catches up on startup when due and handles graceful shutdown signals (SIGINT/SIGTERM). Expired leases automatically recover interrupted jobs.
        </p>
      </div>

      {/* Player Portrait Cache Coverage */}
      <WorkbenchPortraitSettings
        totalCached={portraits?.total_cached ?? 0}
        active={portraits?.active ?? 0}
        totalPlayers={portraits?.total_players ?? 816}
        storagePath={portraits?.storage_path ?? "data/cache/portraits"}
      />

      {/* Optional Assistant Configuration */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Optional AI Assistant (Gemini Adapter)</h2>
            <p className="text-muted text-xs" style={{ margin: "0.2rem 0 0" }}>
              Milestone P8 optional read-only natural language interface over verified analytical services.
            </p>
          </div>
          <span className={`badge ${isKeyConfigured ? "badge-positive" : ""}`}>
            {isKeyConfigured ? "API Key Configured" : "Disabled (No Key Required)"}
          </span>
        </div>

        <div className="notice-box" style={{ borderLeftColor: "var(--series-secondary)" }}>
          <strong>Zero-cost core guarantee:</strong> CourtLoad requires no paid subscription, cloud service, or API key for complete operation. The assistant is entirely optional and remains disabled until an explicit user key is provided.
        </div>

        <div className="lineage-meta-box">
          <div className="meta-row">
            <span className="meta-label">Assistant Status</span>
            <span className="meta-value font-semibold">
              {isKeyConfigured ? "Ready for analytical queries" : "Disabled (Ordinary structured search remains complete)"}
            </span>
          </div>
          <div className="meta-row">
            <span className="meta-label">Configured Model</span>
            <span className="meta-value font-mono text-xs">{assistantStatus?.model ?? "gemini-2.5-flash"}</span>
          </div>
          <div className="meta-row">
            <span className="meta-label">Setup Environment Variable</span>
            <span className="meta-value font-mono text-xs">COURTLOAD_GEMINI_API_KEY</span>
          </div>
          <div className="meta-row">
            <span className="meta-label">Allowlisted Tools ({assistantStatus?.allowed_tools.length ?? 8})</span>
            <span className="meta-value text-xs font-mono">
              {assistantStatus?.allowed_tools.join(", ") ?? "get_catalog, search_players, get_forecast, compare_players, ..."}
            </span>
          </div>
          <div className="meta-row">
            <span className="meta-label">Execution Guardrails</span>
            <span className="meta-value text-xs">
              {assistantStatus?.limits
                ? `Max ${assistantStatus.limits.max_question_length} chars, ≤${assistantStatus.limits.max_rounds} rounds, ≤${assistantStatus.limits.max_total_tool_calls} calls, ${assistantStatus.limits.timeout_seconds}s deadline`
                : "Max 2000 chars, ≤4 rounds, ≤8 calls, 45s deadline"}
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
