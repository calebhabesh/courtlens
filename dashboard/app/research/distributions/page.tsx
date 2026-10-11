import { Suspense } from "react";
import type { Metadata } from "next";
import { TemplateSkeleton } from "@/components/ui/template-skeleton";
import { DistributionsInvestigationView } from "@/components/distributions-investigation-view";

export const metadata: Metadata = {
  title: "Distributions & Splits",
  description: "Game-to-game spread, venue and rest splits, and opponent defensive context."
};

export default function DistributionsPage() {
  return (
    <Suspense fallback={<TemplateSkeleton template="research" />}>
      <DistributionsInvestigationView />
    </Suspense>
  );
}
