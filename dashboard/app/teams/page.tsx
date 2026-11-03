import type { Metadata } from "next";
import { getWorkbenchCatalog } from "@/lib/workbench-api";
import { PageShell } from "@/components/ui/page-shell";
import { TeamsSixFactorView } from "@/components/teams-six-factor-view";

export const metadata: Metadata = {
  title: "NBA Team Stats · CourtLens",
  description: "Six factor team analysis: every team's offensive and defensive rating split into shooting, turnover and rebound points per 100 possessions.",
};
export const dynamic = "force-dynamic";

export default async function TeamsPage({ searchParams }: { searchParams: Promise<{ releaseId?: string; release_id?: string }> }) {
  const params = await searchParams;
  // The catalog only fills the season and phase pickers; the table loads in the browser.
  const catalog = await getWorkbenchCatalog(params.releaseId || params.release_id).catch(() => null);
  return <PageShell template="explorer" className="teams-page-shell"><TeamsSixFactorView catalog={catalog} /></PageShell>;
}
