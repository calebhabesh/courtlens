import type { Metadata } from "next";
import { ResearchResultsView } from "@/components/research-results-view";

export const metadata: Metadata = { title: "Six-Factor · RAPM Research" };

export default function Page() { return <ResearchResultsView experiment="courtload-six-factor-v1" />; }
