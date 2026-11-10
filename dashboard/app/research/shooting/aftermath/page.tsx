import { Suspense } from "react";
import type { Metadata } from "next";
import { ShotAftermathResearch } from "@/components/shot-aftermath-research";

export const metadata: Metadata = { title: "Shot Aftermath · Shooting" };

/** RD18: Shot Aftermath from the frozen R17 aggregate, under its own centred hero with the Shooting tabs. */
export default function Page() {
  return <Suspense fallback={null}><ShotAftermathResearch /></Suspense>;
}
