import type { Metadata } from "next";
import { Suspense } from "react";
import { SeasonMatchupsView } from "@/components/season-matchups-view";
import { TemplateSkeleton } from "@/components/ui/template-skeleton";

export const metadata: Metadata = { title: "Player Matchups" };

export default function Page() {
  return <Suspense fallback={<TemplateSkeleton template="research" />}><SeasonMatchupsView /></Suspense>;
}
