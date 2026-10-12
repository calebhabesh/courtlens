import type { Metadata } from "next";
import { StatsGlossaryView } from "@/components/stats-glossary-view";
import { glossaryEntries } from "@/lib/stats-glossary";
import { getMetricCatalog } from "@/lib/workbench-api";
import type { MetricDefinition } from "@/lib/types";

export const metadata: Metadata = {
  title: "Stats Glossary · CourtLens",
  description: "Definitions for the NBA statistics used across CourtLens, with the exact calculation on request."
};
export const dynamic = "force-dynamic";

export default async function StatsGlossaryPage() {
  let metrics: MetricDefinition[] = [];
  let available = true;
  try {
    metrics = (await getMetricCatalog()).metrics;
  } catch {
    available = false;
  }
  return <StatsGlossaryView entries={glossaryEntries(metrics)} available={available} />;
}
