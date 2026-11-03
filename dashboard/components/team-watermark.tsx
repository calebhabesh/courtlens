import type { CSSProperties } from "react";
import centring from "@/lib/team-logo-centring.json";

const SHIFTS: Record<string, number> = centring;

/**
 * The team's logo large behind a headshot (Databallr's cards, the player page). Logos whose
 * artwork leans to one side are moved so their visual weight sits behind the head
 * (`scripts/measure-logo-centres.mjs`).
 */
export function TeamWatermark({ asset, className = "pvp-watermark" }: { asset: string; className?: string }) {
  const shift = SHIFTS[asset.split("/").pop() ?? ""];
  // eslint-disable-next-line @next/next/no-img-element -- static logo artwork, decorative
  return <img className={className} src={asset} alt="" aria-hidden="true"
    style={shift ? ({ "--logo-shift": shift } as CSSProperties) : undefined} />;
}
