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
import { Button, IconButton, Segmented } from "./kit";
import { PlayerPortrait } from "../player-portrait";
import { TeamLogo, TeamLogoStack } from "../team-logo";
import { queryLookup } from "@/lib/workbench-api";
import { defaultLookupCache, buildLookupCacheKey } from "@/lib/lookup-cache";
import { clearRecentSearches, forgetRecentSearch, IDLE_SETTLE_MS, readRecentSearches, rememberRecentSearch, useRecentSearches, useScopedRecents } from "@/lib/recent-searches";
import { groupBySection, isStrongPageMatch, searchSitePages, SITE_PAGES, sitePageFor, type SitePage } from "@/lib/site-pages";
import { nicknameCaption } from "@/lib/lookup-caption";
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
                <Icon name="search" size={20} className="ui-command-search-icon" />
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

/** A player reads as their team code(s) only; picking one opens their latest valid season (owner,
    2026-10-15: no scope wording in search results). */
function compactCaption(item: LookupItem) {
  if (item.kind !== "player") return item.subtitle;
  const teams = item.team_association?.teams ?? [];
  return teams.length ? teams.join(" / ") : undefined;
}

/** What the search covers: everything, or one kind of result. */
type SearchScope = "all" | "pages" | "players" | "teams";

const SCOPES: { value: SearchScope; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pages", label: "Pages" },
  { value: "players", label: "Players" },
  { value: "teams", label: "Teams" },
];

const SCOPE_KINDS: Record<Exclude<SearchScope, "pages">, ("player" | "team")[]> = {
  all: ["player", "team"],
  players: ["player"],
  teams: ["team"],
};

/** Rows per group under All; each group's "See all" opens its own scope. */
const ALL_LIMITS = { pages: 4, players: 6, teams: 3 } as const;
/** Pages shown before typing under All, ahead of the "See all" link to the full list. */
const IDLE_PAGE_HREFS = ["/stats", "/live", "/players", "/teams", "/compare", "/research/win-probability"];
const LOOKUP_LIMIT = 20;

const PAGE_AVAILABILITY: LookupAvailability = { has_current_season: true, status: "available", seasons: [], latest_tricode: null };

/** A page as a recent search; its path is its identity, so renamed pages refresh from the index. */
function pageAsLookupItem(page: SitePage): LookupItem {
  return {
    id: `page:${page.href}`,
    kind: "page",
    canonical_id: page.href,
    display_name: page.label,
    subtitle: page.description,
    match_basis: "exact",
    match_score: 1,
    availability: PAGE_AVAILABILITY,
    destination_url: page.href,
  };
}

/** Stored page recents point at the page that has their path today; removed pages drop out. */
function refreshPageRecents(items: LookupItem[]): LookupItem[] {
  const seen = new Set<string>();
  return items.flatMap(item => {
    if (item.kind !== "page") return [item];
    const page = sitePageFor(item.destination_url);
    if (!page || seen.has(page.href)) return [];
    seen.add(page.href);
    return [pageAsLookupItem(page)];
  });
}

type Row = { type: "entity"; item: LookupItem; recent?: boolean } | { type: "page"; page: SitePage; showSection: boolean };

interface DisplayGroup {
  key: string;
  name: string;
  rows: Row[];
  /** Matches in total, when more exist than the group shows. */
  total?: number;
  seeAll?: SearchScope;
  recent?: boolean;
  /** A line in place of rows: searching, unavailable or nothing found. */
  status?: { text: string; error?: boolean };
}

function rowKey(group: DisplayGroup, row: Row) {
  return row.type === "page" ? `${group.key}:page:${row.page.href}` : `${group.key}:${row.item.kind}:${row.item.canonical_id}`;
}

export interface GlobalCommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

/**
 * The site search: every canonical page (searched here, from the navigation model) and every
 * player and team (the workbench lookup), in separate groups, with a scope to narrow to one kind.
 */
