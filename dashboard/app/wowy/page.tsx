import { Suspense } from "react";
import { SharedFloorView } from "@/components/shared-floor-view";

export default function WowyPage() {
  return <Suspense fallback={<p>Loading shared-floor workspace…</p>}><SharedFloorView /></Suspense>;
}
