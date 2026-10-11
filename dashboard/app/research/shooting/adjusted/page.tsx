import type { Metadata } from "next";
import { ResearchResultsView } from "@/components/research-results-view";

export const metadata: Metadata = { title: "Adjusted Shooting · Shooting" };

export default function Page() { return <ResearchResultsView experiment="courtload-adjusted-shooting-v1" />; }
