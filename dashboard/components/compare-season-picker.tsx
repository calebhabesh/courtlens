"use client";

import { PlayerPortrait } from "./player-portrait";
import { Icon } from "./ui/icon";
import { Menu, MenuItem } from "./ui/menu";
import { MenuTrigger } from "./ui/kit";

/** One player's mark: their mini photo, the seasons they played, and the duel side if any. */
export type SeasonMark = { id: string; name: string; portraitUrl?: string; played: string[]; identity?: "a" | "b" };

/** A player's mini photo, with a check (in their side's colour on the duel) when they played. */
function Mark({ mark, played }: { mark: SeasonMark; played: boolean }) {
  return <span className="pvp-mark" data-identity={mark.identity} data-played={played || undefined} aria-hidden="true">
    <PlayerPortrait playerId={mark.id} name={mark.name} portraitUrl={mark.portraitUrl} size="sm" className="pvp-mark-photo" />
    {played && <span className="pvp-mark-check"><Icon name="check" size={14} /></span>}
  </span>;
}

function status(marks: SeasonMark[], season: string) {
  const playedIt = marks.filter(mark => mark.played.includes(season));
  if (playedIt.length === marks.length) return marks.length === 2 ? "both played" : "all played";
  if (!playedIt.length) return marks.length === 2 ? "neither played" : "none played";
  const missed = marks.filter(mark => !playedIt.includes(mark));
  return `${playedIt.map(mark => mark.name).join(", ")} played, ${missed.map(mark => mark.name).join(", ")} did not`;
}

/**
 * Compare's console season (alignment row 3, 44): each season shows every compared player's
 * photo, checked when they played it, newest first. Choosing one is the console's global season
 * change, so it also resets per-player seasons. The duel and the grid share it (72).
 */
export function CompareSeasonPicker({ season, seasons, marks, onSelect }: {
  season: string;
  seasons: string[];
  marks: SeasonMark[];
  onSelect: (season: string) => void;
}) {
  const row = (entry: string) => <span className="pvp-marks">{marks.map(mark => <Mark key={mark.id} mark={mark} played={mark.played.includes(entry)} />)}</span>;
  return <Menu className="pvp-season-menu" renderTrigger={props => (
    <MenuTrigger {...props} size="sm" aria-label={`Filter by season, ${season}, ${status(marks, season)}`}>
      <span className="pvp-season-row">{season}{row(season)}</span>
    </MenuTrigger>
  )}>
    {[...seasons].reverse().map(entry => <MenuItem key={entry} className={entry === season ? "pvp-season-current" : undefined} onClick={() => onSelect(entry)}
      label={<span className="pvp-season-row"><span className="pvp-season-label">{entry}</span>{row(entry)}
        <span className="sr-only">{status(marks, entry)}</span></span>} />)}
  </Menu>;
}
