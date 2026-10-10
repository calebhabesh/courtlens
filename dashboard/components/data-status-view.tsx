"use client";

import { useCallback, useEffect, useState } from "react";
import { enqueueJob, getWorkbenchJobs } from "@/lib/workbench-api";
import { formatDate, formatTimestamp } from "@/lib/format-date";
import type { WorkbenchJobItem, WorkbenchStatus } from "@/lib/types";
import { Badge, type BadgeVariant } from "./ui/badge";
import { Button } from "./ui/button";
import { Icon } from "./ui/icon";
import { DataDetailsButton } from "./ui/data-details";
import { CountChip, FilterBar } from "./ui/filter-bar";
import { GatedNote } from "./ui/gated-note";
import { Menu, MenuItem } from "./ui/menu";
import { PageShell, ResearchLayout } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { StatTile } from "./ui/stat-tile";

type JobType = "refresh" | "portraits" | "bootstrap";
const JOB_LABELS: Record<string, string> = { refresh: "Refresh", portraits: "Portraits", bootstrap: "Bootstrap" };
const STATUS_VARIANT: Record<string, BadgeVariant> = { succeeded: "positive", running: "accent", failed: "negative", interrupted: "negative" };

function jobLabel(type: string) {
  return JOB_LABELS[type] ?? type.replaceAll("_", " ");
}

function duration(job: WorkbenchJobItem): string {
  if (!job.started_at || !job.finished_at) return "—";
  const seconds = (new Date(job.finished_at).getTime() - new Date(job.started_at).getTime()) / 1000;
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  return seconds < 60 ? `${seconds.toFixed(seconds < 10 ? 2 : 0)}s` : `${Math.round(seconds / 60)} min`;
}

function seasonRange(seasons: readonly string[]): string | undefined {
  return seasons.length ? (seasons.length === 1 ? seasons[0] : `${seasons[0]} to ${seasons.at(-1)}`) : undefined;
}

/**
 * Data Status (FO13, Research template): published release and coverage as key findings, then the
 * background job table. Release, dataset and signature identities and each job's ID, owner and
 * outputs are in Data details (D5). Values the API did not report are unknown, never filled in.
 */
