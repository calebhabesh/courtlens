import type { Metadata } from "next";
import { PossessionCalculatorView } from "@/components/possession-calculator-view";

export const metadata: Metadata = { title: "Hypothetical Calculator" };

export default function Page() { return <PossessionCalculatorView />; }
