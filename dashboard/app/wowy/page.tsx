import { Suspense } from "react";
import { SharedFloorView } from "@/components/shared-floor-view";

export default function WowyPage() {
  return <Suspense fallback={null}><SharedFloorView /></Suspense>;
}
