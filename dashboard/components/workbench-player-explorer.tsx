"use client";

import { readStoredValue, storageKeys } from "@/lib/storage-keys";
import { saveStatsReturn, STATS_RETURN_PARAM, takeStatsRestore } from "@/lib/stats-return";

import Link from "next/link";
import { CourtLensWordmark } from "./courtlens-wordmark";
import { StatsPreviewRail, STATS_CELL_HOVER } from "./stats-preview-rail";
import { STATS_SCOPE_PENDING } from "./stats-page-controls";
import { seasonScopeLabel } from "@/lib/season-range";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useMemo, useCallback, useTransition, useEffect, useRef, Fragment, type KeyboardEvent } from "react";
import { SortHeader, GroupGuide } from "./table-ui";
import { Icon } from "./ui/icon";
import { useToast } from "./ui/toast";
import { PercentileCell } from "./charts/percentile-cell";
import { Skeleton } from "./ui/skeleton";
import { Field } from "./ui/field";
import { Button, IconButton, Segmented } from "./ui/kit";
import { TeamLogoStack } from "./team-logo";
import { PlayerPortrait } from "./player-portrait";
import { StatsDetailDrawer } from "./stats-detail-drawer";
import { CompareTray } from "./compare-tray";
import { HotkeysModal } from "./hotkeys-modal";
import { ManageViewsModal } from "./manage-views-modal";
import { Menu, MenuItem } from "./ui/menu";
import { ScatterPlotView } from "./scatter-plot-view";
import { MultiPlayerLinesView } from "./multi-player-lines-view";
import { useWorkspace } from "@/lib/workspace-context";
import { saveInvestigation } from "@/lib/workbench-api";
import {
  IMPACT_COLUMNS,
  DARKO_COLUMNS,
  getPresetById,
  tableGroups,
  formatColumnValue,
  ORDERED_COUNTING_MODES,
  ORDERED_PRESETS,
  IDENTITY_MODES,
  type PresetId,
  type CountingMode,
  type IdentityDensity,
  type TableDensity
} from "@/lib/stats-presets";
import { normalizedColumn, normalizedSortMetric } from "@/lib/stats-query";
import { formatDate } from "@/lib/format-date";
import type { MetricHint } from "@/lib/stats-glossary";
import { StatsHeaderTip, type HeaderTip } from "./stats-header-tip";
import { DarkoSourceLink } from "./darko-source-link";
import { StatsTrendDialog, type TrendTarget } from "./stats-trend-dialog";
import type { QuerySpec, WorkbenchCatalog, PlayerResearchResponse, PlayerResearchItem } from "@/lib/types";

interface WorkbenchPlayerExplorerProps {
  data: PlayerResearchResponse;
  querySpec?: QuerySpec;
  countingMode?: CountingMode;
  catalog?: WorkbenchCatalog;
  currentSortMetric?: string;
  currentSortDirection?: string;
  /** Full name and description per metric key, shown when a column header is hovered. */
  metricHints?: Record<string, MetricHint>;
}

const LOCAL_STORAGE_DENSITY_KEY = storageKeys.density;

const SKELETON_ROW_COUNT = 12;
// Pause after the last keystroke before the table search queries the server.
const NAME_SEARCH_DEBOUNCE_MS = 250;

// Databallr's view order; CourtLens-only presets follow.
// Display order of the counting-mode buttons: Totals last, as on Databallr.

type GuideGeometry = React.CSSProperties & { "--guide-offset": string };
const guideGeometry = (index: number): GuideGeometry => ({
  "--guide-offset": `var(--group-guide-offset-${index}, 0px)`
});

/** Headers with a 7+ letter word (PTS CREATED) need more than the 64px column minimum. */
function isWideLabel(label: string): boolean {
  return label.split(/[\s/]+/).some(word => word.length >= 7);
}

