"use client";
import { PlayerIdentity, teamStyle } from "./ui/identity";
import { Icon } from "./ui/icon";
import type { PlayerComparisonResponse } from "@/lib/types";

export function CompareIdentityCard({ player, side }: { player?: PlayerComparisonResponse["player_a"]; side: "a" | "b" }) {
  return <div className="pc04-identity-card" data-identity={side} data-placeholder={!player || undefined} style={teamStyle(player?.teams[0])}>
    <span className="pc04-identity-label">Player {side.toUpperCase()}</span>
    {player ? <><span className="pc04-games-badge">{player.games_played} GP</span><PlayerIdentity playerId={player.id} name={player.name} team={player.teams[0]} size="xl" href={`/players/${player.id}`} subtitle={`${player.total_minutes == null ? "—" : Math.round(player.total_minutes).toLocaleString("en-US")} minutes`} /></> : <><span className="pc04-silhouette" aria-hidden="true"><Icon name="person" size={20} /></span><strong>Choose a player</strong></>}
  </div>;
}
