import { Suspense } from "react";
import type { Metadata } from "next";
import { DistributionsInvestigationView } from "@/components/distributions-investigation-view";

export const metadata: Metadata = {
  title: "Metric Distributions & Contextual Splits · CourtLens Research",
  description: "Empirical sample quantiles, interquartile ranges, venue splits, and team rest day breakdowns."
};

export default function DistributionsPage() {
  return (
    <Suspense
      fallback={
        <div className="workbench-content">
          <div className="table-card" style={{ padding: "2rem", textAlign: "center" }}>
            <div className="text-muted">Loading distributions investigation view...</div>
          </div>
        </div>
      }
    >
      <DistributionsInvestigationView />
    </Suspense>
  );
}
