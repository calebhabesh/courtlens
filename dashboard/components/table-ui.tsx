"use client";

import type { IdentityDensity } from "@/lib/stats-presets";
import type { PlayerResearchItem } from "@/lib/types";
import { PlayerPortrait } from "./player-portrait";
import { TeamLogoStack } from "./team-logo";
import { Icon } from "./ui/icon";

/** Native buttons keep Enter/Space and focus semantics consistent across tables. */
export function SortHeader({ label, metric, active, direction, onSort, sortable = true,
  description, className = "", column }: {
  label: string; metric: string; active: boolean; direction: string;
  onSort: (metric: string) => void; sortable?: boolean; description?: string; className?: string;
  /** Column key for page-level header hints (Stats). */
  column?: string;
}) {
  return <th scope="col" className={className} data-column={column}
    aria-sort={active ? direction === "asc" ? "ascending" : "descending" : "none"}>
    {sortable ? <button type="button" className="table-sort-button" onClick={() => onSort(metric)}
      title={description ?? label} aria-label={`Sort by ${label}`}>
      {label}{active && <Icon name={direction === "asc" ? "up" : "down"} />}
    </button> : <span title={description ?? label}>{label}</span>}
  </th>;
}

/** Decorative repeat of the primary identity; never a metric or focus stop. */
export function GroupGuide({ mode, player }: { mode: IdentityDensity; player: PlayerResearchItem }) {
  if (mode === "photos") return <PlayerPortrait playerId={player.player_id} name={player.player_name}
    portraitUrl={player.portrait_url} size="sm" />;
  if (mode === "logos") return <TeamLogoStack teams={player.teams ?? []} decorative />;
  if (mode === "initials") return <span className="stats-guide-initials">{player.player_name.trim().split(/\s+/).map(word => word[0]).slice(0, 2).join("")}</span>;
  return null;
}
