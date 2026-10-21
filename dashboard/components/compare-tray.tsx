"use client";

import { useEffect, useState } from "react";
import { MAX_GRID_PLAYERS } from "@/lib/compare-grid";
import { queryLookup } from "@/lib/workbench-api";
import { buildLookupCacheKey, defaultLookupCache } from "@/lib/lookup-cache";
import { Button, ButtonLink, IconButton } from "./ui/kit";
import { PlayerPortrait } from "./player-portrait";
import type { PlayerResearchItem } from "@/lib/types";

export interface CompareTrayProps {
  selectedPlayers: PlayerResearchItem[];
  onRemovePlayer: (playerId: string) => void;
  onClearAll: () => void;
  context: {
    season: string;
    phase: string;
    before_date: string;
    window: string;
    release_id?: string;
  };
}

/** The Compare page for a selection: the duel for two players, the grid (first five) for more. */
export function compareHref(selectedPlayers: Pick<PlayerResearchItem, "player_id">[], context: CompareTrayProps["context"]): string {
  const playerA = selectedPlayers[0]?.player_id;
  const playerB = selectedPlayers[1]?.player_id;

  const queryParams = new URLSearchParams({
    season: context.season,
    phase: context.phase,
    beforeDate: context.before_date,
    window: context.window
  });
  if (context.release_id) {
    queryParams.set("releaseId", context.release_id);
  }
  // Three or more open the grid with the first five; two open the duel card (row 3, 64).
  if (selectedPlayers.length > 2) {
    queryParams.set("layout", "grid");
    queryParams.set("players", selectedPlayers.slice(0, MAX_GRID_PLAYERS).map((p) => p.player_id).join(","));
  } else {
    if (playerA) queryParams.set("playerA", playerA);
    if (playerB) queryParams.set("playerB", playerB);
  }

  return `/compare?${queryParams.toString()}`;
}

export function CompareTray({
  selectedPlayers,
  onRemovePlayer,
  onClearAll,
  context
}: CompareTrayProps) {
  if (selectedPlayers.length === 0) return null;

  const href = compareHref(selectedPlayers, context);
  const canCompare = selectedPlayers.length >= 2;

  return (
    <div
      className="compare-tray"
      role="region"
      aria-label="Comparison selection tray"
    >
      <div className="compare-tray-content">
        <div className="compare-tray-info">
          <span className="compare-tray-badge font-mono">
            {selectedPlayers.length}/8
          </span>
          <span className="compare-tray-label">
            Selected players
          </span>
        </div>

        <div className="compare-tray-chips">
          {selectedPlayers.map((player) => (
            <TrayChip key={player.player_id} player={player} context={context} onRemove={onRemovePlayer} />

          ))}
        </div>

        <div className="compare-tray-actions">
          <Button size="xs" onClick={onClearAll} title="Clear all selections">
            Clear
          </Button>
          <ButtonLink
            size="xs"
            variant="primary"
            href={href}
            onClick={event => { if (!canCompare) event.preventDefault(); }}
            aria-disabled={!canCompare}
            tabIndex={canCompare ? 0 : -1}
            title={canCompare ? selectedPlayers.length > MAX_GRID_PLAYERS ? `Compare the first ${MAX_GRID_PLAYERS} selected players (Z)` : "Compare the selected players (Z)" : "Select at least 2 players to compare"}
          >
            {canCompare ? selectedPlayers.length > MAX_GRID_PLAYERS ? `Compare first ${MAX_GRID_PLAYERS}` : `Compare (${selectedPlayers.length})` : "Select 2+ players"}
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}

export function TrayChip({ player, context, onRemove }: { player: PlayerResearchItem;
  context: CompareTrayProps["context"]; onRemove: (id: string) => void }) {
  const key = JSON.stringify([player.player_id, context]);
  const [resolved, setResolved] = useState<{ key: string; name: string; portrait?: string | null; error?: boolean } | null>(null);
  useEffect(() => {
    if (player.player_name !== "Selected player") return;
    const abort = new AbortController();
    const options = { query: player.player_id, releaseId: context.release_id, season: context.season,
      phase: context.phase, beforeDate: context.before_date, kinds: ["player" as const], limit: 1 };
    const cacheKey = buildLookupCacheKey(options);
    Promise.resolve(defaultLookupCache.get(cacheKey) ?? queryLookup({ ...options,
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(5000)]) })).then(response => {
      if (abort.signal.aborted) return;
      defaultLookupCache.set(cacheKey, response);
      const item = response.items.find(item => item.canonical_id === player.player_id);
      setResolved({ key, name: item?.display_name ?? "Unavailable player", portrait: item?.portrait_url, error: !item });
    }).catch(() => { if (!abort.signal.aborted) setResolved({ key, name: "Selection lookup unavailable", error: true }); });
    return () => abort.abort();
    // Serialized key includes the complete selection scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, player.player_name]);
  const identity = resolved?.key === key ? resolved : null;
  const name = player.player_name === "Selected player" ? identity?.name ?? "Resolving player…" : player.player_name;
  return <div className="compare-tray-item">
    <PlayerPortrait playerId={player.player_id} name={name} portraitUrl={identity?.portrait ?? player.portrait_url} size="sm" />
    <span className="compare-tray-chip-name" role={identity?.error ? "status" : undefined}>{name}</span>
    <IconButton icon="close" label={`Remove ${name} from compare tray`} title="Remove player" onClick={() => onRemove(player.player_id)} />
  </div>;
}
