/** Finish plan F04: a signed-in account as the dashboard's account proxy reports it. */
export interface AccountUser {
  id: string;
  name: string;
  /** Null for the shared demo account. */
  email: string | null;
  is_demo: boolean;
}

/** A favourite with its latest season and team, for the season photo and logo. */
export interface FavoritePlayer {
  player_id: string;
  name: string | null;
  season: string | null;
  team: string | null;
}

export interface FavoritesResponse {
  player_ids: string[];
  players: FavoritePlayer[];
  limit: number;
  /** True on the demo account: one list shared by every visitor, reset nightly. */
  shared: boolean;
}
