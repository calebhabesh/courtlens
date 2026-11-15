import type { Metadata } from "next";
import { Suspense } from "react";
import { TrackingPageSkeleton, TrackingStatsView } from "@/components/tracking-stats-view";

export const metadata: Metadata = { title: "Tracking · Stats" };

export default function Page() {
  return <Suspense fallback={<TrackingPageSkeleton />}><TrackingStatsView /></Suspense>;
}
