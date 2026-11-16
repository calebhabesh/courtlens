// Site links (docs/site-links-plan.md): the one place player, team, game and playoff series hrefs
// are built. Links carry the season they were shown in (D5) and name teams by franchise id (D6);
// the destination page resolves the era and the seasons it actually has (SL02).
import { franchiseOf, teamEra } from "./team-era";

/** What a link carries (D5). Phase is written only for the playoffs; table filters, sort and
 * paging never travel. `beforeDate` and `releaseId` only where the source page is pinned to them. */
export interface EntityScope {
  season?: string | null;
  phase?: string | null;
  beforeDate?: string | null;
  releaseId?: string | null;
  tab?: string | null;
  /** Navigation markers the destination reads, never filters: Stats' return marker, the legacy
   * replay `date`/`snapshotId`. Appended last. */
  params?: Record<string, string | null | undefined>;
  /** A section of the destination page (`schedule` → `#schedule`), for player and team pages. */
  section?: string | null;
}

type Id = string | number | null | undefined;

const present = (id: Id): id is string | number => id != null && String(id).trim() !== "";

function query(entries: Array<[string, string | null | undefined]>): string {
  const params = new URLSearchParams();
  for (const [key, value] of entries) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
}

function scopeQuery(scope: EntityScope | undefined, withSeason = true): string {
  return query([
    ["season", withSeason ? scope?.season : null],
    ["phase", scope?.phase === "playoffs" ? "playoffs" : null],
    ["beforeDate", scope?.beforeDate],
    ["releaseId", scope?.releaseId],
    ["tab", scope?.tab],
    ...Object.entries(scope?.params ?? {}),
  ]);
}

const hash = (scope: EntityScope | undefined) => (scope?.section ? `#${encodeURIComponent(scope.section)}` : "");

/** The part of a page's scope query a link carries (D5): its season and phase. */
export function scopeFromQuery(query: string | URLSearchParams | null | undefined): EntityScope {
  const params = new URLSearchParams(query?.toString() ?? "");
  return { season: params.get("season"), phase: params.get("phase") };
}

/** A player's page in the scope he was shown in; null without an id. */
export function playerHref(id: string | number, scope?: EntityScope): string;
export function playerHref(id: Id, scope?: EntityScope): string | null;
export function playerHref(id: Id, scope?: EntityScope): string | null {
  if (!present(id)) return null;
  return `/players/${encodeURIComponent(String(id).trim())}${scopeQuery(scope)}${hash(scope)}`;
}

/**
 * The id a team link names (D6): the current franchise id for a franchise id, current tricode or
 * era code (SEA in 2005-06 is the Thunder's franchise), so the team page picks the era from the
 * season. A team that folded has no franchise and keeps its own code; an id the catalog does not
 * know is passed through for the team page to resolve or reject.
 */
export function teamLinkId(team: string | number, season?: string | null): string {
  const raw = String(team).trim();
  const era = season ? teamEra(raw, season) : null;
  if (era) return era.franchise_id ?? era.code;
  const own = teamEra(raw);
  if (own && own.franchise_id == null) return own.code;
  return franchiseOf(raw) ?? raw;
}

/** A team's page in the season it was shown in; null without an id. */
export function teamHref(team: string | number, scope?: EntityScope): string;
export function teamHref(team: Id, scope?: EntityScope): string | null;
export function teamHref(team: Id, scope?: EntityScope): string | null {
  if (!present(team)) return null;
  return `/teams/${encodeURIComponent(teamLinkId(team, scope?.season))}${scopeQuery(scope)}${hash(scope)}`;
}

/** A team as a warehouse game names it; either part may be missing. */
export interface GameTeamRef {
  id?: string | number | null;
  tricode?: string | null;
}

/**
 * Games have two id spaces. Live pages are keyed by ESPN's id (`espnId`); a warehouse game
 * (`gameId` with its date and teams) opens through /live/open, which finds ESPN's id on that
 * date's slate and redirects.
 */
export type GameRef =
  | { espnId: string | number | null | undefined; date?: string | null }
  | { gameId: string | number | null | undefined; date: string | null | undefined; teams: readonly [GameTeamRef, GameTeamRef] };

const slateDate = (date: string | null | undefined) => (date ? date.slice(0, 10) : null);

/** A game's Live page; null without an id (or, for a warehouse game, without its date). */
export function gameHref(game: GameRef | null | undefined, scope?: Pick<EntityScope, "tab" | "params">): string | null {
  if (!game) return null;
  if ("espnId" in game) {
    if (!present(game.espnId)) return null;
    return `/live/games/${encodeURIComponent(String(game.espnId))}${query([["date", slateDate(game.date)], ["tab", scope?.tab], ...Object.entries(scope?.params ?? {})])}`;
  }
  const date = slateDate(game.date);
  if (!present(game.gameId) || !date) return null;
  const teams = game.teams.map(team => `${team.id ?? ""}:${team.tricode ?? ""}`).join(",");
  return `/live/open${query([["date", date], ["game", String(game.gameId)], ["teams", teams]])}`;
}

/** A playoff series page by its slug (the slug names the season); null without one. */
export function seriesHref(slug: string, scope?: Pick<EntityScope, "beforeDate" | "releaseId">): string;
export function seriesHref(slug: Id, scope?: Pick<EntityScope, "beforeDate" | "releaseId">): string | null;
export function seriesHref(slug: Id, scope?: Pick<EntityScope, "beforeDate" | "releaseId">): string | null {
  if (!present(slug)) return null;
  return `/playoffs/${encodeURIComponent(String(slug).trim())}${scopeQuery(scope, false)}`;
}

/** The path of an entity href, for self-link checks and route matching. */
export function hrefPath(href: string): string {
  return href.split(/[?#]/, 1)[0];
}

/** True when `href` points at the entity page `pathname` already shows (a self link renders plain). */
export function isSelfLink(href: string, pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const path = hrefPath(href);
  return decodeURIComponent(path) === decodeURIComponent(pathname.replace(/\/$/, ""));
}

/** Route prefixes the builders own, for code that matches pathnames (nav trail, active menu items). */
export const ENTITY_ROUTES = {
  player: "/players/",
  team: "/teams/",
  liveGame: "/live/games/",
  liveOpen: "/live/open",
  series: "/playoffs/",
} as const;
