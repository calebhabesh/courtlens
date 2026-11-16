import type { PositionEstimateCoverage } from "./types";

// Plain helpers (no "use client"): the server-rendered Stats page computes the chip status.
export type PositionChipStatus = "sealed" | "provisional" | "none";

/** Whether the shown seasons have estimated positions; unknown (older API) reads as sealed. */
export function positionChipStatus(coverage: PositionEstimateCoverage | null | undefined, seasons: string[]): PositionChipStatus {
  if (!coverage) return "sealed";
  const sealed = seasons.filter(season => coverage.sealed_seasons.includes(season));
  const provisional = seasons.filter(season => coverage.provisional_seasons.includes(season));
  if (provisional.length) return "provisional";
  return sealed.length ? "sealed" : "none";
}

/** Hover text for an estimated position: what it is, the NBA listing beside it, and provisional state. */
export function positionTitle(position: string, listed: string | null | undefined, provisional?: boolean | null): string {
  return [`Estimated ${position}`, listed ? `NBA lists ${listed}` : null, provisional ? "provisional while the season is in progress" : null]
    .filter(Boolean).join(" · ");
}
