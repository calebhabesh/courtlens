import { redirect } from "next/navigation";
import { FINANCE_TEAMS } from "@/lib/finance-teams";

export const dynamic = "force-dynamic";

interface RosterShapesTeamPageProps {
  params: Promise<{ team: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Alignment row 12 folded the team page into the team select (`/roster-shapes?team=SAS`); the
 * depth chart moved to the team profile, so old `?view=depth` links open it there.
 */
export default async function RosterShapesTeamPage({ params, searchParams }: RosterShapesTeamPageProps) {
  const [{ team }, query] = await Promise.all([params, searchParams]);
  const code = decodeURIComponent(team);
  const info = FINANCE_TEAMS.find(t => t.tricode === code.toUpperCase() || t.id === code);
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (key !== "view" && key !== "team" && typeof value === "string") next.set(key, value);
  if (query.view === "depth") redirect(`/teams/${info?.id ?? code}${next.size ? `?${next}` : ""}#depth-chart`);
  if (info) next.set("team", info.tricode);
  redirect(`/roster-shapes${next.size ? `?${next}` : ""}`);
}
