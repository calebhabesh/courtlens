"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { browserApi } from "@/lib/api";
import type { AnalyticsCatalog, AnalyticsSearch } from "@/lib/types";

export function PlayerSearch({ catalog }: { catalog: AnalyticsCatalog }) {
  const [query, setQuery] = useState("");
  const [season, setSeason] = useState(catalog.supported_seasons.at(-1) ?? "");
  const [results, setResults] = useState<AnalyticsSearch["players"]>([]);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("Search the published historical player directory.");

  async function search(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    const params = new URLSearchParams({ query, season, snapshotId: catalog.snapshot_id });
    try {
      const response = await fetch(`${browserApi}/api/analytics/players?${params}`);
      if (!response.ok) throw new Error("search failed");
      const body = (await response.json()) as AnalyticsSearch;
      setResults(body.players);
      setMessage(
        body.players.length ? `${body.players.length} matches` : `No players match “${query}”.`
      );
    } catch {
      setResults([]);
      setMessage("Search is unavailable. Check the API and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="analytics-search-card">
      <form className="analytics-search-form" onSubmit={search}>
        <label htmlFor="player-query">
          Player name
          <input
            id="player-query"
            minLength={1}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try LeBron James"
            required
            value={query}
          />
        </label>
        <label htmlFor="player-season">
          Season
          <select
            id="player-season"
            onChange={(event) => setSeason(event.target.value)}
            value={season}
          >
            {catalog.supported_seasons.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
        <button className="button button-dark" disabled={pending} type="submit">
          {pending ? "Searching…" : "Search"}
        </button>
      </form>
      <p className="form-hint" role="status">{message}</p>
      {results.length > 0 && (
        <ul className="analytics-search-results">
          {results.map((player) => (
            <li key={player.id}>
              <Link
                href={`/players/${player.id}?date=${catalog.default_replay_date}&snapshotId=${catalog.snapshot_id}`}
              >
                <span className="avatar" aria-hidden="true">
                  {player.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}
                </span>
                <span>
                  <strong>{player.name}</strong>
                  <small>Last archive row {player.last_observed_date}</small>
                </span>

              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
