import type { Metadata } from "next";
import { Suspense } from "react";
import { PointsForecastsResearch } from "@/components/points-forecasts-research";

export const metadata: Metadata = { title: "Points Forecasts" };

export default function Page() { return <Suspense fallback={null}><PointsForecastsResearch /></Suspense>; }
