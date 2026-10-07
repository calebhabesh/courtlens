import { Suspense } from "react";
import type { Metadata } from "next";
import { SimilarityInvestigationView } from "@/components/similarity-investigation-view";

export const metadata: Metadata = {
  title: "Statistical Peers & Twin Modeling · CourtLens Research",
  description: "Standardized Euclidean distance player twins across production and workload dimensions."
};

export default function SimilarityPage() {
  return (
    <Suspense fallback={null}>
      <SimilarityInvestigationView />
    </Suspense>
  );
}
