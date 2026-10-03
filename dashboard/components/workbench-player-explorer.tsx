"use client";

import Link from "next/link";
import { SharedFloorView } from "@/components/shared-floor-view";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useEffect, useMemo, useCallback } from "react";
import { PlayerPortrait } from "./player-portrait";
import { StatsDetailDrawer } from "./stats-detail-drawer";
import { CompareTray } from "./compare-tray";
import { HotkeysModal } from "./hotkeys-modal";
import { ManageViewsModal } from "./manage-views-modal";
import { ScatterPlotView } from "./scatter-plot-view";
import { MultiPlayerLinesView } from "./multi-player-lines-view";
import { useWorkspace } from "@/lib/workspace-context";
import { saveInvestigation } from "@/lib/workbench-api";
import {
  STATS_PRESETS,
  getPresetById,
  computeHeaderGroups,
  calculateCohortPercentiles,
  NBA_TEAMS,
  COUNTING_MODES,
  IDENTITY_MODES,
  type PresetId,
  type CountingMode,
  type IdentityDensity,
  type TableDensity
} from "@/lib/stats-presets";
import type { PlayerResearchResponse, PlayerResearchItem } from "@/lib/types";

interface WorkbenchPlayerExplorerProps {
  data: PlayerResearchResponse;
  currentSortMetric?: string;
  currentSortDirection?: string;
}

const LOCAL_STORAGE_DENSITY_KEY = "courtload_table_density";

