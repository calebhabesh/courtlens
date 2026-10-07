import { Suspense } from "react";
import { ShootingView } from "@/components/shooting-view";

export default function Page() {
  return <Suspense fallback={null}><ShootingView initialOperation="matchups" /></Suspense>;
}
