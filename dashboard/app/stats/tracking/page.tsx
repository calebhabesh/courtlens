import type { Metadata } from "next";
import { Suspense } from "react";
import { TrackingStatsView } from "@/components/tracking-stats-view";
import { TemplateSkeleton } from "@/components/ui/template-skeleton";

export const metadata: Metadata = { title: "Tracking · Stats" };

export default function Page() {
  return <Suspense fallback={<TemplateSkeleton template="research" />}><TrackingStatsView /></Suspense>;
}
