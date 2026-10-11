import { TemplateSkeleton } from "@/components/ui/template-skeleton";
import { Suspense } from "react";
import { MatchupsView } from "@/components/matchups-view";

export default function Page() {
  return <Suspense fallback={<TemplateSkeleton template="compare" />}><MatchupsView /></Suspense>;
}
