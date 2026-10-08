"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { motion, AnimatePresence, popoverVariants } from "../../lib/motion";
import { Icon } from "./icon";
import { Button, IconButton } from "./button";
import { Drawer } from "./drawer";
import { Accordion, AccordionItem } from "./accordion";
import { GlobalCommandPalette } from "./command-palette";
import { Brand } from "../brand";
import { useAssistantPage } from "@/lib/assistant-page-context";
import { AskDrawer } from "../ask-drawer";
import { HotkeysModal } from "../hotkeys-modal";
import { getSharedCatalog, routeAvailability } from "@/lib/route-availability";
import type { WorkbenchCatalog } from "@/lib/types";
import { buildPreservedContextUrl } from "@/lib/query-url";

interface NavDropdownItem {
  label: string;
  href: string;
  badge?: string;
  gated?: boolean;
}

interface NavSection {
  title: string;
  items: NavDropdownItem[];
}

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const assistantPage = useAssistantPage();
  const pageSupportsPanel = /^\/(?:players\/\d+|teams\/\d{10}|compare)$/.test(pathname);

  // Overlays and dropdowns
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [availabilitySubmenuOpen, setAvailabilitySubmenuOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [hotkeysOpen, setHotkeysOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  // Catalog and route availability
  const releaseId = searchParams.get("releaseId") ?? searchParams.get("release_id") ?? undefined;
  const [catalogState, setCatalogState] = useState<{ releaseId?: string; catalog: WorkbenchCatalog } | null>(null);

  useEffect(() => {
    let active = true;
    getSharedCatalog(releaseId)
      .then(catalog => {
        if (active) setCatalogState({ releaseId, catalog });
      })
      .catch(() => {
        if (active) setCatalogState(null);
      });
    return () => {
      active = false;
    };
  }, [releaseId]);

  const catalog = catalogState?.releaseId === releaseId ? catalogState?.catalog ?? null : null;
  const availability = useCallback(
    (href: string) =>
      routeAvailability(
        href,
        catalog,
        searchParams.get("season") ?? undefined,
        searchParams.get("phase") ?? undefined
      ),
    [catalog, searchParams]
  );

  const preserveContextUrl = useCallback(
    (targetHref: string) => buildPreservedContextUrl(targetHref, searchParams),
    [searchParams]
  );

  const navRef = useRef<HTMLElement>(null);
  const searchPillRef = useRef<HTMLButtonElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Scrolled state detector (sticky blur with zero layout shift)
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
      setIsScrolled(scrollY > 4);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    document.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      document.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // Close menus on route change
  const [prevPath, setPrevPath] = useState(pathname);
  if (prevPath !== pathname) {
    setPrevPath(pathname);
    setOpenDropdown(null);
    setMoreMenuOpen(false);
    setMobileDrawerOpen(false);
    setPaletteOpen(false);
    setAskOpen(false);
  }

  // Global keyboard shortcuts (Cmd+K, Ctrl+K, '/', '?', 'Esc')
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target?.tagName === "INPUT" ||
        target?.tagName === "SELECT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if ((e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key === "k")) && !isInput) {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }

      if (e.key === "?" && !isInput) {
        e.preventDefault();
        setHotkeysOpen(true);
        return;
      }

      if (e.key === "Escape") {
        if (openDropdown) {
          const trigger = navRef.current?.querySelector<HTMLButtonElement>(
            `[data-dropdown-id="${openDropdown}"]`
          );
          trigger?.focus();
          setOpenDropdown(null);
        }
        if (moreMenuOpen) {
          moreButtonRef.current?.focus();
          setMoreMenuOpen(false);
          setAvailabilitySubmenuOpen(false);
        }
        if (mobileDrawerOpen) {
          setMobileDrawerOpen(false);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [openDropdown, moreMenuOpen, mobileDrawerOpen]);

  // Click outside listener for desktop dropdowns
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Hover-intent helpers
  const handleDropdownEnter = (id: string) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setOpenDropdown(id);
      setMoreMenuOpen(false);
    }, 80);
  };

  const handleDropdownLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setOpenDropdown(null);
    }, 150);
  };

  const toggleDropdown = (id: string) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setOpenDropdown(prev => (prev === id ? null : id));
    setMoreMenuOpen(false);
  };

  // Nav menus definition
  const liveItems: NavDropdownItem[] = [
    { label: "Live Scoreboard", href: "/live" },
    { label: "Historical Finals", href: "/live?live_mode=history" },
    { label: "Playoff Series", href: "/playoffs" },
  ];

  const playersItems: NavDropdownItem[] = [
    { label: "Recent Games", href: "/last-games" },
    { label: "Showcase Cards", href: "/showcase" },
    { label: "Player Directory", href: "/players" },
    { label: "Statistical Peers", href: "/research/similarity" },
    { label: "Shot-Profile Twins", href: "/shot-profile-twin" },
    { label: "Ranking Boards", href: "/rankings" },
  ];

  const teamsItems: NavDropdownItem[] = [
    { label: "Team Stats & Cohorts", href: "/teams" },
    { label: "Roster Shapes", href: "/roster-shapes" },
    { label: "Teammate Stat Shift", href: "/stat-line-shift" },
    { label: "Contracts & Payroll", href: "/contracts" },
    { label: "Free Agency Tracker", href: "/free-agency" },
  ];

  const compareItems: NavDropdownItem[] = [
    { label: "Player Comparison", href: "/compare" },
    { label: "Team Comparison", href: "/team-compare" },
    { label: "Player Matchups", href: "/matchups" },
    { label: "Tier Lists", href: "/tierlist" },
  ];

  const researchSections: NavSection[] = [
    {
      title: "Core Research",
      items: [
        { label: "Saved Investigations", href: "/investigations" },
        { label: "Ask CourtLens AI", href: "/research/ask" },
        { label: "Points Forecasts", href: "/forecasts" },
        { label: "Evaluation Archive", href: "/evaluation" },
        { label: "Case Studies", href: "/research/case-studies" },
      ],
    },
    {
      title: "Advanced Analytics",
      items: [
        { label: "Workload Trends", href: "/research/trends" },
        { label: "Distributions & Splits", href: "/research/distributions" },
        { label: "Adjusted Shooting", href: "/research/adjusted-shooting" },
        { label: "RAPM Research", href: "/research/rapm" },
        { label: "Six-Factor RAPM", href: "/six-factor-rapm" },
        { label: "Expected Shots", href: "/research/expected-shots" },
        { label: "Shot Aftermath", href: "/shot-aftermath" },
        { label: "Defensive Matchups", href: "/research/defensive-matchups" },
        { label: "Spatial EPV", href: "/research/epv" },
        { label: "Combine & Wingspan", href: "/wingspan" },
        { label: "Hypothetical Calculator", href: "/calculator" },
      ],
    },
  ];

  const helpItems: NavDropdownItem[] = [
    { label: "Definitions & Glossary", href: "/methodology" },
    { label: "Interactive Learning", href: "/learning" },
    { label: "Patch Notes", href: "/patch-notes" },
    { label: "Blog & Updates", href: "/blog" },
  ];

  // Route availability filtering
  const allSections = [
    { title: "Live", items: liveItems },
    { title: "Players", items: playersItems },
    { title: "Teams", items: teamsItems },
    { title: "Compare", items: compareItems },
    ...researchSections,
    { title: "Help", items: helpItems },
    {
      title: "Primary",
      items: [
        { label: "Stats", href: "/stats" },
        { label: "WOWY", href: "/wowy" },
      ],
    },
  ];

  const unavailableItems = allSections
    .flatMap(s => s.items)
    .filter(item => availability(item.href).secondary);

  const filteredLiveItems = liveItems.filter(i => !availability(i.href).secondary);
  const filteredPlayersItems = playersItems.filter(i => !availability(i.href).secondary);
  const filteredTeamsItems = teamsItems.filter(i => !availability(i.href).secondary);
  const filteredCompareItems = compareItems.filter(i => !availability(i.href).secondary);
  const filteredResearchSections = researchSections.map(s => ({
    ...s,
    items: s.items.filter(i => !availability(i.href).secondary),
  }));

  // Active section identification
  let activeSection = "";
  if (pathname === "/stats" || pathname === "/" || pathname === "/players") {
    activeSection = "stats";
  } else if (pathname === "/wowy") {
    activeSection = "wowy";
  } else if (pathname.startsWith("/live") || pathname.startsWith("/playoffs")) {
    activeSection = "live";
  } else if (
    ["/last-games", "/showcase", "/rankings", "/shot-profile-twin", "/research/similarity"].includes(pathname) ||
    pathname.startsWith("/players/")
  ) {
    activeSection = "players";
  } else if (
    pathname.startsWith("/teams") ||
    ["/roster-shapes", "/stat-line-shift", "/contracts", "/free-agency"].includes(pathname)
  ) {
    activeSection = "teams";
  } else if (["/compare", "/team-compare", "/matchups", "/tierlist"].includes(pathname)) {
    activeSection = "compare";
  } else if (
    pathname.startsWith("/research") ||
    [
      "/investigations",
      "/forecasts",
      "/evaluation",
      "/six-factor-rapm",
      "/shot-aftermath",
      "/wingspan",
      "/calculator",
    ].includes(pathname)
  ) {
    activeSection = "research";
  }

  // Keyboard navigation within dropdowns
  const handleDropdownKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const menu = target.closest('[role="menu"]');
    if (!menu) return;

    const items = Array.from(
      menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)')
    );
    const index = items.indexOf(target);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const nextIndex = (index + 1) % items.length;
      items[nextIndex]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prevIndex = (index - 1 + items.length) % items.length;
      items[prevIndex]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (openDropdown) {
        const trigger = navRef.current?.querySelector<HTMLButtonElement>(
          `[data-dropdown-id="${openDropdown}"]`
        );
        trigger?.focus();
      }
      setOpenDropdown(null);
      setMoreMenuOpen(false);
      setAvailabilitySubmenuOpen(false);
    }
  };

  const handleTriggerKeyDown = (
    e: KeyboardEvent<HTMLButtonElement>,
    id: string
  ) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpenDropdown(id);
      requestAnimationFrame(() => {
        const panel = navRef.current?.querySelector(
          `[data-dropdown-panel="${id}"]`
        );
        panel?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
      });
    }
  };

  return (
    <header
      ref={navRef}
      className={`courtlens-header replica-header ${isScrolled ? "is-scrolled scrolled" : ""}`}
    >
      {/* Left: Brand + Menus with sliding active indicator */}
      <div className="courtlens-header-left">
        <Brand />

        <nav className="courtlens-nav" aria-label="Workspace Navigation">
          {/* Stats direct link */}
          <div className="courtlens-nav-item">
            <Link
              href={preserveContextUrl("/stats")}
              className={`courtlens-nav-link ${activeSection === "stats" ? "active" : ""}`}
            >
              Stats
              {activeSection === "stats" && (
                <motion.span
                  layoutId="header-active-indicator"
                  className="courtlens-nav-indicator"
                  transition={{ type: "spring", stiffness: 520, damping: 38, mass: 0.9 }}
                />
              )}
            </Link>
          </div>

          {/* WOWY direct link */}
          {!availability("/wowy").secondary && (
            <div className="courtlens-nav-item">
              <Link
                href={preserveContextUrl("/wowy")}
                className={`courtlens-nav-link ${activeSection === "wowy" ? "active" : ""}`}
              >
                WOWY
                {activeSection === "wowy" && (
                  <motion.span
                    layoutId="header-active-indicator"
                    className="courtlens-nav-indicator"
                    transition={{ type: "spring", stiffness: 520, damping: 38, mass: 0.9 }}
                  />
                )}
              </Link>
            </div>
          )}

          {/* Live dropdown */}
          <div
            className="courtlens-nav-item"
            onMouseEnter={() => handleDropdownEnter("live")}
            onMouseLeave={handleDropdownLeave}
          >
            <button
              type="button"
              data-dropdown-id="live"
              aria-haspopup="menu"
              aria-expanded={openDropdown === "live"}
              onClick={() => toggleDropdown("live")}
              onKeyDown={e => handleTriggerKeyDown(e, "live")}
              className={`courtlens-nav-dropdown-btn ${activeSection === "live" ? "active" : ""}`}
            >
              <span>Live</span>
              <Icon name="chevron-down" size={14} className="courtlens-nav-chevron" />
              {activeSection === "live" && (
                <motion.span
                  layoutId="header-active-indicator"
                  className="courtlens-nav-indicator"
                  transition={{ type: "spring", stiffness: 520, damping: 38, mass: 0.9 }}
                />
              )}
            </button>

            <AnimatePresence>
              {openDropdown === "live" && (
                <motion.div
                  data-dropdown-panel="live"
                  role="menu"
                  variants={popoverVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="courtlens-dropdown-menu"
                  onKeyDown={handleDropdownKeyDown}
                >
                  {filteredLiveItems.map(item => (
                    <Link
                      key={item.href}
                      href={preserveContextUrl(item.href)}
                      role="menuitem"
                      className={`courtlens-dropdown-item ${pathname === item.href ? "active" : ""}`}
                      onClick={() => setOpenDropdown(null)}
                    >
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Players dropdown */}
          <div
            className="courtlens-nav-item"
            onMouseEnter={() => handleDropdownEnter("players")}
            onMouseLeave={handleDropdownLeave}
          >
            <button
              type="button"
              data-dropdown-id="players"
              aria-haspopup="menu"
              aria-expanded={openDropdown === "players"}
              onClick={() => toggleDropdown("players")}
              onKeyDown={e => handleTriggerKeyDown(e, "players")}
              className={`courtlens-nav-dropdown-btn ${activeSection === "players" ? "active" : ""}`}
            >
              <span>Players</span>
              <Icon name="chevron-down" size={14} className="courtlens-nav-chevron" />
              {activeSection === "players" && (
                <motion.span
                  layoutId="header-active-indicator"
                  className="courtlens-nav-indicator"
                  transition={{ type: "spring", stiffness: 520, damping: 38, mass: 0.9 }}
                />
              )}
            </button>

            <AnimatePresence>
              {openDropdown === "players" && (
                <motion.div
                  data-dropdown-panel="players"
                  role="menu"
                  variants={popoverVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="courtlens-dropdown-menu"
                  onKeyDown={handleDropdownKeyDown}
                >
                  {filteredPlayersItems.map(item => (
                    <Link
                      key={item.href}
                      href={preserveContextUrl(item.href)}
                      role="menuitem"
                      className={`courtlens-dropdown-item ${pathname === item.href ? "active" : ""}`}
                      onClick={() => setOpenDropdown(null)}
                    >
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Teams dropdown */}
          <div
            className="courtlens-nav-item"
            onMouseEnter={() => handleDropdownEnter("teams")}
            onMouseLeave={handleDropdownLeave}
          >
            <button
              type="button"
              data-dropdown-id="teams"
              aria-haspopup="menu"
              aria-expanded={openDropdown === "teams"}
              onClick={() => toggleDropdown("teams")}
              onKeyDown={e => handleTriggerKeyDown(e, "teams")}
              className={`courtlens-nav-dropdown-btn ${activeSection === "teams" ? "active" : ""}`}
            >
              <span>Teams</span>
              <Icon name="chevron-down" size={14} className="courtlens-nav-chevron" />
              {activeSection === "teams" && (
                <motion.span
                  layoutId="header-active-indicator"
                  className="courtlens-nav-indicator"
                  transition={{ type: "spring", stiffness: 520, damping: 38, mass: 0.9 }}
                />
              )}
            </button>

            <AnimatePresence>
              {openDropdown === "teams" && (
                <motion.div
                  data-dropdown-panel="teams"
                  role="menu"
                  variants={popoverVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="courtlens-dropdown-menu"
                  onKeyDown={handleDropdownKeyDown}
                >
                  {filteredTeamsItems.map(item => (
                    <Link
                      key={item.href}
                      href={preserveContextUrl(item.href)}
                      role="menuitem"
                      className={`courtlens-dropdown-item ${pathname === item.href ? "active" : ""}`}
                      onClick={() => setOpenDropdown(null)}
                    >
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Compare dropdown */}
          <div
            className="courtlens-nav-item"
            onMouseEnter={() => handleDropdownEnter("compare")}
            onMouseLeave={handleDropdownLeave}
          >
            <button
              type="button"
              data-dropdown-id="compare"
              aria-haspopup="menu"
              aria-expanded={openDropdown === "compare"}
              onClick={() => toggleDropdown("compare")}
              onKeyDown={e => handleTriggerKeyDown(e, "compare")}
              className={`courtlens-nav-dropdown-btn ${activeSection === "compare" ? "active" : ""}`}
            >
              <span>Compare</span>
              <Icon name="chevron-down" size={14} className="courtlens-nav-chevron" />
              {activeSection === "compare" && (
                <motion.span
                  layoutId="header-active-indicator"
                  className="courtlens-nav-indicator"
                  transition={{ type: "spring", stiffness: 520, damping: 38, mass: 0.9 }}
                />
              )}
            </button>

            <AnimatePresence>
              {openDropdown === "compare" && (
                <motion.div
                  data-dropdown-panel="compare"
                  role="menu"
                  variants={popoverVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="courtlens-dropdown-menu"
                  onKeyDown={handleDropdownKeyDown}
                >
                  {filteredCompareItems.map(item => (
                    <Link
                      key={item.href}
                      href={preserveContextUrl(item.href)}
                      role="menuitem"
                      className={`courtlens-dropdown-item ${pathname === item.href ? "active" : ""}`}
                      onClick={() => setOpenDropdown(null)}
                    >
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Research dropdown (multi-column) */}
          <div
            className="courtlens-nav-item"
            onMouseEnter={() => handleDropdownEnter("research")}
            onMouseLeave={handleDropdownLeave}
          >
            <button
              type="button"
              data-dropdown-id="research"
              aria-haspopup="menu"
              aria-expanded={openDropdown === "research"}
              onClick={() => toggleDropdown("research")}
              onKeyDown={e => handleTriggerKeyDown(e, "research")}
              className={`courtlens-nav-dropdown-btn ${activeSection === "research" ? "active" : ""}`}
            >
              <span>Research</span>
              <Icon name="chevron-down" size={14} className="courtlens-nav-chevron" />
              {activeSection === "research" && (
                <motion.span
                  layoutId="header-active-indicator"
                  className="courtlens-nav-indicator"
                  transition={{ type: "spring", stiffness: 520, damping: 38, mass: 0.9 }}
                />
              )}
            </button>

            <AnimatePresence>
              {openDropdown === "research" && (
                <motion.div
                  data-dropdown-panel="research"
                  role="menu"
                  variants={popoverVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="courtlens-dropdown-menu courtlens-dropdown-multicol"
                  onKeyDown={handleDropdownKeyDown}
                >
                  {filteredResearchSections.map(section => (
                    <div key={section.title} className="courtlens-dropdown-col">
                      <span className="courtlens-dropdown-section-title">
                        {section.title}
                      </span>
                      {section.items.map(item => (
                        <Link
                          key={item.href}
                          href={preserveContextUrl(item.href)}
                          role="menuitem"
                          className={`courtlens-dropdown-item ${pathname === item.href ? "active" : ""}`}
                          onClick={() => setOpenDropdown(null)}
                        >
                          <span>{item.label}</span>
                        </Link>
                      ))}
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </nav>
      </div>

      {/* Center: Search pill opening command palette */}
      <div className="courtlens-header-center">
        <button
          ref={searchPillRef}
          type="button"
          role="searchbox"
          aria-label="Search players, teams and pages"
          aria-keyshortcuts="Control+K Meta+K /"
          className="courtlens-search-pill"
          onClick={() => setPaletteOpen(true)}
        >
          <Icon name="search" size={14} className="courtlens-search-pill-icon" />
          <span className="courtlens-search-pill-label">Search players, teams…</span>
          <kbd className="courtlens-search-pill-kbd">⌘K</kbd>
        </button>
      </div>

      {/* Right: Ask, More (⋯), and Mobile controls */}
      <div className="courtlens-header-right replica-nav-right">
        {/* Mobile Search button */}
        <IconButton
          icon="search"
          label="Search workbench"
          variant="ghost"
          size="sm"
          className="courtlens-mobile-search-btn"
          onClick={() => setPaletteOpen(true)}
        />

        {/* Ask button */}
        <Button
          variant="ghost"
          size="sm"
          className="courtlens-ask-btn"
          disabled={pageSupportsPanel && !assistantPage}
          aria-haspopup={assistantPage ? "dialog" : undefined}
          onClick={() => {
            if (assistantPage) setAskOpen(true);
            else router.push(preserveContextUrl("/research/ask"));
          }}
        >
          <Icon name="message" size={16} className="courtlens-ask-icon" />
          <span>Ask</span>
        </Button>

        {/* More (⋯) dropdown */}
        <div className="courtlens-nav-item">
          <IconButton
            ref={moreButtonRef}
            icon="more-horizontal"
            label="More options"
            variant="ghost"
            size="sm"
            aria-haspopup="menu"
            aria-expanded={moreMenuOpen}
            onClick={() => setMoreMenuOpen(prev => !prev)}
          />

          <AnimatePresence>
            {moreMenuOpen && (
              <motion.div
                role="menu"
                variants={popoverVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="courtlens-dropdown-menu courtlens-dropdown-menu-right"
                onKeyDown={handleDropdownKeyDown}
              >
                <Link
                  href={preserveContextUrl("/settings")}
                  role="menuitem"
                  className={`courtlens-dropdown-item ${pathname === "/settings" ? "active" : ""}`}
                  onClick={() => setMoreMenuOpen(false)}
                >
                  <span>Settings</span>
                </Link>

                <Link
                  href={preserveContextUrl("/data-status")}
                  role="menuitem"
                  className={`courtlens-dropdown-item ${pathname === "/data-status" ? "active" : ""}`}
                  onClick={() => setMoreMenuOpen(false)}
                >
                  <span>Data status</span>
                </Link>

                {/* Availability item */}
                {unavailableItems.length > 0 ? (
                  <div className="courtlens-availability-section">
                    <button
                      type="button"
                      role="menuitem"
                      aria-expanded={availabilitySubmenuOpen}
                      className="courtlens-dropdown-item availability-trigger"
                      onClick={() => setAvailabilitySubmenuOpen(prev => !prev)}
                    >
                      <span>Availability</span>
                      <span className="replica-badge-gated">
                        {unavailableItems.length} unavailable
                      </span>
                    </button>
                    {availabilitySubmenuOpen && (
                      <div className="availability-menu" role="menu">
                        {unavailableItems.map(item => (
                          <Link
                            key={item.href}
                            href={preserveContextUrl(item.href)}
                            role="menuitem"
                            className="courtlens-dropdown-item"
                            onClick={() => setMoreMenuOpen(false)}
                          >
                            <span>
                              {item.label}
                              <small className="availability-reason">
                                {availability(item.href).reason}
                              </small>
                            </span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="courtlens-dropdown-item courtlens-dropdown-item-disabled">
                    <span>Availability (All available)</span>
                  </div>
                )}

                <div className="courtlens-dropdown-divider" />

                {helpItems.map(item => (
                  <Link
                    key={item.href}
                    href={preserveContextUrl(item.href)}
                    role="menuitem"
                    className={`courtlens-dropdown-item ${pathname === item.href ? "active" : ""}`}
                    onClick={() => setMoreMenuOpen(false)}
                  >
                    <span>{item.label}</span>
                  </Link>
                ))}

                <button
                  type="button"
                  role="menuitem"
                  className="courtlens-dropdown-item"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    setHotkeysOpen(true);
                  }}
                >
                  <span>Keyboard Shortcuts</span>
                  <kbd className="font-mono text-xs courtlens-dropdown-kbd">?</kbd>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Mobile menu toggle */}
        <IconButton
          icon="menu"
          label="Toggle navigation drawer"
          variant="ghost"
          size="sm"
          className="courtlens-mobile-toggle"
          aria-expanded={mobileDrawerOpen}
          onClick={() => setMobileDrawerOpen(true)}
        />
      </div>

      {/* Mobile Drawer */}
      <Drawer
        isOpen={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        side="left"
        className="replica-mobile-drawer"
        title={<Brand />}
      >
        <div className="courtlens-mobile-drawer-body">
          <div className="courtlens-mobile-direct-links">
            <Link
              href={preserveContextUrl("/stats")}
              className={`courtlens-mobile-link ${activeSection === "stats" ? "active" : ""}`}
              onClick={() => setMobileDrawerOpen(false)}
            >
              Stats
            </Link>
            {!availability("/wowy").secondary && (
              <Link
                href={preserveContextUrl("/wowy")}
                className={`courtlens-mobile-link ${activeSection === "wowy" ? "active" : ""}`}
                onClick={() => setMobileDrawerOpen(false)}
              >
                WOWY
              </Link>
            )}
          </div>

          <Accordion>
            <AccordionItem title="Live" defaultExpanded={activeSection === "live"}>
              <div className="courtlens-mobile-section-links">
                {filteredLiveItems.map(item => (
                  <Link
                    key={item.href}
                    href={preserveContextUrl(item.href)}
                    className="courtlens-mobile-sublink"
                    onClick={() => setMobileDrawerOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </AccordionItem>

            <AccordionItem title="Players" defaultExpanded={activeSection === "players"}>
              <div className="courtlens-mobile-section-links">
                {filteredPlayersItems.map(item => (
                  <Link
                    key={item.href}
                    href={preserveContextUrl(item.href)}
                    className="courtlens-mobile-sublink"
                    onClick={() => setMobileDrawerOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </AccordionItem>

            <AccordionItem title="Teams" defaultExpanded={activeSection === "teams"}>
              <div className="courtlens-mobile-section-links">
                {filteredTeamsItems.map(item => (
                  <Link
                    key={item.href}
                    href={preserveContextUrl(item.href)}
                    className="courtlens-mobile-sublink"
                    onClick={() => setMobileDrawerOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </AccordionItem>

            <AccordionItem title="Compare" defaultExpanded={activeSection === "compare"}>
              <div className="courtlens-mobile-section-links">
                {filteredCompareItems.map(item => (
                  <Link
                    key={item.href}
                    href={preserveContextUrl(item.href)}
                    className="courtlens-mobile-sublink"
                    onClick={() => setMobileDrawerOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </AccordionItem>

            <AccordionItem title="Research" defaultExpanded={true}>
              <div className="courtlens-mobile-section-links">
                {filteredResearchSections.flatMap(s => s.items).map(item => (
                  <Link
                    key={item.href}
                    href={preserveContextUrl(item.href)}
                    className="courtlens-mobile-sublink"
                    onClick={() => setMobileDrawerOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </AccordionItem>

            {unavailableItems.length > 0 && (
              <AccordionItem title={`Availability (${unavailableItems.length})`}>
                <div className="courtlens-mobile-section-links replica-mobile-section">
                  <span className="replica-dropdown-section-title sr-only">Availability</span>
                  {unavailableItems.map(item => (
                    <Link
                      key={item.href}
                      href={preserveContextUrl(item.href)}
                      className="courtlens-mobile-sublink"
                      onClick={() => setMobileDrawerOpen(false)}
                    >
                      <span>
                        {item.label}
                        <small className="availability-reason">
                          {availability(item.href).reason}
                        </small>
                      </span>
                    </Link>
                  ))}
                </div>
              </AccordionItem>
            )}
          </Accordion>

          <div className="courtlens-dropdown-divider" />

          <div className="courtlens-mobile-direct-links">
            <Link
              href={preserveContextUrl("/data-status")}
              className="courtlens-mobile-link"
              onClick={() => setMobileDrawerOpen(false)}
            >
              Data status
            </Link>
            <Link
              href={preserveContextUrl("/settings")}
              className="courtlens-mobile-link"
              onClick={() => setMobileDrawerOpen(false)}
            >
              Settings
            </Link>
            <Link
              href={preserveContextUrl("/methodology")}
              className="courtlens-mobile-link"
              onClick={() => setMobileDrawerOpen(false)}
            >
              Definitions & Glossary
            </Link>
            <Link
              href={preserveContextUrl("/learning")}
              className="courtlens-mobile-link"
              onClick={() => setMobileDrawerOpen(false)}
            >
              Interactive Learning
            </Link>
            <Link
              href={preserveContextUrl("/patch-notes")}
              className="courtlens-mobile-link"
              onClick={() => setMobileDrawerOpen(false)}
            >
              Patch Notes
            </Link>
            <Link
              href={preserveContextUrl("/blog")}
              className="courtlens-mobile-link"
              onClick={() => setMobileDrawerOpen(false)}
            >
              Blog & Updates
            </Link>
            <button
              type="button"
              className="courtlens-mobile-link"
              onClick={() => {
                setMobileDrawerOpen(false);
                setHotkeysOpen(true);
              }}
            >
              Keyboard shortcuts (?)
            </button>
          </div>
        </div>
      </Drawer>

      {/* Global Command Palette */}
      <GlobalCommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        triggerRef={searchPillRef}
      />

      {/* Ask Side Drawer (when attached to entity page context) */}
      {askOpen && assistantPage && (
        <AskDrawer
          pageContext={assistantPage.context}
          pageLabel={assistantPage.label}
          onClose={() => setAskOpen(false)}
        />
      )}

      {/* Hotkeys Modal */}
      <HotkeysModal isOpen={hotkeysOpen} onClose={() => setHotkeysOpen(false)} />
    </header>
  );
}
