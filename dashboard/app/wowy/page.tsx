import type { Metadata } from "next";
import { Suspense } from "react";
import { WowyView } from "@/components/wowy-view";
import { TemplateSkeleton } from "@/components/ui/template-skeleton";

export const metadata: Metadata = { title: "WOWY" };

export default function WowyPage() {
  return <Suspense fallback={<TemplateSkeleton template="research" />}><WowyView /></Suspense>;
}
