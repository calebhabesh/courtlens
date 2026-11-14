// The site search's page index: every canonical page, built from the navigation model so a page
// added to a menu is searchable without a second list to keep in step. Pages reached only from
// another page (route tabs, the ⋯ menu, links inside pages) are added here. Searching runs in the
// browser: the index is small and pages need no season scope.

import type { IconName } from "@/components/ui/icon";
import { askAvailable } from "./hosted";
import { DIRECT_LINKS, NAV_MENUS, moreLinks, type NavItem } from "./nav-model";

export interface SitePage {
  label: string;
  href: string;
  /** The menu (and menu group) the page belongs to, as the search groups it. */
  section: string;
  description: string;
  icon: IconName;
  /** Other words people search for this page with. */
  keywords: readonly string[];
}

/** Descriptions and icons for top-level links, which the menus show without them. */
const DIRECT_DETAILS: Record<string, { description: string; icon: IconName }> = {
  "/stats": { description: "Player and team stats, leaderboards and percentiles for any season", icon: "table" },
  "/wowy": { description: "How players and lineups do with and without each other", icon: "users" },
  "/stat-line-shift": { description: "How a player's stat line shifts with and without a teammate", icon: "swap" },
};

/** Pages outside the menus, appended to the named section. */
const EXTRA_PAGES: SitePage[] = [
  { label: "Tracking Stats", href: "/stats/tracking", section: "Stats", icon: "crosshair", keywords: [],
    description: "NBA tracking totals: drives, touches, passes, speed and distance" },
  { label: "Stats Glossary", href: "/stats/glossary", section: "Stats", icon: "book", keywords: [],
    description: "Definitions for every stat on the site, with the exact calculation" },
  { label: "RAPM Ratings", href: "/research/rapm", section: "Research · Impact", icon: "table", keywords: [],
    description: "One-, two- and three-year RAPM tables and the sealed experiment" },
  { label: "Evaluation Archive", href: "/evaluation", section: "Research · Methods", icon: "database", keywords: [],
    description: "Out-of-time benchmark cards for the points forecasts" },
  ...(askAvailable ? [{ label: "Ask CourtLens", href: "/research/ask", section: "More", icon: "message" as const, keywords: [],
    description: "Ask a question about the data in plain English" }] : []),
  { label: "Case Studies", href: "/research/case-studies", section: "More", icon: "page", keywords: [],
    description: "Reproducible case studies built on CourtLens data" },
  { label: "Saved Investigations", href: "/investigations", section: "More", icon: "save", keywords: [],
    description: "Saved queries and their evidence, ready to rerun" },
];

const MORE_DETAILS: Record<string, { description: string; icon: IconName }> = {
  "/settings": { description: "Display preferences, portraits and account", icon: "settings" },
  "/data-status": { description: "Where each data source stands and when it last updated", icon: "database" },
  "/methodology": { description: "Metric definitions, principles and worked lessons", icon: "book" },
  "/planner": { description: "Plan a fantasy league lineup from player forecasts", icon: "calendar" },
};

