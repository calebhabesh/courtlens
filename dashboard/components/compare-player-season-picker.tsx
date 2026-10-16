"use client";

import { announcedBefore, type SeasonEnds } from "@/lib/compare-accolades";
import type { PlayerBio } from "@/lib/types";
import { Icon } from "./ui/icon";
import { Menu, MenuItem } from "./ui/menu";
import { MenuTrigger } from "./ui/kit";

export function ComparePlayerSeasonPicker({ label, season, seasons, awards, championshipSeasons, beforeDate, align = "left", onSelect, ends }: {
  /** Completed seasons: their awards mark them although announced after the cutoff (75). */
  ends?: SeasonEnds;
  label: string; season: string; seasons: string[]; awards: NonNullable<PlayerBio["reference"]>["awards"] | undefined;
  championshipSeasons: string[];
  align?: "left" | "right";
  beforeDate: string; onSelect: (season: string) => void;
}) {
  const markers = (entry: string) => {
    const codes = awards?.[entry] ?? [];
    const mvp = codes.includes("MVP-1") && announcedBefore(entry, "MVP-1", beforeDate, ends);
    const star = codes.includes("AS") && announcedBefore(entry, "AS", beforeDate, ends);
    const champion = championshipSeasons.includes(entry);
    const text = [mvp && "MVP winner", champion && "NBA champion", star && "All-Star"].filter(Boolean).join(", ");
    return { text, node: <span className="pvp-season-honor-icons" aria-hidden="true">
      {mvp && <span title="MVP winner"><Icon name="medal" size={14} /></span>}
      {champion && <span title="NBA champion"><Icon name="trophy" size={14} /></span>}
      {star && <span title="All-Star"><Icon name="star" size={14} /></span>}
    </span> };
  };
  const current = markers(season);
  const entries = [...new Set([season, ...seasons])].sort().reverse();
  return <Menu className="pvp-season-menu pvp-player-season-menu" align={align} renderTrigger={props => <MenuTrigger {...props} size="sm"
    aria-label={`${label} season, ${season}${current.text ? `, ${current.text}` : ""}`}>
    <span className="pvp-season-row">{season}{current.node}</span>
  </MenuTrigger>}>
    {entries.map(entry => {
      const row = markers(entry);
      return <MenuItem key={entry} className={entry === season ? "pvp-season-current" : undefined} onClick={() => onSelect(entry)}
        label={<span className="pvp-season-row"><span>{entry}{!seasons.includes(entry) && " · No Games"}</span>{row.node}
          <span className="sr-only">{row.text}{entry === season ? ", selected" : ""}</span></span>} />;
    })}
    <p className="pvp-season-legend"><span><Icon name="medal" size={14} /> MVP</span><span><Icon name="trophy" size={14} /> Title</span><span><Icon name="star" size={14} /> All-Star</span></p>
  </Menu>;
}
