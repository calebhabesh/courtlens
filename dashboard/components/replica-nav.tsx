"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./ui/icon";
import { Button } from "./ui/controls";
import { Brand } from "./brand";
import { GlobalLookup } from "./global-lookup";
import { AskDrawer } from "./ask-drawer";
import { HotkeysModal } from "./hotkeys-modal";
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

export function ReplicaNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [hotkeysOpen, setHotkeysOpen] = useState(false);

  const releaseId = searchParams.get("releaseId") ?? searchParams.get("release_id") ?? undefined;
  const [catalogState, setCatalogState] = useState<{ releaseId?: string; catalog: WorkbenchCatalog } | null>(null);
  useEffect(() => {
    let active = true;
    getSharedCatalog(releaseId).then(catalog => { if (active) setCatalogState({ releaseId, catalog }); }).catch(() => { if (active) setCatalogState(null); });
    return () => { active = false; };
  }, [releaseId]);
  const catalog = catalogState?.releaseId === releaseId ? catalogState?.catalog ?? null : null;
  const availability = (href: string) => routeAvailability(href, catalog, searchParams.get("season") ?? undefined, searchParams.get("phase") ?? undefined);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const navRef = useRef<HTMLElement>(null);

  // Helper to preserve active context parameters across navigation links
  const preserveContextUrl = useCallback(
    (targetHref: string) => buildPreservedContextUrl(targetHref, searchParams),
    [searchParams]
  );

  // Global keyboard shortcuts: '/' or 'Cmd+K' to focus search, '?' for hotkeys, 'Esc' to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target?.tagName === "INPUT" ||
        target?.tagName === "SELECT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if ((e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key === "k")) && !isInput) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (e.key === "?" && !isInput) {
        e.preventDefault();
        setHotkeysOpen(true);
        return;
      }

      if (e.key === "Escape") {
        if (openDropdown) {
          navRef.current?.querySelector<HTMLButtonElement>('.replica-nav-dropdown-btn[aria-expanded="true"]')?.focus();
          setOpenDropdown(null);
        }
        if (mobileMenuOpen) {
          navRef.current?.querySelector<HTMLButtonElement>(".replica-mobile-toggle")?.focus();
          setMobileMenuOpen(false);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openDropdown, mobileMenuOpen]);

  // Click outside to close open dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close dropdowns on path change during render
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setOpenDropdown(null);
    setMobileMenuOpen(false);
  }

  const toggleDropdown = (id: string) => {
    setOpenDropdown((prev) => (prev === id ? null : id));
  };

  // Dropdown menus definition
  const liveItems: NavDropdownItem[] = [
    { label: "Live Scoreboard", href: "/live" },
    { label: "Historical Finals", href: "/live?live_mode=history" },
    { label: "Playoff Series", href: "/playoffs" }
  ];

  const playersItems: NavDropdownItem[] = [
    { label: "Recent Games", href: "/last-games" },
    { label: "Showcase Cards", href: "/showcase" },
    { label: "Player Directory", href: "/players" },
    { label: "Statistical Peers", href: "/research/similarity" },
    { label: "Shot-Profile Twins", href: "/shot-profile-twin" },
    { label: "Ranking Boards", href: "/rankings" }
  ];

  const teamsItems: NavDropdownItem[] = [
    { label: "Team Stats & Cohorts", href: "/teams" },
    { label: "Roster Shapes", href: "/roster-shapes" },
    { label: "Teammate Stat Shift", href: "/stat-line-shift" },
    { label: "Contracts & Payroll", href: "/contracts" },
    { label: "Free Agency Tracker", href: "/free-agency" }
  ];

  const compareItems: NavDropdownItem[] = [
    { label: "Player Comparison", href: "/compare" },
    { label: "Team Comparison", href: "/team-compare" },
    { label: "Player Matchups", href: "/matchups" },
    { label: "Tier Lists", href: "/tierlist" }
  ];

  const researchSections: NavSection[] = [
    {
      title: "Core Research",
      items: [
        { label: "Saved Investigations", href: "/investigations" },
        { label: "Ask CourtLoad AI", href: "/research/ask" },
        { label: "Points Forecasts", href: "/forecasts" },
        { label: "Evaluation Archive", href: "/evaluation" },
        { label: "Case Studies", href: "/research/case-studies" }
      ]
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
        { label: "Hypothetical Calculator", href: "/calculator" }
      ]
    }
  ];

  const helpItems: NavDropdownItem[] = [
    { label: "Definitions & Glossary", href: "/methodology" },
    { label: "Interactive Learning", href: "/learning" },
    { label: "Patch Notes", href: "/patch-notes" },
    { label: "Blog & Updates", href: "/blog" }
  ];

  const allSections = [
    { title: "Live", items: liveItems }, { title: "Players", items: playersItems },
    { title: "Teams", items: teamsItems }, { title: "Compare", items: compareItems },
    ...researchSections, { title: "Help", items: helpItems },
    { title: "Primary", items: [{ label: "Stats", href: "/stats" }, { label: "WOWY", href: "/wowy" }] }
  ];
  const unavailableItems = allSections.flatMap(section => section.items).filter(item => availability(item.href).secondary);
  const availableSections = allSections.map(section => ({ ...section, items: section.items.filter(item => !availability(item.href).secondary) }));
  for (const items of [liveItems, playersItems, teamsItems, compareItems, helpItems, ...researchSections.map(section => section.items)]) {
    for (let index = items.length - 1; index >= 0; index--) if (availability(items[index].href).secondary) items.splice(index, 1);
  }

  const isStatsActive = pathname === "/stats" || pathname === "/" || pathname === "/players";
  const isWowyActive = pathname === "/wowy";
  const isLiveActive = pathname?.startsWith("/live") || pathname?.startsWith("/playoffs");
  const isPlayersActive =
    pathname === "/last-games" ||
    pathname === "/showcase" ||
    pathname === "/rankings" ||
    pathname === "/shot-profile-twin" ||
    pathname === "/research/similarity";
  const isTeamsActive =
    pathname?.startsWith("/teams") ||
    pathname === "/roster-shapes" ||
    pathname === "/stat-line-shift" ||
    pathname === "/contracts" ||
    pathname === "/free-agency";
  const isCompareActive =
    pathname === "/compare" ||
    pathname === "/team-compare" ||
    pathname === "/matchups" ||
    pathname === "/tierlist";
  const isResearchActive =
    pathname?.startsWith("/research") ||
    pathname === "/investigations" ||
    pathname === "/forecasts" ||
    pathname === "/evaluation" ||
    pathname === "/six-factor-rapm" ||
    pathname === "/shot-aftermath" ||
    pathname === "/wingspan" ||
    pathname === "/calculator";
  const isHelpActive =
    pathname === "/methodology" ||
    pathname === "/learning" ||
    pathname === "/patch-notes" ||
    pathname === "/blog";

  return (
    <header className="replica-header" ref={navRef} onKeyDown={(event) => {
      const target = event.target as HTMLElement;
      const trigger = target.closest<HTMLButtonElement>(".replica-nav-dropdown-btn");
      if (trigger && ["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        if (trigger.getAttribute("aria-expanded") !== "true") trigger.click();
        requestAnimationFrame(() => {
          const items = trigger.parentElement?.querySelectorAll<HTMLAnchorElement>("[role=menuitem]");
          (event.key === "ArrowUp" ? items?.[items.length - 1] : items?.[0])?.focus();
        });
      }
      const menu = target.closest("[role=menu]");
      if (menu && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const items = Array.from(menu.querySelectorAll<HTMLAnchorElement>("[role=menuitem]"));
        const index = items.indexOf(target as HTMLAnchorElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 :
          (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      }
    }}>
      {/* Row 1: Top Application Row */}
      <div className="replica-top-row">
        <div className="replica-brand-group">
          <Brand />
          <nav className="replica-quick-links" aria-label="Primary Quick Switch">
            <Link
              href={preserveContextUrl("/stats")}
              className={`replica-quick-link ${isStatsActive ? "active" : ""}`}
            >
              Stats
            </Link>
            <span className="text-muted" aria-hidden="true">
              ·
            </span>
            <Link
              href={preserveContextUrl("/live")}
              className={`replica-quick-link ${isLiveActive ? "active" : ""}`}
            >
              Games
            </Link>
          </nav>
        </div>

        {/* Center: Incremental Global Lookup (Block B06) */}
        <GlobalLookup
          inputRef={searchInputRef}
          className="replica-search-container"
        />

        {/* Right: Operational Actions & Mobile Toggle */}
        <div className="replica-actions-group">
          <Button variant="quiet" className="replica-action-link" aria-haspopup="dialog" onClick={() => setAskOpen(true)}><Icon name="message" />Ask</Button>
          {askOpen && <AskDrawer onClose={() => setAskOpen(false)} />}
          <Link
            href={preserveContextUrl("/data-status")}
            className={`replica-action-link ${pathname === "/data-status" ? "active" : ""}`}
            title="Dataset health, publication pointer, and background jobs"
          >
            <Icon name="settings" />Data status
          </Link>
          <Link
            href={preserveContextUrl("/settings")}
            className={`replica-action-link ${pathname === "/settings" ? "active" : ""}`}
            title="Workbench configuration and display settings"
          >
            <Icon name="settings" />Settings
          </Link>
          <button
            type="button"
            className="replica-mobile-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation drawer"
            aria-expanded={mobileMenuOpen}
          >
            <Icon name={mobileMenuOpen ? "close" : "menu"} />
          </button>
        </div>
      </div>

      {/* Row 2: Horizontal Menus Row */}
      <nav className="replica-nav-row" aria-label="Workspace Navigation">
        <div className="replica-nav-left">
          {/* Stats direct link */}
          <Link
            href={preserveContextUrl("/stats")}
            className={`replica-nav-link ${isStatsActive ? "active" : ""}`}
          >
            Stats
          </Link>

          {/* WOWY direct link */}
          {!availability("/wowy").secondary && <Link
            href={preserveContextUrl("/wowy")}
            className={`replica-nav-link ${isWowyActive ? "active" : ""}`}
          >
            WOWY
          </Link>}

          {/* Live dropdown */}
          <div className="replica-nav-item">
            <button
              type="button"
              className={`replica-nav-dropdown-btn ${isLiveActive ? "active" : ""}`}
              onClick={() => toggleDropdown("live")}
              aria-haspopup="menu"
              aria-expanded={openDropdown === "live"}
            >
              <span>Live</span>
              <Icon name="chevron-down" className="replica-dropdown-arrow" />
            </button>
            {openDropdown === "live" && (
              <div className="replica-dropdown-menu" role="menu">
                {liveItems.map((item) => (
                  <Link
                    key={item.href}
                    href={preserveContextUrl(item.href)}
                    className={`replica-dropdown-item ${pathname === item.href ? "active" : ""}`}
                    role="menuitem"
                  >
                    <span>{item.label}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Players dropdown */}
          <div className="replica-nav-item">
            <button
              type="button"
              className={`replica-nav-dropdown-btn ${isPlayersActive ? "active" : ""}`}
              onClick={() => toggleDropdown("players")}
              aria-haspopup="menu"
              aria-expanded={openDropdown === "players"}
            >
              <span>Players</span>
              <Icon name="chevron-down" className="replica-dropdown-arrow" />
            </button>
            {openDropdown === "players" && (
              <div className="replica-dropdown-menu" role="menu">
                {playersItems.map((item) => (
                  <Link
                    key={item.href}
                    href={preserveContextUrl(item.href)}
                    className={`replica-dropdown-item ${pathname === item.href ? "active" : ""}`}
                    role="menuitem"
                  >
                    <span>{item.label}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Teams dropdown */}
          <div className="replica-nav-item">
            <button
              type="button"
              className={`replica-nav-dropdown-btn ${isTeamsActive ? "active" : ""}`}
              onClick={() => toggleDropdown("teams")}
              aria-haspopup="menu"
              aria-expanded={openDropdown === "teams"}
            >
              <span>Teams</span>
              <Icon name="chevron-down" className="replica-dropdown-arrow" />
            </button>
            {openDropdown === "teams" && (
              <div className="replica-dropdown-menu" role="menu">
                {teamsItems.map((item) => (
                  <Link
                    key={item.href}
                    href={preserveContextUrl(item.href)}
                    className={`replica-dropdown-item ${pathname === item.href ? "active" : ""}`}
                    role="menuitem"
                  >
                    <span>{item.label}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Compare dropdown */}
          <div className="replica-nav-item">
            <button
              type="button"
              className={`replica-nav-dropdown-btn ${isCompareActive ? "active" : ""}`}
              onClick={() => toggleDropdown("compare")}
              aria-haspopup="menu"
              aria-expanded={openDropdown === "compare"}
            >
              <span>Compare</span>
              <Icon name="chevron-down" className="replica-dropdown-arrow" />
            </button>
            {openDropdown === "compare" && (
              <div className="replica-dropdown-menu" role="menu">
                {compareItems.map((item) => (
                  <Link
                    key={item.href}
                    href={preserveContextUrl(item.href)}
                    className={`replica-dropdown-item ${pathname === item.href ? "active" : ""}`}
                    role="menuitem"
                  >
                    <span>{item.label}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Research dropdown (multi-column) */}
          <div className="replica-nav-item">
            <button
              type="button"
              className={`replica-nav-dropdown-btn ${isResearchActive ? "active" : ""}`}
              onClick={() => toggleDropdown("research")}
              aria-haspopup="menu"
              aria-expanded={openDropdown === "research"}
            >
              <span>Research</span>
              <Icon name="chevron-down" className="replica-dropdown-arrow" />
            </button>
            {openDropdown === "research" && (
              <div className="replica-dropdown-menu replica-dropdown-multicol" role="menu">
                {researchSections.map((section) => (
                  <div key={section.title} className="replica-dropdown-col">
                    <span className="replica-dropdown-section-title">{section.title}</span>
                    {section.items.map((item) => (
                      <Link
                        key={item.href}
                        href={preserveContextUrl(item.href)}
                        className={`replica-dropdown-item ${
                          pathname === item.href ? "active" : ""
                        }`}
                        role="menuitem"
                      >
                        <span>{item.label}</span>
                      </Link>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {unavailableItems.length > 0 && <div className="replica-nav-item">
          <button type="button" className="replica-nav-dropdown-btn" aria-haspopup="menu" aria-expanded={openDropdown === "availability"} onClick={() => toggleDropdown("availability")}>Availability <Icon name="chevron-down" /></button>
          {openDropdown === "availability" && <div className="replica-dropdown-menu availability-menu" role="menu">{unavailableItems.map(item => <Link key={item.href} href={preserveContextUrl(item.href)} className="replica-dropdown-item" role="menuitem"><span>{item.label}<small className="availability-reason">{availability(item.href).reason}</small></span></Link>)}</div>}
        </div>}

        {/* Right: Help dropdown */}
        <div className="replica-nav-right">
          <div className="replica-nav-item">
            <button
              type="button"
              className={`replica-nav-dropdown-btn ${isHelpActive ? "active" : ""}`}
              onClick={() => toggleDropdown("help")}
              aria-haspopup="menu"
              aria-expanded={openDropdown === "help"}
            >
              <span>Help</span>
              <Icon name="chevron-down" className="replica-dropdown-arrow" />
            </button>
            {openDropdown === "help" && (
              <div className="replica-dropdown-menu replica-dropdown-menu-right" role="menu">
                {helpItems.map((item) => (
                  <Link
                    key={item.href}
                    href={preserveContextUrl(item.href)}
                    className={`replica-dropdown-item ${pathname === item.href ? "active" : ""}`}
                    role="menuitem"
                  >
                    <span>{item.label}</span>
                  </Link>
                ))}
                <button
                  type="button"
                  className="replica-dropdown-item"
                  style={{ width: "calc(100% - 8px)", textAlign: "left", cursor: "pointer", background: "none", border: "none" }}
                  onClick={() => {
                    setOpenDropdown(null);
                    setHotkeysOpen(true);
                  }}
                  role="menuitem"
                >
                  <span>Keyboard Shortcuts</span>
                  <kbd className="font-mono text-xs" style={{ opacity: 0.7 }}>?</kbd>
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile drawer when open on <= 900px screens */}
      {mobileMenuOpen && (
        <div className="replica-mobile-drawer" role="dialog" aria-label="Mobile Navigation">
          {availableSections.filter(section => section.items.length).map(section => <div className="replica-mobile-section" key={section.title}><span className="replica-dropdown-section-title">{section.title}</span>{section.items.map(item => <Link key={item.href} href={preserveContextUrl(item.href)} className="replica-dropdown-item">{item.label}</Link>)}</div>)}
          <div className="replica-mobile-section"><span className="replica-dropdown-section-title">Availability</span>{unavailableItems.map(item => <Link key={item.href} href={preserveContextUrl(item.href)} className="replica-dropdown-item"><span>{item.label}<small className="availability-reason">{availability(item.href).reason}</small></span></Link>)}</div>
          <div className="replica-mobile-section"><Link href={preserveContextUrl("/data-status")} className="replica-dropdown-item">Data status</Link><Link href={preserveContextUrl("/settings")} className="replica-dropdown-item">Settings</Link><button type="button" className="replica-dropdown-item" onClick={() => { setMobileMenuOpen(false); setHotkeysOpen(true); }}>Keyboard shortcuts</button></div>
        </div>
      )}

      {/* Hotkeys Modal */}
      <HotkeysModal isOpen={hotkeysOpen} onClose={() => setHotkeysOpen(false)} />
    </header>
  );
}
