"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { HotkeysModal } from "./hotkeys-modal";
import { Icon } from "./ui/icon";
import { Modal } from "./ui/modal";
import { Select } from "./ui/select";
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

/** Team filter in the scope row; the URL keeps the analytical query as the single source of truth. */
export function StatsTeamSelect() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const team = searchParams.get("teamId") || searchParams.get("team_id") || "";
  return (
    <Select className="stats-team-select" value={team} aria-label="Filter by NBA team"
      onChange={(event) => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("team_id");
        params.delete("cursor");
        if (event.target.value) params.set("teamId", event.target.value); else params.delete("teamId");
        router.push(`${pathname}?${params}`);
      }}>
      <option value="">Select Team</option>
      {NBA_TEAMS.map((t) => <option key={t.tricode} value={t.tricode}>{t.tricode} · {t.name}</option>)}
    </Select>
  );
}
