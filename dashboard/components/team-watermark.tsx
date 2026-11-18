"use client";

import { useRef, type CSSProperties } from "react";
import { useWarmImage } from "@/lib/use-warm-image";
import centring from "@/lib/team-logo-centring.json";

const SHIFTS: Record<string, number> = centring;

/**
 * The team's logo large behind a headshot (the reference site's cards, the player page). Logos whose
 * artwork leans to one side are moved so their visual weight sits behind the head
 * (`scripts/measure-logo-centres.mjs`).
 */
export function TeamWatermark({ asset, className = "pvp-watermark" }: { asset: string; className?: string }) {
  const shift = SHIFTS[asset.split("/").pop() ?? ""];
  const imageRef = useRef<HTMLImageElement>(null);
  useWarmImage(imageRef);
  // Page CSS sets the box (absolute, sized from its card, `object-fit: contain`); the square
  // width and height only reserve that box's ratio before the file arrives. Lazy in the HTML (SP06),
  // started once the page is idle (lib/use-warm-image.ts).
  // eslint-disable-next-line @next/next/no-img-element -- static logo artwork, decorative
  return <img ref={imageRef} className={className} src={asset} alt="" aria-hidden="true" width={160} height={160} loading="lazy"
    style={shift ? ({ "--logo-shift": shift } as CSSProperties) : undefined} />;
}
