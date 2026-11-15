import type { Metadata } from "next";
import { Suspense } from "react";
import { MatchupsPageSkeleton, SeasonMatchupsView } from "@/components/season-matchups-view";
import { PageShell } from "@/components/ui/page-shell";

export const metadata: Metadata = { title: "Player Matchups" };

export default function Page() {
  return <Suspense fallback={<PageShell template="compare"><MatchupsPageSkeleton /></PageShell>}><PageShell template="compare"><SeasonMatchupsView /></PageShell></Suspense>;
}
