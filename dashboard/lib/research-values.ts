/**
 * Shared value rules for Research pages (design phase, row 18 pattern).
 *
 * Colour rule (owner): green and red mark only a good or bad signal whose interval excludes zero
 * (or that meets a registered threshold). Anything else, including a value with no interval, stays
 * neutral. Values are in the favorable sign: positive always helps.
 */
export type SignalTone = "good" | "bad";

export const signed = (value: number | null | undefined, digits = 2): string =>
  value == null || !Number.isFinite(value) ? "—" : `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}`;

/** Green when the whole interval sits above zero, red when it sits below; otherwise no tone. */
export function intervalTone(low: number | null | undefined, high: number | null | undefined): SignalTone | undefined {
  if (low == null || high == null || !Number.isFinite(low) || !Number.isFinite(high)) return undefined;
  if (low > 0) return "good";
  if (high < 0) return "bad";
  return undefined;
}

export const intervalLabel = (low: number | null | undefined, high: number | null | undefined, digits = 2): string =>
  low == null || high == null ? "Interval unknown" : `${signed(low, digits)} to ${signed(high, digits)}`;

/** Plain-language reason for a tone, for titles and the table legend. */
export const toneReason = (tone: SignalTone | undefined): string =>
  tone === "good" ? "80% interval above zero" : tone === "bad" ? "80% interval below zero" : "80% interval includes zero or is unknown";

/** RFC 4180 CSV: quotes fields that need it; unknown values are empty, never zero. */
export function toCsv(header: readonly string[], rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  const field = (value: string | number | null | undefined) => {
    if (value == null) return "";
    const text = String(value);
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [header, ...rows].map(row => row.map(field).join(",")).join("\r\n") + "\r\n";
}

/** Hands a CSV to the browser as a download. */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
