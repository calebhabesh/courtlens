import notes from "../content/patch-notes.json";
import { REPO_URL } from "./research-facts";

/**
 * Patch Notes (Research R11, catalog row 21; RD07 design): real releases and dates from git history and
 * the progress logs. `content/patch-notes.json` holds them; `scripts/check-patch-notes.mjs` checks every
 * commit, date, log heading and the version order against the repository. Version numbers were assigned
 * on 2026-11-08 in merge order (owner, RD07).
 */

export type PatchBadge = "New" | "Updated" | "Removed";

export interface PatchEntry {
  title: string;
  badge: PatchBadge;
  href?: string;
  date: string;
  commit: string;
  text: string;
  bullets?: string[];
  log?: { file: string; heading: string };
}

export interface PatchRelease {
  id: string;
  /** "v1.6": assigned in merge order (RD07). */
  number: string;
  title: string;
  version: string;
  merge: { commit: string; date: string } | null;
  range: { from: string; to: string };
  summary: string;
  groups: { title: string; entries: PatchEntry[] }[];
}

export const PATCH_ABOUT: string = notes.about;
export const PATCH_RELEASES = notes.releases as PatchRelease[];

export const commitUrl = (hash: string): string => `${REPO_URL}/commit/${hash}`;
export const logUrl = (file: string): string => `${REPO_URL}/blob/main/${file}`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Nov 3, 2026" from an ISO date, without time-zone shifts. */
export function shortDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

/** "Oct 14 – Nov 3, 2026", or one date when the range is a single day. */
export function dateRange({ from, to }: { from: string; to: string }): string {
  if (from === to) return shortDate(from);
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${sameYear ? shortDate(from).replace(/, \d{4}$/, "") : shortDate(from)} – ${shortDate(to)}`;
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Databallr's release month: "November 2026"; a range uses short names so it fits the 160 px column: "Oct–Nov 2026", "Dec 2026–Jan 2027". */
export function monthRange({ from, to }: { from: string; to: string }): string {
  const [fromYear, fromMonth] = from.split("-").map(Number);
  const [toYear, toMonth] = to.split("-").map(Number);
  if (fromYear === toYear && fromMonth === toMonth) return `${MONTH_NAMES[toMonth - 1]} ${toYear}`;
  if (fromYear === toYear) return `${MONTHS[fromMonth - 1]}–${MONTHS[toMonth - 1]} ${toYear}`;
  return `${MONTHS[fromMonth - 1]} ${fromYear}–${MONTHS[toMonth - 1]} ${toYear}`;
}

/** A release still on its branch (not merged to main), shown with an "Unmerged" pill. */
export const isUnmerged = (release: PatchRelease): boolean => release.merge === null && release.version !== "main";

/** Every entry, newest release first, in listed order. */
export const patchEntries = (releases: readonly PatchRelease[] = PATCH_RELEASES): PatchEntry[] =>
  releases.flatMap(release => release.groups.flatMap(group => group.entries));

/** The release line under a heading: version and when it reached main (or that it hasn't). */
export function releaseLine(release: PatchRelease): string {
  if (release.merge) return `${release.version} · merged ${shortDate(release.merge.date)}`;
  return `${release.version} · ${dateRange(release.range)}`;
}

/** The newest entry (latest date; the first listed wins a tie), for the Stats "What's New" line. */
export function latestPatchEntry(releases: readonly PatchRelease[] = PATCH_RELEASES): PatchEntry | null {
  let latest: PatchEntry | null = null;
  for (const release of releases) for (const group of release.groups) for (const entry of group.entries) {
    if (!latest || entry.date > latest.date) latest = entry;
  }
  return latest;
}

/**
 * Entry copy as displayed: commits quoted in the source text ("(abc1234)", "(abc1234, 2026-10-16)")
 * stay in the JSON for the git check but are not shown (glance test: no hashes in the main flow);
 * a quoted date reads "(Oct 16, 2026)".
 */
export function displayText(text: string): string {
  return text
    .replace(/ \(([0-9a-f]{7}), (\d{4}-\d{2}-\d{2})\)/g, (_match, _hash: string, date: string) => ` (${shortDate(date)})`)
    .replace(/ \([0-9a-f]{7}\)/g, "");
}
