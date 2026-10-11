"use client";

import { useMemo, useState, type CSSProperties } from "react";
import catalog from "@/lib/team-branding.json";
import { teamAccent } from "@/lib/team-colors";
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
}

/** Team picker (D17): all 30 franchise logos plus a name/tricode filter. */
export function TeamGrid({ selected, onSelect, className = "" }: TeamGridProps) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? TEAMS.filter((team) => team.artwork_name.toLowerCase().includes(needle) || team.tricode.toLowerCase().startsWith(needle)) : TEAMS;
  }, [query]);

  return (
    <div className={`team-grid ${className}`}>
      <SearchField value={query} onChange={(event) => setQuery(event.target.value)} onClear={() => setQuery("")}
        placeholder="Filter teams" aria-label="Filter teams" wrapperClassName="team-grid-search" />
      {visible.length ? (
        <ul className="team-grid-list" aria-label="Teams">
          {visible.map((team) => (
            <li key={team.team_id}>
              <button type="button" className={`team-grid-tile ${selected === team.team_id ? "is-selected" : ""}`}
                aria-label={team.artwork_name} aria-pressed={selected === team.team_id} onClick={() => onSelect(team.team_id)}
                style={{ "--team-color": teamAccent(team.team_id) ?? "var(--color-text-tertiary)" } as CSSProperties}>
                <TeamLogo team={team.team_id} size={40} />
                <span className="team-grid-code">{team.tricode}</span>
                <span className="team-grid-name">{team.artwork_name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="team-grid-empty">No team matches “{query.trim()}”.</p>}
    </div>
  );
}
