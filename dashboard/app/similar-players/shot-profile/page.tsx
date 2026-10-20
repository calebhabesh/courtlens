import { Suspense } from "react";
import type { Metadata } from "next";
import { ShootingView } from "@/components/shooting-view";

export const metadata: Metadata = { title: "Shot Profile · Player Twins" };

export default function Page() {
  return <Suspense fallback={null}><ShootingView initialOperation="shot-profile-peers" embedded /></Suspense>;
}
