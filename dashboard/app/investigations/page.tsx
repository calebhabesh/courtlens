import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { PageShell } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/ui/panel";
import { SavedOperationLibrary } from "@/components/saved-operation-library";
import { listSavedInvestigations } from "@/lib/workbench-api";
import type { SavedInvestigation } from "@/lib/types";

export const metadata: Metadata = { title: "Saved Investigations" };
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
    <PageShell template="research" className="research-view investigations-view">
      <PageHeader title="Saved Investigations" subtitle="Retained results you can reopen, verify without AI and export." actions={
        <Link href="/research/ask" className="button button-primary"><Icon name="plus" size={16} />New Investigation</Link>
      } />
      <SavedOperationLibrary legacy={items} legacyError={error} />
    </PageShell>
  );
}
