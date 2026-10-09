// Team accent colors for identity treatments (frontend overhaul D10). These are each franchise's
// most recognizable brand color, keyed by the tricodes in team-branding.json. Decorative only:
// like the logos, they describe current franchise branding, not era-specific identity.
import catalog from "./team-branding.json";

const BRAND: Record<string, string> = {
  ATL: "#E03A3E", BOS: "#007A33", BKN: "#000000", CHA: "#00788C", CHI: "#CE1141", CLE: "#860038",
  DAL: "#00538C", DEN: "#FEC524", DET: "#C8102E", GSW: "#1D428A", HOU: "#CE1141", IND: "#002D62",
  LAC: "#C8102E", LAL: "#552583", MEM: "#5D76A9", MIA: "#98002E", MIL: "#00471B", MIN: "#236192",
  NOP: "#0C2340", NYK: "#F58426", OKC: "#007AC1", ORL: "#0077C0", PHI: "#006BB6", PHX: "#E56020",
  POR: "#E03A3E", SAC: "#5A2D81", SAS: "#C4CED4", TOR: "#CE1141", UTA: "#002B5C", WAS: "#E31837"
};

// --color-bg in tokens.css. Accents are lightened toward white until they reach 3:1 against it,
// the WCAG minimum for non-text graphics, so dark navies and wines stay visible.
const BACKGROUND = "#0C0D10";
const MIN_CONTRAST = 3;

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(channels(a)), luminance(channels(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function toHex(rgb: number[]): string {
  return `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function displayAccent(hex: string): string {
  const base = channels(hex);
  for (let mix = 0; mix <= 1; mix += 0.05) {
    const candidate = toHex(base.map((channel) => channel + (255 - channel) * mix));
    if (contrastRatio(candidate, BACKGROUND) >= MIN_CONTRAST) return candidate;
  }
  return "#FFFFFF";
}

const accents = new Map(Object.entries(BRAND).map(([tricode, hex]) => [tricode, displayAccent(hex)]));

/** Display accent for a team ID or tricode, or null when the team is not in the current catalog. */
export function teamAccent(team: string | null | undefined): string | null {
  if (!team) return null;
  const record = catalog.teams.find((entry) => entry.team_id === team || entry.tricode === team);
  return record ? accents.get(record.tricode) ?? null : null;
}

export function teamBrandColor(team: string | null | undefined): string | null {
  if (!team) return null;
  const record = catalog.teams.find((entry) => entry.team_id === team || entry.tricode === team);
  return record ? BRAND[record.tricode] ?? null : null;
}

/** True when an exact catalog ID or code has logo artwork, so callers can skip the text fallback. */
export function hasTeamLogo(team: string): boolean {
  return catalog.teams.some((entry) => entry.team_id === team || entry.tricode === team);
}
