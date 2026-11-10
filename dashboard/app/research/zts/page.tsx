import type { Metadata } from "next";
import { Suspense } from "react";
import { ZtsResearch } from "@/components/zts-research";

export const metadata: Metadata = { title: "zTS" };

export default function Page() { return <Suspense fallback={null}><ZtsResearch /></Suspense>; }
