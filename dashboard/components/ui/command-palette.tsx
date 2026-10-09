import {
  useState,
  useEffect,
  useRef,
  type KeyboardEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence, modalVariants, scrimVariants } from "../../lib/motion";
import { Icon, type IconName } from "./icon";
import { OverlayPortal } from "./overlay-portal";
import { PlayerPortrait } from "../player-portrait";
import { TeamLogo, TeamLogoStack } from "../team-logo";
import { queryLookup } from "@/lib/workbench-api";
import { buildPreservedContextUrl } from "@/lib/query-url";
import { defaultLookupCache, buildLookupCacheKey } from "@/lib/lookup-cache";
import { rememberRecentSearch, useRecentSearches } from "@/lib/recent-searches";
import type { LookupItem, LookupAvailability } from "@/lib/types";

export interface CommandItem {
  id: string;
  label: string;
  subtitle?: string;
  icon?: IconName;
  onSelect: () => void;
}

export interface CommandGroup {
  name: string;
  items: CommandItem[];
}

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  groups: CommandGroup[];
  placeholder?: string;
  className?: string;
}

/** Standard CommandPalette for static groups with client-side query filtering */
export function CommandPalette({
  isOpen,
  onClose,
  groups,
  placeholder = "Type a command or search…",
  className = "",
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  // Filter groups
  const filteredGroups = groups
    .map(group => ({
      ...group,
      items: group.items.filter(item =>
        item.label.toLowerCase().includes(query.toLowerCase()) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(query.toLowerCase()))
      ),
    }))
    .filter(group => group.items.length > 0);

  const flatItems = filteredGroups.flatMap(g => g.items);
  const activeIndex = flatItems.length > 0 ? Math.min(selectedIndex, flatItems.length - 1) : 0;

  const handleQueryChange = (val: string) => {
    setQuery(val);
    setSelectedIndex(0);
  };

  const handleClose = () => {
    setQuery("");
    setSelectedIndex(0);
    onClose();
  };

  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      triggerRef.current = document.activeElement as HTMLElement;
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    } else if (wasOpenRef.current && triggerRef.current) {
      wasOpenRef.current = false;
      triggerRef.current.focus();
    }
  }, [isOpen]);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      handleClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (flatItems.length > 0) {
        setSelectedIndex(prev => (prev + 1) % flatItems.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (flatItems.length > 0) {
        setSelectedIndex(prev => (prev - 1 + flatItems.length) % flatItems.length);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (flatItems[activeIndex]) {
        flatItems[activeIndex].onSelect();
        handleClose();
      }
    }
  };

  let globalIndexCounter = 0;

  return (
    <OverlayPortal>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            variants={scrimVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="ui-scrim ui-command-palette-scrim"
            onClick={handleClose}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Command palette"
              tabIndex={-1}
              variants={modalVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className={`ui-command-palette ${className}`}
              onClick={e => e.stopPropagation()}
              onKeyDown={handleKeyDown}
            >
              <div className="ui-command-input-wrapper">
                <Icon name="search" size={18} className="ui-command-search-icon" />
                <input
                  ref={inputRef}
                  type="text"
                  role="combobox"
                  aria-expanded="true"
                  aria-autocomplete="list"
                  aria-controls="ui-command-listbox"
                  value={query}
                  onChange={e => handleQueryChange(e.target.value)}
                  placeholder={placeholder}
                  className="ui-command-input"
                />
                <kbd className="ui-command-shortcut">Esc</kbd>
              </div>

              <div id="ui-command-listbox" ref={listRef} className="ui-command-list" role="listbox">
                {filteredGroups.length === 0 ? (
                  <div className="ui-command-empty">No results found for &ldquo;{query}&rdquo;</div>
                ) : (
                  filteredGroups.map(group => (
                    <div key={group.name} className="ui-command-group">
                      <div className="ui-command-group-heading">{group.name}</div>
                      {group.items.map(item => {
                        const itemIndex = globalIndexCounter++;
                        const isSelected = itemIndex === activeIndex;
                        return (
                          <div
                            key={item.id}
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => {
                              item.onSelect();
                              handleClose();
                            }}
                            onMouseEnter={() => setSelectedIndex(itemIndex)}
                            className={`ui-command-item ${isSelected ? "ui-command-item-active" : ""}`}
                          >
                            {item.icon && <Icon name={item.icon} size={16} />}
                            <div className="ui-command-item-text">
                              <span className="ui-command-item-label">{item.label}</span>
                              {item.subtitle && (
                                <span className="ui-command-item-subtitle text-muted">
                                  {item.subtitle}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </OverlayPortal>
  );
}

const KIND_LABEL: Record<LookupItem["kind"], string> = { player: "Player", team: "Team", page: "Page" };

/** Formats compact player captions */
function compactCaption(item: LookupItem) {
  if (item.kind !== "player") return item.subtitle;
  if (item.availability?.status === "no_current_games") return "No stats in selected scope";
  const association = item.team_association;
  if (!association?.teams.length) return undefined;
  return `${association.teams.join(" / ")}${association.basis === "last_observed" ? " · Last observed team" : association.season ? ` · ${association.season}` : " · Selected scope"}`;
}

const DEFAULT_PAGE_AVAILABILITY: LookupAvailability = {
  has_current_season: true,
  status: "available",
  seasons: [],
  latest_tricode: null,
};

const DEFAULT_QUICK_ACTIONS: LookupItem[] = [
  {
    id: "action-stats",
    canonical_id: "stats",
    kind: "page",
    display_name: "Stats Workspace",
    subtitle: "Player and team statistics, leaderboards, and rate percentiles",
    destination_url: "/stats",
    match_basis: "exact",
    match_score: 1.0,
    availability: DEFAULT_PAGE_AVAILABILITY,
  },
  {
    id: "action-live",
    canonical_id: "live",
    kind: "page",
    display_name: "Live Scoreboard & Finals",
    subtitle: "Real-time game tracking, win probabilities, and postseason series",
    destination_url: "/live",
    match_basis: "exact",
    match_score: 1.0,
    availability: DEFAULT_PAGE_AVAILABILITY,
  },
  {
    id: "action-players",
    canonical_id: "players",
    kind: "page",
    display_name: "Player Directory",
    subtitle: "Active roster search, career profiles, and statistical peers",
    destination_url: "/players",
    match_basis: "exact",
    match_score: 1.0,
    availability: DEFAULT_PAGE_AVAILABILITY,
  },
  {
    id: "action-teams",
    canonical_id: "teams",
    kind: "page",
    display_name: "Team Stats & Cohorts",
    subtitle: "Efficiency ratings, four factors, and team comparison",
    destination_url: "/teams",
    match_basis: "exact",
    match_score: 1.0,
    availability: DEFAULT_PAGE_AVAILABILITY,
  },
  {
    id: "action-compare",
    canonical_id: "compare",
    kind: "page",
    display_name: "Player Comparison",
    subtitle: "Multi-player radar charts, differential tables, and percentiles",
    destination_url: "/compare",
    match_basis: "exact",
    match_score: 1.0,
    availability: DEFAULT_PAGE_AVAILABILITY,
  },
  {
    id: "action-ask",
    canonical_id: "ask",
    kind: "page",
    display_name: "Ask CourtLens AI",
    subtitle: "Natural language analytics assistant with evidence citations",
    destination_url: "/research/ask",
    match_basis: "exact",
    match_score: 1.0,
    availability: DEFAULT_PAGE_AVAILABILITY,
  },
  {
    id: "action-rapm",
    canonical_id: "rapm",
    kind: "page",
    display_name: "RAPM Research",
    subtitle: "Regularized adjusted plus-minus and six-factor possessions",
    destination_url: "/research/rapm",
    match_basis: "exact",
    match_score: 1.0,
    availability: DEFAULT_PAGE_AVAILABILITY,
  },
];

export interface GlobalCommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

/**
 * GlobalCommandPalette connects directly to CourtLens Workbench API (global-lookup)
 * with real-time candidate search, keyboard navigation, grouped results, and preserved context.
 */
export function GlobalCommandPalette({
  isOpen,
  onClose,
  triggerRef: externalTriggerRef,
}: GlobalCommandPaletteProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [items, setItems] = useState<LookupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const internalTriggerRef = useRef<HTMLElement | null>(null);
  const activeTrigger = externalTriggerRef ?? internalTriggerRef;
  const controller = useRef<AbortController | null>(null);

  const releaseId = searchParams.get("releaseId") ?? searchParams.get("release_id") ?? undefined;
  const season = searchParams.get("season") ?? undefined;
  const phase = searchParams.get("phase") ?? undefined;
  const beforeDate = searchParams.get("beforeDate") ?? searchParams.get("before_date") ?? undefined;

  const wasOpenRef = useRef(false);

  // On open, trap focus into input; on close, restore to trigger
  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      if (!externalTriggerRef?.current) {
        internalTriggerRef.current = document.activeElement as HTMLElement;
      }
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    } else if (wasOpenRef.current && activeTrigger.current) {
      wasOpenRef.current = false;
      activeTrigger.current.focus();
    }
  }, [isOpen, externalTriggerRef, activeTrigger]);

  useEffect(() => {
    if (!isOpen) return;
    const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        setQuery("");
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [isOpen, onClose]);

  // Query API when query changes
  useEffect(() => {
    controller.current?.abort();
    if (!isOpen) return;

    const trimmed = query.trim();
    if (!trimmed) {
      return;
    }

    const cacheKey = buildLookupCacheKey({
      query: trimmed,
      releaseId,
      season,
      phase,
      beforeDate,
      limit: 12,
    });

    const abort = new AbortController();
    controller.current = abort;

    const timer = setTimeout(async () => {
      const cached = defaultLookupCache.get(cacheKey);
      if (cached) {
        setItems(cached.items);
        setLoading(false);
        setSelectedIndex(0);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const response = await queryLookup({
          query: trimmed,
          releaseId,
          season,
          phase,
          beforeDate,
          limit: 12,
          signal: abort.signal,
        });

        if (!abort.signal.aborted) {
          defaultLookupCache.set(cacheKey, response);
          setItems(response.items);
          setLoading(false);
          setSelectedIndex(0);
        }
      } catch {
        if (!abort.signal.aborted) {
          setLoading(false);
          setError("Search is temporarily unavailable. Check backend connection.");
        }
      }
    }, 120);

    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query, isOpen, releaseId, season, phase, beforeDate]);

  // Result groupings
  const isQueryEmpty = query.trim() === "";
  const recents = useRecentSearches();
  const players = items.filter(i => i.kind === "player");
  const teams = items.filter(i => i.kind === "team");
  const pages = items.filter(i => i.kind === "page");

  // D8: one search with grouped results. The empty state shows bounded local recents, then pages.
  const displayGroups: { name: string; recent?: boolean; items: LookupItem[] }[] = isQueryEmpty
    ? [
        ...(recents.length > 0 ? [{ name: "Recent", recent: true, items: recents }] : []),
        { name: "Pages", items: DEFAULT_QUICK_ACTIONS },
      ]
    : [
        ...(players.length > 0 ? [{ name: "Players", items: players }] : []),
        ...(teams.length > 0 ? [{ name: "Teams", items: teams }] : []),
        ...(pages.length > 0 ? [{ name: "Pages", items: pages }] : []),
      ];

  const flatItems = displayGroups.flatMap(g => g.items);
  const activeIndex = flatItems.length > 0 ? Math.min(selectedIndex, flatItems.length - 1) : -1;

  const handleSelect = (item: LookupItem) => {
    rememberRecentSearch(item);
    onClose();
    setQuery("");
    const url = buildPreservedContextUrl(item.destination_url, searchParams);
    router.push(url);
  };

  const handleRawSubmit = () => {
    const trimmed = query.trim();
    if (trimmed) {
      onClose();
      setQuery("");
      const url = buildPreservedContextUrl(`/stats?name=${encodeURIComponent(trimmed)}`, searchParams);
      router.push(url);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      setQuery("");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (flatItems.length > 0) {
        setSelectedIndex(prev => (prev + 1) % flatItems.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (flatItems.length > 0) {
        setSelectedIndex(prev => (prev - 1 + flatItems.length) % flatItems.length);
      }
    } else if (e.key === "Home") {
      e.preventDefault();
      setSelectedIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setSelectedIndex(flatItems.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && flatItems[activeIndex]) {
        handleSelect(flatItems[activeIndex]);
      } else {
        handleRawSubmit();
      }
    }
  };

  let globalCounter = 0;

  return (
    <OverlayPortal>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            variants={scrimVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="ui-scrim ui-command-palette-scrim"
            onClick={() => {
              onClose();
              setQuery("");
            }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="CourtLens global command palette"
              tabIndex={-1}
              variants={modalVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="ui-command-palette"
              onClick={e => e.stopPropagation()}
              onKeyDown={handleKeyDown}
            >
              <div className="ui-command-input-wrapper lookup-input-wrapper">
                <Icon name="search" size={18} className="ui-command-search-icon lookup-search-icon" />
                <input
                  ref={inputRef}
                  type="text"
                  role="combobox"
                  aria-label="Search players, teams and pages"
                  aria-expanded="true"
                  aria-autocomplete="list"
                  aria-controls="global-command-list"
                  aria-activedescendant={activeIndex >= 0 ? `global-cmd-opt-${activeIndex}` : undefined}
                  value={query}
                  onChange={e => {
                    const val = e.target.value;
                    setQuery(val);
                    setSelectedIndex(0);
                    if (!val.trim()) {
                      setItems([]);
                      setLoading(false);
                      setError(null);
                    }
                  }}
                  placeholder="Search players, teams, leaderboards, or research tools…"
                  className="ui-command-input lookup-input"
                />
                {query && (
                  <button
                    type="button"
                    className="lookup-clear-btn"
                    aria-label="Clear search"
                    onClick={() => {
                      setQuery("");
                      setItems([]);
                      setSelectedIndex(0);
                      inputRef.current?.focus();
                    }}
                  >
                    <Icon name="close" size={14} />
                  </button>
                )}
                {!query && <kbd className="ui-command-shortcut">Esc</kbd>}
                <button
                  type="button"
                  className="ui-command-close"
                  aria-label="Close search"
                  onClick={() => {
                    onClose();
                    setQuery("");
                  }}
                >
                  Cancel
                </button>
              </div>

              <div
                id="global-command-list"
                className="ui-command-list lookup-listbox"
                role="listbox"
                aria-label="Search suggestions"
              >
                {loading && <div className="lookup-status-message">Searching…</div>}

                {error && (
                  <div className="lookup-status-message error">
                    {error}
                  </div>
                )}

                {!loading && !error && !isQueryEmpty && flatItems.length === 0 && (
                  <div className="lookup-status-message">
                    No matches for &ldquo;{query}&rdquo;. Try another spelling or tricode.
                  </div>
                )}

                {!loading &&
                  !error &&
                  displayGroups.map(group => (
                    <div key={group.name} className="ui-command-group">
                      <div className="lookup-group-header ui-command-group-heading">
                        {group.name}
                      </div>
                      {group.items.map(item => {
                        const itemIndex = globalCounter++;
                        const isSelected = itemIndex === activeIndex;
                        const caption = group.recent ? KIND_LABEL[item.kind] : compactCaption(item) ?? KIND_LABEL[item.kind];

                        return (
                          <div
                            key={`${group.name}:${item.kind}:${item.canonical_id}`}
                            id={`global-cmd-opt-${itemIndex}`}
                            role="option"
                            tabIndex={-1}
                            aria-selected={isSelected}
                            data-active={isSelected}
                            onClick={() => handleSelect(item)}
                            onMouseEnter={() => setSelectedIndex(itemIndex)}
                            className={`ui-command-item lookup-option ${
                              isSelected ? "ui-command-item-active selected" : ""
                            }`}
                          >
                            <span className="lookup-item-leading">
                              {item.kind === "player" ? (
                                <PlayerPortrait
                                  playerId={
                                    item.metadata?.identity_namespace === "planner"
                                      ? undefined
                                      : item.canonical_id
                                  }
                                  name={item.display_name}
                                  portraitUrl={item.portrait_url}
                                  size="sm"
                                />
                              ) : item.kind === "team" ? (
                                <TeamLogo team={item.portrait_fallback ?? item.canonical_id} size={28} />
                              ) : (
                                <Icon
                                  name={
                                    group.recent
                                      ? "history"
                                      : item.id.includes("ask")
                                      ? "message"
                                      : item.id.includes("live")
                                      ? "play"
                                      : "page"
                                  }
                                  size={16}
                                />
                              )}
                            </span>

                            <span className="lookup-item-content ui-command-item-text">
                              <span className="lookup-item-name ui-command-item-label">
                                {item.display_name}
                              </span>
                              <span className="lookup-item-subtitle ui-command-item-subtitle">
                                {item.kind === "player" && !group.recent && (
                                  <TeamLogoStack
                                    decorative
                                    size={16}
                                    teams={item.team_association?.teams ?? []}
                                    label={
                                      item.team_association?.basis === "last_observed"
                                        ? "Last observed team"
                                        : "Teams observed in selected scope"
                                    }
                                  />
                                )}
                                {caption}
                              </span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
              </div>

              <div className="ui-command-footer" aria-hidden="true">
                <span><kbd><Icon name="up" size={14} /></kbd><kbd><Icon name="down" size={14} /></kbd> Navigate</span>
                <span><kbd><Icon name="enter" size={14} /></kbd> Open</span>
                <span><kbd>Esc</kbd> Close</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </OverlayPortal>
  );
}
