"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { HotkeysModal } from "./hotkeys-modal";
import { Icon } from "./ui/icon";
import { Modal } from "./ui/modal";
import { TeamLogo } from "./team-logo";
import { NBA_TEAMS } from "@/lib/stats-presets";

/** Databallr's help row under the page title: how-to, glossary and hotkeys. */
export function StatsHelpRow() {
  const [howToOpen, setHowToOpen] = useState(false);
  const [hotkeysOpen, setHotkeysOpen] = useState(false);
  return (
    <div className="stats-help-row" role="group" aria-label="Page help">
      <button type="button" className="stats-help-button" onClick={() => setHowToOpen(true)}>
        <Icon name="help" size={14} />How to Use This Page
      </button>
      <Link className="stats-help-button" href="/stats/glossary"><Icon name="page" size={14} />Stats Glossary</Link>
      <button type="button" className="stats-help-button" onClick={() => setHotkeysOpen(true)}>
        <Icon name="keyboard" size={14} />Hotkeys
      </button>
      <Modal isOpen={howToOpen} onClose={() => setHowToOpen(false)} title="How to use this page" className="stats-how-to">
        <ul className="stats-how-to-list">
          <li>Pick a season, Regular or Playoffs, and optionally a team. Through and Window narrow the dates counted.</li>
          <li>Views switch the column set. Add View saves your own; Manage reorders, edits or sets a default.</li>
          <li>Per Game, Per 36 and Totals change how counting stats are expressed.</li>
          <li>Small numbers under each value are league percentiles among qualified players; Rules above the table gives the cutoff.</li>
          <li>Hover or focus a row to preview a player. Use + to add players to a comparison.</li>
          <li>Click a column header to sort. The filter button sets minimum games and minutes.</li>
        </ul>
      </Modal>
      <HotkeysModal isOpen={hotkeysOpen} onClose={() => setHotkeysOpen(false)} />
    </div>
  );
}

/** Replace scope-row URL filters; any change returns to the first page. */
function useScopeFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const set = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("cursor");
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value); else params.delete(key);
    }
    router.push(`${pathname}?${params}`);
  };
  return { searchParams, set };
}

/** Databallr's "Select Team": a dialog with a grid of the 30 team logos. */
export function StatsTeamSelect() {
  const { searchParams, set } = useScopeFilter();
  const [open, setOpen] = useState(false);
  const team = searchParams.get("teamId") || searchParams.get("team_id") || "";
  const selected = NBA_TEAMS.find(entry => entry.tricode === team);
  const choose = (tricode: string | null) => { setOpen(false); set({ teamId: tricode, team_id: null }); };
  return (
    <>
      <button type="button" className={`stats-team-button ${selected ? "is-selected" : ""}`} onClick={() => setOpen(true)}
        aria-haspopup="dialog" aria-label={selected ? `Team: ${selected.name}. Change team` : "Select Team"}>
        {selected ? <><TeamLogo team={selected.tricode} size={20} />{selected.tricode}</> : "Select Team"}
      </button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Select Team" description="30 NBA teams" className="stats-team-dialog">
        <div className="stats-team-grid" role="group" aria-label="NBA teams">
          {NBA_TEAMS.map(entry => (
            <button key={entry.tricode} type="button" className="stats-team-option" aria-pressed={entry.tricode === team}
              aria-label={entry.name} onClick={() => choose(entry.tricode)}>
              <TeamLogo team={entry.tricode} size={40} />
              <span>{entry.tricode}</span>
            </button>
          ))}
        </div>
        {selected && <button type="button" className="stats-team-clear" onClick={() => choose(null)}>Show all teams</button>}
      </Modal>
    </>
  );
}

const POSITIONS = [
  { value: "G", label: "Guards" }, { value: "F", label: "Forwards" }, { value: "C", label: "Centers" }
] as const;

/**
 * Position chips. The free NBA roster index lists G, F and C (G-F counts for both), so these stand
 * in for Databallr's five positions; listings are current, not backdated to past seasons.
 */
export function StatsPositionChips() {
  const { searchParams, set } = useScopeFilter();
  const active = new Set((searchParams.get("positions") ?? "").split(",").filter(Boolean));
  const toggle = (value: string) => {
    const next = new Set(active);
    if (next.has(value)) next.delete(value); else next.add(value);
    set({ positions: POSITIONS.map(p => p.value).filter(p => next.has(p)).join(",") || null });
  };
  return (
    <div className="stats-position-chips" role="group" aria-label="Positions"
      title="NBA listed roster positions (G, F, C) as currently listed; hybrid listings such as G-F match both. Not backdated to past seasons.">
      {POSITIONS.map(position => (
        <button key={position.value} type="button" className="stats-position-chip" aria-pressed={active.has(position.value)}
          aria-label={position.label} onClick={() => toggle(position.value)}>{position.value}</button>
      ))}
    </div>
  );
}
