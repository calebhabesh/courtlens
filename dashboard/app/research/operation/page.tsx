import { Suspense } from "react";
import type { Metadata } from "next";
import { ResearchOperationView } from "@/components/research-operation-view";
import { TemplateSkeleton } from "@/components/ui/template-skeleton";

export const metadata: Metadata = { title: "Research Operation" };

export default function ResearchOperationPage() {
  return <Suspense fallback={<TemplateSkeleton template="research" />}><ResearchOperationView /></Suspense>;
}
