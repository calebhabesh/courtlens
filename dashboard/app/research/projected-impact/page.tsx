import type { Metadata } from "next";
import { Suspense } from "react";
import { ProjectedImpactResearch } from "@/components/projected-impact-research";

export const metadata: Metadata = { title: "Projected Impact" };

export default function Page() { return <Suspense fallback={null}><ProjectedImpactResearch /></Suspense>; }
