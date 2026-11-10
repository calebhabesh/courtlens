import { Suspense } from "react";
import type { Metadata } from "next";
import { OrtgLabView } from "@/components/ortg-lab-view";
import { FeedSkeleton } from "@/components/stats-feed-ui";

export const metadata: Metadata = {
  title: "Offensive Rating Calculator",
  description: "An ORTG lab on Poropudas and Halme's four-factor formula, from each season's counted league and team inputs since 2014-15.",
};

export default function Page() {
  return <Suspense fallback={<FeedSkeleton label="Loading the ORTG lab" />}><OrtgLabView /></Suspense>;
}
