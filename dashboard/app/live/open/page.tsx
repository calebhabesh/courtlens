import { redirect } from "next/navigation";
import { findLiveGameId } from "@/lib/workbench-api";
import { validSlate } from "@/lib/live";

/**
 * Opens one of our games (Team Game Log) as its Live game page. Live pages are keyed by ESPN's
 * game id, so this reads that date's slate and redirects; without a match it opens the date.
 */
export default async function LiveOpenPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const date = typeof sp.date === "string" && validSlate(sp.date) ? sp.date : null;
  if (!date) redirect("/live");
  const gameId = typeof sp.game === "string" ? sp.game : "";
  // Each team as "id:TRI" (either part may be empty); the slate names teams by one or the other.
  const teams = (typeof sp.teams === "string" ? sp.teams.split(",") : []).slice(0, 2)
    .map(team => team.split(":").filter(key => /^(\d{1,12}|[A-Z]{2,4})$/.test(key)));
  const id = await findLiveGameId({ date, gameId, teams }).catch(() => null);
  redirect(id ? `/live/games/${id}?date=${date}` : `/live/${date}`);
}
