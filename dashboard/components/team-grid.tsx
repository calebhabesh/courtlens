"use client";

import { useMemo, useState } from "react";
import catalog from "@/lib/team-branding.json";
import { foldedTeams, franchiseActive, teamEra } from "@/lib/team-era";
import { TeamLogo } from "./team-logo";
import { SearchField } from "./ui/input";

const TEAMS = [...catalog.teams].sort((a, b) => a.artwork_name.localeCompare(b.artwork_name));

export function teamDisplayName(team: string): string | null {
  return catalog.teams.find((entry) => entry.team_id === team || entry.tricode === team)?.artwork_name ?? null;
}

export interface TeamGridProps {
  selected?: string | null;
  onSelect: (teamId: string) => void;
  className?: string;
  /** `compact` is Databallr's dialog: logo and code only, five a row, no filter (row 13). */
  variant?: "default" | "compact";
  /** Show each franchise as it was this season (the Sonics for the Thunder in 2005-06). */
  season?: string | null;
}

/** Team picker (D17): all 30 franchise logos plus a name/tricode filter. Selection is always the franchise id. */
export function TeamGrid({ selected, onSelect, className = "", variant = "default", season }: TeamGridProps) {
  const [query, setQuery] = useState("");
  const tiles = useMemo(() => [...TEAMS.map((team) => {
    const era = teamEra(team.team_id, season);
    return { team_id: team.team_id, tricode: era?.code ?? team.tricode, name: era?.artwork_name ?? team.artwork_name,
      active: !season || franchiseActive(team.team_id, season) };
  }),
  // Teams that folded join the season they played (the 1946-47 Chicago Stags); their code is their id.
  ...(season ? foldedTeams(season).map(era => ({ team_id: era.code, tricode: era.code, name: era.artwork_name, active: true })) : [])]
    .sort((a, b) => a.name.localeCompare(b.name)), [season]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? tiles.filter((team) => team.name.toLowerCase().includes(needle) || team.tricode.toLowerCase().startsWith(needle)) : tiles;
  }, [query, tiles]);

  return (
    <div className={`team-grid ${className}`} data-variant={variant}>
      {variant === "default" && <SearchField value={query} onChange={(event) => setQuery(event.target.value)} onClear={() => setQuery("")}
        placeholder="Filter teams" aria-label="Filter teams" wrapperClassName="team-grid-search" />}
      {visible.length ? (
        <ul className="team-grid-list" aria-label="Teams">
          {visible.map((team) => (
            <li key={team.team_id}>
              <button type="button" className={`team-grid-tile ${selected === team.team_id ? "is-selected" : ""}`}
                aria-label={team.active ? team.name : `${team.name}: no team in ${season}`} aria-pressed={selected === team.team_id}
                disabled={!team.active} title={team.active ? undefined : `No team in ${season}`} onClick={() => onSelect(team.team_id)}>
                <TeamLogo team={team.team_id} season={season} size={40} />
                <span className="team-grid-code">{team.tricode}</span>
                {variant === "default" && <span className="team-grid-name">{team.name}</span>}
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="team-grid-empty">No team matches “{query.trim()}”.</p>}
    </div>
  );
}
