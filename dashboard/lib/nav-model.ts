// One navigation model for the desktop menus, the narrow-width drawer and availability (FO02, D9).
// Groups follow the FO07 targets. A merged page (lib/route-consolidation.ts) appears once, under its
// page title; its tabs are reached on the page and through search.

import type { IconName } from "@/components/ui/icon";

export interface NavItem {
  label: string;
  href: string;
  /** A menu whose items all carry an icon and a one-line description shows them as rich rows (Teams, alignment row 4). */
  icon?: IconName;
  description?: string;
}

export interface NavGroup {
  title?: string;
  items: NavItem[];
}

export interface NavMenu {
  id: string;
  label: string;
  groups: NavGroup[];
}

export const STATS_LINK: NavItem = { label: "Stats", href: "/stats" };
/** A top-level link after Stats, as on Databallr (alignment row 5). */
export const WOWY_LINK: NavItem = { label: "WOWY", href: "/wowy" };
/** After WOWY, as on Databallr (alignment row 13, follow-up 18); no longer under Teams. */
export const STAT_LINE_SHIFT_LINK: NavItem = { label: "Stat Line Shift", href: "/stat-line-shift" };

/** Top-level links without a menu, keyed by their section id. */
export const DIRECT_LINKS: { id: string; item: NavItem }[] = [
  { id: "stats", item: STATS_LINK },
  { id: "wowy", item: WOWY_LINK },
  { id: "stat-line-shift", item: STAT_LINE_SHIFT_LINK },
];

export const NAV_MENUS: NavMenu[] = [
  {
    id: "live",
    label: "Live",
    groups: [{ items: [
      // Databallr's Live menu (alignment row 7): past dates on Live show their finals.
      { label: "Live", href: "/live", icon: "broadcast", description: "Live NBA scores, box scores and play-by-play" },
      { label: "Playoffs", href: "/playoffs", icon: "trophy", description: "The playoff bracket, with series and team comparisons" },
    ] }],
  },
  {
    id: "players",
    label: "Players",
    groups: [{ items: [
      // Databallr's Players menu order (Rankings and Tier List cut, alignment rows 10–11).
      { label: "Last X Games", href: "/last-games", icon: "chart-trend", description: "Player performance over their most recent games" },
      { label: "Showcase", href: "/showcase", icon: "crown", description: "Each season's leaders as player cards, with a season slideshow" },
      { label: "Player Twins", href: "/similar-players", icon: "fingerprint", description: "Player-seasons with the closest shot or box-score profiles, since 1996-97" },
      { label: "Player Dashboard", href: "/players", icon: "dashboard", description: "Player panels side by side, from the DARKO leaders or search" },
    ] }],
  },
  {
    id: "teams",
    label: "Teams",
    groups: [{ items: [
      { label: "Teams", href: "/teams", icon: "building", description: "Team ratings, six factors and rankings" },
      { label: "Roster Shapes", href: "/roster-shapes", icon: "shapes", description: "Every NBA roster as shapes in a box" },
      { label: "Contracts", href: "/contracts", icon: "dollar", description: "NBA salary cap analysis and contract details" },
      { label: "Free Agency", href: "/free-agency", icon: "user-check", description: "The 2026 NBA free agency tracker" },
    ] }],
  },
  {
    id: "compare",
    label: "Compare",
    groups: [{ items: [
      { label: "Player Comparison", href: "/compare", icon: "swap", description: "Compare stats between up to five NBA players" },
      { label: "Team Comparison", href: "/team-compare", icon: "scale", description: "Two team seasons side by side: rotations and team stats" },
      { label: "Player Matchups", href: "/matchups", icon: "swords", description: "Who guarded whom, from NBA tracking" },
    ] }],
  },
  {
    id: "research",
    label: "Research",
    groups: [
      { title: "Impact", items: [
        { label: "RAPM Research", href: "/research/rapm" },
        { label: "Defensive Matchups", href: "/research/defensive-matchups" },
      ] },
      { title: "Shooting", items: [
        { label: "Shooting", href: "/research/shooting" },
      ] },
      { title: "Trends & Distributions", items: [
        { label: "Workload Trends", href: "/research/trends" },
        { label: "Distributions & Splits", href: "/research/distributions" },
      ] },
      { title: "Forecasts & Evaluation", items: [
        { label: "Points Forecasts", href: "/forecasts" },
        { label: "Evaluation Archive", href: "/evaluation" },
        { label: "Case Studies", href: "/research/case-studies" },
        { label: "Saved Investigations", href: "/investigations" },
      ] },
      { title: "Tools", items: [
        { label: "Combine & Wingspan", href: "/wingspan" },
        { label: "Hypothetical Calculator", href: "/calculator" },
      ] },
    ],
  },
];

/** Pages that exist locally but not on the hosted demo (PC11). Their routes redirect there too. */
export const HOSTED_DEMO_HIDDEN = new Set(["/planner"]);

/** Inlined at build time; set only by the hosted-demo build (PC13). */
export const HOSTED_DEMO = process.env.NEXT_PUBLIC_COURTLENS_HOSTED_DEMO === "1";

/**
 * The desktop `⋯` menu (D9); Schedule was hidden in FO13 (owner decision). Below the desktop breakpoint the same links sit at the end of the drawer. */
export function moreLinks(hosted = HOSTED_DEMO): NavItem[] {
  return [
    { label: "Settings", href: "/settings" },
    { label: "Data Status", href: "/data-status" },
    { label: "Methodology", href: "/methodology" },
    { label: "What's New", href: "/whats-new" },
    // Planner is empty without a signed-in league, so the hosted demo drops it (PC11).
    { label: "Planner", href: "/planner" },
  ].filter(item => !(hosted && HOSTED_DEMO_HIDDEN.has(item.href)));
}

export const MORE_LINKS: NavItem[] = moreLinks();

/** Every analytical destination whose availability is checked against the catalog. */
export function analyticalNavItems(): NavItem[] {
  return [...DIRECT_LINKS.map(link => link.item), ...NAV_MENUS.flatMap(menu => menu.groups.flatMap(group => group.items))];
}

function pathOf(href: string): string {
  return href.split("?")[0];
}

/** The top-level entry that owns a pathname: "stats", a menu id, or "" when none does. */
export function activeNavSection(pathname: string): string {
  if (pathname === "/" || pathname === "/stats" || pathname.startsWith("/stats/")) return "stats";
  for (const { id, item } of DIRECT_LINKS) if (id !== "stats" && (pathname === item.href || pathname.startsWith(`${item.href}/`))) return id;
  for (const menu of NAV_MENUS) {
    for (const group of menu.groups) {
      // A merged page's tabs live under its path (FO07), so they belong to the same menu.
      if (group.items.some(item => pathname === pathOf(item.href) || pathname.startsWith(`${pathOf(item.href)}/`))) return menu.id;
    }
  }
  if (pathname.startsWith("/live") || pathname.startsWith("/playoffs")) return "live";
  if (pathname.startsWith("/players/")) return "players";
  if (pathname.startsWith("/teams/") || pathname.startsWith("/contracts/")) return "teams";
  if (pathname.startsWith("/research") || pathname.startsWith("/investigations")) return "research";
  return "";
}
