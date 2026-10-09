"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { motion } from "../../lib/motion";
import { buildPreservedContextUrl } from "../../lib/query-url";
import { getSharedCatalog, routeAvailability } from "../../lib/route-availability";
import type { WorkbenchCatalog } from "../../lib/types";

export interface RouteTabItem {
  label: string;
  href: string;
}

export interface RouteTabsProps {
  tabs: readonly RouteTabItem[];
  "aria-label": string;
  /** Query keys carried to every tab besides the shared context (season, phase, through date, release). */
  carry?: readonly string[];
  /** The selected tab's href, when tabs share a path and differ by query (Live · Finals). */
  active?: string;
  className?: string;
}

/** The tab whose path owns `pathname`: an exact match, otherwise the longest path prefix. */
export function activeRouteTab(tabs: readonly RouteTabItem[], pathname: string): RouteTabItem | undefined {
  const exact = tabs.find(tab => tab.href === pathname);
  if (exact) return exact;
  return [...tabs]
    .sort((a, b) => b.href.length - a.href.length)
    .find(tab => pathname.startsWith(`${tab.href}/`));
}

/**
 * Tabs that are separate URLs (FO07 merged pages). Each tab is a link, so it can be opened in a new
 * tab, shared and reached by redirects; the selected tab carries `aria-current="page"`. Tabs whose
 * source is unavailable in the selected scope stay reachable but read as secondary (D4), with the
 * reason as a tooltip, like the header menus.
 */
export function RouteTabs({ tabs, "aria-label": ariaLabel, carry = [], active: activeHref, className = "" }: RouteTabsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const indicatorId = useId();
  const active = activeHref ? tabs.find(tab => tab.href === activeHref) : activeRouteTab(tabs, pathname);

  const releaseId = searchParams.get("releaseId") ?? searchParams.get("release_id") ?? undefined;
  const [catalog, setCatalog] = useState<WorkbenchCatalog | null>(null);
  useEffect(() => {
    let live = true;
    getSharedCatalog(releaseId).then(value => { if (live) setCatalog(value); }).catch(() => { if (live) setCatalog(null); });
    return () => { live = false; };
  }, [releaseId]);

  function hrefFor(tab: RouteTabItem) {
    const target = new URL(buildPreservedContextUrl(tab.href, searchParams), "http://courtlens.local");
    for (const key of carry) {
      const value = searchParams.get(key);
      if (value && !target.searchParams.has(key)) target.searchParams.set(key, value);
    }
    return `${target.pathname}${target.search}`;
  }

  return (
    <nav className={`ui-route-tabs ${className}`} aria-label={ariaLabel}>
      <ul className="ui-tabs-list ui-route-tabs-list">
        {tabs.map(tab => {
          const selected = tab === active;
          // Availability is only known once the catalog loads; until then no tab is marked.
          const gate = catalog ? routeAvailability(tab.href, catalog, searchParams.get("season") ?? undefined, searchParams.get("phase") ?? undefined) : null;
          return (
            <li key={tab.href}>
              <Link
                href={hrefFor(tab)}
                className="ui-tab-trigger ui-route-tab"
                aria-current={selected ? "page" : undefined}
                data-active={selected}
                data-secondary={gate?.secondary || undefined}
                title={gate?.secondary ? gate.reason : undefined}
                scroll={false}
              >
                {tab.label}
                {selected && (
                  <motion.span
                    layoutId={`route-tab-indicator-${indicatorId}`}
                    className="ui-tab-indicator"
                    transition={{ type: "spring", stiffness: 520, damping: 38, mass: 0.9 }}
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
