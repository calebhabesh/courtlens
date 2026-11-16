// Site links SL02: a link names the season it was shown in, without knowing which seasons the
// player or team has. The destination resolves it: the latest season it has at or before the one
// asked for, else its earliest; regular season when it missed the playoffs. The URL is rewritten to
// name what is shown, and `asked` carries the request so the page can say so once.
import { franchiseActive, teamEra } from "./team-era";

const REGULAR = "regular_season";
const PLAYOFFS = "playoffs";

/** The query parameter that records what a rewritten link asked for (`2026-27` or `2021-22:playoffs`). */
export const ASKED_PARAM = "asked";

export interface LinkScope { season: string; phase: string }

/** The season in `seasons` closest to `asked` from below, else the earliest; null when there are none. */
export function closestSeason(asked: string, seasons: readonly string[]): string | null {
  if (seasons.includes(asked)) return asked;
  const sorted = [...new Set(seasons)].sort();
  return sorted.filter(season => season <= asked).at(-1) ?? sorted[0] ?? null;
}

/**
 * What a player link should show. `regular` and `playoffs` are the seasons he played in each
 * phase (null when not loaded: then nothing is rewritten). Playoffs he missed open that season's
 * regular season, then the season rule applies. Null means keep the asked scope (he has it, or
 * has no seasons at all and keeps the bio-only page).
 */
export function resolvePlayerScope(asked: LinkScope, seasons: { regular: readonly string[] | null; playoffs?: readonly string[] | null }): LinkScope | null {
  if (asked.phase === PLAYOFFS) {
    if (seasons.playoffs?.includes(asked.season)) return null;
    if (!seasons.regular?.length) return null;
    return { season: closestSeason(asked.season, seasons.regular)!, phase: REGULAR };
  }
  if (!seasons.regular?.length || seasons.regular.includes(asked.season)) return null;
  return { season: closestSeason(asked.season, seasons.regular)!, phase: asked.phase };
}

/**
 * The seasons a team id fielded a team, from the release's seasons: a folded team's own era, or
 * the franchise's seasons less its inactive gaps (New Orleans before 2002-03).
 */
export function teamSeasons(franchiseOrCode: string, releaseSeasons: readonly string[]): string[] {
  const folded = teamEra(franchiseOrCode);
  if (folded && folded.franchise_id == null) {
    return releaseSeasons.filter(season => teamEra(folded.code, season)?.code === folded.code);
  }
  return releaseSeasons.filter(season => franchiseActive(franchiseOrCode, season));
}

/**
 * What a team link should show. `madePlayoffs` is whether the team appears in that season's
 * playoff table (undefined when unknown: then the phase is kept). Null means keep the asked scope.
 */
export function resolveTeamScope(asked: LinkScope, active: readonly string[], madePlayoffs?: boolean): LinkScope | null {
  if (!active.length) return null;
  const season = closestSeason(asked.season, active)!;
  const phase = asked.phase === PLAYOFFS && (season !== asked.season || madePlayoffs === false) ? REGULAR : asked.phase;
  return season === asked.season && phase === asked.phase ? null : { season, phase };
}

/** The `asked` value for a rewritten link. */
export function askedValue(asked: LinkScope): string {
  return asked.phase === PLAYOFFS ? `${asked.season}:${PLAYOFFS}` : asked.season;
}

/** The note a page shows once after a rewrite; null when `asked` is absent or matches what is shown. */
export function askedNote(asked: string | null | undefined, shown: LinkScope, subject: string): string | null {
  if (!asked) return null;
  const [season, phase] = asked.split(":");
  if (!/^\d{4}-\d{2}$/.test(season)) return null;
  const askedPlayoffs = phase === PLAYOFFS;
  const shownPlayoffs = shown.phase === PLAYOFFS;
  if (season === shown.season && askedPlayoffs === shownPlayoffs) return null;
  const label = (value: string, playoffs: boolean) => `${value}${playoffs ? " playoffs" : ""}`;
  return `${subject} has no ${label(season, askedPlayoffs)} games; showing the ${label(shown.season, shownPlayoffs)}${shownPlayoffs ? "" : " regular season"}.`;
}

/**
 * The URL for the shown scope: the rewritten season and phase, `asked` recorded, and the old
 * `beforeDate` dropped so the page uses the shown season's default cutoff. Other parameters stay.
 */
export function rewrittenUrl(pathname: string, params: Record<string, string | undefined>, asked: LinkScope, shown: LinkScope): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && !["season", "phase", "beforeDate", "before_date", ASKED_PARAM].includes(key)) next.set(key, value);
  }
  next.set("season", shown.season);
  if (shown.phase !== REGULAR) next.set("phase", shown.phase);
  next.set(ASKED_PARAM, askedValue(asked));
  return `${pathname}?${next}`;
}
