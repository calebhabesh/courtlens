import { Suspense } from "react";
import type { Metadata } from "next";
import { CaseStudiesView } from "@/components/case-studies-view";
import { CaseStudiesSkeleton } from "@/components/case-studies-skeleton";

export const metadata: Metadata = {
  title: "Case Studies",
  description: "Reproducible empirical case studies demonstrating CourtLens data integrity guarantees."
};

export default function CaseStudiesPage() {
  return <Suspense fallback={<CaseStudiesSkeleton />}><CaseStudiesView /></Suspense>;
}
