import type { Metadata } from "next";
import { Suspense } from "react";
import { PlannerClient } from "@/components/planner-client";
import { PageShell } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/ui/panel";
import { getDataStatus, mondayFor } from "@/lib/api";

export const metadata: Metadata = { title: "Planner · CourtLens" };
export const dynamic = "force-dynamic";

export default async function PlannerPage() {
  const status = await getDataStatus();
  const fixtureMode = status.classification === "fixture";
  return (
    <PageShell template="board" className="legacy-planner planner-page">
      <PageHeader title="Planner" subtitle="Count the games your lineup slots can use, then compare one roster change." />
      <Suspense fallback={null}>
        <PlannerClient fixtureMode={fixtureMode} defaultWeek={fixtureMode ? "2025-02-03" : mondayFor()} />
      </Suspense>
    </PageShell>
  );
}
