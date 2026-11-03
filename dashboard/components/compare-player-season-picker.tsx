"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { announcedBefore, type SeasonEnds } from "@/lib/compare-accolades";
import { basisLabel, freshLanding, settleLanding, type BestSeason } from "@/lib/landing-season";
import { useReducedMotion } from "@/lib/motion";
import type { PlayerBio } from "@/lib/types";
import { Icon } from "./ui/icon";
import { Menu, MenuItem } from "./ui/menu";
import { MenuTrigger } from "./ui/kit";

/** After a pick: the card's fade (200 ms) and a beat, then the season menu opens. */
const LANDED_OPEN_DELAY_MS = 420;
/** Past every cutoff: a season other than the compared one shows all its recorded honours. */
const RECORDED = "9999-12-31";

/**
 * A player's season menu. Each row marks its own season's honours as recorded in the release
 * (alignment row 16, 13), so picking a rookie season keeps the later MVP and title marks. Only
 * the compared season is dated to the comparison's cutoff, as the card is (row 3, 75).
 * The player's best full season is marked; right after a pick moved the
 * player to one of them (owner, 2026-10-22), the menu opens by itself and says why.
 */
export function ComparePlayerSeasonPicker({ label, playerId, best, season, seasons, awards, championshipSeasons, recordedChampionships, beforeDate, align = "left", onSelect, ends }: {
  playerId?: string;
  /** The best full season (BPM, or Win Shares before 1973-74); null when none qualifies. */
  best?: BestSeason | null;
  /** Completed seasons: their awards mark them although announced after the cutoff (75). */
  ends?: SeasonEnds;
  label: string; season: string; seasons: string[]; awards: NonNullable<PlayerBio["reference"]>["awards"] | undefined;
  /** Titles before the cutoff, and every title in the release (older API: absent). */
  championshipSeasons: string[];
  recordedChampionships?: string[];
  align?: "left" | "right";
  beforeDate: string; onSelect: (season: string) => void;
}) {
  const markers = (entry: string) => {
    const codes = awards?.[entry] ?? [];
    const compared = entry === season;
    const cutoff = compared ? beforeDate : RECORDED;
    const mvp = codes.includes("MVP-1") && announcedBefore(entry, "MVP-1", cutoff, ends);
    const star = codes.includes("AS") && announcedBefore(entry, "AS", cutoff, ends);
    const champion = (compared ? championshipSeasons : recordedChampionships ?? championshipSeasons).includes(entry);
    const text = [mvp && "MVP winner", champion && "NBA champion", star && "All-Star"].filter(Boolean).join(", ");
    return { text, node: <span className="pvp-season-honor-icons" aria-hidden="true">
      {mvp && <span title="MVP winner"><Icon name="medal" size={14} /></span>}
      {champion && <span title="NBA champion"><Icon name="trophy" size={14} /></span>}
      {star && <span title="All-Star"><Icon name="star" size={14} /></span>}
    </span> };
  };
  const current = markers(season);
  const entries = [...new Set([season, ...seasons])].sort().reverse();
  const bestSeason = best && seasons.includes(best.season) ? best.season : null;
  const measure = basisLabel(best?.basis);
  // The pick that landed here, read once when this card mounts (it remounts per season).
  const [landed, setLanded] = useState(() => playerId ? freshLanding(playerId, season) : null);
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  // After a pick, open once the new card has faded in, so the menu follows the card rather than
  // arriving with it.
  useEffect(() => {
    if (!landed) return;
    const timer = setTimeout(() => setOpen(true), reduced ? 0 : LANDED_OPEN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [landed, reduced]);
  // The note belongs to that one opening: once the menu closes it is gone.
  // An open menu shows the compared season, not the top of a long career.
  const currentRef = useRef<HTMLSpanElement>(null);
  // Before the first paint, so the list never jumps from its top to the season.
  useLayoutEffect(() => {
    if (!open) return;
    const row = currentRef.current?.closest<HTMLElement>(".ui-menu-item"), panel = row?.closest<HTMLElement>(".ui-menu-panel");
    if (row && panel) panel.scrollTop = Math.max(0, row.offsetTop - (panel.clientHeight - row.offsetHeight) / 2);
  }, [open]);
  const onOpenChange = (next: boolean) => { setOpen(next); if (!next) { setLanded(null); if (playerId) settleLanding(playerId, season); } };
  // Only Best is marked: the latest season is always the menu's top row.
  const tag = (entry: string) => entry === bestSeason ? "Best" : null;
  const chipTag = season === bestSeason ? "Best" : null;
  return <Menu className="pvp-season-menu pvp-player-season-menu" align={align} open={open} onOpenChange={onOpenChange} renderTrigger={props => <MenuTrigger {...props} size="sm"
    title={chipTag ? `Best season by ${measure}, in a full season. Choose any season here.` : undefined}
    aria-label={`${label} season, ${season}${chipTag ? ", best season" : ""}${current.text ? `, ${current.text}` : ""}`}>
    <span className="pvp-season-row">{season}{chipTag && <span className="pvp-season-tag">{chipTag}</span>}{current.node}</span>
  </MenuTrigger>}>
    {landed && <p className="pvp-season-landed">{landed === "best"
      ? `Showing the best season by ${measure}. Pick another:`
      : `Showing the latest season. Pick another:`}</p>}
    {entries.map(entry => {
      const row = markers(entry);
      const entryTag = tag(entry);
      return <MenuItem key={entry} className={entry === season ? "pvp-season-current" : undefined} onClick={() => onSelect(entry)}
        label={<span className="pvp-season-row" ref={entry === season ? currentRef : undefined}><span>{entry}{!seasons.includes(entry) && " · No Games"}</span>
          {entryTag && <span className="pvp-season-tag">{entryTag}</span>}{row.node}
          <span className="sr-only">{row.text}{entry === season ? ", selected" : ""}</span></span>} />;
    })}
    <p className="pvp-season-legend"><span><Icon name="medal" size={14} /> MVP</span><span><Icon name="trophy" size={14} /> Title</span><span><Icon name="star" size={14} /> All-Star</span></p>
    {bestSeason && <p className="pvp-season-legend">Best: highest {measure} in a full season</p>}
  </Menu>;
}
