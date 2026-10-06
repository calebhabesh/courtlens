import { Suspense } from "react";
import type { Metadata } from "next";
import { SimilarityInvestigationView } from "@/components/similarity-investigation-view";

export const metadata: Metadata = {
  title: "Statistical Peers & Twin Modeling · CourtLens Research",
  description: "Standardized Euclidean distance player twins across production and workload dimensions."
};

export default function SimilarityPage() {
  return (
    <Suspense
      fallback={
        <div className="workbench-content">
          <div className="table-card" style={{ padding: "2rem", textAlign: "center" }}>
            <div className="text-muted">Loading statistical peers similarity view...</div>
          </div>
        </div>
      }
    >
      <SimilarityInvestigationView />
    </Suspense>
  );
}
