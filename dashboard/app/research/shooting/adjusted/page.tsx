import type { Metadata } from "next";
import { Suspense } from "react";
import { PlayTypeShootingView } from "@/components/play-type-shooting-view";

export const metadata: Metadata = { title: "Adjusted Shooting · Shooting" };

export default function Page() { return <Suspense fallback={null}><PlayTypeShootingView /></Suspense>; }
