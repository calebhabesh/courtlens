import { Suspense } from "react";
import type { Metadata } from "next";
import { TemplateSkeleton } from "@/components/ui/template-skeleton";
import { TrendsInvestigationView } from "@/components/trends-investigation-view";

export const metadata: Metadata = {
  title: "Workload Trends",
  description: "A player's recent stretch against the one before it, or the league's largest shifts."
};

export default function TrendsPage() {
  return (
    <Suspense fallback={<TemplateSkeleton template="research" />}>
      <TrendsInvestigationView />
    </Suspense>
  );
}
