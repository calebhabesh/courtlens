"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { EntityField } from "./entity-picker";
import { PlayerPortrait } from "./player-portrait";
import { Icon } from "./ui/icon";
import { IconButton } from "./ui/kit";
import { PlayerSilhouette } from "./player-silhouette";
import type { CompareSelection } from "./compare-player-slot";

/**
 * One side of the card before a pair resolves (alignment row 3, 24): a grey avatar with a plus,
 * or the player already chosen for this side while the other is still open. Pressing the tile
 * opens search in place, as the change-player icon does on a filled card.
 */
export function CompareEmptySlot({ side, selection, onPick, label: named, excludedIds = [], onDismiss }: {
  side: "a" | "b";
  /** Closes an optional slot (the grid's add tile, 67); the duel's sides have none. */
  onDismiss?: () => void;
  /** Players already on the card: never offered again. */
  excludedIds?: string[];
  /** The slot's name for readers and its search field; the duel's sides default to Player A/B. */
  label?: string;
  selection: CompareSelection | null;
  onPick: (selection: CompareSelection) => void;
}) {
  const params = useSearchParams();
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null), photoRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (searching) searchRef.current?.querySelector<HTMLInputElement>('[role="combobox"]')?.focus(); }, [searching]);
  const label = named ?? `Player ${side.toUpperCase()}`;
  return <div className="pvp-slot pvp-fade" data-identity={side} data-empty={selection ? undefined : true}>
    <div className="pvp-photo-frame">
      <button ref={photoRef} type="button" className="pvp-photo pvp-photo-empty" aria-expanded={searching}
        aria-label={selection ? `Change ${label}, ${selection.name}` : named ?? `Add ${label}`} onClick={() => setSearching(open => !open)}>
        {selection
          ? <PlayerPortrait playerId={selection.id} name={selection.name} size="xl" className="pvp-portrait" />
          : <PlayerSilhouette className="pvp-portrait" />}
        <span className={selection ? "pvp-change" : "pvp-add"} aria-hidden="true"><Icon name={selection ? "user-edit" : "plus"} size={selection ? 16 : 20} /></span>
      </button>
      {onDismiss && <span className="pvp-grid-remove"><IconButton size="sm" variant="secondary" icon="close" label={`Close ${named ?? label}`} onClick={onDismiss} /></span>}
    </div>
    {searching
      ? <div className="pvp-search" ref={searchRef}>
          <EntityField label={label} value="" excludedIds={excludedIds} portalDropdown openOnFocus={false} dropdownMinWidth={440} releaseId={params.get("releaseId") || params.get("release_id")} season={params.get("season")} phase={params.get("phase")} beforeDate={params.get("beforeDate") || params.get("before_date")}
            onChange={(id, items) => { if (id && items[0]) { setSearching(false); onPick({ id, name: items[0].display_name });
              // The search unmounts: keep focus on this slot rather than dropping it to the page (72).
              requestAnimationFrame(() => photoRef.current?.focus({ preventScroll: true })); } }} />
        </div>
      : <div className="pvp-who">
          {selection ? <span className="pvp-name">{selection.name}</span> : <span className="pvp-dnp">{named ?? `Add ${label}`}</span>}
        </div>}
  </div>;
}
