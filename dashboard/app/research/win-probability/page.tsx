import type { Metadata } from "next";
import { Suspense } from "react";
import { WinProbabilityResearch } from "@/components/win-probability-research";

export const metadata: Metadata = { title: "Win Probability" };

export default function Page() { return <Suspense fallback={null}><WinProbabilityResearch /></Suspense>; }
