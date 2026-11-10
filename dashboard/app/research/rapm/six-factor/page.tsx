import type { Metadata } from "next";
import { Suspense } from "react";
import { SixFactorResearch } from "@/components/six-factor-research";

export const metadata: Metadata = { title: "Six-Factor RAPM" };

export default function Page() { return <Suspense fallback={null}><SixFactorResearch /></Suspense>; }