export function WorkbenchPlayerExplorer({
  data,
  currentSortMetric = "pts",
  currentSortDirection = "desc"
}: WorkbenchPlayerExplorerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const {
    views,
    favorites,
    isFavorite,
    toggleFavorite,
    compareTray,
    toggleCompare,
    removeCompare,
    clearCompare,
    defaultViewId,
    preferences,
    updatePreferences
  } = useWorkspace();

  // Active preset derived from URL viewId or default view
  const urlViewId = searchParams?.get("viewId") || searchParams?.get("view_id");
  const activePresetId: PresetId = (urlViewId as PresetId) || (defaultViewId as PresetId) || "overview";

  // Counting Mode derived from URL or workspace preferences
  const countingMode: CountingMode =
    ((searchParams?.get("countingMode") || searchParams?.get("counting_mode")) as CountingMode) ||
    preferences.counting_mode ||
    "per_game";

  // Identity Density mode derived from URL or workspace preferences
  const identityMode: IdentityDensity =
    ((searchParams?.get("identityMode") || searchParams?.get("identity_mode")) as IdentityDensity) ||
    (preferences.identity_mode as IdentityDensity) ||
    "photos";

  // Table Density state (compact vs standard) with lazy localStorage & preferences fallback
  const [tableDensity, setTableDensity] = useState<TableDensity>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(LOCAL_STORAGE_DENSITY_KEY);
        if (stored === "compact" || stored === "standard") return stored;
      } catch {
        // Ignore localStorage errors
      }
    }
    return preferences.density === "compact" ? "compact" : "standard";
  });

  // Expanded table width state
  const [isExpanded, setIsExpanded] = useState(false);

  // Show percentiles toggle
  const [showPercentiles, setShowPercentiles] = useState(true);

  // Detail Drawer state
  const [selectedPlayerForDrawer, setSelectedPlayerForDrawer] =
    useState<PlayerResearchItem | null>(null);

  // Hovered player ID for keyboard shortcut C
  const [hoveredPlayer, setHoveredPlayer] = useState<PlayerResearchItem | null>(null);

  // Hotkeys Modal state
  const [isHotkeysOpen, setIsHotkeysOpen] = useState(false);

  // Manage Views Modal state (F04)
  const [isManageViewsOpen, setIsManageViewsOpen] = useState(false);

  // Favorites-only filter state (F05)
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  // Table Plots View Mode (F06: table, scatter, lines)
  const [viewMode, setViewMode] = useState<"table" | "scatter" | "lines">(() => {
    const fromParam = searchParams?.get("viewMode");
    if (fromParam === "scatter" || fromParam === "lines" || fromParam === "table") {
      return fromParam;
    }
    return "table";
  });

  // Saving state
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Local filter states
  const [localName, setLocalName] = useState(searchParams?.get("name") || "");

  const query = data.query;
  const rawItems = data.items;
  const items = useMemo(() => {
    if (!favoritesOnly) return rawItems;
    return rawItems.filter((p) => favorites.includes(p.player_id));
  }, [rawItems, favoritesOnly, favorites]);

  const preset = useMemo(() => getPresetById(activePresetId, views), [activePresetId, views]);

  // Retained Comparison Tray derived from workspace compare_tray (F05)
  const comparedPlayers = useMemo<PlayerResearchItem[]>(() => {
    return compareTray.map((id) => {
      const found = data.items.find((p) => p.player_id === id);
      if (found) return found;
      return {
        player_id: id,
        player_name: id,
        teams: [],
        games_played: 0,
        total_minutes: 0,
        metrics: { gp: 0, min: 0 },
        sample_sizes: {}
      } as unknown as PlayerResearchItem;
    });
  }, [compareTray, data.items]);

  // Update localStorage and workspace preferences when density changes
  const handleDensityChange = useCallback(
    (newDensity: TableDensity) => {
      setTableDensity(newDensity);
      try {
        localStorage.setItem(LOCAL_STORAGE_DENSITY_KEY, newDensity);
      } catch {
        // Ignore
      }
      updatePreferences({ density: newDensity }).catch(() => {});
    },
    [updatePreferences]
  );

  // Compute cohort percentiles across active items for all columns in current preset
  const cohortPercentiles = useMemo(() => {
    const metricKeys = preset.columns.map((c) => {
      if (c.countingModeKeys && c.countingModeKeys[countingMode]) {
        return c.countingModeKeys[countingMode]!;
      }
      return c.key;
    });
    return calculateCohortPercentiles(items, metricKeys);
  }, [items, preset, countingMode]);

  // URL updater preserving context parameters
  const updateParam = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      for (const [key, value] of Object.entries(updates)) {
        if (value !== null && value !== "") {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }
      // Reset cursor when non-cursor filters change
      if (!updates.cursor) {
        params.delete("cursor");
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const handlePresetSelect = (id: PresetId) => {
    if (id === "onoff") {
      const params = new URLSearchParams(searchParams.toString());
      params.set("preset", "onoff");
      router.push(`/stats?${params}`);
      return;
    }
    updateParam({ viewId: id === "overview" ? null : id });
  };

  const handleCountingModeSelect = (mode: CountingMode) => {
    updateParam({ countingMode: mode === "per_game" ? null : mode });
  };

  const handleIdentityModeSelect = (mode: IdentityDensity) => {
    updateParam({ identityMode: mode === "photos" ? null : mode });
  };

  const handleSort = (metricKey: string) => {
    if (metricKey === currentSortMetric) {
      updateParam({ sortDirection: currentSortDirection === "desc" ? "asc" : "desc" });
    } else {
      updateParam({ sortMetric: metricKey, sortDirection: "desc" });
    }
  };

  const handleToggleCompare = useCallback(
    async (player: PlayerResearchItem) => {
      try {
        await toggleCompare(player.player_id);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to update compare tray");
      }
    },
    [toggleCompare]
  );

  const handleRemoveCompare = async (playerId: string) => {
    try {
      await removeCompare(playerId);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to remove player from compare tray");
    }
  };

  const handleClearCompare = async () => {
    try {
      await clearCompare();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to clear compare tray");
    }
  };

  // Keyboard shortcut listeners (T, W, E, C, Z, ?, Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept typing in inputs, textareas, or selects
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "SELECT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        setIsExpanded((prev) => !prev);
      } else if (e.key === "w" || e.key === "W") {
        e.preventDefault();
        handleDensityChange("compact");
      } else if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        handleDensityChange("standard");
      } else if (e.key === "c" || e.key === "C") {
        if (hoveredPlayer) {
          e.preventDefault();
          handleToggleCompare(hoveredPlayer);
        }
      } else if (e.key === "z" || e.key === "Z") {
        if (comparedPlayers.length >= 2) {
          e.preventDefault();
          const pA = comparedPlayers[0].player_id;
          const pB = comparedPlayers[1].player_id;
          const params = new URLSearchParams({
            season: query.season,
            phase: query.phase,
            beforeDate: query.before_date,
            window: query.window,
            playerA: pA,
            playerB: pB
          });
          if (query.release_id) params.set("releaseId", query.release_id);
          router.push(`/compare?${params.toString()}`);
        }
      } else if (e.key === "?") {
        e.preventDefault();
        setIsHotkeysOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hoveredPlayer, comparedPlayers, query, router, handleDensityChange, handleToggleCompare]);

  const handleSaveInvestigation = async () => {
    const title = window.prompt(
      "Name this investigation finding:",
      `Player Research: ${query.season} ${preset.label} (${currentSortMetric.toUpperCase()})`
    );
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

  const hasActiveFilters = Boolean(
    searchParams?.get("name") ||
      searchParams?.get("teamId") ||
      searchParams?.get("minGames") ||
      searchParams?.get("minAvgMinutes") ||
      searchParams?.get("minMinutes")
  );

  const handleResetFilters = () => {
    updateParam({
      name: null,
      teamId: null,
      minGames: null,
      minAvgMinutes: null,
      minMinutes: null
    });
    setLocalName("");
  };

  // Compute column header groups
  const headerGroups = useMemo(() => computeHeaderGroups(preset.columns), [preset]);

  // Context bundle for subcomponents
  const contextBundle = {
    season: query.season,
    phase: query.phase,
    before_date: query.before_date,
    window: query.window,
    release_id: query.release_id
  };

  if (activePresetId === "onoff") return <SharedFloorView initialOperation="on-off" statsPreset />;

  return (
    <div className={`player-explorer-container ${isExpanded ? "table-expanded" : ""}`}>
      {/* Preset Tabs Row (F02 & F04) */}
      <div className="stats-preset-tabs-wrapper" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div className="stats-preset-tabs" role="tablist" aria-label="Stats Explorer Presets">
          {STATS_PRESETS.map((p) => {
            const isActive = p.id === activePresetId;
            return (
              <button
                key={p.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => handlePresetSelect(p.id)}
                className={`stats-preset-tab ${isActive ? "active" : ""}`}
                title={p.description}
              >
                <span>{p.label}</span>
                {p.gated && <span className="stats-preset-gated-tag">🔒 {p.gated.block}</span>}
              </button>
            );
          })}

          {/* Personal Custom Views (F04) */}
          {views.map((v) => {
            const isActive = v.id === activePresetId;
            const isDefault = v.id === defaultViewId;
            const hasUnavailable = (v.unavailable_columns?.length ?? 0) > 0;
            return (
              <button
                key={v.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => handlePresetSelect(v.id as PresetId)}
                className={`stats-preset-tab ${isActive ? "active" : ""}`}
                title={`Custom View: ${v.name} (${v.columns.length} columns)`}
              >
                <span>{v.name}</span>
                {isDefault && <span style={{ marginLeft: "0.2rem", color: "var(--accent)" }}>★</span>}
                {hasUnavailable && <span className="stats-preset-gated-tag">🔒 {v.unavailable_columns?.length}</span>}
              </button>
            );
          })}
        </div>

        {/* Manage Views Button (F04) */}
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", marginLeft: "0.5rem", flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setIsManageViewsOpen(true)}
            className="button button-small"
            style={{ fontSize: "0.74rem", padding: "0.25rem 0.55rem", whiteSpace: "nowrap" }}
            title="Manage custom views, default view, and import/export"
          >
            ⚙ Manage Views
          </button>
        </div>
      </div>

      {/* Gated Preset Capability Notice */}
      {preset.gated && (
        <div className="stats-gated-banner" role="status">
          <div className="stats-gated-header">
            <span className="replica-badge-gated">Gated Capability · {preset.gated.block}</span>
            <strong className="stats-gated-title">{preset.label} Model &amp; Lineage Gate</strong>
          </div>
          <p className="stats-gated-desc">
            {preset.gated.reason} Displaying admitted box-score and efficiency metrics in the interim.
          </p>
        </div>
      )}

      {/* Gated Counting Mode Notice */}
      {(countingMode === "per_75" || countingMode === "per_100") && (
        <div className="stats-gated-banner" role="status">
          <div className="stats-gated-header">
            <span className="replica-badge-gated">Gated Normalization · B19/B20</span>
            <strong className="stats-gated-title">Possession Exposure Warehouse Pending</strong>
          </div>
          <p className="stats-gated-desc">
            Normalizations per 75/100 possessions require admitted on-court possession logs (Blocks B19–B20).
            Displaying per-game averages until possession facts are admitted.
          </p>
        </div>
      )}

      {/* Secondary Controls Toolbar (Counting mode, Identity mode, Density, %iles, Shortcuts) */}
      <div className="stats-controls-row">
        {/* Counting Mode Buttons (F03) */}
        <div className="control-button-group" role="group" aria-label="Counting Mode">
          <span className="control-group-label">Mode:</span>
          {COUNTING_MODES.map((cm) => (
            <button
              key={cm.id}
              type="button"
              onClick={() => handleCountingModeSelect(cm.id)}
              className={`control-pill ${countingMode === cm.id ? "active" : ""}`}
              title={cm.tooltip}
            >
              {cm.label}
              {cm.gated && <span className="control-pill-gated-dot" title="Gated by B19/B20" />}
            </button>
          ))}
        </div>

        {/* Identity Density Mode Buttons (F03) */}
        <div className="control-button-group" role="group" aria-label="Identity Presentation">
          <span className="control-group-label">Show:</span>
          {IDENTITY_MODES.map((im) => (
            <button
              key={im.id}
              type="button"
              onClick={() => handleIdentityModeSelect(im.id)}
              className={`control-pill ${identityMode === im.id ? "active" : ""}`}
              title={im.tooltip}
            >
              {im.label}
            </button>
          ))}
        </div>

        {/* Layout & Density Options */}
        <div className="control-button-group" role="group" aria-label="Table Layout and Density">
          <button
            type="button"
            onClick={() => handleDensityChange(tableDensity === "compact" ? "standard" : "compact")}
            className={`control-pill ${tableDensity === "compact" ? "active" : ""}`}
            title="Toggle compact table density (W: compact, E: standard)"
          >
            {tableDensity === "compact" ? "Compact Density" : "Standard Density"}
          </button>

          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className={`control-pill ${isExpanded ? "active" : ""}`}
            title="Toggle expanded / full table width (T)"
          >
            {isExpanded ? "Standard Width" : "Expand Table (T)"}
          </button>

          <button
            type="button"
            onClick={() => setShowPercentiles((prev) => !prev)}
            className={`control-pill ${showPercentiles ? "active" : ""}`}
            title="Toggle midrank cohort percentile sublabels"
          >
            %iles {showPercentiles ? "On" : "Off"}
          </button>
        </div>

        {/* View Mode Toggle (F06 Table Plots) */}
        <div className="control-button-group" role="group" aria-label="Explorer View Mode">
          <span className="control-group-label">View:</span>
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={`control-pill ${viewMode === "table" ? "active" : ""}`}
            title="Dense statistical table view"
          >
            ☷ Table
          </button>
          <button
            type="button"
            onClick={() => setViewMode("scatter")}
            className={`control-pill ${viewMode === "scatter" ? "active" : ""}`}
            title="Two-axis scatter plot view with outlier detection"
          >
            ⤢ Scatter Plot
          </button>
          <button
            type="button"
            onClick={() => setViewMode("lines")}
            className={`control-pill ${viewMode === "lines" ? "active" : ""}`}
            title="Multi-player game progression lines"
          >
            📈 Trend Lines
          </button>
        </div>

        {/* Global Helpers */}
        <div className="control-button-group">
          <button
            type="button"
            onClick={() => setIsHotkeysOpen(true)}
            className="button button-small"
            title="Open keyboard shortcuts guide (?)"
          >
            ? Hotkeys
          </button>
          <button
            type="button"
            onClick={handleSaveInvestigation}
            disabled={saving}
            className="button button-small"
            title="Save this analysis and cryptographic finding"
          >
            {saving ? "Saving…" : "💾 Save"}
          </button>
        </div>
      </div>

      {/* Save Success Notice */}
      {saveSuccess && (
        <div className="notice-box" style={{ borderLeftColor: "var(--positive)", marginBottom: "1rem" }}>
          <strong>Saved:</strong> {saveSuccess}. Inspect under{" "}
          <Link href="/investigations" className="text-accent underline">
            Saved Investigations
          </Link>.
        </div>
      )}

      {/* Primary Filters Toolbar (Name, Team, Min GP, Min MPG, Min MIN, Sort) */}
      <div className="filter-toolbar">
        {/* Name search */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateParam({ name: localName.trim() || null });
          }}
          className="filter-group filter-name-group"
        >
          <label htmlFor="stats-player-search">Player search</label>
          <div className="filter-input-wrap">
            <input
              id="stats-player-search"
              type="text"
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              placeholder="Search table (e.g. Luka, Siakam)..."
              aria-label="Filter players by name"
            />
            {localName && (
              <button
                type="button"
                className="filter-clear-btn"
                onClick={() => {
                  setLocalName("");
                  updateParam({ name: null });
                }}
                aria-label="Clear player search"
              >
                ✕
              </button>
            )}
          </div>
        </form>

        {/* Team filter dropdown */}
        <div className="filter-group">
          <label htmlFor="stats-team-filter">Team</label>
          <select
            id="stats-team-filter"
            value={searchParams?.get("teamId") || ""}
            onChange={(e) => updateParam({ teamId: e.target.value || null })}
            aria-label="Filter by NBA team"
          >
            <option value="">All Teams (30)</option>
            {NBA_TEAMS.map((t) => (
              <option key={t.tricode} value={t.tricode}>
                {t.tricode} — {t.name}
              </option>
            ))}
          </select>
        </div>

        {/* Min Games Played */}
        <div className="filter-group">
          <label htmlFor="min-games-filter">Min GP</label>
          <input
            id="min-games-filter"
            type="number"
            min="0"
            max="82"
            placeholder="0"
            style={{ width: "70px" }}
            defaultValue={searchParams?.get("minGames") || ""}
            onBlur={(e) => updateParam({ minGames: e.target.value || null })}
            onKeyDown={(e) => {
              if (e.key === "Enter") updateParam({ minGames: e.currentTarget.value || null });
            }}
            aria-label="Minimum games played"
          />
        </div>

        {/* Min MPG */}
        <div className="filter-group">
          <label htmlFor="min-mpg-filter">Min MPG</label>
          <input
            id="min-mpg-filter"
            type="number"
            min="0"
            max="48"
            placeholder="0"
            style={{ width: "70px" }}
            defaultValue={searchParams?.get("minAvgMinutes") || ""}
            onBlur={(e) => updateParam({ minAvgMinutes: e.target.value || null })}
            onKeyDown={(e) => {
              if (e.key === "Enter") updateParam({ minAvgMinutes: e.currentTarget.value || null });
            }}
            aria-label="Minimum minutes per game"
          />
        </div>

        {/* Sort Select */}
        <div className="filter-group">
          <label htmlFor="stats-sort-select">Sort By</label>
          <select
            id="stats-sort-select"
            value={currentSortMetric}
            onChange={(e) => handleSort(e.target.value)}
            aria-label="Sort table by metric"
          >
            {preset.columns.map((c) => (
              <option key={c.sortMetric} value={c.sortMetric}>
                {c.label} ({c.group})
              </option>
            ))}
          </select>
        </div>

        {/* Page size limit */}
        <div className="filter-group">
          <label htmlFor="stats-limit-select">Rows</label>
          <select
            id="stats-limit-select"
            value={searchParams?.get("limit") || "50"}
            onChange={(e) => updateParam({ limit: e.target.value })}
            aria-label="Results per page"
          >
            <option value="25">25 rows</option>
            <option value="50">50 rows</option>
            <option value="100">100 rows</option>
          </select>
        </div>

        {/* Favorites quick toggle (F05) */}
        <button
          type="button"
          onClick={() => setFavoritesOnly((prev) => !prev)}
          className={`control-pill ${favoritesOnly ? "active" : ""}`}
          style={{
            alignSelf: "flex-end",
            height: "32px",
            display: "flex",
            alignItems: "center",
            gap: "0.3rem",
            color: favoritesOnly ? "var(--on-accent)" : "var(--accent)"
          }}
          title={favoritesOnly ? "Show all players" : "Filter to favorite players only"}
        >
          <span>{favoritesOnly ? "★" : "☆"}</span>
          <span>Favorites {favorites.length > 0 ? `(${favorites.length})` : ""}</span>
        </button>

        {/* Reset Filters Action */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleResetFilters}
            className="button button-small"
            style={{ alignSelf: "flex-end" }}
            title="Reset all active search and sample filters"
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* Scatter Plot View (F06) */}
      {viewMode === "scatter" && (
        <ScatterPlotView
          items={items}
          context={contextBundle}
          onSelectPlayer={(p) => setSelectedPlayerForDrawer(p)}
          initialXMetric={currentSortMetric === "pts" ? "pts_per_game" : currentSortMetric}
          initialYMetric="ts_pct"
        />
      )}

      {/* Multi-Player Lines View (F06) */}
      {viewMode === "lines" && (
        <MultiPlayerLinesView
          playerIds={compareTray.length > 0 ? compareTray : items.slice(0, 3).map((p) => p.player_id)}
          players={items}
          context={contextBundle}
        />
      )}

      {/* Dense Stats Table with Two-Tier Grouped Headers & Sticky Pinned Identity */}
      {viewMode === "table" && (
        <>
          <div className="stats-results-meta">
            <span className="text-xs text-muted font-mono">
              Showing {items.length} of {data.total_eligible_players} eligible players · Sorted by{" "}
              <strong>{currentSortMetric.toUpperCase()}</strong> ({currentSortDirection.toUpperCase()})
            </span>
            <span className="text-xs text-muted">
              Click column headers to sort · Click player row to view profile
            </span>
          </div>

          <div className={`table-wrapper ${tableDensity === "compact" ? "density-compact" : "density-standard"}`}>
            <table className="data-table dense-stats-table" aria-label="Dense player statistics explorer">
              <thead>
                {/* Tier 1 Header: Group Categories */}
                <tr className="stats-header-tier-1">
              <th
                colSpan={4}
                className="pinned-col-group"
                style={{ textAlign: "left", paddingLeft: "0.75rem" }}
              >
                Player Identity
              </th>
              {headerGroups.map((group, gIdx) => (
                <th
                  key={`${group.label}-${gIdx}`}
                  colSpan={group.colSpan}
                  className="stats-group-th"
                >
                  {group.label}
                </th>
              ))}
              <th style={{ width: "60px" }}>Actions</th>
            </tr>

            {/* Tier 2 Header: Individual Metrics */}
            <tr className="stats-header-tier-2">
              {/* Pinned Col 1: Select Checkbox */}
              <th
                className="pinned-col pinned-col-select"
                style={{ width: "36px", textAlign: "center" }}
                title="Select players for comparison (max 8)"
              >
                ✓
              </th>

              {/* Pinned Col 2: Rank # */}
              <th
                className="pinned-col pinned-col-rank"
                style={{ width: "36px", textAlign: "center" }}
              >
                #
              </th>

              {/* Pinned Col 3: Player Name & Avatar */}
              <th
                className="pinned-col pinned-col-name sortable"
                style={{ minWidth: "190px", textAlign: "left" }}
                onClick={() => handleSort("name")}
                aria-sort={
                  currentSortMetric === "name" || currentSortMetric === "player_name"
                    ? currentSortDirection === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
              >
                Player{" "}
                {(currentSortMetric === "name" || currentSortMetric === "player_name") &&
                  (currentSortDirection === "asc" ? "▲" : "▼")}
              </th>

              {/* Pinned Col 4: Teams (boundary pinned column) */}
              <th
                className="pinned-col pinned-col-teams"
                style={{ minWidth: "70px", textAlign: "left" }}
              >
                Team
              </th>

              {/* Scrollable Metric Column Headers */}
              {preset.columns.map((col) => {
                const isSorted = currentSortMetric === col.sortMetric;
                return (
                  <th
                    key={col.key}
                    className={`sortable ${col.num ? "num" : ""}`}
                    onClick={() => handleSort(col.sortMetric)}
                    aria-sort={
                      isSorted
                        ? currentSortDirection === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    title={col.tooltip ?? col.label}
                  >
                    <div className="th-sort-inner">
                      <span>{col.label}</span>
                      {isSorted && (
                        <span className="th-sort-arrow">
                          {currentSortDirection === "asc" ? "▲" : "▼"}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}

              <th style={{ width: "60px", textAlign: "center" }}>Detail</th>
            </tr>
          </thead>

          <tbody>
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={preset.columns.length + 5}
                  style={{ textAlign: "center", padding: "3.5rem" }}
                  className="text-muted"
                >
                  <p style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>
                    No players matched the current query filters.
                  </p>
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="button button-small"
                  >
                    Clear Search &amp; Sample Filters
                  </button>
                </td>
              </tr>
            ) : (
              items.map((player, idx) => {
                const isCompared = comparedPlayers.some((p) => p.player_id === player.player_id);
                const playerPercentiles = cohortPercentiles[player.player_id] ?? {};

                return (
                  <tr
                    key={player.player_id}
                    className={`stats-table-row ${isCompared ? "row-selected" : ""}`}
                    onMouseEnter={() => setHoveredPlayer(player)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setSelectedPlayerForDrawer(player);
                      } else if (e.key === "c" || e.key === "C") {
                        handleToggleCompare(player);
                      }
                    }}
                  >
                    {/* Pinned Col 1: Select Checkbox */}
                    <td className="pinned-col pinned-col-select" style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={isCompared}
                        onChange={() => handleToggleCompare(player)}
                        aria-label={`Select ${player.player_name} for comparison`}
                        className="stats-compare-checkbox"
                      />
                    </td>

                    {/* Pinned Col 2: Rank # */}
                    <td className="pinned-col pinned-col-rank font-mono text-muted text-xs" style={{ textAlign: "center" }}>
                      {idx + 1}
                    </td>

                    {/* Pinned Col 3: Player Identity */}
                    <td className="pinned-col pinned-col-name">
                      <div className="player-cell">
                        {identityMode === "photos" && (
                          <PlayerPortrait
                            playerId={player.player_id}
                            name={player.player_name}
                            portraitUrl={player.portrait_url}
                            size="sm"
                          />
                        )}
                        {identityMode === "logos" && (
                          <span className="player-cell-logo-badge font-mono">
                            {player.teams?.[0] ?? "NBA"}
                          </span>
                        )}
                        {identityMode === "initials" && (
                          <div
                            className="player-portrait-fallback"
                            style={{ width: 28, height: 28, minWidth: 28, minHeight: 28, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: "0.7rem", backgroundColor: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                          >
                            {player.player_name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(player.player_id);
                          }}
                          style={{
                            background: "transparent",
                            border: 0,
                            cursor: "pointer",
                            fontSize: "1rem",
                            lineHeight: 1,
                            padding: "0 0.15rem",
                            color: isFavorite(player.player_id) ? "var(--accent)" : "var(--text-muted)"
                          }}
                          title={isFavorite(player.player_id) ? "Remove from favorites" : "Add to favorites"}
                          aria-label={
                            isFavorite(player.player_id)
                              ? `Remove ${player.player_name} from favorites`
                              : `Add ${player.player_name} to favorites`
                          }
                        >
                          {isFavorite(player.player_id) ? "★" : "☆"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedPlayerForDrawer(player)}
                          className="player-cell-name text-accent font-semibold"
                          title="Open player profile sidebar"
                        >
                          {player.player_name}
                        </button>
                      </div>
                    </td>

                    {/* Pinned Col 4: Teams (boundary separator) */}
                    <td className="pinned-col pinned-col-teams">
                      <span className="player-cell-teams font-mono text-xs">
                        {player.teams?.length > 0 ? player.teams.join(", ") : "—"}
                      </span>
                    </td>

                    {/* Scrollable Metric Cells */}
                    {preset.columns.map((col) => {
                      // Determine effective metric key based on active counting mode override
                      let metricKey = col.key;
                      if (col.countingModeKeys && col.countingModeKeys[countingMode]) {
                        metricKey = col.countingModeKeys[countingMode]!;
                      }

                      // Special-case root item fields vs metrics dictionary
                      let rawValue: number | null | undefined;
                      if (metricKey === "gp" || metricKey === "games_played") {
                        rawValue = player.games_played ?? player.metrics.gp;
                      } else if (metricKey === "min" || metricKey === "total_minutes") {
                        rawValue = player.total_minutes ?? player.metrics.min;
                      } else {
                        rawValue = player.metrics[metricKey];
                      }

                      const formatted = col.format
                        ? col.format(rawValue, player)
                        : rawValue !== null && rawValue !== undefined
                        ? String(rawValue)
                        : "—";

                      const pct = playerPercentiles[metricKey];

                      return (
                        <td
                          key={col.key}
                          className={`font-mono ${col.num ? "num" : ""}`}
                        >
                          <div className="stat-cell-content">
                            <span className="stat-main-value">{formatted}</span>
                            {showPercentiles && pct !== null && pct !== undefined && (
                              <span
                                className={`stat-pct-sublabel ${
                                  pct >= 85
                                    ? "pct-elite"
                                    : pct >= 65
                                    ? "pct-good"
                                    : pct <= 20
                                    ? "pct-low"
                                    : ""
                                }`}
                                title={`Cohort midrank percentile: ${pct}%`}
                              >
                                {pct}
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}

                    {/* Actions Cell */}
                    <td style={{ textAlign: "center" }}>
                      <button
                        type="button"
                        onClick={() => setSelectedPlayerForDrawer(player)}
                        className="button button-small"
                        aria-label={`Open details for ${player.player_name}`}
                        title="View detailed player stats sidebar"
                      >
                        ⌕
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="stats-pagination-footer">
        <div className="stats-pagination-actions">
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

        <div className="stats-keyboard-hint text-xs text-muted">
          Keyboard: <kbd>T</kbd> expand width · <kbd>W</kbd>/<kbd>E</kbd> density · <kbd>C</kbd> compare row · <kbd>Z</kbd> compare · <kbd>?</kbd> hotkeys
        </div>
      </div>
      </>
      )}

      {/* Detail Slide-out Drawer */}
      <StatsDetailDrawer
        player={selectedPlayerForDrawer}
        isOpen={Boolean(selectedPlayerForDrawer)}
        onClose={() => setSelectedPlayerForDrawer(null)}
        context={contextBundle}
        onToggleCompare={handleToggleCompare}
        isCompared={Boolean(
          selectedPlayerForDrawer &&
            comparedPlayers.some((p) => p.player_id === selectedPlayerForDrawer.player_id)
        )}
        onToggleFavorite={
          selectedPlayerForDrawer
            ? () => toggleFavorite(selectedPlayerForDrawer.player_id)
            : undefined
        }
        isFavorite={
          selectedPlayerForDrawer
            ? isFavorite(selectedPlayerForDrawer.player_id)
            : false
        }
      />

      {/* Compare Tray (F05) */}
      <CompareTray
        selectedPlayers={comparedPlayers}
        onRemovePlayer={handleRemoveCompare}
        onClearAll={handleClearCompare}
        context={contextBundle}
      />

      {/* Keyboard Shortcuts Modal */}
      <HotkeysModal isOpen={isHotkeysOpen} onClose={() => setIsHotkeysOpen(false)} />

      {/* Manage Custom Views Modal (F04) */}
      <ManageViewsModal
        isOpen={isManageViewsOpen}
        onClose={() => setIsManageViewsOpen(false)}
        activeViewId={activePresetId}
        onSelectView={(viewId) => {
          handlePresetSelect(viewId as PresetId);
        }}
      />
    </div>
  );
}
