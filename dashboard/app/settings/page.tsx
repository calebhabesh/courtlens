import type { Metadata } from "next";
import Link from "next/link";
import { Section } from "@/components/ui/controls";
import { InstallInterface } from "@/components/install-interface";
import { WorkbenchPortraitSettings } from "@/components/workbench-portrait-settings";
import { AssistantStatusCard } from "@/components/assistant-status-card";
import { AssistantHistorySettings } from "@/components/assistant-history-settings";
import { AdvancedModeSetting } from "@/components/advanced-mode-setting";
import { getAssistantStatus, getWorkbenchStatus } from "@/lib/workbench-api";
import type { AssistantStatusResponse, WorkbenchStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Workbench Settings · CourtLens" };
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

  return (
    <div className="workbench-content">
      <div className="page-header">
        <div>
          <span className="text-xs text-muted font-mono uppercase">System Configuration</span>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">
            Configure portraits and the optional assistant; inspect local service status.
          </p>
        </div>
      </div>

      {loadError && (
        <div className="notice-box notice-box-warning">
          <strong>Notice:</strong> {loadError}. Live configuration and health values are unavailable.
        </div>
      )}

      <div className="page-actions"><Link href="/data-status">Source lineage, freshness and jobs</Link><Link href="/methodology">Definitions</Link><Link href="/investigations">Saved evidence</Link><Link href="/whats-new">Dated changes</Link></div>

      <AdvancedModeSetting />

      {/* Player Portrait Cache Coverage */}
      <WorkbenchPortraitSettings
        available={Boolean(portraits)}
        totalCached={portraits?.total_cached ?? 0}
        active={portraits?.active ?? 0}
        totalPlayers={portraits?.total_players ?? 0}
        storagePath={portraits?.storage_path ?? "data/cache/portraits"}
      />

      <AssistantStatusCard status={assistantStatus} />

      <AssistantHistorySettings />

      <InstallInterface />
      <Section title="Reported local worker state"><p>Scheduled refresh: {status?.worker.scheduled_refresh_utc ?? "Unavailable"}</p><p>Active job: {status?.worker.active_job ? `${status.worker.active_job.job_type} · ${status.worker.active_job.stage ?? "stage unavailable"}` : status ? "No active job reported" : "Unavailable"}</p><p>Latest job: {status?.worker.latest_job ? `${status.worker.latest_job.job_type} · ${status.worker.latest_job.status}` : "Unavailable"}</p><p>An idle job queue does not establish worker liveness. Inspect job heartbeats and source coverage in Data status.</p></Section>
      {/* Admitted Source Licenses & Attribution */}
      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Admitted Source Attribution & Terms</h2>
        </div>
        <div className="text-sm text-muted prose-line-relaxed">
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
