import type { Metadata } from "next";
import { PageShell } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/ui/panel";
import { SavedOperationLibrary } from "@/components/saved-operation-library";
import { getRetainedOperation, listSavedInvestigations } from "@/lib/workbench-api";
import { publicInvestigation, publicInvestigations } from "@/lib/public-investigations";
import { PublicInvestigationLibrary } from "@/components/public-investigation-library";
import type { SavedInvestigation } from "@/lib/types";
import { ButtonLink } from "@/components/ui/kit";

export const metadata: Metadata = { title: "Saved Investigations" };
export const dynamic = "force-dynamic";

export default async function InvestigationsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const personal = view === "personal" && process.env.NEXT_PUBLIC_COURTLENS_HOSTED_DEMO !== "1";
  if (!personal) {
    const details = await Promise.all(publicInvestigations.map(async item => {
      try {
        const detail = await getRetainedOperation(item.id);
        return publicInvestigation(detail) ? detail : null;
      } catch { return null; }
    }));
    return <PageShell template="research" className="research-view investigations-view">
      <PageHeader title="Saved Investigations" subtitle="Reopen real findings and verify their retained evidence." actions={process.env.NEXT_PUBLIC_COURTLENS_HOSTED_DEMO !== "1" ? <ButtonLink size="lg" href="/investigations?view=personal">My Saved Investigations</ButtonLink> : undefined} />
      <PublicInvestigationLibrary details={details} />
    </PageShell>;
  }
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
        <><ButtonLink size="lg" href="/investigations">Public Examples</ButtonLink><ButtonLink size="lg" variant="primary" icon="plus" href="/research/ask">New Investigation</ButtonLink></>
      } />
      <SavedOperationLibrary legacy={items} legacyError={error} />
    </PageShell>
  );
}
