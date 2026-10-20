// FO07 route consolidation (frontend overhaul D3). Merged pages are one title with route tabs: the
// first tab lives at the page's own path and every other tab at a sub-path, so views that rewrite
// their URL from `usePathname()` keep the selected tab. This file is imported by `next.config.ts`,
// so it must stay free of path aliases and runtime dependencies.

export interface RouteTab {
  label: string;
  href: string;
}

export interface TabbedPage {
  title: string;
  /** One short line under the title (D7). */
  subtitle: string;
  tabs: readonly RouteTab[];
}

export const TABBED_PAGES = {
  rapm: {
    title: "RAPM Research",
    subtitle: "Served impact ratings and registered impact experiments.",
    tabs: [
      { label: "RAPM", href: "/research/rapm" },
      { label: "Six-Factor", href: "/research/rapm/six-factor" },
    ],
  },
  similarPlayers: {
    title: "Similar Players",
    subtitle: "Players with the closest box-score or shot profiles.",
    tabs: [
      { label: "Box Score", href: "/similar-players" },
      { label: "Shot Profile", href: "/similar-players/shot-profile" },
    ],
  },
  shooting: {
    title: "Shooting",
    subtitle: "Expected-shot and adjusted-shooting research, and what follows a shot.",
    tabs: [
      { label: "Expected Shots", href: "/research/shooting" },
      { label: "Adjusted Shooting", href: "/research/shooting/adjusted" },
      { label: "Shot Aftermath", href: "/research/shooting/aftermath" },
    ],
  },
  whatsNew: {
    title: "What's New",
    subtitle: "Dated changes and engineering notes.",
    tabs: [
      { label: "Patch Notes", href: "/whats-new" },
      { label: "Blog", href: "/whats-new/blog" },
    ],
  },
  methodology: {
    title: "Methodology",
    subtitle: "Metric definitions, principles and worked lessons.",
    tabs: [
      { label: "Definitions", href: "/methodology" },
      { label: "Learning", href: "/methodology/learning" },
    ],
  },
} satisfies Record<string, TabbedPage>;

/** PC11: Stats keeps its own header; Tracking is a second route tab (season totals, separate query). */
export const STATS_TABS: readonly RouteTab[] = [
  { label: "Box Score", href: "/stats" },
  { label: "Tracking", href: "/stats/tracking" },
];

/**
 * Every URL removed by FO07 and the tab that replaced it. Next.js redirects pass the query string
 * through, so saved links and evidence links keep their scope. Older aliases point straight at the
 * final tab so no request takes two hops.
 */
export const CONSOLIDATED_REDIRECTS: { source: string; destination: string }[] = [
  { source: "/six-factor-rapm", destination: "/research/rapm/six-factor" },
  { source: "/research/similarity", destination: "/similar-players" },
  { source: "/shot-profile-twin", destination: "/similar-players/shot-profile" },
  { source: "/research/expected-shots", destination: "/research/shooting" },
  { source: "/research/adjusted-shooting", destination: "/research/shooting/adjusted" },
  { source: "/shot-aftermath", destination: "/research/shooting/aftermath" },
  { source: "/patch-notes", destination: "/whats-new" },
  { source: "/blog", destination: "/whats-new/blog" },
  { source: "/learning", destination: "/methodology/learning" },
];

/** Replica-era aliases that predate FO07. */
export const COMPATIBILITY_REDIRECTS: { source: string; destination: string }[] = [
  { source: "/pvp", destination: "/compare" },
  { source: "/StatLineShift", destination: "/stat-line-shift" },
  { source: "/zts", destination: "/research/shooting/adjusted" },
  { source: "/shotquality", destination: "/research/shooting" },
  { source: "/d-shotquality", destination: "/research/defensive-matchups" },
  { source: "/kawhifiles", destination: "/research/case-studies" },
  { source: "/ask", destination: "/research/ask" },
  { source: "/dashboard", destination: "/players" },
];

/**
 * Pages hidden by an owner decision rather than merged. `/schedule` read 14 legacy fixture games;
 * Live's date strip shows the retained schedule (FO13, 2026-10-09).
 */
export const HIDDEN_REDIRECTS: { source: string; destination: string }[] = [
  { source: "/schedule", destination: "/live" },
  // Free Agency returned with NBA.com's tracker (alignment row 14, 2026-10-19).
  // PC11 (C14): EPV needs non-public player-location tracking, so the page is removed, not gated.
  { source: "/research/epv", destination: "/research/rapm" },
];

/** PC11: removed from the hosted demo only (see HOSTED_DEMO_HIDDEN in lib/nav-model.ts). */
export const HOSTED_DEMO_REDIRECTS: { source: string; destination: string }[] = [
  { source: "/planner", destination: "/" },
];

/** The path of the merged page that owns `pathname` when it is one of its tabs, else the pathname. */
export function mergedPagePath(pathname: string): string {
  const page = Object.values(TABBED_PAGES).find(entry => entry.tabs.some(tab => tab.href === pathname));
  return page ? page.tabs[0].href : pathname;
}
