import { Suspense } from "react";
import type { Metadata } from "next";
import { TrendsInvestigationView } from "@/components/trends-investigation-view";

export const metadata: Metadata = {
  title: "Workload & Performance Trends · CourtLens Research",
  description: "Disjoint window delta analysis across consecutive appearance slices and calendar periods."
};

export default function TrendsPage() {
  return (
    <Suspense fallback={null}>
      <TrendsInvestigationView />
    </Suspense>
  );
}
