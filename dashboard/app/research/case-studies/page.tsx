import { Suspense } from "react";
import type { Metadata } from "next";
import { CaseStudiesView } from "@/components/case-studies-view";
import { TemplateSkeleton } from "@/components/ui/template-skeleton";

export const metadata: Metadata = {
  title: "Case Studies",
  description: "Reproducible empirical case studies demonstrating CourtLens data integrity guarantees."
};

export default function CaseStudiesPage() {
  return <Suspense fallback={<TemplateSkeleton template="research" />}><CaseStudiesView /></Suspense>;
}
