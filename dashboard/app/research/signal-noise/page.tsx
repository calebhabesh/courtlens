import type { Metadata } from "next";
import { Suspense } from "react";
import { SignalNoiseResearch } from "@/components/signal-noise-research";

export const metadata: Metadata = { title: "Signal vs Noise" };

export default function Page() { return <Suspense fallback={null}><SignalNoiseResearch /></Suspense>; }
