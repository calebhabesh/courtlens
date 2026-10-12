import type { Metadata } from "next";
import { RankingBoardsView } from "@/components/ranking-boards-view";
import { getWorkbenchCatalog } from "@/lib/workbench-api";

export const metadata: Metadata = {
  title: "Ranking Boards",
  description: "Create, reorder, and mathematically aggregate personal player ranking boards with transparent missingness rules."
};

export const dynamic = "force-dynamic";

export default async function RankingsPage() {
  const catalog = await getWorkbenchCatalog().catch(() => null);
  return <RankingBoardsView catalog={catalog} />;
}
