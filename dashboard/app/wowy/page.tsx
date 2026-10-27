import type { Metadata } from "next";
import { Suspense } from "react";
import { PageShell } from "@/components/ui/page-shell";
import { WowyView } from "@/components/wowy-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "WOWY · CourtLens" };

/** WOWY (alignment row 5): a team's stints split into every on/off mix of up to five combo players. */
export default function WowyPage() {
  return <PageShell template="explorer"><Suspense fallback={null}><WowyView /></Suspense></PageShell>;
}
