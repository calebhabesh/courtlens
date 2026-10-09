// One navigation model for the desktop menus, the narrow-width drawer and availability (FO02, D9).
// Groups follow the FO07 targets. A merged page (lib/route-consolidation.ts) appears once, under its
// page title; its tabs are reached on the page and through search.

export interface NavItem {
  label: string;
  href: string;
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

export const NAV_MENUS: NavMenu[] = [
  {
    id: "live",
    label: "Live",
    groups: [{ items: [
      // The Live page's tabs (D19); every entry opens the page titled "Live".
      { label: "Live", href: "/live" },
      { label: "Finals", href: "/live?live_mode=history" },
      { label: "Playoffs", href: "/playoffs" },
    ] }],
  },
  {
    id: "players",
    label: "Players",
    groups: [{ items: [
      { label: "Player Directory", href: "/players" },
      { label: "Recent Games", href: "/last-games" },
      { label: "Player Showcase", href: "/showcase" },
      { label: "Ranking Boards", href: "/rankings" },
      { label: "Tier Lists", href: "/tierlist" },
      { label: "Similar Players", href: "/similar-players" },
    ] }],
  },
  {
    id: "teams",
    label: "Teams",
    groups: [{ items: [
      { label: "Team Stats & Cohorts", href: "/teams" },
      { label: "Roster Shapes", href: "/roster-shapes" },
      { label: "Teammate Stat Shift", href: "/stat-line-shift" },
      { label: "Contracts & Payroll", href: "/contracts" },
      { label: "Free Agency Tracker", href: "/free-agency" },
    ] }],
  },
  {
    id: "compare",
    label: "Compare",
    groups: [{ items: [
      { label: "Player Comparison", href: "/compare" },
      { label: "Team Comparison", href: "/team-compare" },
      { label: "Player Matchups", href: "/matchups" },
    ] }],
  },
  {
    id: "research",
    label: "Research",
    groups: [
      { title: "Impact", items: [
        { label: "RAPM Research", href: "/research/rapm" },
        { label: "WOWY", href: "/wowy" },
        { label: "Defensive Matchups", href: "/research/defensive-matchups" },
        { label: "Spatial EPV", href: "/research/epv" },
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

/** The desktop `⋯` menu (D9); below the desktop breakpoint the same links sit at the end of the drawer. */
export const MORE_LINKS: NavItem[] = [
  { label: "Settings", href: "/settings" },
  { label: "Data status", href: "/data-status" },
  { label: "Methodology", href: "/methodology" },
  { label: "What's New", href: "/whats-new" },
  { label: "Schedule", href: "/schedule" },
  { label: "Planner", href: "/planner" },
];

/** Every analytical destination whose availability is checked against the catalog. */
export function analyticalNavItems(): NavItem[] {
  return [STATS_LINK, ...NAV_MENUS.flatMap(menu => menu.groups.flatMap(group => group.items))];
}

function pathOf(href: string): string {
  return href.split("?")[0];
}

/** The top-level entry that owns a pathname: "stats", a menu id, or "" when none does. */
export function activeNavSection(pathname: string): string {
  if (pathname === "/" || pathname === "/stats") return "stats";
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