export function GlobalCommandPalette({
  isOpen,
  onClose,
  triggerRef: externalTriggerRef,
}: GlobalCommandPaletteProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>("all");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [lookup, setLookup] = useState<{ key: string; items: LookupItem[]; total: number } | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const internalTriggerRef = useRef<HTMLElement | null>(null);
  const activeTrigger = externalTriggerRef ?? internalTriggerRef;

  const releaseId = searchParams.get("releaseId") ?? searchParams.get("release_id") ?? undefined;
  const season = searchParams.get("season") ?? undefined;
  const phase = searchParams.get("phase") ?? undefined;
  const beforeDate = searchParams.get("beforeDate") ?? searchParams.get("before_date") ?? undefined;

  const wasOpenRef = useRef(false);

  const close = () => {
    onClose();
    setQuery("");
    setScope("all");
    setSelectedIndex(0);
  };

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
        setScope("all");
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [isOpen, onClose]);

  // Before typing (row 3, 64): the scope's season leaders, between recents and pages. A cached
  // read shows at once; otherwise one request fills them in.
  const leaderOptions = { query: "", releaseId, season, phase, beforeDate, kinds: ["player" as const], limit: 5 };
  const leaderKey = buildLookupCacheKey(leaderOptions);
  const [fetchedLeaders, setFetchedLeaders] = useState<{ key: string; items: LookupItem[] } | null>(null);
  const [leadersSettled, setLeadersSettled] = useState<string | null>(null);
  const leaders = defaultLookupCache.get(leaderKey)?.items ?? (fetchedLeaders?.key === leaderKey ? fetchedLeaders.items : []);
  const leadersReady = Boolean(defaultLookupCache.get(leaderKey)) || leadersSettled === leaderKey;
  useEffect(() => {
    if (!isOpen || defaultLookupCache.get(leaderKey)) return;
    const abort = new AbortController();
    // A slow read never holds the empty state for long (72).
    const timer = window.setTimeout(() => setLeadersSettled(leaderKey), IDLE_SETTLE_MS);
    queryLookup({ ...leaderOptions, signal: AbortSignal.any([abort.signal, AbortSignal.timeout(5000)]) })
      .then(response => { if (!abort.signal.aborted) { defaultLookupCache.set(leaderKey, response); setFetchedLeaders({ key: leaderKey, items: response.items }); } })
      .catch(() => undefined)
      .finally(() => { if (!abort.signal.aborted) setLeadersSettled(leaderKey); });
    return () => { abort.abort(); window.clearTimeout(timer); };
    // leaderKey holds every scope value of the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, leaderKey]);

  // Players and teams come from the lookup; pages never need a request.
  const trimmed = query.trim();
  const isQueryEmpty = trimmed === "";
  const lookupKinds = scope === "pages" || isQueryEmpty ? null : SCOPE_KINDS[scope];
  const lookupKey = lookupKinds
    ? buildLookupCacheKey({ query: trimmed, releaseId, season, phase, beforeDate, kinds: lookupKinds, limit: LOOKUP_LIMIT })
    : null;
  useEffect(() => {
    if (!isOpen || !lookupKey || !lookupKinds || defaultLookupCache.get(lookupKey)) return;
    const abort = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await queryLookup({
          query: trimmed, releaseId, season, phase, beforeDate, kinds: lookupKinds, limit: LOOKUP_LIMIT, signal: abort.signal,
        });
        if (abort.signal.aborted) return;
        defaultLookupCache.set(lookupKey, response);
        setLookup({ key: lookupKey, items: response.items, total: response.total_matches });
        setLookupError(null);
      } catch {
        if (!abort.signal.aborted) setLookupError(lookupKey);
      }
    }, 120);
    return () => { window.clearTimeout(timer); abort.abort(); };
    // lookupKey holds the query, scope and kinds of the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, lookupKey]);

  // A cached read shows at once; otherwise the request above fills it in.
  const cached = lookupKey ? defaultLookupCache.get(lookupKey) : undefined;
  const current = cached ? { items: cached.items, total: cached.total_matches } : lookup && lookup.key === lookupKey ? lookup : null;
  const failed = lookupKey !== null && lookupError === lookupKey;
  const searching = lookupKey !== null && !current && !failed;
  const players = current?.items.filter(item => item.kind === "player") ?? [];
  const teams = current?.items.filter(item => item.kind === "team") ?? [];
  // The lookup counts every match but returns at most LOOKUP_LIMIT; a full page means "more".
  const moreThanShown = (current?.total ?? 0) > (current?.items.length ?? 0);

  const pageMatches = searchSitePages(trimmed);

  // Recents read as ordinary results: the same team logo and caption in this scope (70).
  const { items: scopedRecents, ready: recentsReady } = useScopedRecents(useRecentSearches(), { releaseId, season, phase, beforeDate }, isOpen && isQueryEmpty);
  const recents = refreshPageRecents(scopedRecents).filter(item =>
    scope === "all" || item.kind === (scope === "pages" ? "page" : scope === "players" ? "player" : "team"));
  // The empty state appears once, complete: recents, leaders and pages together (72).
  const idleReady = recentsReady && leadersReady;
  const seasonLeaders = leaders.filter(item => item.match_basis === "leader" && !recents.some(entry => entry.kind === "player" && entry.canonical_id === item.canonical_id));

  const entityRows = (items: LookupItem[]): Row[] => items.map(item => ({ type: "entity", item }));
  const pageRows = (pages: readonly SitePage[], showSection: boolean): Row[] => pages.map(page => ({ type: "page", page, showSection }));
  const lookupStatus = (noun: string) =>
    searching ? { text: `Searching ${noun}…` } : failed ? { text: "Search is temporarily unavailable. Check backend connection.", error: true } : undefined;

  const groups: DisplayGroup[] = [];
  const recentGroup = (): DisplayGroup | null => recents.length > 0
    ? { key: "recent", name: "Recent", recent: true, rows: recents.map(item => ({ type: "entity", item, recent: true })) }
    : null;
  if (isQueryEmpty) {
    if (scope === "pages") {
      const recent = recentGroup();
      if (recent) groups.push(recent);
      for (const section of groupBySection(SITE_PAGES)) groups.push({ key: `section:${section.section}`, name: section.section, rows: pageRows(section.pages, false) });
    } else if (idleReady) {
      const recent = recentGroup();
      if (recent) groups.push(recent);
      if (scope !== "teams" && seasonLeaders.length > 0) {
        groups.push({ key: "leaders", name: `Season leaders${season ? ` · ${season}` : ""}`, rows: entityRows(seasonLeaders) });
      }
      if (scope === "all") {
        const idlePages = IDLE_PAGE_HREFS.flatMap(href => SITE_PAGES.filter(page => page.href === href));
        groups.push({ key: "pages", name: "Pages", rows: pageRows(idlePages, true), total: SITE_PAGES.length, seeAll: "pages" });
      }
    }
  } else if (scope === "all") {
    const pagesGroup: DisplayGroup | null = pageMatches.length > 0
      ? { key: "pages", name: "Pages", rows: pageRows(pageMatches.slice(0, ALL_LIMITS.pages), true), total: pageMatches.length, seeAll: pageMatches.length > ALL_LIMITS.pages ? "pages" : undefined }
      : null;
    const lookupGroups: DisplayGroup[] = [];
    const status = lookupStatus("players and teams");
    if (status) {
      lookupGroups.push({ key: "players", name: "Players", rows: [], status });
    } else {
      if (players.length > 0) lookupGroups.push({
        key: "players", name: "Players", rows: entityRows(players.slice(0, ALL_LIMITS.players)), total: players.length,
        seeAll: players.length > ALL_LIMITS.players || moreThanShown ? "players" : undefined,
      });
      if (teams.length > 0) lookupGroups.push({
        key: "teams", name: "Teams", rows: entityRows(teams.slice(0, ALL_LIMITS.teams)), total: teams.length,
        seeAll: teams.length > ALL_LIMITS.teams ? "teams" : undefined,
      });
    }
    // Pages lead when the query names one ("draft", "shot qu") and no player's full name is typed.
    const pagesLead = pageMatches.length > 0 && isStrongPageMatch(trimmed, pageMatches[0])
      && !players.some(item => item.match_basis === "exact");
    groups.push(...(pagesLead && pagesGroup ? [pagesGroup, ...lookupGroups] : [...lookupGroups, ...(pagesGroup ? [pagesGroup] : [])]));
  } else if (scope === "pages") {
    if (pageMatches.length > 0) groups.push({ key: "pages", name: "Pages", rows: pageRows(pageMatches, true), total: pageMatches.length });
  } else {
    const noun = scope === "players" ? "players" : "teams";
    const status = lookupStatus(noun);
    const items = scope === "players" ? players : teams;
    if (status) groups.push({ key: noun, name: scope === "players" ? "Players" : "Teams", rows: [], status });
    else if (items.length > 0) groups.push({ key: noun, name: scope === "players" ? "Players" : "Teams", rows: entityRows(items), total: current?.total });
  }

  const flatRows = groups.flatMap(group => group.rows);
  const activeIndex = flatRows.length > 0 ? Math.min(selectedIndex, flatRows.length - 1) : -1;
  const nothingFound = !isQueryEmpty && !searching && flatRows.length === 0 && groups.every(group => !group.status);
  const teamsIdle = isQueryEmpty && scope === "teams" && idleReady && flatRows.length === 0;

  // Keep the arrowed-to row in view.
  useEffect(() => {
    if (activeIndex < 0) return;
    listRef.current?.querySelector(`#global-cmd-opt-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const changeScope = (next: SearchScope) => {
    setScope(next);
    setSelectedIndex(0);
    listRef.current?.scrollTo({ top: 0 });
    inputRef.current?.focus();
  };

  const handleSelect = (row: Row) => {
    const item = row.type === "page" ? pageAsLookupItem(row.page) : row.item;
    rememberRecentSearch(item);
    close();
    // Results open at the destination's own scope: one page's season never carries to another.
    router.push(item.destination_url);
  };

  const handleRawSubmit = () => {
    if (trimmed) {
      close();
      router.push(`/stats?name=${encodeURIComponent(trimmed)}`);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // The scope control handles its own arrows, Home and End.
    if (e.key !== "Escape" && (e.target as HTMLElement).closest("[data-kit='segmented']")) return;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab" && e.target === inputRef.current) {
      // Tab steps through the scopes from the search field, as in most command palettes.
      e.preventDefault();
      const index = SCOPES.findIndex(option => option.value === scope);
      changeScope(SCOPES[(index + (e.shiftKey ? SCOPES.length - 1 : 1)) % SCOPES.length].value);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (flatRows.length > 0) {
        setSelectedIndex(prev => (Math.min(prev, flatRows.length - 1) + 1) % flatRows.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (flatRows.length > 0) {
        setSelectedIndex(prev => (Math.min(prev, flatRows.length - 1) - 1 + flatRows.length) % flatRows.length);
      }
    } else if (e.key === "Home" && e.target !== inputRef.current) {
      e.preventDefault();
      setSelectedIndex(0);
    } else if (e.key === "End" && e.target !== inputRef.current) {
      e.preventDefault();
      setSelectedIndex(flatRows.length - 1);
    } else if (e.key === "Delete" && isQueryEmpty && activeIndex >= 0) {
      const row = flatRows[activeIndex];
      if (row.type === "entity" && row.recent) {
        e.preventDefault();
        forgetRecent(row.item);
      }
    } else if (e.key === "Enter" && e.target === inputRef.current) {
      e.preventDefault();
      if (activeIndex >= 0 && flatRows[activeIndex]) {
        handleSelect(flatRows[activeIndex]);
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
            onClick={close}
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
                <Icon name="search" size={20} className="ui-command-search-icon lookup-search-icon" />
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
                    setQuery(e.target.value);
                    setSelectedIndex(0);
                  }}
                  placeholder={scope === "pages" ? "Search pages…" : scope === "players" ? "Search players…" : scope === "teams" ? "Search teams…" : "Search pages, players and teams…"}
                  className="ui-command-input lookup-input"
                />
                {query && (
                  <IconButton
                    size="sm"
                    variant="ghost"
                    icon="close"
                    label="Clear search"
                    onClick={() => {
                      setQuery("");
                      setSelectedIndex(0);
                      inputRef.current?.focus();
                    }}
                  />
                )}
                {!query && <kbd className="ui-command-shortcut">Esc</kbd>}
                <button
                  type="button"
                  className="ui-command-close"
                  aria-label="Close search"
                  onClick={close}
                >
                  Cancel
                </button>
              </div>

              <div className="ui-command-scopes">
                <Segmented size="sm" label="Search in" options={SCOPES} value={scope} onChange={changeScope} />
              </div>

              <div
                id="global-command-list"
                ref={listRef}
                className="ui-command-list lookup-listbox"
                role="listbox"
                aria-label="Search results"
              >
                {nothingFound && (
                  <div className="lookup-status-message">
                    No {scope === "all" ? "pages, players or teams" : scope} match &ldquo;{trimmed}&rdquo;.
                    {scope !== "all" ? " Try All, or another spelling." : " Try another spelling or tricode."}
                  </div>
                )}
                {teamsIdle && <div className="lookup-status-message">Type a team name, city or code.</div>}

                {groups.map(group => (
                  <div key={group.key} className="ui-command-group" role="group" aria-label={group.name}>
                    <div className="lookup-group-header ui-command-group-heading">
                      <span>{group.name}</span>
                      {group.recent && (
                        <Button size="xs" variant="text" onMouseDown={e => e.preventDefault()}
                          onClick={() => { clearRecentSearches(); setSelectedIndex(0); }}>
                          Clear all
                        </Button>
                      )}
                      {group.seeAll && <SeeAll scope={group.seeAll} total={group.seeAll === "players" && moreThanShown ? undefined : group.total} onSelect={changeScope} />}
                    </div>
                    {group.status && (
                      <div className={`lookup-status-message${group.status.error ? " error" : ""}`}>{group.status.text}</div>
                    )}
                    {group.rows.map(row => {
                      const itemIndex = globalCounter++;
                      const isSelected = itemIndex === activeIndex;
                      return (
                        <div
                          key={rowKey(group, row)}
                          id={`global-cmd-opt-${itemIndex}`}
                          role="option"
                          tabIndex={-1}
                          aria-selected={isSelected}
                          data-active={isSelected}
                          data-kind={row.type === "page" ? "page" : row.item.kind}
                          onClick={() => handleSelect(row)}
                          onMouseEnter={() => setSelectedIndex(itemIndex)}
                          className={`ui-command-item lookup-option ${isSelected ? "ui-command-item-active selected" : ""}`}
                        >
                          {row.type === "page" ? <PageRow page={row.page} showSection={row.showSection} /> : <EntityRow item={row.item} recent={row.recent} />}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              <div className="ui-command-footer" aria-hidden="true">
                <span><kbd>Tab</kbd> Filter</span>
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

function SeeAll({ scope, total, onSelect }: { scope: SearchScope; total?: number; onSelect: (scope: SearchScope) => void }) {
  return (
    <Button size="xs" variant="text" iconAfter="arrow-right" onMouseDown={e => e.preventDefault()} onClick={() => onSelect(scope)}>
      {total === undefined ? "See all" : `See all ${total}`}
    </Button>
  );
}

/** Forgets a recent; a page is forgotten under every stored id that opens the same path. */
function forgetRecent(item: LookupItem) {
  forgetRecentSearch(item);
  if (item.kind !== "page") return;
  const path = item.destination_url.split("?")[0];
  for (const entry of readRecentSearches()) {
    if (entry.kind === "page" && entry.destination_url.split("?")[0] === path) forgetRecentSearch(entry);
  }
}

function PageRow({ page, showSection }: { page: SitePage; showSection: boolean }) {
  return (
    <>
      <span className="lookup-item-leading ui-command-page-icon"><Icon name={page.icon} size={16} /></span>
      <span className="lookup-item-content ui-command-item-text">
        <span className="lookup-item-name ui-command-item-label">{page.label}</span>
        {page.description && <span className="lookup-item-subtitle ui-command-item-subtitle">{page.description}</span>}
      </span>
      {showSection && <span className="ui-command-item-section">{page.section}</span>}
    </>
  );
}

function EntityRow({ item, recent }: { item: LookupItem; recent?: boolean }) {
  const page = item.kind === "page" ? sitePageFor(item.destination_url) : undefined;
  const caption = recent && item.kind !== "player" ? KIND_LABEL[item.kind] : compactCaption(item) ?? KIND_LABEL[item.kind];
  return (
    <>
      <span className="lookup-item-leading">
        {item.kind === "player" ? (
          <PlayerPortrait
            playerId={item.metadata?.identity_namespace === "planner" ? undefined : item.canonical_id}
            name={item.display_name}
            portraitUrl={item.portrait_url}
            size="sm"
          />
        ) : item.kind === "team" ? (
          <TeamLogo team={item.portrait_fallback ?? item.canonical_id} size={28} />
        ) : (
          <Icon name={recent ? "history" : page?.icon ?? "page"} size={16} />
        )}
      </span>

      <span className="lookup-item-content ui-command-item-text">
        <span className="lookup-item-name ui-command-item-label">
          {item.display_name}
          {!recent && nicknameCaption(item) && (
            <span className="lookup-alias-badge">{nicknameCaption(item)}</span>
          )}
        </span>
        <span className="lookup-item-subtitle ui-command-item-subtitle">
          {item.kind === "player" && (
            <TeamLogoStack
              decorative
              size={16}
              teams={item.team_association?.teams ?? []}
              label={item.team_association?.basis === "last_observed" ? "Last observed team" : "Teams observed in selected scope"}
            />
          )}
          {caption}
        </span>
      </span>
      {recent && (
        <span className="ui-command-item-actions">
          <IconButton size="xs" variant="ghost" icon="close"
            label={`Remove ${item.display_name} from recent searches`}
            onMouseDown={e => e.preventDefault()}
            onClick={e => { e.stopPropagation(); forgetRecent(item); }} />
        </span>
      )}
    </>
  );
}
