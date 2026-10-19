import type { Metadata } from "next";
import { Suspense } from "react";
import { PageShell } from "@/components/ui/page-shell";
import { RosterShapesView } from "@/components/roster-shapes-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Roster Shapes · CourtLens"
};

/** Roster Shapes (alignment row 12): one box per roster, or one team's box and roster with ?team=. */
export default function RosterShapesPage() {
  return <PageShell template="explorer" className="shapes-page-shell"><Suspense fallback={null}><RosterShapesView /></Suspense></PageShell>;
}
