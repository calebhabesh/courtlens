import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { RosterShapesLeague } from "@/components/roster-shapes-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Roster Shapes · CourtLens"
};

interface RosterShapesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RosterShapesPage({ searchParams }: RosterShapesPageProps) {
  const params = await searchParams;
  const team = typeof params.team === "string" ? params.team : typeof params.teamId === "string" ? params.teamId : null;
  // PC10: the depth chart moved into team detail; old ?team= links open that tab.
  if (team) {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key !== "team" && key !== "teamId" && typeof value === "string") next.set(key, value);
    }
    next.set("view", "depth");
    redirect(`/roster-shapes/${encodeURIComponent(team)}?${next}`);
  }
  return <Suspense fallback={null}><RosterShapesLeague /></Suspense>;
}
