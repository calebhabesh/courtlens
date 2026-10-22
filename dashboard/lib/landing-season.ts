import { getPlayerSeasons } from "./workbench-api";

/** A player's best full season and the measure that chose it ("bpm", "ws_per_48" or "ws"). */
export type BestSeason = { season: string; basis: string };

/** Where a picked player landed: the season on screen, the current season (an active player),
    their best season (a retired one), or their latest. */
export type Landing = { season: string; kind: "kept" | "current" | "best" | "latest" };

const BASIS_LABELS: Record<string, string> = {
  bpm: "Box Plus/Minus",
  ws_per_48: "Win Shares per 48 minutes",
  ws: "Win Shares",
};

/** "Box Plus/Minus" for the best-season note; careers before 1973-74 use Win Shares instead. */
export function basisLabel(basis: string | null | undefined): string {
  return BASIS_LABELS[basis ?? ""] ?? "Box Plus/Minus";
}

/** The release's newest season, from its catalog. */
export function newestSeason(catalog: { seasons?: string[] } | null | undefined): string | null {
  return [...(catalog?.seasons ?? [])].sort().at(-1) ?? null;
}

/** "2025-26" from "2026-27". */
export function previousSeason(season: string): string {
  const start = Number(season.slice(0, 4)) - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** What a pick knows when it lands a player. */
export type LandingContext = {
  /** The page's season (the scope every side follows unless it has its own). */
  page: string;
  /** The other player's season, so two players compare in the same season when both played it. */
  other?: string | null;
  /** Their best full season (retired players land there). */
  best?: string | null;
  /** The release's newest season. */
  newest?: string | null;
  /** On an NBA roster today; null when no roster source speaks for them. */
  active?: boolean | null;
};

/**
 * The season a newly picked player lands in (owner, 2026-10-22), first that applies:
 * 1. the other player's season, when they played it (Magic beside Jordan's 1987-88: 1987-88);
 * 2. the page's season, when they played it;
 * 3. an active player's latest season (on a roster today; without roster evidence, played in
 *    the newest season or the one before);
 * 4. a retired player's best season;
 * 5. their latest season.
 * Null when their seasons are unknown: the caller keeps its season.
 */
export function landing(played: string[], at: LandingContext): Landing | null {
  if (!played.length) return null;
  if (at.other && played.includes(at.other)) return { season: at.other, kind: "kept" };
  if (played.includes(at.page)) return { season: at.page, kind: "kept" };
  const latest = [...played].sort().at(-1)!;
  const active = at.active ?? (at.newest ? latest >= previousSeason(at.newest) : false);
  if (active) return { season: latest, kind: latest === at.newest ? "current" : "latest" };
  if (at.best && played.includes(at.best)) return { season: at.best, kind: "best" };
  return { season: latest, kind: "latest" };
}

type LandingScope = { phase: string; releaseId?: string | null } & Omit<LandingContext, "best" | "active">;

/** Fetches the player's seasons and resolves their landing; null when the read fails. */
export async function fetchLanding(playerId: string, scope: LandingScope): Promise<Landing | null> {
  const read = await getPlayerSeasons([playerId], scope.phase, scope.releaseId ?? undefined).catch(() => null);
  const landed = read ? landing(read.seasons[playerId] ?? [], { ...scope, best: read.peak?.[playerId], active: read.active?.[playerId] }) : null;
  if (landed) noteLanding(playerId, landed);
  return landed;
}

/** The season only, for callers that do not show how it was chosen. */
export async function fetchLandingSeason(playerId: string, scope: LandingScope): Promise<string | null> {
  return (await fetchLanding(playerId, scope))?.season ?? null;
}

/*
 * A pick that moved a player to a season they may not expect (best, or an older latest) is
 * remembered until its season menu closes, so that menu opens by itself once, after the new card
 * renders, and says why that season. The season on screen and the current season need no note.
 */
const fresh = new Map<string, "best" | "latest">();
const key = (playerId: string, season: string) => `${playerId}|${season}`;

export function noteLanding(playerId: string, landed: Landing) {
  if (landed.kind === "kept" || landed.kind === "current") fresh.delete(key(playerId, landed.season));
  else fresh.set(key(playerId, landed.season), landed.kind);
}

export function freshLanding(playerId: string, season: string): "best" | "latest" | null {
  return fresh.get(key(playerId, season)) ?? null;
}

export function settleLanding(playerId: string, season: string) {
  fresh.delete(key(playerId, season));
}
