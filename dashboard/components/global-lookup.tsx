"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { buildLookupCacheKey, defaultLookupCache } from "@/lib/lookup-cache";
import { buildPreservedContextUrl } from "@/lib/query-url";
import type { LookupItem } from "@/lib/types";
import { queryLookup } from "@/lib/workbench-api";
import { PlayerPortrait } from "./player-portrait";

export interface GlobalLookupProps {
  placeholder?: string;
  className?: string;
  onSelect?: (item: LookupItem) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  autoFocus?: boolean;
  releaseId?: string | null;
  season?: string | null;
  kinds?: Array<"player" | "team" | "page">;
  limit?: number;
  debounceMs?: number;
}

export function GlobalLookup({
  placeholder = "Search players, teams and pages (Press / to focus)",
  className = "",
  onSelect,
  inputRef: externalInputRef,
  autoFocus = false,
  releaseId,
  season,
  kinds,
  limit = 10,
  debounceMs = 120
}: GlobalLookupProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Local input and DOM refs
  const localInputRef = useRef<HTMLInputElement>(null);
  const activeInputRef = externalInputRef || localInputRef;
  const comboboxRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef<number>(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isComposingRef = useRef<boolean>(false);

  const listboxId = useId();

  // State
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<LookupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [statusAnnouncement, setStatusAnnouncement] = useState("");

  // Context resolution: props take precedence, fallback to searchParams
  const effectiveReleaseId = releaseId ?? searchParams?.get("releaseId") ?? searchParams?.get("release_id") ?? null;
  const effectiveSeason = season ?? searchParams?.get("season") ?? null;

  // Group results by kind: players, teams, pages
  const { players, teams, pages, flattenedItems } = useMemo(() => {
    const p: LookupItem[] = [];
    const t: LookupItem[] = [];
    const pg: LookupItem[] = [];

    for (const item of results) {
      if (item.kind === "player") p.push(item);
      else if (item.kind === "team") t.push(item);
      else pg.push(item);
    }

    return {
      players: p,
      teams: t,
      pages: pg,
      flattenedItems: [...p, ...t, ...pg]
    };
  }, [results]);

  // Execute lookup fetch with cancellation and caching
  const executeLookup = useCallback(
    async (searchQuery: string) => {
      const trimmed = searchQuery.trim();
      const cacheKey = buildLookupCacheKey({
        query: trimmed,
        releaseId: effectiveReleaseId,
        season: effectiveSeason,
        kinds,
        limit
      });

      // 1. Check bounded LRU cache first
      const cached = defaultLookupCache.get(cacheKey);
      if (cached) {
        setResults(cached.items);
        setLoading(false);
        setError(null);
        setSelectedIndex(-1);
        setStatusAnnouncement(
          cached.items.length === 0
            ? `No matches found for "${trimmed}".`
            : `${cached.items.length} matches found.`
        );
        return;
      }

      // 2. Abort previous in-flight network request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;
      const currentRequestId = ++requestIdRef.current;

      setLoading(true);
      setError(null);

      try {
        const response = await queryLookup({
          query: trimmed,
          releaseId: effectiveReleaseId,
          season: effectiveSeason,
          kinds,
          limit,
          signal: controller.signal
        });

        // 3. Stale response protection: verify this is still the active request
        if (currentRequestId !== requestIdRef.current) {
          return;
        }

        // Cache successful response
        defaultLookupCache.set(cacheKey, response);
        setResults(response.items);
        setLoading(false);
        setSelectedIndex(-1);
        setStatusAnnouncement(
          response.items.length === 0
            ? `No matches found for "${trimmed}".`
            : `${response.items.length} matches found.`
        );
      } catch (err: unknown) {
        if (currentRequestId !== requestIdRef.current) {
          return;
        }
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        setLoading(false);
        setError("Search is temporarily unavailable. Check backend connection.");
        setStatusAnnouncement("Search request failed.");
      }
    },
    [effectiveReleaseId, effectiveSeason, kinds, limit]
  );

  // Debounced input change handler
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setIsOpen(true);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      executeLookup(val);
    }, debounceMs);
  };

  // Focus handler: fetch suggestions on first focus if empty
  const handleFocus = () => {
    setIsOpen(true);
    if (results.length === 0) {
      executeLookup(query);
    }
  };

  // Clear query handler
  const handleClear = () => {
    setQuery("");
    setResults([]);
    setSelectedIndex(-1);
    executeLookup("");
    activeInputRef.current?.focus();
  };

  // Selection navigation handler
  const handleSelectItem = useCallback(
    (item: LookupItem) => {
      setIsOpen(false);
      setSelectedIndex(-1);

      if (onSelect) {
        onSelect(item);
        return;
      }

      // Preserve active context parameters in destination
      const targetUrl = buildPreservedContextUrl(item.destination_url, searchParams);
      router.push(targetUrl);
    },
    [onSelect, router, searchParams]
  );

  // Form submit fallback (Enter when no item highlighted)
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIndex >= 0 && selectedIndex < flattenedItems.length) {
      handleSelectItem(flattenedItems[selectedIndex]);
      return;
    }

    if (flattenedItems.length > 0) {
      handleSelectItem(flattenedItems[0]);
      return;
    }

    const trimmed = query.trim();
    if (trimmed) {
      setIsOpen(false);
      const targetUrl = buildPreservedContextUrl(
        `/stats?name=${encodeURIComponent(trimmed)}`,
        searchParams
      );
      router.push(targetUrl);
    }
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isComposingRef.current) {
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        if (results.length === 0) executeLookup(query);
        return;
      }
      if (flattenedItems.length === 0) return;
      setSelectedIndex((prev) => (prev + 1) % flattenedItems.length);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        return;
      }
      if (flattenedItems.length === 0) return;
      setSelectedIndex((prev) => (prev <= 0 ? flattenedItems.length - 1 : prev - 1));
      return;
    }

    if (e.key === "Escape") {
      if (isOpen) {
        e.preventDefault();
        setIsOpen(false);
        setSelectedIndex(-1);
      }
      return;
    }

    if (e.key === "Tab") {
      // Natural tab behavior: close dropdown and allow focus to move to next interactive element
      setIsOpen(false);
      setSelectedIndex(-1);
    }
  };

  // Dismiss on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (comboboxRef.current && !comboboxRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Cleanup timers and abort controllers on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  // Scroll active listbox option into view
  useEffect(() => {
    if (selectedIndex >= 0 && listboxRef.current) {
      const activeEl = listboxRef.current.querySelector(
        `[data-lookup-index="${selectedIndex}"]`
      ) as HTMLElement | null;
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex]);

  // Determine active descendant ID for ARIA
  const activeDescendantId =
    selectedIndex >= 0 && selectedIndex < flattenedItems.length
      ? `lookup-option-${flattenedItems[selectedIndex].id}`
      : undefined;

  let currentItemCounter = 0;

  return (
    <div
      ref={comboboxRef}
      className={`lookup-combobox ${className}`}
    >
      <form onSubmit={handleSubmit} className="lookup-form" role="search">
        <div className="lookup-input-wrapper">
          <span className="lookup-search-icon" aria-hidden="true">
            🔍
          </span>
          <input
            ref={activeInputRef}
            type="text"
            className="lookup-input"
            role="combobox"
            placeholder={placeholder}
            aria-label="Search players, teams and pages"
            aria-autocomplete="list"
            aria-expanded={isOpen}
            aria-haspopup="listbox"
            aria-controls={listboxId}
            aria-activedescendant={activeDescendantId}
            value={query}
            onChange={handleInputChange}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => {
              isComposingRef.current = true;
            }}
            onCompositionEnd={() => {
              isComposingRef.current = false;
            }}
            autoFocus={autoFocus}
            autoComplete="off"
            spellCheck="false"
          />

          {loading && (
            <span className="lookup-spinner" aria-hidden="true" title="Searching…">
              <span className="lookup-spinner-dot" />
            </span>
          )}

          {query && !loading && (
            <button
              type="button"
              className="lookup-clear-btn"
              onClick={handleClear}
              aria-label="Clear search input"
            >
              ✕
            </button>
          )}

          <kbd className="lookup-kbd" aria-hidden="true">
            /
          </kbd>
        </div>
      </form>

      {/* Screen reader live announcement */}
      <div role="status" aria-live="polite" className="sr-only">
        {statusAnnouncement}
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="lookup-dropdown" role="presentation">
          {error && <div className="lookup-status-message error">{error}</div>}

          {!error && !loading && flattenedItems.length === 0 && (
            <div className="lookup-status-message empty">
              No results found for &ldquo;<strong>{query}</strong>&rdquo;
            </div>
          )}

          <ul
            id={listboxId}
            ref={listboxRef}
            className="lookup-listbox"
            role="listbox"
            aria-label="Search suggestions"
          >
            {/* Players Group */}
            {players.length > 0 && (
              <li role="presentation" className="lookup-group">
                <div className="lookup-group-header">
                  <span className="lookup-group-title">Players</span>
                  <span className="lookup-group-count">{players.length}</span>
                </div>
                <ul role="presentation" className="lookup-group-items">
                  {players.map((item) => {
                    const itemIndex = currentItemCounter++;
                    const isSelected = selectedIndex === itemIndex;
                    return (
                      <li
                        key={`player-${item.id}`}
                        id={`lookup-option-${item.id}`}
                        role="option"
                        aria-selected={isSelected}
                        data-lookup-index={itemIndex}
                        className={`lookup-option ${isSelected ? "selected" : ""}`}
                        onClick={() => handleSelectItem(item)}
                        onMouseEnter={() => setSelectedIndex(itemIndex)}
                      >
                        <div className="lookup-item-leading">
                          <PlayerPortrait
                            playerId={item.id}
                            name={item.display_name}
                            portraitUrl={item.portrait_url}
                            size="sm"
                          />
                        </div>
                        <div className="lookup-item-content">
                          <div className="lookup-item-row">
                            <span className="lookup-item-name">{item.display_name}</span>
                            {item.matched_alias && (
                              <span className="lookup-alias-badge">
                                aka &ldquo;{item.matched_alias}&rdquo;
                              </span>
                            )}
                            {item.availability && !item.availability.has_current_season && (
                              <span
                                className="lookup-availability-badge"
                                title="No games observed in current active season"
                              >
                                Historical
                              </span>
                            )}
                          </div>
                          {item.subtitle && (
                            <span className="lookup-item-subtitle">{item.subtitle}</span>
                          )}
                        </div>
                        <span className="lookup-item-arrow" aria-hidden="true">
                          ↵
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            )}

            {/* Teams Group */}
            {teams.length > 0 && (
              <li role="presentation" className="lookup-group">
                <div className="lookup-group-header">
                  <span className="lookup-group-title">Teams</span>
                  <span className="lookup-group-count">{teams.length}</span>
                </div>
                <ul role="presentation" className="lookup-group-items">
                  {teams.map((item) => {
                    const itemIndex = currentItemCounter++;
                    const isSelected = selectedIndex === itemIndex;
                    const tricode =
                      item.portrait_fallback || item.availability?.latest_tricode || "NBA";
                    return (
                      <li
                        key={`team-${item.id}`}
                        id={`lookup-option-${item.id}`}
                        role="option"
                        aria-selected={isSelected}
                        data-lookup-index={itemIndex}
                        className={`lookup-option ${isSelected ? "selected" : ""}`}
                        onClick={() => handleSelectItem(item)}
                        onMouseEnter={() => setSelectedIndex(itemIndex)}
                      >
                        <div className="lookup-item-leading">
                          <span className="lookup-team-badge">{tricode}</span>
                        </div>
                        <div className="lookup-item-content">
                          <div className="lookup-item-row">
                            <span className="lookup-item-name">{item.display_name}</span>
                            {item.matched_alias && (
                              <span className="lookup-alias-badge">
                                aka &ldquo;{item.matched_alias}&rdquo;
                              </span>
                            )}
                          </div>
                          {item.subtitle && (
                            <span className="lookup-item-subtitle">{item.subtitle}</span>
                          )}
                        </div>
                        <span className="lookup-item-arrow" aria-hidden="true">
                          ↵
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            )}

            {/* Pages & Tools Group */}
            {pages.length > 0 && (
              <li role="presentation" className="lookup-group">
                <div className="lookup-group-header">
                  <span className="lookup-group-title">Navigation & Tools</span>
                  <span className="lookup-group-count">{pages.length}</span>
                </div>
                <ul role="presentation" className="lookup-group-items">
                  {pages.map((item) => {
                    const itemIndex = currentItemCounter++;
                    const isSelected = selectedIndex === itemIndex;
                    return (
                      <li
                        key={`page-${item.id}`}
                        id={`lookup-option-${item.id}`}
                        role="option"
                        aria-selected={isSelected}
                        data-lookup-index={itemIndex}
                        className={`lookup-option ${isSelected ? "selected" : ""}`}
                        onClick={() => handleSelectItem(item)}
                        onMouseEnter={() => setSelectedIndex(itemIndex)}
                      >
                        <div className="lookup-item-leading">
                          <span className="lookup-nav-badge">
                            {item.portrait_fallback || "NAV"}
                          </span>
                        </div>
                        <div className="lookup-item-content">
                          <div className="lookup-item-row">
                            <span className="lookup-item-name">{item.display_name}</span>
                            {item.matched_alias && (
                              <span className="lookup-alias-badge">
                                aka &ldquo;{item.matched_alias}&rdquo;
                              </span>
                            )}
                          </div>
                          {item.subtitle && (
                            <span className="lookup-item-subtitle">{item.subtitle}</span>
                          )}
                        </div>
                        <span className="lookup-item-arrow" aria-hidden="true">
                          ↵
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            )}
          </ul>

          <div className="lookup-footer">
            <span className="lookup-shortcut-hint">
              <kbd>↑</kbd> <kbd>↓</kbd> navigate
            </span>
            <span className="lookup-shortcut-hint">
              <kbd>↵</kbd> select
            </span>
            <span className="lookup-shortcut-hint">
              <kbd>esc</kbd> close
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
