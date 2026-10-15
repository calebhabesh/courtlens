import { browserApi } from "./workbench-api";

/** Square face-framed widths the API renders (`?size=`); mirrors `PORTRAIT_SIZES` in the API. */
export const PORTRAIT_WIDTHS = [64, 96, 128, 192, 288] as const;
export type PortraitWidth = (typeof PORTRAIT_WIDTHS)[number];

const PLAYER_PORTRAIT_PATH = /^\/api\/workbench\/players\/[^/]+\/portrait$/;

function absolute(path: string): string {
  return path.startsWith("/") ? `${browserApi.replace(/\/$/, "")}${path}` : path;
}

export interface PortraitSource {
  src: string;
  /** Width-descriptor candidates, present only for the API's player portrait endpoint. */
  srcSet?: string;
}

/**
 * Where to load a player's headshot. The API's player endpoint serves display-sized derivatives,
 * so the browser picks one near the rendered size instead of shrinking the 1040x760 original.
 * Any other URL (a content-hash media link) is used as given.
 */
/** Ask for the player's headshot from one season (and team); the API falls back to current. */
export interface PortraitEra { season: string; team?: string | null }

export function portraitSource(portraitUrl: string | null | undefined, playerId: string | undefined, fallbackWidth: PortraitWidth, era?: PortraitEra | null): PortraitSource | null {
  const path = portraitUrl || (playerId ? `/api/workbench/players/${playerId}/portrait` : null);
  if (!path) return null;
  if (!PLAYER_PORTRAIT_PATH.test(path)) return { src: absolute(path) };
  const extra = era?.season ? `&season=${encodeURIComponent(era.season)}${era.team ? `&team=${encodeURIComponent(era.team)}` : ""}` : "";
  return {
    src: absolute(`${path}?size=${fallbackWidth}${extra}`),
    srcSet: PORTRAIT_WIDTHS.map((width) => `${absolute(`${path}?size=${width}${extra}`)} ${width}w`).join(", ")
  };
}
