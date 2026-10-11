import { Suspense } from "react";
import type { Metadata } from "next";
import { WingspanExplorerView } from "@/components/wingspan-explorer-view";
import { TemplateSkeleton } from "@/components/ui/template-skeleton";

export const metadata: Metadata = {
  title: "Combine & Wingspan",
  description: "Official NBA Draft Combine anthropometric measurements, wingspan-to-height ratios, and draft metadata."
};

export default function WingspanPage() {
  return <Suspense fallback={<TemplateSkeleton template="research" />}><WingspanExplorerView /></Suspense>;
}
