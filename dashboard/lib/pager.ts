/** A page number, or a gap standing for the pages a pager leaves out. */
export type PagerItem = number | "gap";

/**
 * The page numbers a pager shows: every page up to 7, otherwise the first, the last and the
 * current page with one neighbour each side, with gaps for the rest (`1 … 4 5 6 … 12`). Near
 * either end the run widens to five so the row keeps one width (`1 2 3 4 5 … 12`).
 */
export function pagerItems(page: number, pageCount: number): PagerItem[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const current = Math.min(Math.max(1, page), pageCount);
  let start = current - 1;
  let end = current + 1;
  if (current <= 4) { start = 2; end = 5; }
  else if (current >= pageCount - 3) { start = pageCount - 4; end = pageCount - 1; }
  const items: PagerItem[] = [1];
  if (start > 2) items.push("gap");
  for (let number = start; number <= end; number += 1) items.push(number);
  if (end < pageCount - 1) items.push("gap");
  items.push(pageCount);
  return items;
}
