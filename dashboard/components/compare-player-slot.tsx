"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import { EntityField } from "./entity-picker";
import { PlayerPortrait } from "./player-portrait";
import teamBranding from "@/lib/team-branding.json";
import { TeamLogo } from "./team-logo";
import { Icon } from "./ui/icon";
import { Select } from "./ui/kit";
import { formatHeight } from "./player-bio-header";
import { teamBrandColor } from "@/lib/team-colors";
import type { ComparisonPlayer, PlayerBio } from "@/lib/types";

export type CompareSlotPlayer = ComparisonPlayer;
export type CompareSelection = { id: string; name: string };

/** Age · position · height, from the season listing; absent facts are left out, never guessed. */
export function bioLine(bio: PlayerBio | null | undefined): string | null {
  if (!bio) return null;
  const parts = [bio.age != null ? `Age ${bio.age}` : null, bio.listed_position, formatHeight(bio.listed_height_inches)].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** A team's catalog record (full name and logo artwork); null for codes without artwork. */
export function teamRecord(team: string | undefined) {
  return team ? teamBranding.teams.find(entry => entry.tricode === team || entry.team_id === team) ?? null : null;
}

/** The scope's teams oldest first; a traded player's latest team (the photo, tint) is last. */
export function slotTeams(player: Pick<ComparisonPlayer, "teams" | "teams_chronological">): string[] {
  return player.teams_chronological?.length ? player.teams_chronological : player.teams;
}

/**
 * One side of the duel card (alignment row 3): a square headshot from the compared season on the
 * latest team's colour, its team logos (every team of the scope, latest in front), a games badge
 * and a change-player icon, then the name and one bio line. Pressing the photo opens search.
 */
export function ComparePlayerSlot({ side, player, bio, season, games, playedSeasons = null, onSeason, onPick }: {
  side: "a" | "b";
  player: CompareSlotPlayer;
  bio?: PlayerBio | null;
  /** The compared season: the photo is the player's headshot from it when one exists. */
  season?: string;
  /** Career games when the card compares careers; the season's games otherwise. */
  games?: number | null;
  /** Seasons this player has games in (this phase); null while unknown. */
  playedSeasons?: string[] | null;
  /** Compare this player in another season (alignment row 3, 38). */
  onSeason?: (season: string) => void;
  onPick: (selection: CompareSelection) => void;
}) {
  const params = useSearchParams();
  // The search slides in focused (26) and fades out before it unmounts (46); the name returns after.
  const [search, setSearch] = useState<"closed" | "open" | "closing">("closed");
  const [returned, setReturned] = useState(false);
  const searching = search === "open";
  const searchRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (searching) searchRef.current?.querySelector<HTMLInputElement>('[role="combobox"]')?.focus(); }, [searching]);
  const label = `Player ${side.toUpperCase()}`;
  const teams = slotTeams(player);
  const latest = teams.at(-1);
  const tint = teamBrandColor(latest);
  // No Games in the compared season (39, 43): say so plainly instead of an empty identity.
  const inactive = season != null && (playedSeasons ? !playedSeasons.includes(season) : player.games_played === 0);
  const line = inactive ? null : bioLine(bio);
  const span = playedSeasons?.length ? `${playedSeasons[0]} – ${playedSeasons.at(-1)}` : null;
  const record = teamRecord(latest);

  return <div className="pvp-slot pvp-fade" data-identity={side} data-inactive={inactive || undefined}
    style={tint ? ({ "--team-tint": tint } as CSSProperties) : undefined}>
    <div className="pvp-photo-frame">
      <button type="button" className="pvp-photo" aria-expanded={searching} aria-label={`Change ${label}, ${player.name}`} onClick={() => setSearch(state => state === "open" ? "closing" : "open")}>
        {/* The latest team's logo sits large behind the headshot, as Databallr does (33). */}
        {/* eslint-disable-next-line @next/next/no-img-element -- static SVG artwork, decorative */}
        {record && <img className="pvp-watermark" src={record.asset} alt="" aria-hidden="true" />}
        <PlayerPortrait playerId={player.id} name={player.name} portraitUrl={player.portrait_url} size="xl" className="pvp-portrait"
          era={season ? { season, team: latest } : null} />
        {inactive
          ? <span className="pvp-badge">No Games</span>
          : games != null
          ? <span className="pvp-badge" title={`${games.toLocaleString("en-US")} career games through ${season}`}>{games.toLocaleString("en-US")} GP</span>
          : <span className="pvp-badge" title={`${player.games_played} games · ${Math.round(player.total_minutes).toLocaleString("en-US")} minutes`}>{player.games_played} GP</span>}
        <span className="pvp-change" aria-hidden="true"><Icon name="user-edit" size={16} /></span>
      </button>
    </div>
    {search !== "closed"
      ? <div className="pvp-search" ref={searchRef} data-closing={search === "closing" || undefined}
          onAnimationEnd={event => { if (event.animationName === "pvp-search-out") { setSearch("closed"); setReturned(true); } }}>
          <EntityField label={label} value="" releaseId={params.get("releaseId") || params.get("release_id")} season={params.get("season")} phase={params.get("phase")} beforeDate={params.get("beforeDate") || params.get("before_date")}
            onChange={(id, items) => { if (id && items[0]) { setSearch("closing"); onPick({ id, name: items[0].display_name }); } }} />
        </div>
      : <div className="pvp-who" data-returned={returned || undefined}>
          <Link className="pvp-name" href={`/players/${player.id}`}>{player.name}</Link>
          {/* Full team names with small logos, oldest first: "Brooklyn Nets, Phoenix Suns" (32, 35). */}
          {inactive && <span className="pvp-dnp">No Games in {season}{span ? <><br />Played {span}</> : null}</span>}
          {!inactive && teams.length > 0 && <span className="pvp-team">{teams.map(team => <span key={team} className="pvp-team-entry">
            <TeamLogo team={team} size={16} />{teamRecord(team)?.artwork_name ?? team}</span>)}</span>}
          {line && <span className="pvp-bio">{line}</span>}
          {onSeason && season && playedSeasons && <span className="pvp-season">
            <Select size="sm" aria-label={`${label} season`} value={season} onChange={event => onSeason(event.target.value)}>
              {!playedSeasons.includes(season) && <option value={season}>{season} · No Games</option>}
              {[...playedSeasons].reverse().map(entry => <option key={entry} value={entry}>{entry}</option>)}
            </Select>
          </span>}
        </div>}
  </div>;
}
