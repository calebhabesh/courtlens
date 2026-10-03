"use client";

import Link from "next/link";
import { PlayerPortrait } from "./player-portrait";
import type { PlayerResearchItem } from "@/lib/types";

interface CompareTrayProps {
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

export function CompareTray({
  selectedPlayers,
  onRemovePlayer,
  onClearAll,
  context
}: CompareTrayProps) {
  if (selectedPlayers.length === 0) return null;

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
  if (playerA) queryParams.set("playerA", playerA);
  if (playerB) queryParams.set("playerB", playerB);
  if (selectedPlayers.length > 2) {
    queryParams.set("players", selectedPlayers.map((p) => p.player_id).join(","));
  }

  const compareHref = `/compare?${queryParams.toString()}`;
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
            Selected for comparison
          </span>
        </div>

        <div className="compare-tray-chips">
          {selectedPlayers.map((player) => (
            <div key={player.player_id} className="compare-tray-chip">
              <PlayerPortrait
                playerId={player.player_id}
                name={player.player_name}
                portraitUrl={player.portrait_url}
                size="sm"
              />
              <span className="compare-tray-chip-name">{player.player_name}</span>
              <button
                type="button"
                className="compare-tray-chip-remove"
                onClick={() => onRemovePlayer(player.player_id)}
                aria-label={`Remove ${player.player_name} from compare tray`}
                title="Remove player"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="compare-tray-actions">
          <button
            type="button"
            className="button button-small"
            onClick={onClearAll}
            title="Clear all selections"
          >
            Clear
          </button>
          <Link
            href={compareHref}
            className={`button button-small button-primary ${!canCompare ? "button-disabled" : ""}`}
            aria-disabled={!canCompare}
            tabIndex={canCompare ? 0 : -1}
            title={canCompare ? "Open comparison view (Z)" : "Select at least 2 players to compare"}
          >
            {canCompare ? `Compare (${selectedPlayers.length}) →` : "Select 2+ players"}
          </Link>
        </div>
      </div>
    </div>
  );
}
