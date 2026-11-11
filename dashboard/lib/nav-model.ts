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
      { label: "Standings", href: "/standings", icon: "list-ordered", description: "ESPN's NBA standings by league, conference and division" },
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
    // The Research handoff's target menu (D8), limited to pages that exist; R11 added Learning and Patch Notes.
    // Case Studies and Saved Investigations moved to Methodology; Evaluation Archive is reached from Points Forecasts and Methodology.
    groups: [
      { title: "Models", items: [
        { label: "Win Probability", href: "/research/win-probability", icon: "activity", description: "Live win probability for each game, scored nightly" },
        { label: "Projected Impact", href: "/research/projected-impact", icon: "trend", description: "2026-27 player ratings frozen before the games, with intervals" },
        { label: "Lineup Model", href: "/research/lineup-model", icon: "users", description: "A neural lineup model tested against ridge RAPM, with a lineup tool and player map" },
      ] },
      { title: "Impact", items: [
        { label: "Six-Factor RAPM", href: "/research/rapm/six-factor", icon: "gauge", description: "Player impact ratings and their six-factor breakdown" },
        { label: "Metric Backtest", href: "/research/backtest", icon: "chart-trend", description: "Which impact metric best predicts real game results" },
      ] },
      // RD17 (owner, 2026-11-10): the Shooting page is gone; its two tabs merged into Shot Quality and zTS, and Shot Aftermath stands alone.
      { title: "Shooting", items: [
        { label: "Shot Quality", href: "/research/shot-quality", icon: "scatter", description: "Expected points per shot and each player's shot-making above it" },
        { label: "zTS", href: "/research/zts", icon: "scale", description: "True shooting adjusted for play-type difficulty, and points allowed by play type" },
        { label: "Shot Aftermath", href: "/research/shooting/aftermath", icon: "split", description: "What first-chance shots score, what misses win back and what the opponent scores next" },
        { label: "Defensive Shot Quality", href: "/research/defensive-matchups", icon: "shield", description: "What shooters scored against each defender, against their own shooting" },
      ] },
      { title: "Methods", items: [
        { label: "Signal vs Noise", href: "/research/signal-noise", icon: "waveform", description: "How big a sample a stat needs, and shrunk shooting percentages" },
        { label: "Points Forecasts", href: "/forecasts", icon: "chart-line", description: "Next-game points estimates, their test and the prospective ledger" },
        { label: "Learning", href: "/methodology/learning", icon: "book", description: "Advanced stats from the ground up, each linked to a measured result" },
      ] },
      { title: "Tools", items: [
        { label: "Combine & Wingspan", href: "/wingspan", icon: "ruler", description: "Official NBA Draft Combine measurements, including wingspan" },
        { label: "Draft Classes", href: "/draft", icon: "graduation", description: "What each draft slot returned, classes redrafted and this year's rookies" },
        { label: "ORtg Calculator", href: "/calculator", icon: "calculator", description: "Offensive rating from the four factors, after Poropudas and Halme" },
        { label: "Patch Notes", href: "/whats-new", icon: "history", description: "Every release, with the commit that shipped it" },
      ] },
    ],
  },
];

/**
 * Menu items that open a merged page on a later tab. D8 lists Learning in Research → Methods while it
 * stays a Methodology tab beside the definitions it teaches (R11).
 */
export const TAB_SHORTCUTS = new Set(["/methodology/learning"]);

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
  if (pathname.startsWith("/research") || pathname.startsWith("/investigations") || pathname.startsWith("/evaluation")) return "research";
  return "";
}

/** Estimated height of a menu group in text lines: its heading plus each row's label and wrapped description. */
function groupLines(group: NavGroup, charsPerLine = 34): number {
  return (group.title ? 1.5 : 0) + group.items.reduce((sum, item) => sum + 1.6 + Math.ceil((item.description?.length ?? 0) / charsPerLine), 0);
}

/**
 * Splits a menu's groups into two columns whose heights are as close as possible (owner,
 * 2026-11-06: no gaps in the dropdown). Groups keep their menu order within each column; on a tie
 * the first group stays in the left column.
 */
export function balanceColumns(groups: readonly NavGroup[]): [NavGroup[], NavGroup[]] {
  const heights = groups.map(group => groupLines(group));
  let best = 0, bestDiff = Infinity;
  for (let mask = 0; mask < 1 << groups.length; mask++) {
    if (mask & 1) continue; // group 0 always left
    const right = heights.reduce((sum, h, i) => sum + (mask >> i & 1 ? h : 0), 0);
    const left = heights.reduce((sum, h) => sum + h, 0) - right;
    const diff = Math.abs(left - right);
    if (diff < bestDiff - 1e-9) { best = mask; bestDiff = diff; }
  }
  return [groups.filter((_, i) => !(best >> i & 1)), groups.filter((_, i) => best >> i & 1)];
}
