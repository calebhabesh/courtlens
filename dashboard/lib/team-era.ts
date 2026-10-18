// Franchises' earlier identities (Seattle SuperSonics for the Thunder), mirrored from
// `courtlens.domain.teams.TEAM_ERAS` into team-branding.json by scripts/team_branding_assets.py.
import catalog from "./team-branding.json";

export type TeamEra = (typeof catalog.eras)[number];

const start = (season: string) => Number(season.slice(0, 4));
const covers = (span: { first_season: string | null; last_season: string | null }, season: string) =>
  (span.first_season == null || start(span.first_season) <= start(season))
  && (span.last_season == null || start(season) <= start(span.last_season));

/**
 * The era a team names. With a season, a franchise id or era code matches the era covering it
 * (the Thunder's id in 2005-06 is the Sonics). Without one, only codes a release stores games
 * under (`SEA`) match, to their latest era, so current ids and codes never change meaning.
 */
export function teamEra(team: string | null | undefined, season?: string | null): TeamEra | null {
  if (!team) return null;
  const code = team.toUpperCase();
  const matches = catalog.eras.filter(era => season
    ? covers(era, season) && (era.franchise_id === team || era.code === code)
    : era.stored_as_code && era.code === code);
  return matches.at(-1) ?? null;
}

/** The id a release stores a franchise's games under in a season (`SEA` for the Thunder in 2005-06). */
export function seasonTeamId(franchiseId: string, season: string): string {
  return catalog.eras.find(era => era.stored_as_code && era.franchise_id === franchiseId && covers(era, season))?.code ?? franchiseId;
}

/** The current franchise id for a franchise id, current tricode or era code. */
export function franchiseOf(team: string): string | null {
  const era = teamEra(team);
  if (era) return era.franchise_id;
  return catalog.teams.find(entry => entry.team_id === team || entry.tricode === team.toUpperCase())?.team_id ?? null;
}

/** False for seasons a franchise fielded no team (New Orleans before 2002-03). */
export function franchiseActive(franchiseId: string, season: string): boolean {
  return !catalog.inactive.some(gap => gap.franchise_id === franchiseId && covers(gap, season));
}

type SeasonLogo = { franchise_id: string; first_season: string; last_season: string; asset: string };
/** Logo spans by season; absent until `--acquire-season-logos` has run, so lookups fall back. */
const SEASON_LOGOS: SeasonLogo[] = (catalog as { season_logos?: SeasonLogo[] }).season_logos ?? [];

export interface TeamArtwork {
  /** The code the team used then (SEA, CHH) or its current tricode. */
  tricode: string;
  /** Full name as it was then (Seattle SuperSonics) or the current name. */
  artwork_name: string;
  asset: string;
  caption: string;
}

/**
 * A team's name and logo for a season. Any franchise id, current tricode or era code resolves
 * to the identity it had then (OKC in 2000-01 is the Sonics) and that season's logo from the
 * season spans; without a season, era codes keep their era artwork and others the current logo.
 */
export function teamArtwork(team: string | null | undefined, season?: string | null): TeamArtwork | null {
  if (!team) return null;
  const current = catalog.teams.find(entry => entry.team_id === team || entry.tricode === team);
  const franchise = teamEra(team, season)?.franchise_id ?? teamEra(team)?.franchise_id ?? current?.team_id ?? null;
  if (!franchise) return null;
  const now = catalog.teams.find(entry => entry.team_id === franchise)!;
  const era = season ? teamEra(franchise, season) : teamEra(team);
  const span = season ? SEASON_LOGOS.find(entry => entry.franchise_id === franchise && covers(entry, season)) : undefined;
  const name = era?.artwork_name ?? now.artwork_name;
  return {
    tricode: era?.code ?? now.tricode,
    artwork_name: name,
    asset: span?.asset ?? era?.asset ?? now.asset,
    caption: span ? `${name} logo (${span.first_season}–${span.last_season})` : era ? `${name} artwork (${era.first_season}–${era.last_season})` : `${name} artwork (current franchise)`,
  };
}
