import type { Metadata } from "next";
import { Suspense } from "react";
import { PageShell } from "@/components/ui/page-shell";
import { FreeAgencyView } from "@/components/free-agency-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Free Agency · CourtLens" };

/** Free Agency (alignment row 14): NBA.com's free-agent tracker, sealed by an operator run. */
export default function FreeAgencyPage() {
  return <PageShell template="explorer" className="fa-shell"><Suspense fallback={null}><FreeAgencyView /></Suspense></PageShell>;
}
