import { TemplateSkeleton } from "@/components/ui/template-skeleton";
import { Suspense } from "react";
import { SharedFloorView } from "@/components/shared-floor-view";

export default function WowyPage() {
  return <Suspense fallback={<TemplateSkeleton template="compare" />}><SharedFloorView /></Suspense>;
}
