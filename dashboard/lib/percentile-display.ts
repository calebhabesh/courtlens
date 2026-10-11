// Presentation of the API's cohort midrank percentiles (formula: replica-analytics-contract; the
// server computes them). Nothing here changes a percentile; it only orients it by good direction.

export type GoodDirection = "high" | "low" | null | undefined;

/** Higher is better after orientation: a "low is good" metric shows 100 − p. Unoriented metrics keep p. */
export function orientedPercentile(percentile: number | null | undefined, direction: GoodDirection): number | null {
  if (percentile === null || percentile === undefined) return null;
  return direction === "low" ? 100 - percentile : percentile;
}

/** Stats' highlight rule: a favorable percentile exists only for metrics with a declared direction. */
export function favorablePercentile(percentile: number | null | undefined, direction: GoodDirection): number | null {
  if (percentile === null || percentile === undefined) return null;
  return direction === "low" ? 100 - percentile : direction === "high" ? percentile : null;
}

/** Sort direction that puts the best value first, used to read ranks from the server's ordering. */
export function bestFirst(direction: GoodDirection): "asc" | "desc" {
  return direction === "low" ? "asc" : "desc";
}

/**
 * Rank from a server-sorted page that starts at the best value: 1 + the number of strictly better
 * known values, so ties share a rank. Null when the player is not on the page or has no value.
 */
export function rankInSortedPage(
  page: ReadonlyArray<{ playerId: string; value: number | null | undefined }>,
  playerId: string,
  direction: GoodDirection
): number | null {
  const entry = page.find((row) => row.playerId === playerId);
  if (!entry || entry.value === null || entry.value === undefined) return null;
  const value = entry.value;
  const better = page.filter((row) => row.value !== null && row.value !== undefined &&
    (direction === "low" ? row.value < value : row.value > value)).length;
  return better + 1;
}
