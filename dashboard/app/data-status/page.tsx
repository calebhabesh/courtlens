import type { Metadata } from "next";
import { DataStatusView } from "@/components/data-status-view";
import { getWorkbenchJobs, getWorkbenchStatus } from "@/lib/workbench-api";
import type { WorkbenchJobItem, WorkbenchStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Data Status · CourtLens" };
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

  return <DataStatusView status={status} initialJobs={jobs} error={error} />;
}
