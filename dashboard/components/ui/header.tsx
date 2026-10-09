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
import { MORE_LINKS, NAV_MENUS, STATS_LINK, activeNavSection, analyticalNavItems } from "@/lib/nav-model";

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

  // Navigation model (lib/nav-model.ts) shared by the desktop menus and the drawer
  const unavailableItems = analyticalNavItems().filter(item => availability(item.href).secondary);
  const visibleMenus = NAV_MENUS.map(menu => ({
    ...menu,
    groups: menu.groups
      .map(group => ({ ...group, items: group.items.filter(item => !availability(item.href).secondary) }))
      .filter(group => group.items.length > 0),
  }));
  const activeSection = activeNavSection(pathname);
  const isCurrent = (href: string) => {
    const [path, query] = href.split("?");
    if (path !== pathname) return false;
    if (!query) return !(path === "/live" && searchParams.get("live_mode") === "history");
    return Array.from(new URLSearchParams(query).entries()).every(([key, value]) => searchParams.get(key) === value);
  };

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

  const indicator = (
    <motion.span
      layoutId="header-active-indicator"
      className="courtlens-nav-indicator"
      transition={{ type: "spring", stiffness: 520, damping: 38, mass: 0.9 }}
    />
  );

  const closeDrawer = () => setMobileDrawerOpen(false);

  return (
    <header
      ref={navRef}
      className={`courtlens-header replica-header ${isScrolled ? "is-scrolled scrolled" : ""}`}
    >
      {/* Left: Brand + menus with sliding active indicator (desktop only, D9) */}
      <div className="courtlens-header-left">
        <Brand />

        <nav className="courtlens-nav" aria-label="Workspace Navigation">
          <div className="courtlens-nav-item">
            <Link
              href={preserveContextUrl(STATS_LINK.href)}
              className={`courtlens-nav-link ${activeSection === "stats" ? "active" : ""}`}
            >
              {STATS_LINK.label}
              {activeSection === "stats" && indicator}
            </Link>
          </div>

          {visibleMenus.map(menu => {
            const multi = menu.groups.length > 1;
            return (
              <div
                key={menu.id}
                className="courtlens-nav-item"
                onMouseEnter={() => handleDropdownEnter(menu.id)}
                onMouseLeave={handleDropdownLeave}
              >
                <button
                  type="button"
                  data-dropdown-id={menu.id}
                  aria-haspopup="menu"
                  aria-expanded={openDropdown === menu.id}
                  onClick={() => toggleDropdown(menu.id)}
                  onKeyDown={e => handleTriggerKeyDown(e, menu.id)}
                  className={`courtlens-nav-dropdown-btn ${activeSection === menu.id ? "active" : ""}`}
                >
                  <span>{menu.label}</span>
                  <Icon name="chevron-down" size={14} className="courtlens-nav-chevron" />
                  {activeSection === menu.id && indicator}
                </button>

                <AnimatePresence>
                  {openDropdown === menu.id && (
                    <motion.div
                      data-dropdown-panel={menu.id}
                      role="menu"
                      aria-label={menu.label}
                      variants={popoverVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      className={`courtlens-dropdown-menu ${multi ? "courtlens-dropdown-multicol" : ""}`}
                      onKeyDown={handleDropdownKeyDown}
                    >
                      {menu.groups.map((group, index) => (
                        <div key={group.title ?? index} className={multi ? "courtlens-dropdown-col" : "courtlens-dropdown-group"}>
                          {group.title && (
                            <span className="courtlens-dropdown-section-title">{group.title}</span>
                          )}
                          {group.items.map(item => (
                            <Link
                              key={item.href}
                              href={preserveContextUrl(item.href)}
                              role="menuitem"
                              aria-current={isCurrent(item.href) ? "page" : undefined}
                              className={`courtlens-dropdown-item ${isCurrent(item.href) ? "active" : ""}`}
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
            );
          })}
        </nav>
      </div>

      {/* Center: the one search entry (D8); below 768px the icon button replaces the pill */}
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
          <Icon name="search" size={16} className="courtlens-search-pill-icon" />
          <span className="courtlens-search-pill-label">Search players, teams…</span>
          <kbd className="courtlens-search-pill-kbd">⌘K</kbd>
        </button>
      </div>

      {/* Right: search icon (phones), Ask, More (desktop), drawer toggle (below desktop) */}
      <div className="courtlens-header-right replica-nav-right">
        <IconButton
          icon="search"
          label="Search workbench"
          variant="ghost"
          size="sm"
          className="courtlens-mobile-search-btn"
          onClick={() => setPaletteOpen(true)}
        />

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

        <div className="courtlens-nav-item courtlens-more">
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
                aria-label="More"
                variants={popoverVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="courtlens-dropdown-menu courtlens-dropdown-menu-right"
                onKeyDown={handleDropdownKeyDown}
              >
                {MORE_LINKS.map(item => (
                  <Link
                    key={item.href}
                    href={preserveContextUrl(item.href)}
                    role="menuitem"
                    aria-current={isCurrent(item.href) ? "page" : undefined}
                    className={`courtlens-dropdown-item ${isCurrent(item.href) ? "active" : ""}`}
                    onClick={() => setMoreMenuOpen(false)}
                  >
                    <span>{item.label}</span>
                  </Link>
                ))}

                <div className="courtlens-dropdown-divider" />

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

      {/* Navigation drawer below the desktop breakpoint; rendered at document.body by Drawer */}
      <Drawer
        isOpen={mobileDrawerOpen}
        onClose={closeDrawer}
        side="left"
        className="replica-mobile-drawer"
        title={<Brand />}
      >
        <nav className="courtlens-mobile-drawer-body" aria-label="Drawer navigation">
          <div className="courtlens-mobile-direct-links">
            <Link
              href={preserveContextUrl(STATS_LINK.href)}
              aria-current={activeSection === "stats" ? "page" : undefined}
              className={`courtlens-mobile-link ${activeSection === "stats" ? "active" : ""}`}
              onClick={closeDrawer}
            >
              {STATS_LINK.label}
            </Link>
          </div>

          <Accordion>
            {visibleMenus.map(menu => (
              <AccordionItem
                key={menu.id}
                title={menu.label}
                defaultExpanded={activeSection === menu.id || menu.id === "research"}
              >
                <div className="courtlens-mobile-section-links">
                  {menu.groups.map((group, index) => (
                    <div key={group.title ?? index} className="courtlens-mobile-group">
                      {group.title && <span className="courtlens-mobile-group-title">{group.title}</span>}
                      {group.items.map(item => (
                        <Link
                          key={item.href}
                          href={preserveContextUrl(item.href)}
                          aria-current={isCurrent(item.href) ? "page" : undefined}
                          className={`courtlens-mobile-sublink ${isCurrent(item.href) ? "active" : ""}`}
                          onClick={closeDrawer}
                        >
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  ))}
                </div>
              </AccordionItem>
            ))}

            {unavailableItems.length > 0 && (
              <AccordionItem title={`Availability (${unavailableItems.length})`}>
                <div className="courtlens-mobile-section-links replica-mobile-section">
                  <span className="replica-dropdown-section-title sr-only">Availability</span>
                  {unavailableItems.map(item => (
                    <Link
                      key={item.href}
                      href={preserveContextUrl(item.href)}
                      className="courtlens-mobile-sublink"
                      onClick={closeDrawer}
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
            {MORE_LINKS.map(item => (
              <Link
                key={item.href}
                href={preserveContextUrl(item.href)}
                aria-current={isCurrent(item.href) ? "page" : undefined}
                className={`courtlens-mobile-link ${isCurrent(item.href) ? "active" : ""}`}
                onClick={closeDrawer}
              >
                {item.label}
              </Link>
            ))}
            <button
              type="button"
              className="courtlens-mobile-link"
              onClick={() => {
                closeDrawer();
                setHotkeysOpen(true);
              }}
            >
              Keyboard Shortcuts
            </button>
          </div>
        </nav>
      </Drawer>

      <GlobalCommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        triggerRef={searchPillRef}
      />

      {askOpen && assistantPage && (
        <AskDrawer
          pageContext={assistantPage.context}
          pageLabel={assistantPage.label}
          onClose={() => setAskOpen(false)}
        />
      )}

      <HotkeysModal isOpen={hotkeysOpen} onClose={() => setHotkeysOpen(false)} />
    </header>
  );
}
