import { Suspense } from "react";
import { SharedFloorView } from "@/components/shared-floor-view";

export default function StatLineShiftPage() {
  return <Suspense fallback={null}><SharedFloorView initialOperation="stat-shift" /></Suspense>;
}
