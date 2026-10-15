"use client";

import { PlayerPortrait } from "./player-portrait";
import { Icon } from "./ui/icon";
import { Menu, MenuItem } from "./ui/menu";
import { MenuTrigger } from "./ui/kit";
import type { ComparisonPlayer } from "@/lib/types";

type Played = { a: string[]; b: string[] };

/** A player's mini photo, with a check in their side's colour when they played that season. */
function Mark({ player, side, played }: { player: ComparisonPlayer; side: "a" | "b"; played: boolean }) {
  return <span className="pvp-mark" data-identity={side} data-played={played || undefined} aria-hidden="true">
    <PlayerPortrait playerId={player.id} name={player.name} portraitUrl={player.portrait_url} size="sm" className="pvp-mark-photo" />
    {played && <span className="pvp-mark-check"><Icon name="check" size={14} /></span>}
  </span>;
}

function status(players: [ComparisonPlayer, ComparisonPlayer], inA: boolean, inB: boolean) {
  if (inA && inB) return "both played";
  if (inA) return `${players[0].name} played, ${players[1].name} did not`;
  if (inB) return `${players[1].name} played, ${players[0].name} did not`;
  return "neither played";
}

/**
 * Compare's console season (alignment row 3, 44): each season shows both players' photos, checked
 * in their identity colour when they played it, newest first. Choosing one is the console's global
 * season change, so it also resets per-player seasons.
 */
export function CompareSeasonPicker({ season, seasons, played, players, onSelect }: {
  season: string;
  seasons: string[];
  played: Played;
  players: [ComparisonPlayer, ComparisonPlayer];
  onSelect: (season: string) => void;
}) {
  const marks = (entry: string) => {
    const inA = played.a.includes(entry), inB = played.b.includes(entry);
    return { inA, inB, node: <span className="pvp-marks"><Mark player={players[0]} side="a" played={inA} /><Mark player={players[1]} side="b" played={inB} /></span> };
  };
  const current = marks(season);
  return <Menu className="pvp-season-menu" renderTrigger={props => (
    <MenuTrigger {...props} size="sm" aria-label={`Filter by season, ${season}, ${status(players, current.inA, current.inB)}`}>
      <span className="pvp-season-row">{season}{current.node}</span>
    </MenuTrigger>
  )}>
    {[...seasons].reverse().map(entry => {
      const row = marks(entry);
      return <MenuItem key={entry} className={entry === season ? "pvp-season-current" : undefined} onClick={() => onSelect(entry)}
        label={<span className="pvp-season-row"><span className="pvp-season-label">{entry}</span>{row.node}
          <span className="sr-only">{status(players, row.inA, row.inB)}</span></span>} />;
    })}
  </Menu>;
}
