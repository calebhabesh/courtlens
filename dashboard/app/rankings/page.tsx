import type { Metadata } from "next";
import { RankingBoardsView } from "@/components/ranking-boards-view";
import { getWorkbenchCatalog } from "@/lib/workbench-api";
import { loadExampleBoard } from "@/lib/example-boards";

export const metadata: Metadata = {
  title: "Rankings",
  description: "Create, reorder, and mathematically aggregate personal player ranking boards with transparent missingness rules."
};

export const dynamic = "force-dynamic";

export default async function RankingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const release = params.releaseId ?? params.release_id;
  const catalog = await getWorkbenchCatalog(typeof release === "string" ? release : undefined).catch(() => null);
  const example = catalog ? await loadExampleBoard(catalog, params).catch(() => null) : null;
  return <RankingBoardsView catalog={catalog} example={example} />;
}
