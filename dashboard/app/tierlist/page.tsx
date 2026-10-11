import type { Metadata } from "next";
import { TierListView } from "@/components/tier-list-view";

export const metadata: Metadata = {
  title: "Tier Lists",
  description: "Create, customize, and organize personal NBA player tier lists with drag-and-drop and accessible keyboard allocation."
};

export const dynamic = "force-dynamic";

export default function TierlistPage() {
  return <TierListView />;
}
