import type { Metadata } from "next";
import { ResearchResultsView } from "@/components/research-results-view";

export const metadata: Metadata = { title: "Shooting" };

export default function Page() { return <ResearchResultsView experiment="courtload-expected-shot-retrospective-v2" />; }
