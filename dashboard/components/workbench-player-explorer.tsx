"use client";

import { readStoredValue, storageKeys } from "@/lib/storage-keys";

import Link from "next/link";
import { LookupInput } from "./lookup-input";
import { CourtLensWordmark } from "./courtlens-wordmark";
import { StatsPreviewRail } from "./stats-preview-rail";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useMemo, useCallback, useTransition, Fragment, type KeyboardEvent } from "react";
import { SortHeader, GroupGuide } from "./table-ui";
import { Icon } from "./ui/icon";
import { useToast } from "./ui/toast";
import { PercentileCell } from "./charts/percentile-cell";
import { TablePercentileLegend } from "./table-percentile-legend";
import { Skeleton } from "./ui/skeleton";
import { SlidingIndicator } from "./ui/sliding-indicator";
import { TeamLogoStack } from "./team-logo";
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
  IMPACT_COLUMNS,
  getPresetById,
  tableGroups,
  formatColumnValue,
  NBA_TEAMS,
  COUNTING_MODES,
  IDENTITY_MODES,
  type PresetId,
  type CountingMode,
  type IdentityDensity,
  type TableDensity
} from "@/lib/stats-presets";
import { normalizedColumn, normalizedSortMetric } from "@/lib/stats-query";
import type { QuerySpec, WorkbenchCatalog, PlayerResearchResponse, PlayerResearchItem } from "@/lib/types";

interface WorkbenchPlayerExplorerProps {
  data: PlayerResearchResponse;
  querySpec?: QuerySpec;
  countingMode?: CountingMode;
  catalog?: WorkbenchCatalog;
  currentSortMetric?: string;
  currentSortDirection?: string;
}

const LOCAL_STORAGE_DENSITY_KEY = storageKeys.density;

const SKELETON_ROW_COUNT = 12;

