"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import { EntityField } from "./entity-picker";
import { PlayerPortrait } from "./player-portrait";
import { TeamLogo } from "./team-logo";
import { Icon } from "./ui/icon";
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

/** The scope's teams oldest first; a traded player's latest team (the photo, tint) is last. */
export function slotTeams(player: Pick<ComparisonPlayer, "teams" | "teams_chronological">): string[] {
  return player.teams_chronological?.length ? player.teams_chronological : player.teams;
}

/**
 * One side of the duel card (alignment row 3): a square headshot from the compared season on the
 * latest team's colour, its team logos (every team of the scope, latest in front), a games badge
 * and a change-player icon, then the name and one bio line. Pressing the photo opens search.
 */
export function ComparePlayerSlot({ side, player, bio, season, onPick }: {
  side: "a" | "b";
  player: CompareSlotPlayer;
  bio?: PlayerBio | null;
  /** The compared season: the photo is the player's headshot from it when one exists. */
  season?: string;
  onPick: (selection: CompareSelection) => void;
}) {
  const params = useSearchParams();
  const [searching, setSearching] = useState(false);
  const label = `Player ${side.toUpperCase()}`;
  const teams = slotTeams(player);
  const latest = teams.at(-1);
  const tint = teamBrandColor(latest);
  const line = bioLine(bio);
  return <div className="pvp-slot pvp-fade" data-identity={side}
    style={tint ? ({ "--team-tint": tint } as CSSProperties) : undefined}>
    <div className="pvp-photo-frame">
      <button type="button" className="pvp-photo" aria-expanded={searching} aria-label={`Change ${label}, ${player.name}`} onClick={() => setSearching(open => !open)}>
        <PlayerPortrait playerId={player.id} name={player.name} portraitUrl={player.portrait_url} size="xl" className="pvp-portrait"
          era={season ? { season, team: latest } : null} />
        <span className="pvp-badge" title={`${player.games_played} games · ${Math.round(player.total_minutes).toLocaleString("en-US")} minutes`}>{player.games_played} GP</span>
        <span className="pvp-change" aria-hidden="true"><Icon name="user-edit" size={16} /></span>
      </button>
      {teams.length > 0 && <span className="pvp-logos" data-count={teams.length} role="img" aria-label={`Teams: ${teams.join(", then ")}`} title={teams.join(" then ")}>
        {teams.map(team => <span key={team} className="pvp-logo"><TeamLogo team={team} size={teams.length > 1 ? 22 : 28} /></span>)}
      </span>}
    </div>
    {searching
      ? <div className="pvp-search">
          <EntityField label={label} value="" releaseId={params.get("releaseId") || params.get("release_id")} season={params.get("season")} phase={params.get("phase")} beforeDate={params.get("beforeDate") || params.get("before_date")}
            onChange={(id, items) => { if (id && items[0]) { setSearching(false); onPick({ id, name: items[0].display_name }); } }} />
        </div>
      : <div className="pvp-who">
          <Link className="pvp-name" href={`/players/${player.id}`}>{player.name}</Link>
          {line && <span className="pvp-bio">{line}</span>}
        </div>}
  </div>;
}
