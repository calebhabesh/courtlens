"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useReleaseCatalog } from "@/lib/use-release-catalog";
import type { DataDetailRow } from "./ui/data-details";
import { useToast } from "./ui/toast";
import { Skeleton } from "./ui/skeleton";
import { LookupInput } from "./lookup-input";

/**
 * Scope and page state for the Trends and Distributions investigations. Everything lives in the
 * URL (D6): season, phase and cutoff come from the shared filter bar, page state from `set`.
 */
export function useInvestigationScope() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selectedReleaseId = params.get("releaseId") ?? params.get("release_id");
  const catalog = useReleaseCatalog(selectedReleaseId);
  const releaseId = selectedReleaseId ?? catalog?.release_id ?? null;
  const season = params.get("season") || catalog?.default_season || "";
  const phase = params.get("phase") ?? catalog?.default_phase ?? "regular_season";
  const beforeDate = params.get("beforeDate") ?? params.get("before_date") ?? catalog?.stats_scopes?.find(scope => scope.season === season && scope.phase === phase)?.default_before_date ?? catalog?.default_before_date ?? null;
  const set = useCallback((updates: Record<string, string | number | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") next.delete(key); else next.set(key, String(value));
    }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [params, pathname, router]);
  return { params, catalog, releaseId, season, phase, beforeDate, set };
}

/** Evidence rows for Data details: the operation version and hash never sit in the main flow (D5). */
export function evidenceRows(result: { operation_version: string; evidence_hash: string } | null | undefined, label = "Evidence"): DataDetailRow[] {
  return result ? [{ label: `${label} operation`, value: result.operation_version, mono: true }, { label: `${label} SHA-256`, value: result.evidence_hash, mono: true }] : [];
}

/** "+1.4" / "-0.3" / "0"; unknown stays an em dash, never zero. */
export function signed(value: number | null | undefined, suffix = ""): string {
  if (value === null || value === undefined) return "—";
  return `${value > 0 ? "+" : ""}${value}${suffix}`;
}

export function deltaClass(value: number | null | undefined): string {
  return value == null || value === 0 ? "research-delta" : value > 0 ? "research-delta is-up" : "research-delta is-down";
}

export function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const blob = new Blob([[headers, ...rows].map(row => row.map(escape).join(",")).join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Header action that copies the current URL, which carries the whole investigation. */
export function useShareLink() {
  const { toast } = useToast();
  return async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast({ title: "Link Copied", description: "Investigation link copied to clipboard.", variant: "info" });
    } catch { /* clipboard unavailable; the URL is still in the address bar */ }
  };
}

/** In-page loading state shaped like a Research body: a findings row, then the main table. */
export function ResearchBodySkeleton({ tiles = 4 }: { tiles?: number }) {
  return <div className="ui-research" aria-busy="true" aria-label="Loading">
    <div className="ui-findings">{Array.from({ length: tiles }, (_, index) => <Skeleton key={index} height={88} />)}</div>
    <Skeleton height={360} />
  </div>;
}

/**
 * One 40px player lookup for the filter bar (FO09 pattern): always reachable, even when the
 * current player has no result; the placeholder names the selected player.
 */
export function PlayerLookup({ label = "Player", prefix = label, name, onSelect, releaseId, season, phase, beforeDate }: { label?: string; prefix?: string; name?: string | null; onSelect: (playerId: string) => void; releaseId?: string | null; season?: string | null; phase?: string | null; beforeDate?: string | null }) {
  const [text, setText] = useState("");
  return <div className="research-player-lookup">
    <LookupInput label={label} value={text} onChange={setText} kinds={["player"]} portalDropdown releaseId={releaseId} season={season} phase={phase} beforeDate={beforeDate}
      placeholder={name ? `${prefix}: ${name}` : "Choose a player…"} onSelect={item => { setText(""); if (item.kind === "player") onSelect(item.canonical_id); }} />
  </div>;
}
