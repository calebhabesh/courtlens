import type { Metadata } from "next";
import { Suspense } from "react";
import { MetricBacktestResearch } from "@/components/metric-backtest-research";

export const metadata: Metadata = { title: "Metric Backtest" };

export default function Page() { return <Suspense fallback={null}><MetricBacktestResearch /></Suspense>; }
