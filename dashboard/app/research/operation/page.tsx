import { Suspense } from "react";
import { ResearchOperationView } from "@/components/research-operation-view";
export default function ResearchOperationPage() {
  return <Suspense fallback={null}><ResearchOperationView /></Suspense>;
}