/** Search words by page path: synonyms, abbreviations and what each page answers. */
const KEYWORDS: Record<string, readonly string[]> = {
  "/stats": ["box score", "leaderboard", "leaders", "player stats", "team stats", "per game", "per 100", "advanced stats", "percentiles", "darko", "epm", "lebron", "explorer", "table"],
  "/stats/tracking": ["tracking", "hustle", "drives", "touches", "catch and shoot", "pull up", "speed", "distance", "rebounding chances"],
  "/stats/glossary": ["glossary", "definitions", "abbreviations", "formulas", "what does"],
  "/wowy": ["with or without you", "on off", "on/off", "lineups", "teammates", "stints", "pairs"],
  "/stat-line-shift": ["teammate", "stat shift", "without teammate", "with without", "usage", "injury impact"],
  "/live": ["scores", "scoreboard", "box score", "play by play", "games", "tonight", "today", "schedule", "results", "finals"],
  "/playoffs": ["bracket", "series", "postseason", "finals", "play in"],
  "/last-games": ["recent games", "game log", "form", "last 10", "last 5", "streak", "hot", "cold", "trend"],
  "/showcase": ["season leaders", "player cards", "cards", "slideshow", "leaders", "awards"],
  "/similar-players": ["similar players", "comps", "comparables", "twins", "shot profile", "lookalike", "player similarity"],
  "/players": ["dashboard", "darko", "panels", "player profile"],
  "/teams": ["team stats", "team ratings", "net rating", "offensive rating", "defensive rating", "four factors", "six factors", "team rankings"],
  "/standings": ["conference", "division", "record", "wins", "losses", "seeding", "table"],
  "/roster-shapes": ["roster", "depth chart", "rotation", "positions", "allocation", "minutes"],
  "/contracts": ["salary", "salaries", "cap", "salary cap", "payroll", "luxury tax", "apron", "money", "finance"],
  "/free-agency": ["free agents", "signings", "fa", "tracker", "offseason"],
  "/compare": ["versus", "vs", "head to head", "side by side", "radar", "player vs player", "pvp"],
  "/team-compare": ["team vs team", "versus", "vs", "rotations", "team head to head"],
  "/matchups": ["guarded", "who guarded whom", "defender", "matchup", "assignments", "head to head"],
  "/research/win-probability": ["win prob", "odds", "predictions", "picks", "chances", "model", "live probability", "market"],
  "/research/projected-impact": ["projections", "preseason", "player ratings", "forecast", "intervals", "projected"],
  "/research/lineup-model": ["lineups", "neural network", "five man", "player map", "machine learning"],
  "/research/rapm/six-factor": ["rapm", "plus minus", "impact", "adjusted plus minus", "ridge", "six factor"],
  "/research/rapm": ["rapm", "plus minus", "ratings", "multi year", "adjusted plus minus"],
  "/research/backtest": ["backtest", "epm", "darko", "lebron", "bpm", "predictive", "best metric", "impact metrics"],
  "/research/shot-quality": ["xpts", "expected points", "shot making", "shot model", "expected shots", "shooting"],
  "/research/zts": ["true shooting", "ts%", "ts", "efficiency", "play type", "shooting", "defense"],
  "/research/shooting/aftermath": ["offensive rebound", "putbacks", "second chance", "misses", "transition", "after the shot"],
  "/research/defensive-matchups": ["defense", "contests", "opponent fg", "rim protection", "defender", "dsq"],
  "/research/signal-noise": ["sample size", "stabilization", "reliability", "regression to the mean", "shrinkage", "luck", "noise"],
  "/forecasts": ["points", "projections", "player props", "ledger", "predictions", "next game"],
  "/evaluation": ["archive", "calibration", "benchmark", "backtest", "experiments"],
  "/methodology/learning": ["tutorials", "lessons", "guides", "learn", "basics", "how to", "explainers"],
  "/wingspan": ["combine", "measurements", "height", "wingspan", "standing reach", "draft combine", "athletic testing", "vertical"],
  "/draft": ["draft", "picks", "rookies", "redraft", "lottery", "prospects", "draft classes"],
  "/calculator": ["ortg", "offensive rating", "four factors", "calculator", "efficiency"],
  "/whats-new": ["changelog", "release notes", "updates", "whats new", "what's new", "commits", "versions"],
  "/methodology": ["definitions", "how it works", "methods", "principles", "formulas", "about"],
  "/research/case-studies": ["examples", "studies", "evidence"],
  "/investigations": ["saved", "saved queries", "bookmarks", "evidence", "rerun"],
  "/research/ask": ["ai", "assistant", "chat", "chatbot", "question", "llm", "natural language"],
  "/settings": ["preferences", "account", "theme", "portraits", "options", "configuration"],
  "/data-status": ["data freshness", "pipeline", "sources", "status", "last updated", "health"],
  "/planner": ["fantasy", "league", "lineup planner", "schedule"],
};

function fromNav(item: NavItem, section: string, details?: { description: string; icon: IconName }): SitePage {
  return {
    label: item.label,
    href: item.href,
    section,
    description: item.description ?? details?.description ?? "",
    icon: item.icon ?? details?.icon ?? "page",
    keywords: KEYWORDS[item.href] ?? [],
  };
}

/** Every canonical page in menu order, grouped by section. */
export function buildSitePages(hosted?: boolean): SitePage[] {
  const pages: SitePage[] = [
    // The top-level links are the Stats family (Stats, then WOWY and Stat Line Shift beside it).
    ...DIRECT_LINKS.map(({ item }) => fromNav(item, "Stats", DIRECT_DETAILS[item.href])),
    ...NAV_MENUS.flatMap(menu => menu.groups.flatMap(group =>
      group.items.map(item => fromNav(item, group.title ? `${menu.label} · ${group.title}` : menu.label)))),
    ...moreLinks(hosted).map(item => fromNav(item, "More", MORE_DETAILS[item.href])),
  ];
  for (const extra of EXTRA_PAGES) {
    const page = { ...extra, keywords: KEYWORDS[extra.href] ?? extra.keywords };
    const lastInSection = pages.findLastIndex(entry => entry.section === extra.section);
    pages.splice(lastInSection < 0 ? pages.length : lastInSection + 1, 0, page);
  }
  // One entry per path: a menu shortcut to a tab (Learning) is the page people search for.
  const seen = new Set<string>();
  return pages.filter(page => !seen.has(page.href) && seen.add(page.href));
}

