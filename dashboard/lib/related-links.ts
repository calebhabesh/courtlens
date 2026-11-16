// Site links SL05: the Related row on the four hub pages (player, team, game, playoff series),
// built only from data each page already loads. Each item names the release-bound route it opens
// (`route`), so the row can leave out a destination the release cannot serve (`routeAvailability`).
import branding from "./team-branding.client.json";
import { gameHref, teamHref, type GameTeamRef } from "./entity-links";
import { franchiseOf, teamNameAt } from "./team-era";
import { routeAvailability } from "./route-availability";
import type { WorkbenchCatalog } from "./types";

export interface RelatedTeam {
  /** A franchise id, tricode or era code; drawn with that season's logo. */
  id: string;
  season: string | null;
}

export interface RelatedLink {
  key: string;
  label: string;
  href: string;
  /** Shown with a team's logo before the label. */
  team?: RelatedTeam;
  /** The scope the destination opens in, for the availability check. */
  season?: string | null;
  phase?: string | null;
}

const PLAYOFFS = "playoffs";
const phaseOf = (phase: string | null | undefined) => (phase === PLAYOFFS ? PLAYOFFS : "regular_season");

function query(entries: Record<string, string | number | null | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) if (value != null && value !== "") params.set(key, String(value));
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** Today's tricode of a franchise (Contracts and Roster Shapes are keyed by it); null for a folded team. */
export function currentTricode(team: string): string | null {
  const franchise = franchiseOf(team);
  return branding.teams.find(entry => entry.team_id === franchise)?.tricode ?? null;
}

const teamName = (team: string, season: string | null) => teamNameAt(team, season) ?? team;

export interface PlayerRelatedInput {
  playerId: string;
  season: string;
  phase: string;
  beforeDate?: string | null;
  /** Who the season's games were played for (tricodes), in order. */
  seasonTeams: readonly string[];
  /** The draft year, when he was drafted. */
  draftYear?: number | null;
  /** The team a roster source lists him on today; absent for free agents and retired players. */
  currentTeam?: string | null;
}

/** Player: his team that season, Compare, Similar Players, Last Games, Matchups, his draft class, his team's contracts. */
export function playerRelated(input: PlayerRelatedInput): RelatedLink[] {
  const { playerId, season } = input;
  const phase = phaseOf(input.phase);
  const scope = { season, phase, beforeDate: input.beforeDate ?? null };
  const links: RelatedLink[] = input.seasonTeams.map(team => ({
    key: `team-${team}`, label: teamName(team, season), team: { id: team, season },
    href: teamHref(team, { season, phase }),
  }));
  links.push(
    { key: "compare", label: "Compare", href: `/compare${query({ playerA: playerId, ...scope })}`, season, phase },
    { key: "similar", label: "Similar Players", href: `/similar-players${query({ playerId, season })}`, season },
    { key: "last-games", label: "Last Games", href: `/last-games${query({ playerId, ...scope })}`, season, phase },
    { key: "matchups", label: "Matchups", href: `/matchups${query({ playerId, season, phase })}`, season, phase },
  );
  if (input.draftYear) links.push({ key: "draft", label: `${input.draftYear} Draft Class`, href: `/draft${query({ year: input.draftYear, tab: "classes" })}` });
  const contracts = input.currentTeam ? currentTricode(input.currentTeam) : null;
  if (contracts) links.push({ key: "contracts", label: `${contracts} Contracts`, team: { id: contracts, season: null }, href: `/contracts${query({ team: contracts })}` });
  return links;
}

export interface TeamRelatedInput {
  /** The id the page was opened with (franchise id or a folded team's code). */
  teamId: string;
  season: string;
  phase: string;
  /** Seasons whose playoffs the release covers (its playoff Stats scopes). */
  playoffSeasons: readonly string[];
}

