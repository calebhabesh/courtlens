"use client";

import { FormEvent, useState } from "react";
import { browserApi } from "@/lib/api";

type SearchPlayer = { id: number; name: string; team: string | null; listed_position: string | null };
type PlayerForm = {
  player: { id: number; name: string };
  calculated_as_of: string;
  games_played: number;
  avg_minutes: number | null;
  fantasy_points_per_game: number | null;
  fantasy_points_per_minute: number | null;
  data_completeness: number;
  methodology: string;
  scoring_rules_version: string;
  games: Array<{
    source_stat_id: number;
    game_id: number;
    tipoff_utc: string;
    minutes: number | null;
    fantasy_points: number;
    lineage_url: string;
    stats: { points: number; rebounds: number; assists: number; steals: number; blocks: number };
  }>;
};

export function PlayerSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchPlayer[]>([]);
  const [form, setForm] = useState<PlayerForm | null>(null);
  const [message, setMessage] = useState("Search the loaded, source-backed player directory.");

  async function search(event: FormEvent) {
    event.preventDefault();
    setForm(null);
    try {
      const response = await fetch(`${browserApi}/api/players?query=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error("search failed");
      const players = (await response.json()) as SearchPlayer[];
      setResults(players);
      setMessage(players.length ? `${players.length} matches` : "No matching loaded players.");
    } catch {
      setMessage("The API is unavailable. Start the CourtLoad stack and try again.");
    }
  }

  async function selectPlayer(player: SearchPlayer) {
    setMessage(`Loading ${player.name}…`);
    const response = await fetch(`${browserApi}/api/players/${player.id}/form?window=10`);
    if (!response.ok) {
      setMessage("Recent form is unavailable for this player.");
      return;
    }
    setForm((await response.json()) as PlayerForm);
    setMessage("Only games strictly before the displayed cutoff are included.");
  }

  return (
    <div className="player-browser">
      <div className="search-panel">
        <form onSubmit={search}>
          <label htmlFor="player-query">Player name</label>
          <div className="search-row">
            <input
              id="player-query"
              minLength={1}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try Maya or a loaded surname"
              required
              value={query}
            />
            <button className="button button-dark" type="submit">Search</button>
          </div>
        </form>
        <p className="form-hint" role="status">{message}</p>
        <div className="search-results">
          {results.map((player) => (
            <button key={player.id} onClick={() => selectPlayer(player)} type="button">
              <span className="avatar">{player.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>
              <span><strong>{player.name}</strong><small>{player.team ?? "No team"} · {player.listed_position ?? "—"}</small></span>
              <span aria-hidden="true">→</span>
            </button>
          ))}
        </div>
      </div>
      <div className="form-panel">
        {form ? (
          <>
            <div className="player-title">
              <div>
                <p className="kicker">Recent production</p>
                <h2>{form.player.name}</h2>
              </div>
              <span className="sample-tag">n={form.games_played}</span>
            </div>
            <div className="mini-metrics">
              <div><strong>{form.fantasy_points_per_game ?? "—"}</strong><span>FP / game</span></div>
              <div><strong>{form.avg_minutes ?? "—"}</strong><span>minutes</span></div>
              <div><strong>{Math.round(form.data_completeness * 100)}%</strong><span>window filled</span></div>
            </div>
            <div className="game-log">
              {form.games.map((game) => (
                <div key={game.game_id}>
                  <time>{new Date(game.tipoff_utc).toLocaleDateString("en-CA")}</time>
                  <span>{game.stats.points} PTS · {game.stats.rebounds} REB · {game.stats.assists} AST</span>
                  <strong>{game.fantasy_points} FP</strong>
                  <a href={`${browserApi}${game.lineage_url}`} rel="noreferrer" target="_blank">trace ↗</a>
                </div>
              ))}
            </div>
            <p className="method-note compact">{form.methodology}</p>
            <p className="trace-note">Rules {form.scoring_rules_version.slice(0, 8)} · each trace exposes lineage metadata, never raw payloads.</p>
          </>
        ) : (
          <div className="empty-state tall">
            <span className="empty-icon">↗</span>
            <h3>Select a player</h3>
            <p>Recent form will show the scoring trace, sample size, and explicit as-of cutoff.</p>
          </div>
        )}
      </div>
    </div>
  );
}
