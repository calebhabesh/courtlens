import type { Metadata } from "next";
import { ResearchLanding } from "@/components/research-landing";

export const metadata: Metadata = { title: "Research", description: "CourtLens's own models and tests, each scored on seasons it never saw." };

export default function Page() { return <ResearchLanding />; }
