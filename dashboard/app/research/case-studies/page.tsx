import type { Metadata } from "next";
import { CaseStudiesView } from "@/components/case-studies-view";

export const metadata: Metadata = {
  title: "Flagship Research Case Studies · CourtLens",
  description: "Reproducible empirical case studies demonstrating CourtLens data integrity guarantees."
};

export default function CaseStudiesPage() {
  return <CaseStudiesView />;
}
