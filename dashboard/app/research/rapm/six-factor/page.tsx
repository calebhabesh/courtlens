import type { Metadata } from "next";
import { Suspense } from "react";
import { SixFactorView } from "@/components/six-factor-view";

export const metadata: Metadata = { title: "Six-Factor · RAPM Research" };

export default function Page() { return <Suspense fallback={null}><SixFactorView /></Suspense>; }
