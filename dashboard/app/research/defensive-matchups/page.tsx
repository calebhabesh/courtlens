import type { Metadata } from "next";
import { Suspense } from "react";
import { DefensiveShotQualityView } from "@/components/defensive-shot-quality-view";
import { TemplateSkeleton } from "@/components/ui/template-skeleton";

export const metadata: Metadata = { title: "Defensive Shot Quality" };

export default function DefensiveShotQualityPage() {
  return <Suspense fallback={<TemplateSkeleton template="research" />}><DefensiveShotQualityView /></Suspense>;
}
