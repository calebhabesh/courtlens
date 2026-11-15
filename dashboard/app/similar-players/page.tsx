import type { Metadata } from "next";
import { Suspense } from "react";
import { PlayerTwinsView, TwinsPageSkeleton } from "@/components/player-twins-view";
import { PageShell } from "@/components/ui/page-shell";

export const metadata: Metadata = {
  title: "Player Twins",
  description: "Closest player-seasons by league-relative shot profile or box-score profile.",
};

export default function Page() {
  return <Suspense fallback={<PageShell template="compare"><TwinsPageSkeleton /></PageShell>}><PageShell template="compare"><PlayerTwinsView /></PageShell></Suspense>;
}
