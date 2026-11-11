"use client";

import Link from "next/link";
import { Button, IconButton } from "../ui/kit";
import { PlayerAvatar } from "../ui/identity";
import { TeamLogo } from "../team-logo";
import { seasonEra } from "../../lib/portrait-source";
import { useAccount } from "../../lib/account-context";

/**
 * Finish plan F04, alignment row 0: Databallr's Favorite Players list. Each player shows the
 * photo and team logo of their latest season (a favourite isn't tied to one season), and links to
 * the player page. The header popover and the phone drawer share this list.
 */
export function FavoritePlayersList({ onNavigate }: { onNavigate?: () => void }) {
  const { status, user, favoritePlayers, favorites, sharedFavorites, toggleFavorite, openSignIn, signInDemo } = useAccount();

  if (status === "loading") return <p className="favorite-players-note">Loading…</p>;
  if (status === "signed-out") {
    return (
      <div className="favorite-players-signed-out">
        <p>Keep a list of favourite players and filter Stats to them.</p>
        <div className="favorite-players-actions">
          <Button variant="primary" size="sm" onClick={() => { onNavigate?.(); openSignIn(); }}>Sign in</Button>
          <Button variant="secondary" size="sm" icon="user" onClick={() => { onNavigate?.(); void signInDemo().catch(() => openSignIn()); }}>
            Use the demo account
          </Button>
        </div>
      </div>
    );
  }
  // Names arrive with the server's list; an optimistic add shows once the write returns.
  const rows = favoritePlayers.filter(player => favorites.includes(player.player_id));
  return (
    <div className="favorite-players">
      {sharedFavorites && <p className="favorite-players-note">{user?.name}: one list shared by every visitor, reset each night.</p>}
      {rows.length === 0 ? (
        <p className="favorite-players-empty">No favourites yet. Use the star on a player page or in Stats.</p>
      ) : (
        <ul className="favorite-players-list" aria-label="Favorite players">
          {rows.map(player => {
            const name = player.name ?? `Player ${player.player_id}`;
            return (
              <li key={player.player_id} className="favorite-players-row">
                <Link href={`/players/${player.player_id}`} className="favorite-players-link" onClick={onNavigate}>
                  {/* No logo badge on the photo: the logo sits beside the team code below. */}
                  <PlayerAvatar playerId={player.player_id} name={name} size="sm"
                    era={seasonEra(player.season, player.team)} />
                  <span className="favorite-players-text">
                    <span className="favorite-players-name">{name}</span>
                    {(player.team || player.season) && (
                      <span className="favorite-players-meta">
                        {player.team && <><TeamLogo team={player.team} size={14} season={player.season} />{player.team}</>}
                        {player.team && player.season && <span aria-hidden="true">·</span>}
                        {player.season}
                      </span>
                    )}
                  </span>
                </Link>
                <IconButton size="xs" icon="close" label={`Remove ${name} from favorites`}
                  onClick={() => void toggleFavorite(player.player_id)} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
