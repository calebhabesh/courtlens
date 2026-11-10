import type { Metadata } from "next";
import { Suspense } from "react";
import { DraftClassesResearch } from "@/components/draft-classes-research";

export const metadata: Metadata = { title: "Draft Classes" };

export default function Page() { return <Suspense fallback={null}><DraftClassesResearch /></Suspense>; }
