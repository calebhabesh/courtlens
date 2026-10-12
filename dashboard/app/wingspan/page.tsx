import { Suspense } from "react";
import type { Metadata } from "next";
import { CombineView } from "@/components/combine-view";
import { TemplateSkeleton } from "@/components/ui/template-skeleton";

export const metadata: Metadata = {
  title: "Combine & Wingspan",
  description: "Official NBA Draft Combine measurements, wingspan over height and draft picks, 2000 to the latest class."
};

export default function WingspanPage() {
  return <Suspense fallback={<TemplateSkeleton template="research" />}><CombineView /></Suspense>;
}
