import { Suspense } from "react";
import type { Metadata } from "next";
import { WingspanResearch } from "@/components/wingspan-research";
import { FeedSkeleton } from "@/components/stats-feed-ui";

export const metadata: Metadata = {
  title: "Combine & Wingspan",
  description: "NBA Draft Combine height and wingspan since 2000, with percentiles, DARKO D-DPM, similar builds and combine drills."
};

export default function WingspanPage() {
  return <Suspense fallback={<FeedSkeleton label="Loading wingspan measurements" />}><WingspanResearch /></Suspense>;
}
