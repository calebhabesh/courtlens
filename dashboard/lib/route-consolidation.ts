// FO07 route consolidation (frontend overhaul D3). Merged pages are one title with route tabs: one
// tab lives at the page's own path and every other tab at a sub-path, so views that rewrite their
// URL from `usePathname()` keep the selected tab. The first tab is where the menu opens the page,
// normally the page's own path (Six-Factor RAPM opens on its sub-path). This file is imported by `next.config.ts`,
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
  /** Research design pattern (row 18): a centred header with this Lucide icon name, after Databallr's explainers. */
  hero?: { icon: string };
}

export const TABBED_PAGES = {
  rapm: {
    title: "Six-Factor RAPM",
    subtitle: "A structural decomposition of player impact",
    hero: { icon: "book" },
    // R02: the explainer is the main entry; the 1Y/2Y/3Y table and sealed experiment stay a tab.
    tabs: [
      { label: "Six-Factor", href: "/research/rapm/six-factor" },
      { label: "RAPM Ratings", href: "/research/rapm" },
    ],
  },
  // RD01: one page after Databallr's Wingspan Database; the hero frame with no route tabs.
  wingspan: {
    title: "Combine & Wingspan",
    subtitle: "NBA Draft Combine measurements since 2000, with height and wingspan comps.",
    hero: { icon: "ruler" },
    tabs: [{ label: "Combine & Wingspan", href: "/wingspan" }],
  },
  // R11: the What's New route is the Patch Notes changelog, listed under Research → Tools (D8).
  whatsNew: {
    title: "Patch Notes",
    subtitle: "Every release, with the commit that shipped it.",
    tabs: [
      { label: "Patch Notes", href: "/whats-new" },
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

/** RD06, RD07 (owner, 2026-11-08): tabs that draw their own centred hero instead of the tabbed header (route and redirects unchanged). */
export const OWN_HEADER_TABS: ReadonlySet<string> = new Set(["/methodology/learning", "/whats-new"]);

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
  // RD17 (owner, 2026-11-10): Expected Shots is Shot Quality's earlier attempt (Model tab); Adjusted Shooting's defence is zTS's Defense tab.
  { source: "/research/shooting", destination: "/research/shot-quality?tab=model&earlier=open" },
  { source: "/research/expected-shots", destination: "/research/shot-quality?tab=model&earlier=open" },
  { source: "/research/shooting/adjusted", destination: "/research/zts?tab=defense" },
  { source: "/research/adjusted-shooting", destination: "/research/zts?tab=defense" },
  { source: "/shot-aftermath", destination: "/research/shooting/aftermath" },
  { source: "/patch-notes", destination: "/whats-new" },
  { source: "/blog", destination: "/whats-new" },
  { source: "/learning", destination: "/methodology/learning" },
];

/** Replica-era aliases that predate FO07. */
export const COMPATIBILITY_REDIRECTS: { source: string; destination: string }[] = [
  // Row 17 made Player Twins one page; its Shot Profile tab is the default mode.
  { source: "/research/similarity", destination: "/similar-players" },
  { source: "/shot-profile-twin", destination: "/similar-players" },
  { source: "/similar-players/shot-profile", destination: "/similar-players" },
  { source: "/pvp", destination: "/compare" },
  { source: "/StatLineShift", destination: "/stat-line-shift" },
  // RD17 Q4: Databallr's paths name zTS and Shot Quality.
  { source: "/zts", destination: "/research/zts" },
  { source: "/shotquality", destination: "/research/shot-quality" },
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
  // Alignment row 10 (owner, 2026-10-20): Rankings was built for social sharing, so it is cut.
  { source: "/rankings", destination: "/showcase" },
  // Alignment row 11 (owner, 2026-10-20): Tier List is cut for the same reason.
  { source: "/tierlist", destination: "/compare" },
  // Research D8 (owner, 2026-11-05): Last X Games and the player page cover these two.
  { source: "/research/trends", destination: "/last-games" },
  { source: "/research/distributions", destination: "/last-games" },
  // Research D3 (owner, 2026-11-05): the Blog is dropped.
  { source: "/whats-new/blog", destination: "/whats-new" },
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