/** Team: Standings, schedule, Roster Shapes, Contracts, Team Compare, the season's playoff bracket. */
export function teamRelated(input: TeamRelatedInput): RelatedLink[] {
  const { teamId, season } = input;
  const phase = phaseOf(input.phase);
  const tricode = currentTricode(teamId);
  const franchise = franchiseOf(teamId) ?? teamId;
  const links: RelatedLink[] = [
    { key: "standings", label: `${season} Standings`, href: `/standings${query({ season })}` },
    // The schedule is a section of this page.
    { key: "schedule", label: "Schedule", href: "#schedule" },
  ];
  if (tricode) {
    links.push({ key: "roster-shapes", label: "Roster Shapes", href: `/roster-shapes${query({ team: tricode, season })}`, season, phase });
    links.push({ key: "contracts", label: "Contracts", href: `/contracts${query({ team: tricode })}` });
  }
  links.push({ key: "team-compare", label: "Team Compare", href: `/team-compare${query({ teamA: franchise, season, phase })}`, season, phase });
  if (input.playoffSeasons.includes(season)) {
    links.push({ key: "playoffs", label: `${season} Playoffs`, href: `/playoffs${query({ season })}`, season, phase: PLAYOFFS });
  }
  return links;
}

export interface GameRelatedTeam {
  /** The id a team link names (Live: `canonical_id`); null renders nothing for that team. */
  id: string | null;
  name: string;
}

/** Game: both teams, each team's schedule. (Live games carry no season type, so no series link: D10.) */
export function gameRelated({ season, teams }: { season: string; teams: readonly GameRelatedTeam[] }): RelatedLink[] {
  const known = teams.filter((team): team is GameRelatedTeam & { id: string } => Boolean(team.id));
  return [
    ...known.map(team => ({ key: `team-${team.id}`, label: team.name, team: { id: team.id, season }, href: teamHref(team.id, { season }) })),
    ...known.map(team => ({
      key: `schedule-${team.id}`, label: `${currentTricode(team.id) ?? team.name} Schedule`,
      href: teamHref(team.id, { season, section: "schedule" }),
    })),
  ];
}

export interface SeriesRelatedGame {
  game_id: string;
  game_number: number;
  game_date: string | null;
  home_team_id: string;
  home_team_tricode: string;
  away_team_id: string;
  away_team_tricode: string;
  status: string;
}

/** Series: both teams, the bracket, each game. */
export function seriesRelated({ season, teams, games, beforeDate, releaseId }: {
  season: string;
  teams: readonly { id: string; name: string }[];
  games: readonly SeriesRelatedGame[];
  beforeDate?: string | null;
  releaseId?: string | null;
}): RelatedLink[] {
  const links: RelatedLink[] = teams.map(team => ({
    key: `team-${team.id}`, label: team.name, team: { id: team.id, season },
    href: teamHref(team.id, { season, phase: PLAYOFFS }),
  }));
  // The bracket at the series' own cutoff (D12).
  links.push({ key: "bracket", label: `${season} Bracket`, href: `/playoffs${query({ season, beforeDate, releaseId })}`, season, phase: PLAYOFFS });
  for (const game of [...games].sort((a, b) => a.game_number - b.game_number)) {
    if (game.status === "unplayed_placeholder" || !game.game_date) continue;
    const href = gameHref({
      gameId: game.game_id, date: game.game_date,
      teams: [{ id: game.away_team_id, tricode: game.away_team_tricode }, { id: game.home_team_id, tricode: game.home_team_tricode }] satisfies [GameTeamRef, GameTeamRef],
    });
    if (href) links.push({ key: `game-${game.game_id}`, label: `Game ${game.game_number}`, href });
  }
  return links;
}


/** Whether a related destination is served. Without a catalog (still loading, or failed) a
 * release-bound route reads as unverified and stays out; routes without a source always show. */
export function relatedAvailable(link: RelatedLink, catalog: WorkbenchCatalog | null): boolean {
  if (link.href.startsWith("#")) return true;
  return !routeAvailability(link.href, catalog, link.season ?? undefined, link.phase ?? undefined).secondary;
}

/** The links a release can serve: leave the others out, never show them disabled. */
export function availableRelated(links: readonly RelatedLink[], catalog: WorkbenchCatalog | null): RelatedLink[] {
  return links.filter(link => relatedAvailable(link, catalog));
}
