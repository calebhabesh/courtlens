import type { Metadata } from "next";
import { Suspense } from "react";
import { PageShell } from "@/components/ui/page-shell";
import { TeamStatShiftView } from "@/components/team-stat-shift-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Stat Line Shift · CourtLens"
};

/** Stat Line Shift (alignment row 13): each teammate's per-75 line with and without the picked players. */
export default function StatLineShiftPage() {
  return <PageShell template="explorer" className="sls-page-shell"><Suspense fallback={null}><TeamStatShiftView /></Suspense></PageShell>;
}
