"use client";

import { useState } from "react";
import catalog from "@/lib/team-branding.json";
import { teamEra } from "@/lib/team-era";
import { TeamGrid, teamDisplayName } from "../team-grid";
import { TeamLogo } from "../team-logo";
import { Button } from "../ui/kit";
import { Modal } from "../ui/modal";

/*
 * The site's team picker (WOWY, Contracts, Stat Line Shift; owner RD04 round 2: no team dropdowns): a kit button showing the
 * chosen team's logo and code, opening Databallr's "Select Team" dialog with the compact `TeamGrid` and a Clear Team button.
 * Value and change are the season's team code (what Research feeds carry).
 */

/** A franchise id from the grid → that season's code (the Sonics' SEA in 2005-06, OKC after). */
export function teamCode(teamId: string, season?: string | null): string {
  return teamEra(teamId, season)?.code ?? catalog.teams.find(t => t.team_id === teamId)?.tricode ?? teamId;
}
const teamIdOf = (code: string, season?: string | null) => catalog.teams.find(t => t.tricode === code || t.team_id === code)?.team_id ?? teamEra(code, season)?.franchise_id ?? code;

export function TeamPicker({ value, onChange, season, size = "md" }: { value: string | null; onChange: (code: string | null) => void; season?: string | null; size?: "sm" | "md" | "lg" }) {
  const [open, setOpen] = useState(false);
  const name = value ? teamDisplayName(value) ?? value : null;
  const choose = (code: string | null) => { onChange(code); setOpen(false); };
  return <>
    <Button size={size} iconAfter="chevron-down" aria-haspopup="dialog" aria-label={value ? `Team, ${name}. Change team` : "Select Team"} data-selected={value ? "true" : undefined}
      onClick={() => setOpen(true)}>
      {value ? <><TeamLogo team={value} season={season ?? undefined} size={20} />{value}</> : "Select Team"}
    </Button>
    <Modal isOpen={open} onClose={() => setOpen(false)} title="Select Team" description="30 NBA teams" className="rs-team-modal">
      <TeamGrid variant="compact" season={season} selected={value ? teamIdOf(value, season) : null}
        onSelect={id => { const code = teamCode(id, season); choose(code === value ? null : code); }} />
      {value && <Button size="md" stretch className="rs-team-clear" onClick={() => choose(null)}>Show All Teams</Button>}
    </Modal>
  </>;
}
