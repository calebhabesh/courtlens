import type { DataStatus } from "@/lib/types";

export function DataBadge({ status }: { status: DataStatus }) {
  const label =
    status.classification === "operational"
      ? status.freshness.status === "stale"
        ? "Operational data — stale"
        : status.freshness.status === "degraded"
          ? "Operational data — delayed"
          : "Operational source data"
      : status.classification === "fixture"
        ? "Fixture data — clearly labeled"
        : "Data service unavailable";
  return (
    <span className={`data-badge ${status.classification}`}>
      <span className="status-dot" aria-hidden="true" />
      {label}
    </span>
  );
}
