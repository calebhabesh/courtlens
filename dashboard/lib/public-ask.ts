/** Public Ask on the hosted demo: the visitor's questions left today and the shared limit. */

export interface AskLimits {
  enabled: boolean;
  per_visitor?: number;
  remaining?: number;
  site_open?: boolean;
  resets_at?: string;
}

export interface AskLimitRefusal extends AskLimits {
  code: "visitor_limit" | "site_limit";
  message: string;
}

export async function askLimits(signal?: AbortSignal): Promise<AskLimits> {
  const response = await fetch("/api/assistant-v2/limits", { cache: "no-store", signal });
  if (!response.ok) return { enabled: false };
  return (await response.json()) as AskLimits;
}

/** "3 am" in the reader's own time zone; the limits reset at midnight Pacific. */
export function resetTime(iso: string | undefined, locale?: string, timeZone?: string): string {
  if (!iso) return "tomorrow";
  return new Date(iso).toLocaleTimeString(locale ?? "en-US", { hour: "numeric", minute: "2-digit", timeZone, timeZoneName: "short" });
}

export function limitLine(limits: AskLimits, timeZone?: string): string | null {
  if (!limits.enabled || limits.remaining == null || limits.per_visitor == null) return null;
  if (limits.site_open === false) return `Today's shared demo limit is used up. Ask opens again at ${resetTime(limits.resets_at, undefined, timeZone)}.`;
  if (limits.remaining === 0) return `You've used today's ${limits.per_visitor} questions. More at ${resetTime(limits.resets_at, undefined, timeZone)}.`;
  return `${limits.remaining} of ${limits.per_visitor} questions left today on this demo.`;
}

export function isLimitRefusal(detail: unknown): detail is AskLimitRefusal {
  const code = (detail as { code?: unknown } | null)?.code;
  return code === "visitor_limit" || code === "site_limit";
}

export function refusalMessage(detail: AskLimitRefusal, timeZone?: string): string {
  const when = resetTime(detail.resets_at, undefined, timeZone);
  return detail.code === "site_limit"
    ? `Today's shared question limit for the CourtLens demo is used up. Ask opens again at ${when}.`
    : `You've used today's ${detail.per_visitor ?? ""} questions on the CourtLens demo. You can ask more at ${when}.`.replace("  ", " ");
}
