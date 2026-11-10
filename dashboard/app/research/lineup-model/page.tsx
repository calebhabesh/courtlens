import type { Metadata } from "next";
import { Suspense } from "react";
import { LineupModelResearch } from "@/components/lineup-model-research";

export const metadata: Metadata = { title: "Lineup Model" };

export default function Page() { return <Suspense fallback={null}><LineupModelResearch /></Suspense>; }
