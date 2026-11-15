import { Suspense } from "react";
import { ResearchBodySkeleton } from "@/components/research-investigation";
import type { Metadata } from "next";
import { ResearchOperationView } from "@/components/research-operation-view";

export const metadata: Metadata = { title: "Research Operation" };

export default function ResearchOperationPage() {
  return <Suspense fallback={<ResearchBodySkeleton tiles={3} />}><ResearchOperationView /></Suspense>;
}
