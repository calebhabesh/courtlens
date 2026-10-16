"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { EntityField } from "./entity-picker";
import { PlayerPortrait } from "./player-portrait";
import { Icon } from "./ui/icon";
import type { CompareSelection } from "./compare-player-slot";

/**
 * One side of the card before a pair resolves (alignment row 3, 24): a grey avatar with a plus,
 * or the player already chosen for this side while the other is still open. Pressing the tile
 * opens search in place, as the change-player icon does on a filled card.
 */
export function CompareEmptySlot({ side, selection, onPick }: {
  side: "a" | "b";
  selection: CompareSelection | null;
  onPick: (selection: CompareSelection) => void;
}) {
  const params = useSearchParams();
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (searching) searchRef.current?.querySelector<HTMLInputElement>('[role="combobox"]')?.focus(); }, [searching]);
  const label = `Player ${side.toUpperCase()}`;
  return <div className="pvp-slot pvp-fade" data-identity={side} data-empty={selection ? undefined : true}>
    <div className="pvp-photo-frame">
      <button type="button" className="pvp-photo pvp-photo-empty" aria-expanded={searching}
        aria-label={selection ? `Change ${label}, ${selection.name}` : `Add ${label}`} onClick={() => setSearching(open => !open)}>
        {selection
          ? <PlayerPortrait playerId={selection.id} name={selection.name} size="xl" className="pvp-portrait" />
          : <span className="pvp-silhouette"><Icon name="person" size={20} /></span>}
        <span className={selection ? "pvp-change" : "pvp-add"} aria-hidden="true"><Icon name={selection ? "user-edit" : "plus"} size={selection ? 16 : 20} /></span>
      </button>
    </div>
    {searching
      ? <div className="pvp-search" ref={searchRef}>
          <EntityField label={label} value="" portalDropdown dropdownMinWidth={440} releaseId={params.get("releaseId") || params.get("release_id")} season={params.get("season")} phase={params.get("phase")} beforeDate={params.get("beforeDate") || params.get("before_date")}
            onChange={(id, items) => { if (id && items[0]) { setSearching(false); onPick({ id, name: items[0].display_name }); } }} />
        </div>
      : <div className="pvp-who">
          {selection ? <span className="pvp-name">{selection.name}</span> : <span className="pvp-dnp">Add {label}</span>}
        </div>}
  </div>;
}
