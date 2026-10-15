"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import { EntityField } from "./entity-picker";
import { PlayerPortrait } from "./player-portrait";
import { Icon } from "./ui/icon";
import { formatHeight } from "./player-bio-header";
import { teamBrandColor } from "@/lib/team-colors";
import type { PlayerBio, PlayerComparisonResponse } from "@/lib/types";

export type CompareSlotPlayer = PlayerComparisonResponse["player_a"];
export type CompareSelection = { id: string; name: string };

/** Age · position · height, from the season listing; absent facts are left out, never guessed. */
export function bioLine(bio: PlayerBio | null | undefined): string | null {
  if (!bio) return null;
  const parts = [bio.age != null ? `Age ${bio.age}` : null, bio.listed_position, formatHeight(bio.listed_height_inches)].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * One side of the duel card (alignment row 3): a square headshot on the team's colour with a games
 * badge, then the name and one bio line. Pressing the photo swaps in the player search.
 */
export function ComparePlayerSlot({ side, player, bio, onPick }: {
  side: "a" | "b";
  player: CompareSlotPlayer;
  bio?: PlayerBio | null;
  onPick: (selection: CompareSelection) => void;
}) {
  const params = useSearchParams();
  const [searching, setSearching] = useState(false);
  const label = `Player ${side.toUpperCase()}`;
  const tint = teamBrandColor(player.teams[0]);
  const line = bioLine(bio);
  return <div className="pvp-slot" data-identity={side}
    style={tint ? ({ "--team-tint": tint } as CSSProperties) : undefined}>
    <button type="button" className="pvp-photo" aria-expanded={searching} aria-label={`Change ${label}, ${player.name}`} onClick={() => setSearching(open => !open)}>
      <PlayerPortrait playerId={player.id} name={player.name} portraitUrl={player.portrait_url} size="xl" className="pvp-portrait" />
      <span className="pvp-badge" title={`${player.games_played} games · ${Math.round(player.total_minutes).toLocaleString("en-US")} minutes`}>{player.games_played} GP</span>
      <span className="pvp-photo-hint" aria-hidden="true"><Icon name="search" size={14} /></span>
    </button>
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
