import type { Metadata } from "next";
import { RankingBoardsView } from "@/components/ranking-boards-view";

export const metadata: Metadata = {
  title: "Personal Ranking Boards · CourtLens",
  description: "Create, reorder, and mathematically aggregate personal player ranking boards with transparent missingness rules."
};

export const dynamic = "force-dynamic";

export default function RankingsPage() {
  return <RankingBoardsView />;
}