export function WorkbenchPlayerExplorer({
  data,
  querySpec,
  countingMode: resolvedCountingMode,
  catalog,
  currentSortMetric = "pts",
  currentSortDirection = "desc",
  metricHints = {}
}: WorkbenchPlayerExplorerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const seasonLabel = seasonScopeLabel(querySpec?.season_scope?.seasons ?? null, querySpec?.season ?? data?.context?.season ?? "");

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
  const [pendingNav, setPendingNav] = useState<{ presetId: PresetId | null; data: boolean; search?: boolean } | null>(null);
  const activePresetId: PresetId = (isNavigating && pendingNav?.presetId) || urlPresetId;
  // Scope filters above the table (positions, draft class, team) navigate on their own.
  const [scopePending, setScopePending] = useState(false);
  useEffect(() => {
    const onPending = (event: Event) => setScopePending(Boolean((event as CustomEvent<boolean>).detail));
    window.addEventListener(STATS_SCOPE_PENDING, onPending);
    return () => window.removeEventListener(STATS_SCOPE_PENDING, onPending);
  }, []);
  const loadingRows = (isNavigating && Boolean(pendingNav?.data)) || scopePending;
  const searchingRows = isNavigating && Boolean(pendingNav?.search);

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
  const [manageStartsNew, setManageStartsNew] = useState(false);

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
  // The header search filters the table as you type (Databallr). `pushed` holds names sent to
  // the URL that have not landed yet, so their echoes never overwrite newer typing; any other
  // URL change (reset, back, site search) replaces the draft.
  const urlName = searchParams?.get("name") || "";
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [nameDraft, setNameDraft] = useState({ url: urlName, value: urlName, pushed: [] as string[] });
  if (nameDraft.url !== urlName) {
    const echo = nameDraft.pushed.indexOf(urlName);
    setNameDraft(echo >= 0 ? { ...nameDraft, url: urlName, pushed: nameDraft.pushed.slice(echo + 1) }
      : { url: urlName, value: urlName, pushed: [] });
  }
  const localName = nameDraft.value;
  const setLocalName = (value: string) => setNameDraft(draft => ({ ...draft, value }));

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
    (updates: Record<string, string | null>, options?: { presetId?: PresetId; search?: boolean }) => {
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
      // Typed searches keep the current rows (dimmed) and replace history instead of stacking it.
      setPendingNav({ presetId: options?.presetId ?? null, search: Boolean(options?.search),
        data: !options?.search && Object.keys(updates).some(key => !visualKeys.has(key)) });
      startNavigation(() => (options?.search ? router.replace : router.push)(`${pathname}?${params.toString()}`));
    },
    [router, pathname, searchParams]
  );

  const typedName = localName.trim();
  const lastName = nameDraft.pushed.at(-1) ?? urlName;
  const pushName = (value: string) => {
    setNameDraft(draft => ({ ...draft, pushed: [...draft.pushed, value] }));
    updateParam({ name: value || null }, { search: true });
  };
  useEffect(() => {
    if (typedName === lastName) return;
    const timer = window.setTimeout(() => {
      setNameDraft(draft => ({ ...draft, pushed: [...draft.pushed, typedName] }));
      updateParam({ name: typedName || null }, { search: true });
    }, NAME_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [typedName, lastName, updateParam]);

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
    const metric = id === "overview" ? "dpm" : id === "impact" ? "rapm" : id === "onoff" ? "onoff_net_rating" : id === "sixfactor" ? "rapm" : "pts_per_game";
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

  // Universal reset: every table sort and filter returns to how the page first loads (default
  // sort, no search, minimums, team, positions, draft class or favorites, page one). Season,
  // phase, view and counting mode are scope, not filters, and stay. Always enabled: a sort that
  // is still loading has not reached the URL yet.
  const nameSorted = currentSortMetric === "player_name" || currentSortMetric === "name";
  const resetTable = () => {
    setLocalName("");
    updateParam({ sortMetric: null, sortDirection: null, sort: null, name: null, cursor: null,
      minGames: null, minMinutes: null, minAvgMinutes: null, teamId: null, positions: null,
      draftYear: null, favorites: null, predicates: null });
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

  const scrollRef = useRef<HTMLDivElement>(null);
  // Back to table on the player page returns here: same URL, page and table scroll.
  const rememberTablePosition = () => saveStatsReturn({ href: `${pathname}?${searchParams?.toString() ?? ""}`,
    pageY: window.scrollY, tableTop: scrollRef.current?.scrollTop ?? 0, tableLeft: scrollRef.current?.scrollLeft ?? 0 });
  useEffect(() => {
    if (loadingRows || viewMode !== "table") return;
    const entry = takeStatsRestore(`${pathname}?${searchParams?.toString() ?? ""}`);
    if (!entry) return;
    window.scrollTo({ top: entry.pageY });
    scrollRef.current?.scrollTo({ top: entry.tableTop, left: entry.tableLeft });
  }, [loadingRows, viewMode, pathname, searchParams]);
  const scrollTable = (direction: -1 | 1) => scrollRef.current?.scrollBy({ left: direction * 240 });
  const stepView = (direction: -1 | 1) => {
    const ids = [...ORDERED_PRESETS.map(p => p.id), ...views.map(v => v.id as PresetId)];
    const index = ids.indexOf(activePresetId);
    handlePresetSelect(ids[(index + direction + ids.length) % ids.length]);
  };

  const [headerTip, setHeaderTip] = useState<HeaderTip | null>(null);
  const headerTipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keepHeaderTip = () => {
    if (headerTipTimer.current) clearTimeout(headerTipTimer.current);
  };
  const hideHeaderTip = () => {
    keepHeaderTip();
    headerTipTimer.current = setTimeout(() => setHeaderTip(null), 200);
  };
  useEffect(() => () => { if (headerTipTimer.current) clearTimeout(headerTipTimer.current); }, []);
  const [trendTarget, setTrendTarget] = useState<TrendTarget | null>(null);
  const showHeaderTip = (event: React.SyntheticEvent<HTMLTableRowElement>) => {
    keepHeaderTip();
    const cell = (event.target as HTMLElement).closest<HTMLElement>("th[data-column]");
    const column = preset.columns.find(entry => entry.key === cell?.dataset.column);
    if (!cell || !column) { setHeaderTip(null); return; }
    if (headerTip?.key === column.key) return;
    const hint = metricHints[column.key];
    const rect = cell.getBoundingClientRect();
    setHeaderTip({ key: column.key, label: column.label, name: hint?.name ?? column.tooltip ?? column.label,
      description: hint?.description ?? null, x: rect.left + rect.width / 2, y: rect.top,
      sortable: !catalog?.stats_sort_fields || catalog.stats_sort_fields.includes(column.sortMetric) });
  };

  const openComparison = () => {
    if (comparedPlayers.length < 2) return;
    const params = new URLSearchParams({ season: query.season, phase: query.phase,
      beforeDate: query.before_date, window: query.window,
      playerA: comparedPlayers[0].player_id, playerB: comparedPlayers[1].player_id });
    if (query.release_id) params.set("releaseId", query.release_id);
    router.push(`/compare?${params}`);
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
    else if (key === "f") { e.preventDefault(); setFiltersOpen(value => !value); }
    else if (key === "z" && comparedPlayers.length >= 2) { e.preventDefault(); openComparison(); }
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
      const impactMetrics = preset.columns.filter(column => column.key in IMPACT_COLUMNS || column.key in DARKO_COLUMNS).map(column => column.key);
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
  const wideColumns = preset.columns.filter(column => isWideLabel(column.label)).length;
  const tableRef = useRef<HTMLTableElement>(null);

  // Right-aligned values leave asymmetric space around the structural guide column.
  // Databallr: hovering or focusing a stat cell highlights that stat in the preview rail. One
  // delegated listener; only the rail re-renders.
  useEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    let current: string | null = null;
    const announce = (column: string | null) => {
      if (column === current) return;
      current = column;
      window.dispatchEvent(new CustomEvent(STATS_CELL_HOVER, { detail: column }));
    };
    const fromEvent = (event: Event) => announce((event.target as Element | null)?.closest<HTMLElement>("tbody td[data-column]")?.dataset.column ?? null);
    const clear = () => announce(null);
    table.addEventListener("mouseover", fromEvent);
    table.addEventListener("focusin", fromEvent);
    table.addEventListener("mouseleave", clear);
    table.addEventListener("focusout", clear);
    return () => {
      table.removeEventListener("mouseover", fromEvent);
      table.removeEventListener("focusin", fromEvent);
      table.removeEventListener("mouseleave", clear);
      table.removeEventListener("focusout", clear);
      announce(null);
    };
  }, [viewMode, loadingRows]);

  // Databallr: the table frame reaches just above the bottom of the unscrolled page. Only the
  // frame's height is measured (from its own page offset); inside it a flex column gives the rows
  // whatever the toolbar, footer and compare tray leave, so in-frame changes need no re-measure.
  useEffect(() => {
    const frame = scrollRef.current?.closest<HTMLElement>(".stats-table-frame");
    if (!frame) return;
    const fit = () => {
      const top = frame.getBoundingClientRect().top + window.scrollY;
      // The bottom edge lands on a whole pixel (16px above the fold) whatever the top's fraction.
      frame.style.setProperty("--stats-frame-height", `${window.innerHeight - 16 - top}px`);
    };
    // Anything above the frame can settle after mount (fonts, menus, notices). The workspace has a
    // min-height that hides such changes, so watch each ancestor and everything before it instead.
    const observer = new ResizeObserver(fit);
    for (let node: Element | null = frame; node && !node.classList.contains("stats-workspace"); node = node.parentElement) {
      if (node !== frame) observer.observe(node);
      for (let sibling = node.previousElementSibling; sibling; sibling = sibling.previousElementSibling) observer.observe(sibling);
    }
    window.addEventListener("resize", fit);
    // An entering page slides in with a transform, which moves the frame without resizing anything;
    // measure again once any animation or transition settles.
    document.addEventListener("animationend", fit);
    document.addEventListener("transitionend", fit);
    void document.fonts.ready.then(fit);
    fit();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
      document.removeEventListener("animationend", fit);
      document.removeEventListener("transitionend", fit);
      frame.style.removeProperty("--stats-frame-height");
    };
  }, [viewMode]);

  // Use the visible metric bounds to keep one straight divider per group, including
  // rows with shorter values. Recalculate after fonts, rows or column widths change.
  useEffect(() => {
    const table = tableRef.current;
    if (!table || identityMode === "none" || loadingRows) return;
    let active = true;
    const centerGuides = () => {
      if (!active) return;
      const rows = [...(table.tBodies[0]?.rows ?? [])];
      const first = rows[0];
      if (!first?.classList.contains("stats-table-row")) return;
      const offsets: [string, number][] = [];
      for (const guide of first.querySelectorAll<HTMLTableCellElement>(".stats-guide-cell")) {
        const before = guide.previousElementSibling?.querySelector(".stat-main-value");
        if (!before) continue;
        const leadingValues = rows.flatMap(row => {
          const value = row.cells[guide.cellIndex + 1]?.querySelector(".stat-main-value");
          return value ? [value.getBoundingClientRect().left] : [];
        });
        if (!leadingValues.length) continue;
        const cell = guide.getBoundingClientRect();
        const divider = (before.getBoundingClientRect().right + Math.min(...leadingValues)) / 2;
        offsets.push([`--group-guide-offset-${guide.dataset.guideIndex}`, divider - cell.left - cell.width / 2]);
      }
      for (const [variable, offset] of offsets) table.style.setProperty(variable, `${offset}px`);
    };
    const observer = new ResizeObserver(centerGuides);
    observer.observe(table);
    centerGuides();
    void document.fonts.ready.then(centerGuides);
    document.fonts.addEventListener("loadingdone", centerGuides);
    return () => {
      active = false;
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", centerGuides);
    };
  }, [items, preset, identityMode, loadingRows, viewMode]);

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
        {/* Built-in presets, then personal custom views (F04). */}
        <Segmented label="Stats Explorer Presets" size="lg" tone="console" dense value={activePresetId as string}
          onChange={id => handlePresetSelect(id as PresetId)}
          options={[
            ...ORDERED_PRESETS.map(p => ({ value: p.id as string, title: p.description,
              label: <>{p.label}{p.gated && <span className="stats-preset-gated-tag">Partial</span>}</> })),
            ...views.map(v => ({ value: v.id, title: `Custom View: ${v.name} (${v.columns.length} columns)`,
              label: <>{v.name}
                {v.id === defaultViewId && <span className="stats-default-view-star"><Icon name="star" size={14} filled /><span className="sr-only">Default view</span></span>}
                {(v.unavailable_columns?.length ?? 0) > 0 && <span className="stats-preset-gated-tag">Unavailable: {v.unavailable_columns?.length}</span>}</> })),
          ]} />

        <Field label="Table Divider" layout="inline" className="stats-divider-field">
          <Segmented label="Table Divider" size="lg" tone="console" deferChange
            options={IDENTITY_MODES.map(im => ({ value: im.id, label: im.label, title: im.tooltip }))}
            value={identityMode} onChange={handleIdentityModeSelect} />
        </Field>
        <div className="stats-view-actions">
          <Button size="lg" tone="console" icon="columns" onClick={() => { setManageStartsNew(true); setIsManageViewsOpen(true); }}
            title="Create a personal view from any catalog columns">Add View</Button>
          <Button size="lg" tone="console" icon="settings" onClick={() => { setManageStartsNew(false); setIsManageViewsOpen(true); }}
            title="Manage custom views, default view, and import/export">Manage</Button>
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

      <div className={`stats-frame-layout ${viewMode === "table" ? "has-rail" : ""} ${previewCollapsed ? "preview-collapsed" : ""}`}>
      <div className={`stats-table-frame ${viewMode === "table" ? "is-table" : ""}`}>
      <div className="stats-controls-row">
        <strong className="stats-table-brand"><CourtLensWordmark height={16} /></strong>
        <Segmented label="Counting Mode" size="md" deferChange
          options={ORDERED_COUNTING_MODES.map(cm => ({ value: cm.id, label: cm.label, title: cm.tooltip,
            disabled: catalog?.stats_normalizations ? !catalog.stats_normalizations.includes(cm.id) : cm.gated }))}
          value={countingMode} onChange={handleCountingModeSelect} />
        <div className="stats-tool-group" role="group" aria-label="Explorer View Mode">
          <IconButton variant="secondary" icon="scatter" label="Scatter plot" pressed={viewMode === "scatter"}
            onClick={() => setViewMode(viewMode === "scatter" ? "table" : "scatter")} />
          <IconButton variant="secondary" icon="trend" label="Trend lines" pressed={viewMode === "lines"}
            onClick={() => setViewMode(viewMode === "lines" ? "table" : "lines")} />
          <IconButton variant="secondary" icon="users" label="Compare selected players (Z)" onClick={openComparison} disabled={comparedPlayers.length < 2}
            title={comparedPlayers.length < 2 ? "Add two players with + to compare them" : "Compare the first two selected players (Z)"} />
        </div>
        <div className="stats-tool-group" role="group" aria-label="Table tools">
          <Menu className="stats-tool-menu" renderTrigger={props => <IconButton {...props} variant="secondary" icon="settings" label="Table settings" />}>
            <MenuItem icon={showPercentiles ? "eye-off" : "eye"} label={showPercentiles ? "Hide percentiles" : "Show percentiles"}
              onClick={() => setShowPercentiles(value => !value)} />
            <MenuItem icon="save" label={saving ? "Saving…" : "Save legacy scope"} disabled={saving || !legacySaveAvailable}
              onClick={handleSaveInvestigation} />
          </Menu>
          <IconButton variant="secondary" icon="star" filled={favoritesOnly} pressed={favoritesOnly}
            onClick={() => updateParam({ favorites: favoritesOnly ? null : "1" })}
            label={favoritesOnly ? "Show all players" : `Favorites only${favorites.length ? ` (${favorites.length})` : ""}`}
            title={favoritesOnly ? "Show all players" : "Filter to favorite players only"} />
          <IconButton variant="secondary" icon="help" label="Hotkeys" title="Keyboard shortcuts (?)" onClick={() => setIsHotkeysOpen(true)} />
          {/* Active filters keep the selected outline while the panel is closed. */}
          <IconButton variant="secondary" icon="filter" label="Filters" pressed={filtersOpen} data-selected={hasActiveFilters ? "true" : undefined}
            onClick={() => setFiltersOpen(value => !value)} aria-expanded={filtersOpen} aria-controls="stats-filters"
            title={hasActiveFilters ? "Filters (active) · F" : "Filters · F"} />
          {/* Alphabetical order lives with the table tools; the search then spans the cards. */}
          <IconButton variant="secondary" icon={nameSorted && currentSortDirection === "asc" ? "sort-za" : "sort-az"} label="Sort by Player" pressed={nameSorted}
            onClick={() => nameSorted ? updateParam({ sortMetric: "player_name", sortDirection: currentSortDirection === "asc" ? "desc" : "asc" })
              : updateParam({ sortMetric: "player_name", sortDirection: "asc" })}
            title={nameSorted && currentSortDirection === "asc" ? "Sort players Z–A" : "Sort players A–Z"} />
          <IconButton variant="secondary" icon="reset" label="Reset table" title="Reset sort and filters" onClick={resetTable} />
        </div>
        <span className="stats-expand-action">
          <IconButton icon={isExpanded ? "collapse" : "expand"} label={isExpanded ? "Standard height" : "Expand table"} title="Expand table (T)"
            pressed={isExpanded} onClick={() => setIsExpanded(value => !value)} />
        </span>
      </div>

      {actionError && <div role="alert" className="notice-box stats-action-error">
        {actionError} <Button size="xs" onClick={() => setActionError(null)}>Dismiss</Button>
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
          <Button size="md" className="stats-filter-reset" onClick={handleResetFilters} title="Reset all active search and sample filters">
            Reset Filters
          </Button>
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
              <span className="filter-clear-slot">
                <IconButton
                  size="xs"
                  icon="close"
                  label="Clear player search"
                  onClick={() => {
                    setLocalName("");
                    updateParam({ name: null });
                  }}
                />
              </span>
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
          <div className="stats-table-layout">
          <div ref={scrollRef} role="region" aria-label="Player statistics scroll area" aria-busy={loadingRows} tabIndex={0} onKeyDown={handleTableKey} className={`table-wrapper stats-scroll-region ${tableDensity === "compact" ? "density-compact" : "density-standard"}`}>
            <table ref={tableRef} className="data-table dense-stats-table" aria-label="Dense player statistics explorer"
              style={{
                "--table-min-width": `calc(88px + var(--identity-name-width) + ${preset.columns.length * 64 + wideColumns * 16 + guideCount * 40}px)`,
                "--table-width": `min(100%, calc(88px + var(--identity-name-width) + ${preset.columns.length * 88 + guideCount * 40}px))`
              } as React.CSSProperties}>
              <colgroup>
                <col className="col-select" />
                <col className="stats-name-column" />
                {preset.columns.map((col, index) => <Fragment key={col.key}>
                  {identityMode !== "none" && guideStarts.has(index) && <col className="col-guide" />}
                  <col className={`stats-metric-column ${isWideLabel(col.label) ? "is-wide" : ""}`} />
                </Fragment>)}
                <col className="col-actions" />
              </colgroup>
              <thead>
                {/* Tier 1 Header: Group Categories */}
                <tr className="stats-header-tier-1">
              <th
                colSpan={2}
                className="pinned-col-group text-left pl-3"
              >
                <span className="sr-only">Players</span>
              </th>
              {headerGroups.map((group, gIdx) => (
                <Fragment key={`${group.label}-${gIdx}`}>
                  {identityMode !== "none" && gIdx > 0 && <th className="stats-guide-cell" aria-hidden="true" />}
                  <th
                    colSpan={group.colSpan}
                    className="stats-group-th" scope="colgroup"
                  >
                    {group.label}
                  </th>
                </Fragment>
              ))}
              <th className="stats-actions-header">Actions</th>
            </tr>

            {/* Tier 2 Header: Individual Metrics */}
            <tr className="stats-header-tier-2" onMouseOver={showHeaderTip} onFocus={showHeaderTip}
              onMouseLeave={hideHeaderTip} onBlur={hideHeaderTip}>
              {/* Databallr: one search field spans the compare and name columns, flush with the cards. */}
              <th colSpan={2} className="pinned-col pinned-col-search" scope="col" aria-sort={currentSortMetric === "name" || currentSortMetric === "player_name" ? currentSortDirection === "asc" ? "ascending" : "descending" : "none"}>
                <div className="stats-header-search" role="search">
                  <div className="lookup-input-wrapper">
                    <Icon name="search" className="lookup-search-icon" />
                    <input ref={nameInputRef} type="search" className="lookup-input" aria-label="Filter players by name"
                      placeholder="Search players…" autoComplete="off" spellCheck={false} value={localName}
                      onChange={event => setLocalName(event.target.value)}
                      onKeyDown={event => {
                        if (event.key === "Enter") { event.preventDefault(); if (typedName !== lastName) pushName(typedName); }
                        else if (event.key === "Escape" && localName) { event.preventDefault(); setLocalName(""); }
                      }} />
                    {localName && <IconButton size="sm" icon="close" label="Clear player search"
                      onClick={() => { setLocalName(""); pushName(""); nameInputRef.current?.focus(); }} />}
                  </div>
                </div>
              </th>

              {/* Scrollable Metric Column Headers */}
              {preset.columns.map((col, index) => <Fragment key={col.key}>
                {identityMode !== "none" && guideStarts.has(index) && <th className="stats-guide-cell" aria-hidden="true" />}
                <SortHeader column={col.key} label={col.label} metric={col.sortMetric} onSort={handleSort}
                  active={currentSortMetric === col.sortMetric} direction={currentSortDirection}
                  sortable={!catalog?.stats_sort_fields || catalog.stats_sort_fields.includes(col.sortMetric)}
                  description={col.tooltip} className={col.num ? "num" : ""} />
              </Fragment>)}

              <th className="stats-detail-header text-center">Pin</th>
            </tr>
          </thead>

          {loadingRows ? (
            <tbody className="stats-skeleton-body" aria-hidden="true">
              {Array.from({ length: SKELETON_ROW_COUNT }, (_, rowIndex) => (
                <tr key={rowIndex} className="stats-table-row stats-skeleton-row">
                  <td className="pinned-col pinned-col-select" />
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
                    {identityMode !== "none" && guideStarts.has(index) && <td className="stats-guide-cell" style={guideGeometry(index)}>
                      <span className="stats-guide-marker"><Skeleton variant="circle" width={30} height={30} /></span>
                    </td>}
                    <td className={`stats-metric-cell stats-group-${headerGroups.findIndex(group => index >= group.start && index < group.start + group.colSpan) % 2}`}>
                      <Skeleton variant="text" width={40} className="stats-skeleton-value" />
                    </td>
                  </Fragment>)}
                  <td className="stats-row-actions" />
                </tr>
              ))}
            </tbody>
          ) : (
          <tbody className={`stats-table-body-enter ${searchingRows ? "stats-table-body-searching" : ""}`}>
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={preset.columns.length + guideCount + 3}
                  className="stats-empty-cell text-muted text-center"
                >
                  <p className="stats-empty-title">
                    {urlName ? `No players match “${urlName}” under the current filters.` : "No players matched the current query filters."}
                  </p>
                  <Button size="md" onClick={handleResetFilters}>
                    Clear Search &amp; Sample Filters
                  </Button>
                </td>
              </tr>
            ) : (
              items.map((player) => {
                const isCompared = comparedPlayers.some((p) => p.player_id === player.player_id);

                return (
                  <tr
                    key={player.player_id}
                    className={`stats-table-row ${isCompared ? "row-selected" : ""}`}
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
                      <button type="button" className="stats-compare-toggle" aria-pressed={isCompared}
                        onClick={() => handleToggleCompare(player)}
                        aria-label={isCompared ? `Remove ${player.player_name} from comparison` : `Add ${player.player_name} to comparison`}
                        title={isCompared ? "Remove from comparison (C)" : "Add to comparison (C)"}>
                        <Icon name={isCompared ? "circle-check" : "circle-plus"} />
                      </button>
                    </td>

                    {/* Pinned Col 3: Players */}
                    <td className="pinned-col pinned-col-name">
                      <div className="player-cell">
                        <TeamLogoStack teams={player.teams ?? []} />
                        <PlayerPortrait key={player.player_id} playerId={player.player_id} name={player.player_name}
                          portraitUrl={player.portrait_url} size="sm" className="stats-primary-portrait" />
                        <div className="stats-identity-copy"><Link href={`/players/${player.player_id}?${new URLSearchParams({
                          season: query.season, phase: query.phase, beforeDate: query.before_date,
                          window: query.window, ...(query.release_id ? { releaseId: query.release_id } : {}),
                          [STATS_RETURN_PARAM]: "stats"
                        })}`} title={player.player_name} aria-label={player.player_name} className="stats-player-link"
                          onClick={rememberTablePosition}>
                          <span className="player-cell-name font-semibold">{player.player_name}</span>
                        <span className="player-cell-teams">{player.teams?.join(" / ") || "Team unknown"}{player.position && <> · <abbr title={querySpec?.season_scope?.seasons?.length ? "Estimated position, latest season in the range" : "Estimated position"}>{player.position}</abbr></>} · {seasonLabel}</span>
                        </Link>
                        {player.table_qualified === false && <span className="table-small-sample">Small sample</span>}
                        </div>
                        <IconButton size="xs" icon="cards" label={`Open details for ${player.player_name}`} title="Open full player details"
                          onClick={() => setSelectedPlayerForDrawer(player)} />
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
                          {identityMode !== "none" && guideStarts.has(index) && <td className="stats-guide-cell" data-guide-index={index} style={guideGeometry(index)} aria-hidden="true">
                            <span className="stats-guide-marker"><GroupGuide mode={identityMode} player={player} /></span>
                          </td>}
                        <td data-column={col.key}
                          className={`stats-metric-cell stats-group-${headerGroups.findIndex(group => index >= group.start && index < group.start + group.colSpan) % 2} ${col.num ? "num" : ""}`}
                        >
                          <button type="button" className="stats-cell-button" onClick={() => setTrendTarget({ player, columnKey: col.key })}
                            aria-label={`${col.label} ${player.metrics[metricKey] == null ? "unknown" : formatted} for ${player.player_name}. Open ${col.label} trend`}>
                            <PercentileCell variant="text" showPercentile={showPercentiles}
                              value={player.metrics[metricKey] == null ? null : formatted}
                              percentile={pct} qualified={qualified} label={col.label}
                              cohort={`${player.table_cohort_sample_sizes?.[metricKey] ?? "Unknown"} valid league players; ${data.table_cohort?.min_season_minutes ?? 500}+ season minutes`} />
                          </button>
                        </td>
                        </Fragment>
                      );
                    })}

                    {/* Actions Cell */}
                    <td className="stats-row-actions">
                      <span className="stats-row-pin">
                        <IconButton size="xs" icon="pin" label={`Pin preview for ${player.player_name}`} title="Pin player preview"
                          onClick={() => { setPreviewPlayer(player); setPreviewPinned(true); setPreviewCollapsed(false); }} />
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          )}
        </table>
      </div>

      </div>

      {/* Footer: records, density, view and scroll steppers, filters, expand, paging */}
      <div className="stats-pagination-footer">
        <div className="stats-results-meta">
          <span className="stats-record-dot" aria-hidden="true" />
          <span className="stats-record-count">{(data.total_output_players ?? data.total_eligible_players).toLocaleString("en-US")} records</span>
          <span className="stats-sort-caption">{(data.output_offset ?? 0) + 1}–{(data.output_offset ?? 0) + items.length}{data.total_output_players != null && data.total_output_players !== data.total_eligible_players ? ` · of ${data.total_eligible_players.toLocaleString("en-US")} eligible` : ""}</span>
          <span className="stats-sort-caption" title="Same season, phase and window. Search, team and sample filters, favorites and paging do not change the league reference. Lower is better for turnovers, fouls and opponent allowance.">
            Percentiles vs {data.table_cohort?.qualified_players ?? "unknown number of"} players · {data.table_cohort?.min_season_minutes ?? 500}+ min
          </span>
          {data.darko && <DarkoSourceLink title={`DARKO by Kostya Medvedovsky. ${data.darko.limitations.join(" ")}`}>
            DARKO · {data.darko.data_date ? `through ${formatDate(data.darko.data_date)}` : "unavailable in this scope"}
          </DarkoSourceLink>}
        </div>
        <div className="stats-footer-controls">
          <div className="stats-footer-group" role="group" aria-label="Row density">
            <Button size="xs" variant="ghost" dense onClick={() => handleDensityChange("compact")}
              pressed={tableDensity === "compact"} aria-label="Compact rows (W)"><span aria-hidden="true">−W</span></Button>
            <span className="stats-density-meter" role="img" aria-label={tableDensity === "compact" ? "Compact density" : "Standard density"}>
              <span className="is-on" /><span className={tableDensity === "standard" ? "is-on" : ""} />
            </span>
            <Button size="xs" variant="ghost" dense onClick={() => handleDensityChange("standard")}
              pressed={tableDensity === "standard"} aria-label="Standard rows (E)"><span aria-hidden="true">E+</span></Button>
          </div>
          <div className="stats-footer-group" role="group" aria-label="View">
            <IconButton size="xs" icon="left" label="Previous view" onClick={() => stepView(-1)} />
            <span className="stats-footer-label" aria-hidden="true">View</span>
            <IconButton size="xs" icon="right" label="Next view" onClick={() => stepView(1)} />
          </div>
          <div className="stats-footer-group" role="group" aria-label="Scroll">
            <Button size="xs" variant="ghost" dense onClick={() => scrollTable(-1)} aria-label="Scroll table left (A)"><kbd aria-hidden="true">A</kbd><Icon name="left" size={14} /></Button>
            <span className="stats-footer-label" aria-hidden="true">Scroll</span>
            <Button size="xs" variant="ghost" dense onClick={() => scrollTable(1)} aria-label="Scroll table right (D)"><Icon name="right" size={14} /><kbd aria-hidden="true">D</kbd></Button>
          </div>
          <div className="stats-footer-group is-single">
            <Button size="xs" variant="ghost" dense icon="filter" onClick={() => setFiltersOpen(value => !value)}
              pressed={filtersOpen} aria-label="Toggle filters (F)"><span aria-hidden="true">Filters</span><kbd aria-hidden="true">F</kbd></Button>
          </div>
          <div className="stats-footer-group is-single">
            <Button size="xs" variant="ghost" dense icon={isExpanded ? "collapse" : "expand"} onClick={() => setIsExpanded(value => !value)}
              pressed={isExpanded} aria-label={isExpanded ? "Standard height (T)" : "Expand table (T)"}><kbd aria-hidden="true">T</kbd></Button>
          </div>
        </div>
        <div className="stats-pagination-actions">
          <Button size="xs" icon="left"
            onClick={() => {
              const params = new URLSearchParams(searchParams?.toString() ?? "");
              params.delete("cursor");
              router.push(`${pathname}?${params.toString()}`);
            }}
            disabled={!searchParams?.get("cursor")}
          >
            First Page
          </Button>

          {data.has_more && data.next_cursor && (
            <Button size="xs" variant="primary" iconAfter="right" onClick={() => updateParam({ cursor: data.next_cursor })}>
              Next Page
            </Button>
          )}
        </div>

      </div>
      </>
      )}

      {/* Compare tray (F05) sits inside the frame: the rows give up the space, the frame keeps its height. */}
      <CompareTray
        selectedPlayers={comparedPlayers}
        onRemovePlayer={handleRemoveCompare}
        onClearAll={handleClearCompare}
        context={contextBundle}
      />
      </div>
      {viewMode === "table" && <StatsPreviewRail player={previewPlayer} columns={preset.columns} season={query.season}
        eligiblePlayers={data.total_eligible_players} goodDirections={data.cohort?.good_directions}
        showPercentiles={showPercentiles} pinned={previewPinned} collapsed={previewCollapsed}
        onTogglePin={() => setPreviewPinned(value => !value)}
        onToggleCollapse={() => setPreviewCollapsed(value => !value)}
        onOpenDetails={setSelectedPlayerForDrawer}
        isFavorite={previewPlayer ? isFavorite(previewPlayer.player_id) : false}
        onToggleFavorite={previewPlayer ? () => handleFavorite(previewPlayer.player_id) : undefined} />}
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


      <StatsHeaderTip tip={headerTip} onEnter={keepHeaderTip} onLeave={hideHeaderTip} onClose={() => { keepHeaderTip(); setHeaderTip(null); }} />
      {querySpec && <StatsTrendDialog target={trendTarget} columns={preset.columns} querySpec={querySpec} catalog={catalog}
        hints={metricHints} onClose={() => setTrendTarget(null)} />}

      {/* Keyboard Shortcuts Modal */}
      <HotkeysModal isOpen={isHotkeysOpen} onClose={() => setIsHotkeysOpen(false)} />

      {/* Manage Custom Views Modal (F04) */}
      <ManageViewsModal
        isOpen={isManageViewsOpen}
        onClose={() => setIsManageViewsOpen(false)}
        activeViewId={activePresetId}
        startWithNewView={manageStartsNew}
        onSelectView={(viewId) => {
          handlePresetSelect(viewId as PresetId);
        }}
      />
    </div>
  );
}
