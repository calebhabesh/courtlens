import { Suspense } from "react";
import { SharedFloorView } from "@/components/shared-floor-view";

export default function StatLineShiftPage() {
  return <Suspense fallback={<p>Loading teammate shifts…</p>}><SharedFloorView initialOperation="stat-shift" /></Suspense>;
}
