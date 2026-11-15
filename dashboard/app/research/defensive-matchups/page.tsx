import type { Metadata } from "next";
import { Suspense } from "react";
import { DefensiveShotQualityPageSkeleton, DefensiveShotQualityView } from "@/components/defensive-shot-quality-view";

export const metadata: Metadata = { title: "Defensive Shot Quality" };

export default function DefensiveShotQualityPage() {
  return <Suspense fallback={<DefensiveShotQualityPageSkeleton />}><DefensiveShotQualityView /></Suspense>;
}
