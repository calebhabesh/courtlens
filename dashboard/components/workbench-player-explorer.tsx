"use client";

import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { PlayerPortrait } from "./player-portrait";
import { saveInvestigation } from "@/lib/workbench-api";
import type { PlayerResearchResponse } from "@/lib/types";

interface WorkbenchPlayerExplorerProps {
  data: PlayerResearchResponse;
  currentSortMetric?: string;
  currentSortDirection?: string;
}

const SORTABLE_METRICS = [
  { key: "pts", label: "PTS" },
  { key: "pts_per_game", label: "PPG" },
  { key: "min", label: "MIN" },
  { key: "min_per_game", label: "MPG" },
  { key: "reb_total", label: "REB" },
  { key: "ast", label: "AST" },
  { key: "stl", label: "STL" },
  { key: "blk", label: "BLK" },
  { key: "ts_pct", label: "TS%" },
  { key: "efg_pct", label: "eFG%" },
  { key: "fg_pct", label: "FG%" },
  { key: "fg3_pct", label: "3P%" },
  { key: "ft_pct", label: "FT%" }
];

export function WorkbenchPlayerExplorer({
  data,
  currentSortMetric = "pts",
  currentSortDirection = "desc"
}: WorkbenchPlayerExplorerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const query = data.query;
  const items = data.items;

  const updateParam = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    for (const [key, value] of Object.entries(updates)) {
      if (value !== null && value !== "") {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }
    // Reset cursor when query changes
    if (!updates.cursor) {
      params.delete("cursor");
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleSort = (metricKey: string) => {
    if (metricKey === currentSortMetric) {
      // Toggle direction
      updateParam({ sortDirection: currentSortDirection === "desc" ? "asc" : "desc" });
    } else {
      updateParam({ sortMetric: metricKey, sortDirection: "desc" });
    }
  };

  const handleSaveInvestigation = async () => {
    const title = window.prompt("Name this investigation finding:", `Player Research: ${query.season} ${query.sort_metric.toUpperCase()}`);
    if (!title?.trim()) return;

    setSaving(true);
    setSaveSuccess(null);
    try {
      const saved = await saveInvestigation(title.trim(), query as unknown as Record<string, unknown>);
      setSaveSuccess(`Investigation saved with manifest SHA-256: ${saved.manifest_sha256.slice(0, 8)}...`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save investigation");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="player-explorer-container">
      {/* Search and Filters Toolbar */}
      <div className="filter-toolbar">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const input = form.elements.namedItem("name") as HTMLInputElement;
            updateParam({ name: input.value });
          }}
          style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", flex: 1 }}
        >
          <div className="filter-group" style={{ flex: 1, minWidth: "220px" }}>
            <label htmlFor="player-query">Player name</label>
            <input
              id="player-query"
              name="name"
              type="text"
              defaultValue={searchParams?.get("name") || ""}
              placeholder="Search by name (e.g. Siakam, Barnes, LeBron)..."
            />
          </div>
          <button type="submit" className="button button-primary">
            Search
          </button>
        </form>

        <div className="filter-group">
          <label htmlFor="min-games">Min GP</label>
          <input
            id="min-games"
            type="number"
            min="0"
            max="82"
            style={{ width: "80px" }}
            defaultValue={searchParams?.get("minGames") || ""}
            onBlur={(e) => updateParam({ minGames: e.target.value || null })}
            onKeyDown={(e) => {
              if (e.key === "Enter") updateParam({ minGames: e.currentTarget.value || null });
            }}
          />
        </div>

        <div className="filter-group">
          <label htmlFor="min-mpg">Min MPG</label>
          <input
            id="min-mpg"
            type="number"
            min="0"
            max="48"
            style={{ width: "80px" }}
            defaultValue={searchParams?.get("minAvgMinutes") || ""}
            onBlur={(e) => updateParam({ minAvgMinutes: e.target.value || null })}
            onKeyDown={(e) => {
              if (e.key === "Enter") updateParam({ minAvgMinutes: e.currentTarget.value || null });
            }}
          />
        </div>

        <div className="filter-group">
          <label htmlFor="sort-metric-select">Sort By</label>
          <select
            id="sort-metric-select"
            value={currentSortMetric}
            onChange={(e) => handleSort(e.target.value)}
          >
            {SORTABLE_METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label} ({currentSortDirection.toUpperCase()})
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleSaveInvestigation}
          disabled={saving}
          className="button"
          title="Save this analysis and cryptographic finding"
        >
          {saving ? "Saving…" : "💾 Save Analysis"}
        </button>
      </div>

      {saveSuccess && (
        <div className="notice-box" style={{ borderLeftColor: "var(--positive)", marginBottom: "1rem" }}>
          <strong>Saved:</strong> {saveSuccess}. Inspect under <Link href="/investigations" className="text-accent underline">Saved Investigations</Link>.
        </div>
      )}

      {/* Results Meta Banner */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
        <span className="text-xs text-muted font-mono">
          Showing {items.length} of {data.total_eligible_players} eligible players · Sorted by {currentSortMetric.toUpperCase()} ({currentSortDirection})
        </span>
        <span className="text-xs text-muted">
          Click table headers to sort
        </span>
      </div>

      {/* Main Research Table */}
      <div className="table-wrapper">
        <table className="data-table" aria-label="Player research explorer">
          <thead>
            <tr>
              <th style={{ width: "35px" }}>#</th>
              <th>Player</th>
              <th>Team(s)</th>
              <th
                className="sortable num"
                onClick={() => handleSort("gp")}
                aria-sort={currentSortMetric === "gp" ? (currentSortDirection === "asc" ? "ascending" : "descending") : "none"}
              >
                GP {currentSortMetric === "gp" ? (currentSortDirection === "asc" ? "▲" : "▼") : ""}
              </th>
              <th
                className="sortable num"
                onClick={() => handleSort("min")}
                aria-sort={currentSortMetric === "min" ? (currentSortDirection === "asc" ? "ascending" : "descending") : "none"}
              >
                MIN {currentSortMetric === "min" ? (currentSortDirection === "asc" ? "▲" : "▼") : ""}
              </th>
              <th
                className="sortable num"
                onClick={() => handleSort("min_per_game")}
                aria-sort={currentSortMetric === "min_per_game" ? (currentSortDirection === "asc" ? "ascending" : "descending") : "none"}
              >
                MPG {currentSortMetric === "min_per_game" ? (currentSortDirection === "asc" ? "▲" : "▼") : ""}
              </th>
              <th
                className="sortable num"
                onClick={() => handleSort("pts")}
                aria-sort={currentSortMetric === "pts" ? (currentSortDirection === "asc" ? "ascending" : "descending") : "none"}
              >
                PTS {currentSortMetric === "pts" ? (currentSortDirection === "asc" ? "▲" : "▼") : ""}
              </th>
              <th
                className="sortable num"
                onClick={() => handleSort("pts_per_game")}
                aria-sort={currentSortMetric === "pts_per_game" ? (currentSortDirection === "asc" ? "ascending" : "descending") : "none"}
              >
                PPG {currentSortMetric === "pts_per_game" ? (currentSortDirection === "asc" ? "▲" : "▼") : ""}
              </th>
              <th
                className="sortable num"
                onClick={() => handleSort("reb_total")}
                aria-sort={currentSortMetric === "reb_total" ? (currentSortDirection === "asc" ? "ascending" : "descending") : "none"}
              >
                REB {currentSortMetric === "reb_total" ? (currentSortDirection === "asc" ? "▲" : "▼") : ""}
              </th>
              <th
                className="sortable num"
                onClick={() => handleSort("ast")}
                aria-sort={currentSortMetric === "ast" ? (currentSortDirection === "asc" ? "ascending" : "descending") : "none"}
              >
                AST {currentSortMetric === "ast" ? (currentSortDirection === "asc" ? "▲" : "▼") : ""}
              </th>
              <th
                className="sortable num"
                onClick={() => handleSort("stl")}
                aria-sort={currentSortMetric === "stl" ? (currentSortDirection === "asc" ? "ascending" : "descending") : "none"}
              >
                STL {currentSortMetric === "stl" ? (currentSortDirection === "asc" ? "▲" : "▼") : ""}
              </th>
              <th
                className="sortable num"
                onClick={() => handleSort("blk")}
                aria-sort={currentSortMetric === "blk" ? (currentSortDirection === "asc" ? "ascending" : "descending") : "none"}
              >
                BLK {currentSortMetric === "blk" ? (currentSortDirection === "asc" ? "▲" : "▼") : ""}
              </th>
              <th
                className="sortable num"
                onClick={() => handleSort("ts_pct")}
                aria-sort={currentSortMetric === "ts_pct" ? (currentSortDirection === "asc" ? "ascending" : "descending") : "none"}
              >
                TS% {currentSortMetric === "ts_pct" ? (currentSortDirection === "asc" ? "▲" : "▼") : ""}
              </th>
              <th
                className="sortable num"
                onClick={() => handleSort("efg_pct")}
                aria-sort={currentSortMetric === "efg_pct" ? (currentSortDirection === "asc" ? "ascending" : "descending") : "none"}
              >
                eFG% {currentSortMetric === "efg_pct" ? (currentSortDirection === "asc" ? "▲" : "▼") : ""}
              </th>
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={15} style={{ textAlign: "center", padding: "3rem" }} className="text-muted">
                  No players matched the current query and filters.
                </td>
              </tr>
            ) : (
              items.map((p, idx) => (
                <tr key={p.player_id}>
                  <td className="font-mono text-muted text-xs">{idx + 1}</td>
                  <td>
                    <div className="player-cell">
                      <PlayerPortrait
                        playerId={p.player_id}
                        name={p.player_name}
                        portraitUrl={p.portrait_url}
                        size="sm"
                      />
                      <Link
                        href={`/players/${p.player_id}?season=${query.season}&phase=${query.phase}&beforeDate=${query.before_date}&window=${query.window}`}
                        className="player-cell-name text-accent font-semibold"
                      >
                        {p.player_name}
                      </Link>
                    </div>
                  </td>
                  <td>
                    <span className="player-cell-teams">
                      {p.teams?.join(", ") || "—"}
                    </span>
                  </td>
                  <td className="num font-mono">{p.games_played ?? p.metrics?.gp ?? "—"}</td>
                  <td className="num font-mono">{p.total_minutes !== undefined && p.total_minutes !== null ? p.total_minutes.toFixed(0) : p.metrics?.min !== undefined && p.metrics?.min !== null ? p.metrics.min.toFixed(0) : "—"}</td>
                  <td className="num font-mono">{p.metrics.min_per_game?.toFixed(1) ?? "—"}</td>
                  <td className="num font-mono font-bold">{p.metrics.pts ?? "—"}</td>
                  <td className="num font-mono">{p.metrics.pts_per_game?.toFixed(1) ?? "—"}</td>
                  <td className="num font-mono">{p.metrics.reb_total ?? "—"}</td>
                  <td className="num font-mono">{p.metrics.ast ?? "—"}</td>
                  <td className="num font-mono">{p.metrics.stl ?? "—"}</td>
                  <td className="num font-mono">{p.metrics.blk ?? "—"}</td>
                  <td className="num font-mono">
                    {p.metrics.ts_pct !== null ? `${(p.metrics.ts_pct * 100).toFixed(1)}%` : "—"}
                  </td>
                  <td className="num font-mono">
                    {p.metrics.efg_pct !== null ? `${(p.metrics.efg_pct * 100).toFixed(1)}%` : "—"}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <Link
                      href={`/compare?playerA=${p.player_id}&season=${query.season}&phase=${query.phase}&beforeDate=${query.before_date}&window=${query.window}`}
                      className="button button-small"
                      style={{ marginRight: "0.3rem" }}
                    >
                      Compare
                    </Link>
                    <Link
                      href={`/players/${p.player_id}?season=${query.season}&phase=${query.phase}&beforeDate=${query.before_date}&window=${query.window}`}
                      className="button button-small button-primary"
                    >
                      Profile
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button
          type="button"
          onClick={() => {
            const params = new URLSearchParams(searchParams?.toString() ?? "");
            params.delete("cursor");
            router.push(`${pathname}?${params.toString()}`);
          }}
          disabled={!searchParams?.get("cursor")}
          className="button button-small"
        >
          ← First Page
        </button>

        {data.has_more && data.next_cursor && (
          <button
            type="button"
            onClick={() => updateParam({ cursor: data.next_cursor })}
            className="button button-small button-primary"
          >
            Next Page →
          </button>
        )}
      </div>
    </div>
  );
}
