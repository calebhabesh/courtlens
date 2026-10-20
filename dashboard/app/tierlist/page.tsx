import type { Metadata } from "next";
import { TierListView } from "@/components/tier-list-view";
import { getWorkbenchCatalog } from "@/lib/workbench-api";
import { loadExampleBoard } from "@/lib/example-boards";

export const metadata: Metadata = {
  title: "Tier List",
  description: "Create, customize, and organize personal NBA player tier lists with drag-and-drop and accessible keyboard allocation."
};

export const dynamic = "force-dynamic";

export default async function TierlistPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const release = params.releaseId ?? params.release_id;
  const catalog = await getWorkbenchCatalog(typeof release === "string" ? release : undefined).catch(() => null);
  const example = catalog ? await loadExampleBoard(catalog, params).catch(() => null) : null;
  return <TierListView catalog={catalog} example={example} />;
}
