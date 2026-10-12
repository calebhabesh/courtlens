import type { Metadata } from "next";
import { Suspense } from "react";
import { DefensiveMatchupsView } from "@/components/defensive-matchups-view";
import { TemplateSkeleton } from "@/components/ui/template-skeleton";

export const metadata: Metadata = { title: "Defensive Matchups" };

export default function DefensiveMatchupsPage() {
  return <Suspense fallback={<TemplateSkeleton template="research" />}><DefensiveMatchupsView /></Suspense>;
}