export function WorkbenchPlayerExplorer({
  data,
  querySpec,
  countingMode: resolvedCountingMode,
  catalog,
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
  const urlViewId = searchParams?.get("viewId") || searchParams?.get("view_id") || searchParams?.get("preset");
  const urlPresetId: PresetId = (urlViewId as PresetId) || (defaultViewId as PresetId) || "overview";

  // Navigations run in a transition: the selected tab and column headers switch immediately,
  // and analytical changes swap the table body for skeleton rows until the server query lands.
  const [isNavigating, startNavigation] = useTransition();
  const [pendingNav, setPendingNav] = useState<{ presetId: PresetId | null; data: boolean } | null>(null);
  const activePresetId: PresetId = (isNavigating && pendingNav?.presetId) || urlPresetId;
  const loadingRows = isNavigating && Boolean(pendingNav?.data);

  // Counting Mode derived from URL or workspace preferences
  const countingMode: CountingMode = resolvedCountingMode ||
    ((searchParams?.get("countingMode") || searchParams?.get("counting_mode")) as CountingMode) ||
    preferences.counting_mode ||
    "per_game";

  // Identity Density mode derived from URL or workspace preferences
  const identityMode: IdentityDensity =
    ((searchParams?.get("identityMode") || searchParams?.get("identity_mode")) as IdentityDensity) ||
    (preferences.identity_mode as IdentityDensity) ||
    "photos";

  // Table Density state (compact vs standard) with lazy localStorage & preferences fallback
  const [densityPreference, setTableDensity] = useState<TableDensity>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = readStoredValue(LOCAL_STORAGE_DENSITY_KEY);
        if (stored === "compact" || stored === "standard") return stored;
      } catch {
        // Ignore localStorage errors
      }
    }
    return preferences.density === "compact" ? "compact" : "standard";
  });

  const urlDensity = searchParams.get("density");
  const tableDensity: TableDensity = urlDensity === "compact" || urlDensity === "standard" ? urlDensity : densityPreference;

  // Expanded table height state
  const [isExpanded, setIsExpanded] = useState(false);

  // Show percentiles toggle
  const [showPercentiles, setShowPercentiles] = useState(true);

  // Detail Drawer state
  const [selectedPlayerForDrawer, setSelectedPlayerForDrawer] =
    useState<PlayerResearchItem | null>(null);


  const [previewPlayer, setPreviewPlayer] = useState<PlayerResearchItem | null>(null);
  const [previewPinned, setPreviewPinned] = useState(false);
  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const previewRow = (player: PlayerResearchItem) => {
    if (!previewPinned) setPreviewPlayer(player);
  };

  // Hotkeys Modal state
  const [isHotkeysOpen, setIsHotkeysOpen] = useState(false);

  // Manage Views Modal state (F04)
  const [isManageViewsOpen, setIsManageViewsOpen] = useState(false);

  // Favorites-only filter state (F05)
  const favoritesOnly = searchParams?.get("favorites") === "1";

  // Table Plots View Mode (F06: table, scatter, lines)
  const [viewMode, setViewMode] = useState<"table" | "scatter" | "lines">(() => {
    const fromParam = searchParams?.get("viewMode");
    if (fromParam === "scatter" || fromParam === "lines" || fromParam === "table") {
      return fromParam;
    }
    return "table";
  });

  const { toast } = useToast();

  // Saving state
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Local filter states
  const urlName = searchParams?.get("name") || "";
  const [nameDraft, setNameDraft] = useState({ scope: urlName, value: urlName });
  const localName = nameDraft.scope === urlName ? nameDraft.value : urlName;
  const setLocalName = (value: string) => setNameDraft({ scope: urlName, value });

  const query = data.query;
  const items = data.items;

  const preset = useMemo(() => {
    const base = getPresetById(activePresetId, views);
    const columns = base.columns.map((column) => normalizedColumn(column, countingMode));
    return { ...base, columns: columns.filter((column, index) => columns.findIndex(candidate => candidate.key === column.key) === index) };
  }, [activePresetId, views, countingMode]);

  // Retained Comparison Tray derived from workspace compare_tray (F05)
  const comparedPlayers = useMemo<PlayerResearchItem[]>(() => {
    return compareTray.map((id) => {
      const found = data.items.find((p) => p.player_id === id);
      if (found) return found;
      return {
        player_id: id,
        player_name: "Selected player",
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
      const params = new URLSearchParams(searchParams.toString());
      params.set("density", newDensity);
      router.push(`${pathname}?${params}`);
      try {
        localStorage.setItem(LOCAL_STORAGE_DENSITY_KEY, newDensity);
      } catch {
        // Ignore
      }
      updatePreferences({ density: newDensity }).catch(() => {});
    },
    [updatePreferences, router, pathname, searchParams]
  );

  // URL updater preserving context parameters
  const updateParam = useCallback(
    (updates: Record<string, string | null>, options?: { presetId?: PresetId }) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      const aliases: Record<string, string> = { sortMetric: "sort_metric", sortDirection: "sort_direction", teamId: "team_id", minGames: "min_games", minMinutes: "min_minutes", minAvgMinutes: "min_avg_minutes", countingMode: "counting_mode", identityMode: "identity_mode", viewId: "view_id" };
      for (const [key, value] of Object.entries(updates)) {
        if (aliases[key]) params.delete(aliases[key]);
        if (value !== null && value !== "") {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }
      if ("sortMetric" in updates || "sortDirection" in updates) params.delete("sort");
      // Analytical/paging changes reset the cursor; presentation-only controls retain it.
      const presentationKeys = new Set(["identityMode", "identity_mode", "viewId", "view_id", "density", "viewMode"]);
      if (!("cursor" in updates) && Object.keys(updates).some(key => !presentationKeys.has(key))) params.delete("cursor");
      // Only identity/density/plot-mode changes keep the current rows; anything else refetches.
      const visualKeys = new Set(["identityMode", "identity_mode", "density", "viewMode"]);
      setPendingNav({ presetId: options?.presetId ?? null, data: Object.keys(updates).some(key => !visualKeys.has(key)) });
      startNavigation(() => router.push(`${pathname}?${params.toString()}`));
    },
    [router, pathname, searchParams]
  );

  const handleFavorite = async (playerId: string) => {
    setActionError(null);
    try {
      await toggleFavorite(playerId);
      if (favoritesOnly) {
        if (searchParams.get("cursor")) updateParam({ cursor: null });
        else router.refresh();
        setSelectedPlayerForDrawer(null);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not update favorites. Try again.");
    }
  };

  const handlePresetSelect = (id: PresetId) => {
    const metric = id === "impact" ? "rapm" : id === "onoff" ? "onoff_net_rating" : id === "sixfactor" ? "rapm" : "pts_per_game";
    updateParam({ viewId: id === "overview" ? null : id, preset: null, view_id: null,
      sortMetric: normalizedSortMetric(metric, countingMode), sort: null, sort_metric: null, cursor: null }, { presetId: id });
  };

  const handleCountingModeSelect = (mode: CountingMode) => {
    updateParam({ countingMode: mode, counting_mode: null,
      sortMetric: normalizedSortMetric(currentSortMetric, mode), sort_metric: null, sort: null });
  };

  const handleIdentityModeSelect = (mode: IdentityDensity) => {
    updateParam({ identityMode: mode, identity_mode: null });
    updatePreferences({ identity_mode: mode }).catch(() => {});
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
      setActionError(null);
      try {
        await toggleCompare(player.player_id);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Could not update comparison selection. Try again.");
      }
    },
    [toggleCompare]
  );

  const handleRemoveCompare = async (playerId: string) => {
    setActionError(null);
    try {
      await removeCompare(playerId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not remove comparison selection. Try again.");
    }
  };

  const handleClearCompare = async () => {
    setActionError(null);
    try {
      await clearCompare();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not clear comparison selection. Try again.");
    }
  };

  // One handler in the focused table region; editable/modified/IME events keep native behavior.
  const handleTableKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.nativeEvent.isComposing ||
        target.closest("input, select, textarea, [contenteditable='true']")) return;
    const key = e.key.toLowerCase();
    const rowId = target.closest<HTMLElement>("[data-player-id]")?.dataset.playerId;
    const player = items.find(item => item.player_id === rowId);
    if (key === "c" && player) { e.preventDefault(); handleToggleCompare(player); }
    else if (key === "?") { e.preventDefault(); setIsHotkeysOpen(true); }
    else if (key === "t") { e.preventDefault(); setIsExpanded(value => !value); }
    else if (key === "w" || key === "e") { e.preventDefault(); handleDensityChange(key === "w" ? "compact" : "standard"); }
    else if (key === "a" || key === "d") { e.preventDefault(); e.currentTarget.scrollBy({ left: key === "a" ? -240 : 240 }); }
    else if (key === "z" && comparedPlayers.length >= 2) {
      e.preventDefault();
      const params = new URLSearchParams({ season: query.season, phase: query.phase,
        beforeDate: query.before_date, window: query.window,
        playerA: comparedPlayers[0].player_id, playerB: comparedPlayers[1].player_id });
      if (query.release_id) params.set("releaseId", query.release_id);
      router.push(`/compare?${params}`);
    }
  };

  const closeDetailDrawer = useCallback(() => setSelectedPlayerForDrawer(null), []);

  const legacySaveAvailable = !querySpec?.predicates && (querySpec?.sort?.length ?? 1) <= 1 &&
    !querySpec?.sample_filters?.min_possessions && !querySpec?.sample_filters?.min_attempts;
  const handleSaveInvestigation = async () => {
    const title = window.prompt(
      "Name this investigation finding:",
      `Player Research: ${query.season} ${preset.label} (${currentSortMetric.toUpperCase()})`
    );
    if (!title?.trim()) return;

    setSaving(true);
    setSaveSuccess(null);
    try {
      const impactMetrics = preset.columns.filter(column => column.key in IMPACT_COLUMNS).map(column => column.key);
      const saveQuery = { ...query, ...(impactMetrics.length ? { metrics: impactMetrics } : {}) };
      const saved = await saveInvestigation(title.trim(), saveQuery as unknown as Record<string, unknown>);
      const msg = `Legacy analytical scope saved (retained arithmetic; Favorites and percentiles excluded), manifest SHA-256: ${saved.manifest_sha256.slice(0, 8)}...`;
      setSaveSuccess(msg);
      toast({
        title: "Investigation Saved",
        description: `Saved "${title.trim()}". Manifest SHA-256: ${saved.manifest_sha256.slice(0, 8)}...`,
        variant: "positive",
      });
    } catch (err) {
      const errText = err instanceof Error ? err.message : "Failed to save investigation";
      toast({
        title: "Save Failed",
        description: errText,
        variant: "negative",
      });
    } finally {
      setSaving(false);
    }
  };

  const hasActiveFilters = Boolean(
    searchParams?.get("name") ||
      searchParams?.get("teamId") || searchParams?.get("team_id") ||
      searchParams?.get("minGames") || searchParams?.get("min_games") ||
      searchParams?.get("minAvgMinutes") || searchParams?.get("min_avg_minutes") ||
      searchParams?.get("minMinutes") || searchParams?.get("min_minutes")
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
    toast({
      title: "Filters Reset",
      description: "Restored default filter parameters for current dataset scope.",
      variant: "info",
    });
  };

  // Compute column header groups
  const headerGroups = useMemo(() => tableGroups(preset), [preset]);

  const guideStarts = new Set(headerGroups.slice(1).map(group => group.start));
  const guideCount = identityMode === "none" ? 0 : guideStarts.size;

  // Context bundle for subcomponents
  const contextBundle = {
    season: query.season,
    phase: query.phase,
    before_date: query.before_date,
    window: query.window,
    release_id: query.release_id
  };


  return (
    <div className={`player-explorer-container ${isExpanded ? "table-expanded" : ""}`}>
      {/* Preset Tabs Row (F02 & F04) */}
      <div className="stats-preset-tabs-wrapper">
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
                {isActive && <SlidingIndicator layoutId="stats-preset-indicator" className="stats-preset-indicator" />}
                <span>{p.label}</span>
                {p.gated && <span className="stats-preset-gated-tag">Partial</span>}
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
                {isActive && <SlidingIndicator layoutId="stats-preset-indicator" className="stats-preset-indicator" />}
                <span>{v.name}</span>
                {isDefault && <span className="stats-default-view-star"><Icon name="star" size={14} filled /><span className="sr-only">Default view</span></span>}
                {hasUnavailable && <span className="stats-preset-gated-tag">Unavailable: {v.unavailable_columns?.length}</span>}
              </button>
            );
          })}
        </div>

        {/* Identity Density Mode Buttons (F03) */}
        <div className="control-button-group" role="group" aria-label="Group guides">
          <span className="control-group-label">Group Guides:</span>
          {IDENTITY_MODES.map((im) => (
            <button
              key={im.id}
              type="button"
              onClick={() => handleIdentityModeSelect(im.id)}
              className={`control-pill ${identityMode === im.id ? "active" : ""}`}
              title={im.tooltip}
              aria-pressed={identityMode === im.id}
            >
              {im.label}
            </button>
          ))}
        </div>

        {/* Manage Views Button (F04) */}
        <div className="stats-preset-manage-wrapper">
          <button
            type="button"
            onClick={() => setIsManageViewsOpen(true)}
            className="button button-small stats-manage-views-btn"
            title="Manage custom views, default view, and import/export"
          >
            <Icon name="settings" /> Manage Views
          </button>
        </div>

      </div>

      {/* Gated Preset Capability Notice */}
      {preset.gated && (
        <div className="stats-gated-banner" role="status">
          <div className="stats-gated-header">
            <span className="replica-badge-gated">Partial capability</span>
            <strong className="stats-gated-title">{preset.label} limitations</strong>
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
            <span className="replica-badge-gated">Possession normalization unavailable</span>
            <strong className="stats-gated-title">Use an available counting mode</strong>
          </div>
          <p className="stats-gated-desc">
            Per 75/100 possessions requires admitted on-court possession logs. Per game, totals and per 36 remain available.
            Displaying per-game averages until possession facts are admitted.
          </p>
        </div>
      )}

      <div className="stats-table-frame">
      <div className="stats-controls-row">
        <strong className="stats-table-brand"><CourtLensWordmark height={16} /></strong>
        <div className="control-button-group" role="group" aria-label="Counting Mode">
          {COUNTING_MODES.map(cm => <button key={cm.id} type="button"
            onClick={() => handleCountingModeSelect(cm.id)}
            disabled={catalog?.stats_normalizations ? !catalog.stats_normalizations.includes(cm.id) : cm.gated}
            className={`control-pill ${countingMode === cm.id ? "active" : ""}`}
            title={cm.tooltip} aria-pressed={countingMode === cm.id}>{cm.label}
          </button>)}
        </div>
        <div className="control-button-group stats-view-controls" role="group" aria-label="Explorer View Mode">
          <button type="button" onClick={() => setViewMode("table")} className={`control-pill ${viewMode === "table" ? "active" : ""}`} aria-pressed={viewMode === "table"}><Icon name="table" size={14} /> Table</button>
          <button type="button" onClick={() => setViewMode("scatter")} className={`control-pill ${viewMode === "scatter" ? "active" : ""}`} aria-pressed={viewMode === "scatter"}><Icon name="scatter" size={14} /> Scatter Plot</button>
          <button type="button" onClick={() => setViewMode("lines")} className={`control-pill ${viewMode === "lines" ? "active" : ""}`} aria-pressed={viewMode === "lines"}><Icon name="chart-line" size={14} /> Trend Lines</button>
        </div>
        <div className="control-button-group stats-table-tools">
          <button type="button" onClick={() => setShowPercentiles(value => !value)}
            className={`control-pill ${showPercentiles ? "active" : ""}`} aria-pressed={showPercentiles}
            title="Toggle qualified league percentile labels">%iles {showPercentiles ? "On" : "Off"}</button>
          <button type="button" onClick={() => updateParam({ favorites: favoritesOnly ? null : "1" })}
            className={`control-pill ${favoritesOnly ? "active" : ""}`} aria-pressed={favoritesOnly}
            title={favoritesOnly ? "Show all players" : "Filter to favorite players only"}>
            <Icon name="star" /> Favorites {favorites.length > 0 ? `(${favorites.length})` : ""}
          </button>
          <button type="button" className={`control-pill ${filtersOpen || hasActiveFilters ? "active" : ""}`}
            onClick={() => setFiltersOpen(value => !value)} aria-expanded={filtersOpen} aria-controls="stats-filters">
            <Icon name="sliders" size={14} /> Filters{hasActiveFilters ? " · Active" : ""}
          </button>
          <button type="button" onClick={() => setIsHotkeysOpen(true)} className="control-pill" title="Open keyboard shortcuts guide (?)"><Icon name="help" size={14} /> Hotkeys</button>
          <button type="button" onClick={handleSaveInvestigation} disabled={saving || !legacySaveAvailable}
            className="control-pill" title="Save this scope using retained legacy arithmetic. Favorites and cohort percentiles are excluded; advanced query filters cannot be saved here.">
            <Icon name="save" size={14} /> {saving ? "Saving…" : "Save legacy scope"}
          </button>
        </div>
      </div>

      {actionError && <div role="alert" className="notice-box stats-action-error">
        {actionError} <button type="button" className="button button-small" onClick={() => setActionError(null)}>Dismiss</button>
      </div>}

      {/* Save Success Notice */}
      {saveSuccess && (
        <div className="notice-box notice-box-success">
          <strong>Saved:</strong> {saveSuccess}. Inspect under{" "}
          <Link href="/investigations" className="text-accent underline">
            Saved Investigations
          </Link>.
        </div>
      )}

      {filtersOpen && <div className="filter-toolbar" id="stats-filters" role="region" aria-label="Statistics filters">
        {/* Team filter dropdown */}
        <div className="filter-group">
          <label htmlFor="stats-team-filter">Team</label>
          <select
            id="stats-team-filter"
            value={searchParams?.get("teamId") || searchParams?.get("team_id") || ""}
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
            placeholder="0"
            className="stats-filter-num-sm"
            key={searchParams?.get("minGames") || searchParams?.get("min_games") || ""}
            defaultValue={searchParams?.get("minGames") || searchParams?.get("min_games") || ""}
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
            className="stats-filter-num-sm"
            key={searchParams?.get("minAvgMinutes") || searchParams?.get("min_avg_minutes") || ""}
            defaultValue={searchParams?.get("minAvgMinutes") || searchParams?.get("min_avg_minutes") || ""}
            onBlur={(e) => updateParam({ minAvgMinutes: e.target.value || null })}
            onKeyDown={(e) => {
              if (e.key === "Enter") updateParam({ minAvgMinutes: e.currentTarget.value || null });
            }}
            aria-label="Minimum minutes per game"
          />
        </div>

        <div className="filter-group">
          <label htmlFor="min-total-minutes-filter">Min total MIN</label>
          <input id="min-total-minutes-filter" type="number" min="0" placeholder="0" className="stats-filter-num-md"
            key={searchParams.get("minMinutes") || searchParams.get("min_minutes") || ""}
            defaultValue={searchParams.get("minMinutes") || searchParams.get("min_minutes") || ""}
            onBlur={event => updateParam({ minMinutes: event.target.value || null })}
            onKeyDown={event => { if (event.key === "Enter") updateParam({ minMinutes: event.currentTarget.value || null }); }}
            aria-label="Minimum total minutes played" />
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
            {!preset.columns.some((c) => c.sortMetric === currentSortMetric) && <option value={currentSortMetric}>{currentSortMetric}</option>}
            {preset.columns.filter((c) => !catalog?.stats_sort_fields || catalog.stats_sort_fields.includes(c.sortMetric)).map((c) => (
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

        {/* Reset Filters Action */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleResetFilters}
            className="button button-small stats-filter-reset"
            title="Reset all active search and sample filters"
          >
            Reset Filters
          </button>
        )}
      </div>}

      {viewMode !== "table" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateParam({ name: localName.trim() || null });
          }}
          className="filter-group filter-name-group stats-plot-search"
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
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
        </form>

      )}

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
          <TablePercentileLegend cohort={data.table_cohort} />
          <div className={`stats-table-layout ${previewCollapsed ? "preview-collapsed" : ""}`}>
          <div role="region" aria-label="Player statistics scroll area" aria-busy={loadingRows} tabIndex={0} onKeyDown={handleTableKey} className={`table-wrapper stats-scroll-region ${tableDensity === "compact" ? "density-compact" : "density-standard"}`}>
            <table className="data-table dense-stats-table" aria-label="Dense player statistics explorer"
              style={{
                "--table-min-width": `calc(114px + var(--identity-name-width) + ${preset.columns.length * 84 + guideCount * 40}px)`,
                "--table-width": `min(100%, calc(114px + var(--identity-name-width) + ${preset.columns.length * 140 + guideCount * 40}px))`
              } as React.CSSProperties}>
              <colgroup>
                <col className="col-select" /><col className="col-rank" />
                <col className="stats-name-column" />
                {preset.columns.map((col, index) => <Fragment key={col.key}>
                  {identityMode !== "none" && guideStarts.has(index) && <col className="col-guide" />}
                  <col className="stats-metric-column" />
                </Fragment>)}
                <col className="col-actions" />
              </colgroup>
              <thead>
                {/* Tier 1 Header: Group Categories */}
                <tr className="stats-header-tier-1">
              <th
                colSpan={3}
                className="pinned-col-group text-left pl-3"
              >
                Players
              </th>
              {headerGroups.map((group, gIdx) => (
                <th
                  key={`${group.label}-${gIdx}`}
                  colSpan={group.colSpan + (identityMode !== "none" && gIdx > 0 ? 1 : 0)}
                  className="stats-group-th" scope="colgroup"
                >
                  {group.label}
                </th>
              ))}
              <th className="stats-actions-header">Actions</th>
            </tr>

            {/* Tier 2 Header: Individual Metrics */}
            <tr className="stats-header-tier-2">
              {/* Pinned Col 1: Select Checkbox */}
              <th
                className="pinned-col pinned-col-select text-center"
                title="Select players for comparison (max 8)"
              >
                <Icon name="check" size={14} />
              </th>

              {/* Pinned Col 2: Rank # */}
              <th
                className="pinned-col pinned-col-rank num"
              >
                #
              </th>

              <th className="pinned-col pinned-col-name" scope="col" aria-sort={currentSortMetric === "name" || currentSortMetric === "player_name" ? currentSortDirection === "asc" ? "ascending" : "descending" : "none"}>
                <div className="stats-header-search">
                  <LookupInput label="Filter players by name" placeholder="Search players…" value={localName}
                    onChange={setLocalName} kinds={["player"]} limit={8} compactResults portalDropdown
                    onSelect={item => { setLocalName(item.display_name); updateParam({ name: item.display_name }); }}
                    onSubmitText={text => updateParam({ name: text.trim() || null })}
                    clearLabel="Clear player search" onClear={() => updateParam({ name: null })} />
                </div>
                <button type="button" className="stats-name-sort" onClick={() => handleSort("player_name")} aria-label="Sort by Player" title="Sort by player name"><Icon name={currentSortDirection === "asc" ? "up" : "down"} /></button>
              </th>

              {/* Scrollable Metric Column Headers */}
              {preset.columns.map((col, index) => <Fragment key={col.key}>
                {identityMode !== "none" && guideStarts.has(index) && <th className="stats-guide-cell" aria-hidden="true" />}
                <SortHeader label={col.label} metric={col.sortMetric} onSort={handleSort}
                  active={currentSortMetric === col.sortMetric} direction={currentSortDirection}
                  sortable={!catalog?.stats_sort_fields || catalog.stats_sort_fields.includes(col.sortMetric)}
                  description={col.tooltip} className={col.num ? "num" : ""} />
              </Fragment>)}

              <th className="stats-detail-header text-center">Detail</th>
            </tr>
          </thead>

          {loadingRows ? (
            <tbody className="stats-skeleton-body" aria-hidden="true">
              {Array.from({ length: SKELETON_ROW_COUNT }, (_, rowIndex) => (
                <tr key={rowIndex} className="stats-table-row stats-skeleton-row">
                  <td className="pinned-col pinned-col-select" />
                  <td className="pinned-col pinned-col-rank" />
                  <td className="pinned-col pinned-col-name">
                    <div className="player-cell">
                      <Skeleton variant="circle" width={40} height={40} />
                      <div className="stats-skeleton-identity">
                        <Skeleton variant="text" width="70%" />
                        <Skeleton variant="text" width="40%" />
                      </div>
                    </div>
                  </td>
                  {preset.columns.map((col, index) => <Fragment key={col.key}>
                    {identityMode !== "none" && guideStarts.has(index) && <td className="stats-guide-cell"><Skeleton variant="circle" width={30} height={30} /></td>}
                    <td className={`stats-metric-cell stats-group-${headerGroups.findIndex(group => index >= group.start && index < group.start + group.colSpan) % 2}`}>
                      <Skeleton variant="text" width={40} className="stats-skeleton-value" />
                    </td>
                  </Fragment>)}
                  <td className="stats-row-actions" />
                </tr>
              ))}
            </tbody>
          ) : (
          <tbody className="stats-table-body-enter">
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={preset.columns.length + guideCount + 4}
                  className="stats-empty-cell text-muted text-center"
                >
                  <p className="stats-empty-title">
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

                return (
                  <tr
                    key={player.player_id}
                    className={`stats-table-row ${isCompared ? "row-selected" : ""} ${previewPlayer?.player_id === player.player_id ? "row-previewed" : ""}`}
                    onMouseEnter={() => previewRow(player)}
                    onFocus={() => previewRow(player)}
                    data-player-id={player.player_id}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && e.target === e.currentTarget) {
                        e.preventDefault();
                        setSelectedPlayerForDrawer(player);
                      }
                    }}
                  >
                    {/* Pinned Col 1: Select Checkbox */}
                    <td className="pinned-col pinned-col-select text-center">
                      <input
                        type="checkbox"
                        checked={isCompared}
                        onChange={() => handleToggleCompare(player)}
                        aria-label={`Select ${player.player_name} for comparison`}
                        className="stats-compare-checkbox"
                      />
                    </td>

                    {/* Pinned Col 2: Rank # */}
                    <td className="pinned-col pinned-col-rank num font-mono text-muted text-xs">
                      {(data.output_offset ?? 0) + idx + 1}
                    </td>

                    {/* Pinned Col 3: Players */}
                    <td className="pinned-col pinned-col-name">
                      <div className="player-cell">
                        <TeamLogoStack teams={player.teams ?? []} />
                        <PlayerPortrait key={player.player_id} playerId={player.player_id} name={player.player_name}
                          portraitUrl={player.portrait_url} size="sm" className="stats-primary-portrait" />
                        <div className="stats-identity-copy"><Link href={`/players/${player.player_id}?${new URLSearchParams({
                          season: query.season, phase: query.phase, beforeDate: query.before_date,
                          window: query.window, ...(query.release_id ? { releaseId: query.release_id } : {})
                        })}`} title={player.player_name} aria-label={player.player_name} className="stats-player-link">
                          <span className="player-cell-name font-semibold">{player.player_name}</span>
                        <span className="player-cell-teams">{player.teams?.join(" / ") || "Team unknown"} · {query.season}</span>
                        </Link>
                        {player.table_qualified === false && <span className="table-small-sample">Small sample</span>}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFavorite(player.player_id);
                          }}
                          className={`stats-favorite-button ${isFavorite(player.player_id) ? "is-favorite" : ""}`}
                          aria-pressed={isFavorite(player.player_id)}
                          title={isFavorite(player.player_id) ? "Remove from favorites" : "Add to favorites"}
                          aria-label={
                            isFavorite(player.player_id)
                              ? `Remove ${player.player_name} from favorites`
                              : `Add ${player.player_name} to favorites`
                          }
                        >
                          <Icon name="star" />
                        </button>

                      </div>
                    </td>

                    {/* Scrollable Metric Cells */}
                    {preset.columns.map((col, index) => {
                      const metricKey = col.key;
                      const formatted = formatColumnValue(col, player);

                      const pct = player.table_percentiles?.[metricKey] ?? null;
                      const qualified = player.table_qualified === true && player.impact_support?.[metricKey]?.qualified !== false;

                      return (
                        <Fragment key={col.key}>
                          {identityMode !== "none" && guideStarts.has(index) && <td className="stats-guide-cell" aria-hidden="true">
                            <GroupGuide mode={identityMode} player={player} />
                          </td>}
                        <td
                          className={`stats-metric-cell stats-group-${headerGroups.findIndex(group => index >= group.start && index < group.start + group.colSpan) % 2} ${col.num ? "num" : ""}`}
                        >
                          <PercentileCell compact showPercentile={showPercentiles}
                            value={player.metrics[metricKey] == null ? null : formatted}
                            percentile={pct} qualified={qualified} label={col.label}
                            cohort={`${player.table_cohort_sample_sizes?.[metricKey] ?? "Unknown"} valid league players; ${data.table_cohort?.min_season_minutes ?? 500}+ season minutes`} />
                        </td>
                        </Fragment>
                      );
                    })}

                    {/* Actions Cell */}
                    <td className="stats-row-actions">
                      <button type="button" className="stats-icon-action stats-row-pin"
                        onClick={() => { setPreviewPlayer(player); setPreviewPinned(true); setPreviewCollapsed(false); }}
                        aria-label={`Pin preview for ${player.player_name}`} title="Pin player preview"><Icon name="pin" size={14} /></button>
                      <button
                        type="button"
                        onClick={() => setSelectedPlayerForDrawer(player)}
                        className="stats-icon-action"
                        aria-label={`Open details for ${player.player_name}`}
                        title="Open full player details"
                      >
                        <Icon name="search" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          )}
        </table>
      </div>

      <StatsPreviewRail player={previewPlayer} columns={preset.columns} season={query.season}
        eligiblePlayers={data.total_eligible_players} goodDirections={data.cohort?.good_directions}
        showPercentiles={showPercentiles} pinned={previewPinned} collapsed={previewCollapsed}
        onTogglePin={() => setPreviewPinned(value => !value)}
        onToggleCollapse={() => setPreviewCollapsed(value => !value)}
        onOpenDetails={setSelectedPlayerForDrawer} />
      </div>

      {/* Pagination Footer */}
      <div className="stats-pagination-footer">
        <div className="stats-results-meta">
          <span className="stats-record-dot" aria-hidden="true" />
          <span>Showing {items.length} of {data.total_output_players ?? data.total_eligible_players} matching players · {data.total_eligible_players} eligible players</span>
          <span className="stats-sort-caption">Sorted by {preset.columns.find(column => column.sortMetric === currentSortMetric)?.label || "Player"} ({currentSortDirection.toUpperCase()})</span>
        </div>
        <div className="control-button-group" role="group" aria-label="Table Layout and Density">
          <button type="button" onClick={() => handleDensityChange(tableDensity === "compact" ? "standard" : "compact")} className="control-pill" title="W: compact rows, E: standard rows">{tableDensity === "compact" ? "Compact Density" : "Standard Density"}</button>
          <button type="button" onClick={() => setIsExpanded(value => !value)} className={`control-pill ${isExpanded ? "active" : ""}`} aria-pressed={isExpanded} title="Toggle expanded table height (T)">{isExpanded ? <Icon name="collapse" size={14} /> : <Icon name="expand" size={14} />}{isExpanded ? "Standard Height" : "Expand Table (T)"}</button>
        </div>
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
            <Icon name="left" size={14} />First Page
          </button>

          {data.has_more && data.next_cursor && (
            <button
              type="button"
              onClick={() => updateParam({ cursor: data.next_cursor })}
              className="button button-small button-primary"
            >
              Next Page<Icon name="right" size={14} />
            </button>
          )}
        </div>

      </div>
      </>
      )}

      </div>

      {/* Detail Slide-out Drawer */}
      <StatsDetailDrawer
        player={selectedPlayerForDrawer}
        isOpen={Boolean(selectedPlayerForDrawer)}
        onClose={closeDetailDrawer}
        context={contextBundle}
        onToggleCompare={handleToggleCompare}
        isCompared={Boolean(
          selectedPlayerForDrawer &&
            comparedPlayers.some((p) => p.player_id === selectedPlayerForDrawer.player_id)
        )}
        onToggleFavorite={
          selectedPlayerForDrawer
            ? () => handleFavorite(selectedPlayerForDrawer.player_id)
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
