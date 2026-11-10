import type { Metadata } from "next";
import { Suspense } from "react";
import { EvaluationArchiveResearch } from "@/components/evaluation-archive-research";

export const metadata: Metadata = { title: "Evaluation Archive" };

export default function Page() { return <Suspense fallback={null}><EvaluationArchiveResearch /></Suspense>; }