export function DataStatusView({ status, initialJobs, error }: { status: WorkbenchStatus | null; initialJobs: WorkbenchJobItem[]; error: string | null }) {
  const [jobs, setJobs] = useState(initialJobs);
  const [submitting, setSubmitting] = useState<JobType | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try { setJobs(await getWorkbenchJobs(undefined, 20)); } catch { /* The last known table stays; the next poll retries. */ }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => void reload(), 4000);
    return () => clearInterval(timer);
  }, [reload]);

  async function trigger(type: JobType) {
    setSubmitting(type);
    setMessage(null);
    try {
      const result = await enqueueJob(type);
      setMessage(`${jobLabel(type)} job ${result.status}.`);
      await reload();
    } catch (cause) {
      setMessage(`Could not queue ${jobLabel(type).toLowerCase()}: ${cause instanceof Error ? cause.message : "the job was not accepted"}`);
    } finally {
      setSubmitting(null);
    }
  }

  const release = status?.release;
  const source = status?.source;
  const seasons = source?.admitted_seasons ?? [];
  const published = release?.published_at ? formatTimestamp(release.published_at) : null;
  const rows = [
    { label: "Channel", value: release?.channel ?? "Unavailable" },
    { label: "Snapshot ID", value: release?.snapshot_id ?? "Uninitialized", mono: true },
    { label: "Dataset ID", value: release?.dataset_id ?? "—", mono: true },
    { label: "Semantic signature", value: release?.semantic_signature ?? "—", mono: true },
    { label: "Published", value: published ?? "—" },
    { label: "Coverage", value: release?.coverage_start && release.coverage_end ? `${formatDate(release.coverage_start)} – ${formatDate(release.coverage_end)}` : "—" },
    { label: "Source namespace", value: source?.namespace ?? "—", mono: true },
    { label: "Publication", value: "Atomic pointer swap on the public channel; rollback moves the pointer to a retained snapshot." },
  ];
  const actions = (
    <>
      <Button variant="primary" size="sm" icon="refresh" loading={submitting === "refresh"} disabled={submitting !== null} onClick={() => void trigger("refresh")}>Refresh workbench</Button>
      {/* Menu renders its own trigger button, so the trigger is button-styled content, not a Button. */}
      <Menu align="right" trigger={<span className="ui-button ui-button-secondary ui-button-sm">More jobs<Icon name="chevron-down" size={14} /></span>}>
        <MenuItem icon="camera" label="Acquire portraits" disabled={submitting !== null} onClick={() => void trigger("portraits")} />
        <MenuItem icon="zap" label="Run bootstrap" disabled={submitting !== null} onClick={() => void trigger("bootstrap")} />
      </Menu>
    </>
  );

  return (
    <PageShell template="research" className="research-view data-status-view">
      <PageHeader title="Data Status" subtitle="Published release, source coverage and background jobs." actions={actions} />
      <FilterBar
        collapsible={false}
        label="Published release"
        summary="Published release"
        scope={<span className="research-scope-label">{release ? <><span className="ui-hide-narrow">{release.channel === "public" ? "Public" : release.channel} channel · </span>{release.published_at ? <>Published {formatDate(release.published_at.slice(0, 10))}<span className="ui-hide-narrow"> · {published?.split(" · ")[1]}</span></> : "Publication time unknown"}</> : "Release unavailable"}</span>}
        count={seasons.length ? <CountChip>{seasons.length} {seasons.length === 1 ? "season" : "seasons"}</CountChip> : undefined}
        details={<DataDetailsButton rows={rows} />}
      />
      {error && <GatedNote tone="warning" why={<p>{error}. Release, coverage and job values are unknown until the local API answers.</p>} action={<a href="/data-status" className="ui-button ui-button-secondary ui-button-sm">Retry</a>}>Workbench status is unavailable.</GatedNote>}
      <ResearchLayout findings={<>
        <StatTile label="Service" value={status ? status.status.charAt(0).toUpperCase() + status.status.slice(1) : null} footnote={status ? "Reported by the local API" : "Unknown"} />
        <StatTile label="Admitted Seasons" value={status ? seasons.length : null} footnote={seasonRange(seasons) ?? "Unknown"} />
        <StatTile label="Latest Final" value={source?.latest_finalized_date ? formatDate(source.latest_finalized_date) : null} footnote={status && !source?.latest_finalized_date ? "None before the season opener" : "Newest admitted final game"} />
        <StatTile label="Daily Refresh" value={status ? `${status.worker.scheduled_refresh_utc} UTC` : null} footnote={status?.worker.active_job ? `${jobLabel(status.worker.active_job.job_type)} running` : status ? "No active job reported" : "Unknown"} />
      </>}>
        <section className="research-section" aria-label="Background jobs">
          <h2>Background jobs</h2>
          {message && <p role="status" className="research-caption">{message}</p>}
          <div className="table-wrapper research-table" role="region" aria-label="Background jobs table" tabIndex={0}>
            <table className="data-table">
              <thead><tr><th scope="col">Job</th><th scope="col">Status</th><th scope="col">Stage</th><th scope="col" className="num">Duration</th><th scope="col">Started</th><th scope="col">Finished</th><th scope="col">Result</th><th scope="col"><span className="sr-only">Details</span></th></tr></thead>
              <tbody>
                {jobs.length === 0 ? (
                  <tr><td colSpan={8} className="text-muted table-empty-cell">No jobs recorded yet.</td></tr>
                ) : jobs.map((job, index) => (
                  <tr key={job.job_id || index}>
                    <th scope="row">{jobLabel(job.job_type)}</th>
                    <td><Badge variant={STATUS_VARIANT[job.status] ?? "default"}>{job.status}</Badge></td>
                    <td>{job.stage ? job.stage.replaceAll("_", " ") : "—"}</td>
                    <td className="num">{duration(job)}</td>
                    <td>{job.started_at ? formatTimestamp(job.started_at) : "—"}</td>
                    <td>{job.finished_at ? formatTimestamp(job.finished_at) : "—"}</td>
                    <td className="data-status-result">{job.error_summary ?? (job.status === "succeeded" ? "Completed" : "—")}</td>
                    <td><DataDetailsButton label="Details" rows={[
                      { label: "Job ID", value: job.job_id || "—", mono: true },
                      { label: "Owner", value: job.owner ?? "—", mono: true },
                      { label: "Heartbeat", value: job.heartbeat_at ? formatTimestamp(job.heartbeat_at) : "—" },
                      { label: "Stage timings", value: job.timings && Object.keys(job.timings).length ? JSON.stringify(job.timings) : "—", mono: true },
                      { label: "Outputs", value: job.output_refs && Object.keys(job.output_refs).length ? JSON.stringify(job.output_refs, null, 2) : "—", mono: true },
                    ]} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="research-section" aria-label="Source rules">
          <h2>Source rules</h2>
          <ul className="data-status-rules">
            <li><strong>Preseason:</strong> preseason games are admitted as schedule only; a missing preseason box score is unobserved, not zero.</li>
            <li><strong>Team participation:</strong> a player&apos;s team comes from their latest observed participation; unobserved roster transactions are not guessed.</li>
            <li><strong>Shot arithmetic:</strong> every admitted player and team game has made shots no greater than attempts; reconciled games match the final score.</li>
            <li><strong>Locking:</strong> ingestion, dbt builds and publication hold an exclusive PostgreSQL session lock so two releases never publish at once.</li>
          </ul>
        </section>
      </ResearchLayout>
    </PageShell>
  );
}
