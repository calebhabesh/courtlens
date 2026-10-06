import type { Metadata } from "next";
import { StatsWorkspace } from "@/components/stats-workspace";

export const metadata: Metadata = {
  title: "Stats Explorer · CourtLens",
  description: "Dense player statistics explorer with SQL-backed analytical windowing and metric integrity."
};
export const dynamic = "force-dynamic";

export default async function StatsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <StatsWorkspace params={await searchParams} />;
}
