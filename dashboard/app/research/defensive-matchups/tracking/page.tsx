import type { Metadata } from "next";
import { Suspense } from "react";
import { DefensiveMatchupsPageSkeleton, DefensiveMatchupsView } from "@/components/defensive-matchups-view";

export const metadata: Metadata = { title: "Defensive Matchups" };

export default function DefensiveMatchupsTrackingPage() {
  return <Suspense fallback={<DefensiveMatchupsPageSkeleton />}><DefensiveMatchupsView /></Suspense>;
}