export const SITE_PAGES: readonly SitePage[] = buildSitePages();

export function normalizeSearchText(text: string): string {
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9%]+/g, " ").trim();
}

function words(text: string): string[] {
  const normalized = normalizeSearchText(text);
  return normalized ? normalized.split(" ") : [];
}

/** True when the two words differ by at most one edit (insert, delete, substitute or swap). */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (i === a.length || i === b.length) return true;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1)
    || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

interface IndexedPage { page: SitePage; order: number; label: string; labelWords: string[]; keywords: string[]; keywordWords: string[]; sectionWords: string[]; descriptionWords: string[] }

function indexPages(pages: readonly SitePage[]): IndexedPage[] {
  return pages.map((page, order) => ({
    page,
    order,
    label: normalizeSearchText(page.label),
    labelWords: words(page.label),
    keywords: page.keywords.map(normalizeSearchText),
    keywordWords: page.keywords.flatMap(words),
    sectionWords: words(page.section),
    descriptionWords: words(page.description),
  }));
}

/** The best (lowest) tier at which one query word matches the page, or null. */
function wordTier(entry: IndexedPage, token: string): number | null {
  if (entry.labelWords.some(word => word.startsWith(token))) return 1;
  if (entry.keywordWords.some(word => word.startsWith(token))) return 2;
  if (token.length >= 3 && entry.label.includes(token)) return 3;
  if (entry.sectionWords.some(word => word.startsWith(token))) return 4;
  if (token.length >= 3 && entry.descriptionWords.some(word => word.startsWith(token))) return 5;
  // Typos rarely hit the first letter, and allowing it there turns "james" into "games".
  if (token.length >= 5 && [...entry.labelWords, ...entry.keywordWords].some(word => word[0] === token[0] && withinOneEdit(token, word))) return 6;
  return null;
}

/**
 * Pages matching every word of the query, best first: the whole query as the page's name, then as
 * the start of its name or one of its search words, then word by word (name, search words,
 * section, description, one typo). Ties keep menu order.
 */
export function searchSitePages(query: string, pages: readonly SitePage[] = SITE_PAGES): SitePage[] {
  const normalized = normalizeSearchText(query);
  if (!normalized) return [...pages];
  const tokens = normalized.split(" ");
  const scored: { page: SitePage; score: number; order: number }[] = [];
  for (const entry of indexPages(pages)) {
    let wordScore = 0;
    let matched = true;
    for (const token of tokens) {
      const tier = wordTier(entry, token);
      if (tier === null) { matched = false; break; }
      wordScore = Math.max(wordScore, tier);
    }
    if (!matched) continue;
    const whole = entry.label === normalized || entry.keywords.includes(normalized) ? 0
      : entry.label.startsWith(normalized) ? 0.5
      : entry.keywords.some(keyword => keyword.startsWith(normalized)) ? 1
      : wordScore;
    scored.push({ page: entry.page, score: whole, order: entry.order });
  }
  return scored.sort((a, b) => a.score - b.score || a.order - b.order).map(entry => entry.page);
}

/**
 * True when the query is the start of the page's name or of a word in it ("draft", "shot qu"), so
 * the page is what was typed. A search word alone ("lebron", a metric and a player) is not.
 */
export function isStrongPageMatch(query: string, page: SitePage): boolean {
  const normalized = normalizeSearchText(query);
  if (!normalized) return false;
  return normalizeSearchText(page.label).startsWith(normalized) || words(page.label).some(word => word.startsWith(normalized));
}

/** The page whose path (query string ignored) is `href`, for refreshing stored recents. */
export function sitePageFor(href: string, pages: readonly SitePage[] = SITE_PAGES): SitePage | undefined {
  const path = href.split("?")[0];
  return pages.find(page => page.href.split("?")[0] === path);
}

/** Groups pages by section, keeping their order. */
export function groupBySection(pages: readonly SitePage[]): { section: string; pages: SitePage[] }[] {
  const groups: { section: string; pages: SitePage[] }[] = [];
  for (const page of pages) {
    const group = groups.find(entry => entry.section === page.section);
    if (group) group.pages.push(page);
    else groups.push({ section: page.section, pages: [page] });
  }
  return groups;
}
