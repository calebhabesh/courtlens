import { Suspense } from "react";
import { ResearchOperationView } from "@/components/research-operation-view";
export default function ResearchOperationPage() {
  return <Suspense fallback={<p role="status">Loading Research operation…</p>}><ResearchOperationView /></Suspense>;
}
