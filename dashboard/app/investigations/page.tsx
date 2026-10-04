import type { Metadata } from "next";
import Link from "next/link";
import { SavedOperationLibrary } from "@/components/saved-operation-library";
import { WorkbenchInvestigationsList } from "@/components/workbench-investigations-list";
import { listSavedInvestigations } from "@/lib/workbench-api";
import type { SavedInvestigation } from "@/lib/types";

export const metadata: Metadata = { title: "Saved Investigations · CourtLoad" };
export const dynamic = "force-dynamic";

export default async function InvestigationsPage() {
  let items: SavedInvestigation[] = [];
  let error: string | null = null;

  try {
    items = await listSavedInvestigations(50);
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to load investigations";
  }

  return (
    <div className="workbench-content">
      <div className="page-header">
        <div>
          <span className="text-xs text-muted font-mono uppercase">Reproducible Research</span>
          <h1 className="page-title">Saved Investigations</h1>
          <p className="page-subtitle">
            Cryptographically bound research findings. Re-execute queries against frozen releases and verify exact SHA-256 result matching.
          </p>
        </div>
        <div className="page-actions">
          <Link href="/research/ask" className="button button-primary">
            + New Investigation
          </Link>
        </div>
      </div>

      {error && (
        <div className="notice-box" style={{ borderLeftColor: "var(--warning)" }}>
          <strong>Notice:</strong> {error}
        </div>
      )}

      <SavedOperationLibrary />
      <section aria-label="Legacy saved investigations"><h2>Legacy saved investigations</h2><p>Existing archive investigations retain their original IDs, result signatures and export contracts.</p>{error ? <p>Legacy investigations are unavailable until the local API connection is restored.</p> : <WorkbenchInvestigationsList items={items} />}</section>
    </div>
  );
}
