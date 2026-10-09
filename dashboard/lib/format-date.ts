// One display format for calendar dates (frontend overhaul D11/D20). Inputs are ISO calendar
// dates (YYYY-MM-DD); they are parsed as UTC calendar days so no local time zone can shift them.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type DateStyle = "long" | "compact";

export function parseIsoDate(value: string | null | undefined): Date | null {
  const match = value ? ISO_DATE.exec(value.slice(0, 10)) : null;
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value!.slice(0, 10) ? date : null;
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** "Apr 12, 2026" (long) or "Apr 12" (compact, for date strips). Unparseable input is returned as-is. */
export function formatDate(value: string | null | undefined, style: DateStyle = "long"): string {
  const date = parseIsoDate(value);
  if (!date) return value ?? "";
  const monthDay = `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
  return style === "compact" ? monthDay : `${monthDay}, ${date.getUTCFullYear()}`;
}

export function addDays(value: string, days: number): string {
  const date = parseIsoDate(value);
  if (!date) return value;
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

/**
 * The URL keeps the exclusive cutoff (`beforeDate`: games dated strictly before it). The interface
 * shows the last included day. Both describe `game_date < beforeDate`.
 */
export function throughDateFromBefore(beforeDate: string): string {
  return addDays(beforeDate, -1);
}

export function beforeDateFromThrough(throughDate: string): string {
  return addDays(throughDate, 1);
}

/** "Through Apr 12, 2026" for an exclusive cutoff of 2026-04-13. */
export function throughLabel(beforeDate: string | null | undefined): string {
  return beforeDate && parseIsoDate(beforeDate) ? `Through ${formatDate(throughDateFromBefore(beforeDate))}` : "";
}
