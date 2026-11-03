import type { Metadata } from "next";
import { Suspense } from "react";
import { PlayerTwinsView } from "@/components/player-twins-view";
import { PageShell } from "@/components/ui/page-shell";
import { TemplateSkeleton } from "@/components/ui/template-skeleton";

export const metadata: Metadata = {
  title: "Player Twins",
  description: "Closest player-seasons by league-relative shot profile or box-score profile.",
};

export default function Page() {
  return <Suspense fallback={<TemplateSkeleton template="compare" />}><PageShell template="compare"><PlayerTwinsView /></PageShell></Suspense>;
}
