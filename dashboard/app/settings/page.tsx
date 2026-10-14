import type { Metadata } from "next";
import { InstallInterface } from "@/components/install-interface";
import { WorkbenchPortraitSettings } from "@/components/workbench-portrait-settings";
import { AssistantStatusCard } from "@/components/assistant-status-card";
import { AssistantHistorySettings } from "@/components/assistant-history-settings";
import { AdvancedModeSetting } from "@/components/advanced-mode-setting";
import { ArticleLayout, ArticleSection } from "@/components/ui/article-layout";
import { GatedNote } from "@/components/ui/gated-note";
import { PageShell } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/ui/panel";
import { formatTimestamp } from "@/lib/format-date";
import { getAssistantStatus, getWorkbenchStatus } from "@/lib/workbench-api";
import type { AssistantStatusResponse, WorkbenchStatus } from "@/lib/types";
import { ButtonLink } from "@/components/ui/kit";

export const metadata: Metadata = { title: "Settings · CourtLens" };
export const dynamic = "force-dynamic";

// Configuration a person can change comes first; read-only service state follows (FO13).
const TOC = [
  { id: "display", label: "Display" },
  { id: "assistant", label: "Assistant" },
  { id: "history", label: "History and privacy" },
  { id: "portraits", label: "Player portraits" },
  { id: "install", label: "Install" },
  { id: "worker", label: "Background worker" },
  { id: "sources", label: "Sources and terms" },
];

function jobLabel(type: string) {
  return type.charAt(0).toUpperCase() + type.slice(1).replaceAll("_", " ");
}

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
    // The assistant section states that its configuration is unavailable.
  }

  const portraits = status?.capabilities?.portraits;
  const worker = status?.worker;

  return (
    <PageShell template="article">
      <PageHeader title="Settings" subtitle="Display, assistant, portraits and installation for this local workbench." />
      {loadError && (
        <GatedNote tone="warning" why={<p>{loadError}. Portrait counts and worker state are unknown until the local API answers.</p>}>
          Workbench status is unavailable.
        </GatedNote>
      )}
      <ArticleLayout toc={TOC}>
        <AdvancedModeSetting />
        <AssistantStatusCard status={assistantStatus} />
        <AssistantHistorySettings />
        <WorkbenchPortraitSettings
          available={Boolean(portraits)}
          totalCached={portraits?.total_cached ?? 0}
          active={portraits?.active ?? 0}
          totalPlayers={portraits?.total_players ?? 0}
          storagePath={portraits?.storage_path ?? "data/cache/portraits"}
        />
        <InstallInterface />
        <ArticleSection id="worker" title="Background worker" actions={<ButtonLink size="xs" href="/data-status">Open Data Status</ButtonLink>}>
          <dl className="ui-article-facts">
            <div><dt>Scheduled refresh</dt><dd>{worker ? `${worker.scheduled_refresh_utc} UTC daily` : "Unavailable"}</dd></div>
            <div><dt>Active job</dt><dd>{worker?.active_job ? `${jobLabel(worker.active_job.job_type)} · ${worker.active_job.stage ?? "stage unavailable"}` : worker ? "No active job reported" : "Unavailable"}</dd></div>
            <div><dt>Latest job</dt><dd>{worker?.latest_job ? `${jobLabel(worker.latest_job.job_type)} · ${worker.latest_job.status}${worker.latest_job.finished_at ? ` · ${formatTimestamp(worker.latest_job.finished_at)}` : ""}` : "Unavailable"}</dd></div>
          </dl>
          <p>An idle job queue does not establish worker liveness. Job heartbeats and source coverage are in Data Status.</p>
        </ArticleSection>
        <ArticleSection id="sources" title="Sources and terms">
          <p><strong>SportsDataverse NBA Stats:</strong> historical and recent regular-season and playoff box scores from open, zero-cost public release archives.</p>
          <p><strong>NBA CDN media:</strong> player headshots fetched from the public CDN and cached locally by SHA-256 digest. Unofficial and not affiliated with the National Basketball Association.</p>
        </ArticleSection>
      </ArticleLayout>
    </PageShell>
  );
}
