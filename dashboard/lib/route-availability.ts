import type { WorkbenchCatalog } from "./types";
import { getWorkbenchCatalog } from "./workbench-api";

// Only release-bound sources belong here. Personal tools and sealed research reports
// remain reachable independently of current statistical/source coverage.
const requirements: Record<string, string> = {
  "/stats": "core_stats", "/players": "core_stats", "/teams": "core_stats",
  "/compare": "core_stats", "/team-compare": "core_stats", "/last-games": "core_stats",
  "/showcase": "core_stats", "/research/trends": "core_stats",
  "/research/distributions": "core_stats", "/similar-players": "core_stats",
  "/roster-shapes": "core_stats", "/playoffs": "core_stats",
  "/wowy": "on_off", "/stat-line-shift": "on_off",
  "/similar-players/shot-profile": "shots", "/research/shooting/aftermath": "shots", "/matchups": "matchups",
  "/wingspan": "measurements",
  "/research/defensive-matchups": "defensive_tracking", "/research/epv": "tracking",
};
export function routeAvailability(href: string, catalog: WorkbenchCatalog | null, season?: string, phase?: string) {
  const route = href.split("?")[0];
  const requirement = requirements[route];
  if (!requirement) return { secondary: false, reason: "" };
  if (!catalog) return { secondary: true, reason: "Availability could not be verified. Open the tool to retry." };
  const capability = catalog.capabilities?.[requirement];
  if (!capability) return { secondary: true, reason: "Required source is not declared in this release. Try Stats or inspect Data status." };
  if (!["available", "partial"].includes(capability.status)) return { secondary: true, reason: capability.limitations[0] ?? "Required inputs are unavailable in this release. Try Stats." };
  const selectedSeason = season ?? catalog.default_season;
  const selectedPhase = phase ?? catalog.default_phase;
  if ((capability.seasons.length && !capability.seasons.includes(selectedSeason)) ||
      (capability.phases.length && !capability.phases.includes(selectedPhase))) {
    return { secondary: true, reason: "No declared coverage for this season or phase. Change context or inspect Data status." };
  }
  return { secondary: false, reason: capability.status === "partial" ? "Partial source coverage; inspect the tool’s sample and limitations." : "" };
}

const catalogs = new Map<string, { expires: number; request: Promise<WorkbenchCatalog> }>();
export function getSharedCatalog(releaseId?: string) {
  const key = releaseId ?? "public";
  const cached = catalogs.get(key);
  if (cached && cached.expires > Date.now()) return cached.request;
  const request = getWorkbenchCatalog(releaseId);
  catalogs.set(key, { expires: Date.now() + 30_000, request });
  if (catalogs.size > 8) catalogs.delete(catalogs.keys().next().value!);
  void request.catch(() => { if (catalogs.get(key)?.request === request) catalogs.delete(key); });
  return request;
}

const labels: Record<string, string> = {
  regular_season: "Regular season", play_in: "Play-in", cup_final: "Cup final",
  summer_league: "Summer league", playoffs: "Playoffs", preseason: "Preseason",
  season_to_date: "Season to date", season: "Season to date", last_10: "Last 10 appearances",
  last_5: "Last 5 appearances", source_blocked: "Source unavailable",
  selection_failed_negative_result: "Completed negative result · selection failed",
};
export function humanLabel(value: string) { return labels[value] ?? value.replaceAll("_", " "); }
