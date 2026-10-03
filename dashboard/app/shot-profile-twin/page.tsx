import { Suspense } from "react";
import { ShootingView } from "@/components/shooting-view";

export default function Page() {
  return <Suspense fallback={<p>Loading shooting workspace…</p>}><ShootingView initialOperation="shot-profile-peers" /></Suspense>;
}
