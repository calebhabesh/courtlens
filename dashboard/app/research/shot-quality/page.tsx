import type { Metadata } from "next";
import { Suspense } from "react";
import { ShotQualityResearch } from "@/components/shot-quality-research";

export const metadata: Metadata = { title: "Shot Quality" };

export default function Page() { return <Suspense fallback={null}><ShotQualityResearch /></Suspense>; }
