import { browserApi } from "./workbench-api";
import type { Category } from "@/components/charts";

/** Roster Shapes v2 (alignment row 12): rosters sized by DARKO DPM, shaped by an estimated ease of fit. */
export type ShapeContinuity = "returning" | "new" | "unknown";
export type ShapeSort = "fullest" | "fit" | "az";
export type ShapeMode = "regular" | "playoff";

export interface ShapeArchetype {
  season: string; minutes: number; games: number; small_sample: boolean;
  primary: number; primary_name: string; membership: { cluster: number; name: string; probability: number }[];
}
export interface ShapePlayer {
  player_id: string; player_name: string; listed_position: string | null;
  dpm: number | null; o_dpm: number | null; d_dpm: number | null; playoff_shift: number | null; playoff_games: number;
  minutes_per_game: number | null;
  /** Before the rotation cap at 240 a game; absent from older payloads. */
  minutes_uncapped?: number | null;
  games: number | null; size: number | null; size_playoff: number | null;
  archetype: ShapeArchetype | null; fit_ease: number | null; fit_band: number | null;
  continuity: ShapeContinuity; previous_teams: string[]; unknown_reasons: string[];
}
export interface ShapeTeam {
  team_id: string; team_tricode: string; team_name: string; conference: string;
  players: number; sized_players: number; below_replacement_players: number; unknown_players: number;
  size: number; size_playoff: number; fill: number; fill_playoff: number; fit_ease: number | null;
  roster: ShapePlayer[];
}
export interface ShapeCluster { cluster: number; name: string; short: string; description: string; color_token: string | null }
export interface RosterShapes {
  version: string; season: string; seasons: { season: string; label: string; projected: boolean }[]; projected: boolean;
  label: string; reference_season: string; replacement_level: number; exponent: number; box_net: number; capacity: number;
  fit_bands: number; playoff_prior_games: number;
  dpm: { season: string; phase: string; as_of: string; data_date: string; raw_sha256: string; source: string };
  minutes_source: "darko_expected" | "reference" | "season";
  archetypes: { artifact_sha256: string; names_status: string; clusters: ShapeCluster[] };
  roster_context: { dataset_id: string; observed_at: string; source_url: string; content_sha256: string } | null;
  statistics_release_id: string | null; credit: string; limitations: string[]; teams: ShapeTeam[];
}

export const SORTS: { value: ShapeSort; label: string; title: string }[] = [
  { value: "fullest", label: "Fullest", title: "Most of the box filled first" },
  { value: "fit", label: "Best Fit", title: "Highest size-weighted ease of fit first" },
  { value: "az", label: "A–Z", title: "Alphabetical by team" }
];
export const MODES: { value: ShapeMode; label: string; title: string }[] = [
  { value: "regular", label: "Regular Season", title: "Each player at his regular-season DPM" },
  { value: "playoff", label: "Playoff-Adjusted", title: "Each player moved by his career DARKO playoff offense change" }
];
export const CONTINUITY_LABELS: Record<ShapeContinuity, string> = { returning: "Returning", new: "New arrival", unknown: "No sample" };
/** Fit bands, 0 = plugs in anywhere ... 7 = hardest to fit. */
export const FIT_LABELS = ["Plugs in anywhere", "Fits almost anywhere", "Easy fit", "Fits most rosters", "Needs some fit", "Needs the right fit", "Hard to fit", "Hardest to fit"];

export async function getRosterShapes(params: { season?: string | null; datasetId?: string | null; releaseId?: string | null }, signal?: AbortSignal): Promise<RosterShapes> {
  const query = new URLSearchParams();
  if (params.season) query.set("season", params.season);
  if (params.datasetId) query.set("datasetId", params.datasetId);
  if (params.releaseId) query.set("releaseId", params.releaseId);
  const response = await fetch(`${browserApi}/api/workbench/roster-shapes${query.size ? `?${query}` : ""}`, { cache: "no-store", signal });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.detail === "string" ? body.detail : `Roster Shapes request failed (${response.status}).`);
  }
  return response.json();
}

export const parseSort = (value: string | null): ShapeSort => (value === "fit" || value === "az" ? value : "fullest");
export const parseMode = (value: string | null): ShapeMode => (value === "playoff" ? "playoff" : "regular");
export const teamFill = (team: ShapeTeam, mode: ShapeMode) => mode === "playoff" ? team.fill_playoff : team.fill;
export const playerSize = (player: ShapePlayer, mode: ShapeMode) => mode === "playoff" ? player.size_playoff : player.size;

/** Unknown fit sorts last; ties fall back to the team name so the order is stable. */
export function sortTeams(teams: ShapeTeam[], sort: ShapeSort, mode: ShapeMode = "regular"): ShapeTeam[] {
  const byName = (a: ShapeTeam, b: ShapeTeam) => a.team_name.localeCompare(b.team_name);
  if (sort === "az") return [...teams].sort(byName);
  if (sort === "fit") return [...teams].sort((a, b) => (b.fit_ease ?? -1) - (a.fit_ease ?? -1) || byName(a, b));
  return [...teams].sort((a, b) => teamFill(b, mode) - teamFill(a, mode) || byName(a, b));
}

/** Cluster index 0..5 maps to the six categorical tokens; anything else stays unknown. */
export function category(cluster: number | null | undefined): Category | null {
  return cluster !== null && cluster !== undefined && cluster >= 0 && cluster < 6 ? (cluster + 1) as Category : null;
}

const SUFFIXES = new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv", "v"]);
/** The surname a shape is labelled with: "Jones Jr." for suffixed names, never "Jr." alone. */
export function surname(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length > 2 && SUFFIXES.has(parts.at(-1)!.toLowerCase())) return parts.slice(-2).join(" ");
  return parts.at(-1) ?? name;
}

export const one = (value: number | null | undefined) => value === null || value === undefined ? "—" : value.toFixed(1);
/** Signs follow the displayed (rounded) value, so a tiny negative never reads "−0.0". */
export function signed(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined) return "—";
  const scale = 10 ** digits;
  const shown = Math.round(value * scale) / scale;
  return `${shown > 0 ? "+" : shown < 0 ? "−" : ""}${Math.abs(shown).toFixed(digits)}`;
}
export const percent = (value: number | null | undefined) => value === null || value === undefined ? "—" : `${Math.round(value * 100)}%`;

/* ---------- Beyond Databallr: sandbox, what's missing, season changes, fill vs results ---------- */

const TEAM_MINUTES = 240;
type SizeScale = Pick<RosterShapes, "replacement_level" | "exponent">;

/** The server's size formula, for rosters the sandbox redraws: (DPM − replacement)^exponent × minutes. */
export function sizeOf(dpm: number | null, minutes: number | null, scale: SizeScale): number | null {
  if (dpm === null || minutes === null) return null;
  return Math.max(0, dpm - scale.replacement_level) ** scale.exponent * Math.max(0, minutes);
}

export interface SandboxEntry { player: ShapePlayer; size: number | null; minutes: number | null; added: boolean }

/**
 * The server's rotation cap: in order of minutes, each player keeps his own until the team reaches
 * 240 a game, the next gets what is left and the rest none. Ties go by player id.
 */
export function rotationCap(minutes: Map<string, number>): Map<string, number> {
  let left = TEAM_MINUTES;
  const out = new Map<string, number>();
  for (const [id, value] of [...minutes].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    out.set(id, Math.min(value, left));
    left -= out.get(id)!;
  }
  return out;
}

/**
 * A what-if roster: the team without `drop`, plus `add` (players from any other roster in the
 * same response), each at his own uncapped minutes, then capped at 240 a game by rotation as
 * projected rosters are.
 */
export function sandboxRoster(team: ShapeTeam, teams: ShapeTeam[], add: string[], drop: string[], mode: ShapeMode, scale: SizeScale): SandboxEntry[] {
  const kept = team.roster.filter(p => !drop.includes(p.player_id)).map(player => ({ player, added: false }));
  const pool = new Map(teams.flatMap(t => t.team_tricode === team.team_tricode ? [] : t.roster.map(p => [p.player_id, p] as const)));
  const added = add.filter(id => !team.roster.some(p => p.player_id === id)).flatMap(id => pool.has(id) ? [{ player: pool.get(id)!, added: true }] : []);
  const roster = [...kept, ...added];
  const own = (player: ShapePlayer) => player.minutes_uncapped ?? player.minutes_per_game;
  const capped = rotationCap(new Map(roster.flatMap(({ player }) => { const m = own(player); return m === null ? [] : [[player.player_id, m] as const]; })));
  return roster.map(({ player, added }) => {
    const minutes = capped.get(player.player_id) ?? null;
    const dpm = player.dpm === null ? null : player.dpm + (mode === "playoff" ? player.playoff_shift ?? 0 : 0);
    return { player, minutes, added, size: sizeOf(dpm, minutes, scale) };
  });
}

/** Archetypes with under `threshold` of the box among a roster's drawn players, in cluster order. */
export function missingStyles(entries: { player: ShapePlayer; size: number | null }[], capacity: number, clusters: ShapeCluster[], threshold = 0.02): string[] {
  const share = new Map<number, number>();
  for (const { player, size } of entries) if (size && player.archetype) share.set(player.archetype.primary, (share.get(player.archetype.primary) ?? 0) + size / capacity);
  return clusters.filter(c => category(c.cluster) && (share.get(c.cluster) ?? 0) < threshold).map(c => c.name);
}

/** The white space as one player: the DPM that fills it at `minutes` a game (null when the box is full). */
export function whiteAsPlayer(fill: number, capacity: number, scale: SizeScale, minutes = 34): number | null {
  const white = (1 - fill) * capacity;
  return white <= 0 ? null : (white / minutes) ** (1 / scale.exponent) + scale.replacement_level;
}

/** Players on `next` but not `previous` (arrivals) and the reverse (departures). */
export function seasonChanges(previous: ShapeTeam | null, next: ShapeTeam) {
  const before = new Set(previous?.roster.map(p => p.player_id) ?? []), after = new Set(next.roster.map(p => p.player_id));
  return {
    arrivals: next.roster.filter(p => !before.has(p.player_id)),
    departures: previous?.roster.filter(p => !after.has(p.player_id)) ?? [],
  };
}

/** Share of the box per archetype (key −1 for unknown) for a roster's drawn players. */
export function styleShares(entries: { player: ShapePlayer; size: number | null }[], capacity: number): Map<number, number> {
  const shares = new Map<number, number>();
  for (const { player, size } of entries) if (size && size > 0) {
    const key = player.archetype?.primary ?? -1;
    shares.set(key, (shares.get(key) ?? 0) + size / capacity);
  }
  return shares;
}

/** Average archetype shares of the season's `count` fullest rosters: the tick on "What fills the box". */
export function fullestAverage(teams: ShapeTeam[], mode: ShapeMode, capacity: number, count = 5): Map<number, number> {
  const top = sortTeams(teams, "fullest", mode).slice(0, count);
  const sum = new Map<number, number>();
  for (const team of top) for (const [key, share] of styleShares(team.roster.map(player => ({ player, size: playerSize(player, mode) })), capacity)) sum.set(key, (sum.get(key) ?? 0) + share / top.length);
  return sum;
}

/** Points per 100 above replacement the drawn players add: Σ (DPM − replacement) × minutes ÷ 48. */
export function valueAbove(entries: { player: ShapePlayer; size: number | null; minutes?: number | null }[], mode: ShapeMode, scale: SizeScale): number {
  return entries.reduce((sum, { player, size, minutes }) => {
    if (!size || player.dpm === null) return sum;
    const dpm = player.dpm + (mode === "playoff" ? player.playoff_shift ?? 0 : 0);
    return sum + Math.max(0, dpm - scale.replacement_level) * ((minutes ?? player.minutes_per_game ?? 0) / 48);
  }, 0);
}

export interface ShapeHistory { version: string; box_net: number; seasons: { season: string; fills: Record<string, number> }[] }

export async function getRosterShapeHistory(params: { releaseId?: string | null }, signal?: AbortSignal): Promise<ShapeHistory> {
  const query = params.releaseId ? `?${new URLSearchParams({ releaseId: params.releaseId })}` : "";
  const response = await fetch(`${browserApi}/api/workbench/roster-shapes/history${query}`, { cache: "no-store", signal });
  if (!response.ok) throw new Error(`Roster Shapes history failed (${response.status}).`);
  return response.json();
}

/** Pearson r and the least-squares line y = a + b·x. */
export function fitLine(points: { x: number; y: number }[]): { r: number; a: number; b: number } | null {
  const n = points.length;
  if (n < 3) return null;
  const mx = points.reduce((s, p) => s + p.x, 0) / n, my = points.reduce((s, p) => s + p.y, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const p of points) { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2; }
  if (sxx === 0 || syy === 0) return null;
  const b = sxy / sxx;
  return { r: sxy / Math.sqrt(sxx * syy), a: my - b * mx, b };
}

/* ---------- Shapes: squarer plugs in anywhere, spikier is harder to fit ---------- */

export type ShapeKind = "squircle" | "circle" | "octagon" | "hexagon" | "pentagon" | "diamond" | "star4" | "burst" | "unknown";
/** One shape per fit band, easiest first; "unknown" (no fit inputs) is a plain square. */
export const FIT_SHAPES: ShapeKind[] = ["squircle", "circle", "octagon", "hexagon", "pentagon", "diamond", "star4", "burst"];

function polygon(points: number, rotation: number, inner?: number): [number, number][] {
  const count = inner === undefined ? points : points * 2;
  return Array.from({ length: count }, (_, i) => {
    const r = inner !== undefined && i % 2 ? inner : 1;
    const a = rotation + (i * 2 * Math.PI) / count;
    return [r * Math.cos(a), r * Math.sin(a)] as [number, number];
  });
}

function rawPoints(kind: ShapeKind): [number, number][] {
  switch (kind) {
    case "squircle": return Array.from({ length: 64 }, (_, i) => {
      const a = (i * 2 * Math.PI) / 64, c = Math.cos(a), s = Math.sin(a);
      return [Math.sign(c) * Math.abs(c) ** 0.5, Math.sign(s) * Math.abs(s) ** 0.5] as [number, number];
    });
    case "circle": return polygon(48, 0);
    case "octagon": return polygon(8, Math.PI / 8);
    case "hexagon": return polygon(6, Math.PI / 6);
    case "pentagon": return polygon(5, -Math.PI / 2);
    case "diamond": return polygon(4, -Math.PI / 2);
    case "star4": return polygon(4, -Math.PI / 2, 0.42);
    case "burst": return polygon(10, -Math.PI / 2, 0.72);
    case "unknown": return [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  }
}

export interface ShapeGeometry { points: [number, number][]; ratio: number }
const geometryCache = new Map<ShapeKind, ShapeGeometry>();
/** Points normalised to the [-1, 1] square (largest extent 2), and drawn area ÷ that square's area. */
export function shapeGeometry(kind: ShapeKind): ShapeGeometry {
  const cached = geometryCache.get(kind);
  if (cached) return cached;
  const raw = rawPoints(kind);
  const xs = raw.map(p => p[0]), ys = raw.map(p => p[1]);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const extent = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2;
  const points = raw.map(([x, y]) => [(x - cx) / extent, (y - cy) / extent] as [number, number]);
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i], [x2, y2] = points[(i + 1) % points.length];
    area += x1 * y2 - x2 * y1;
  }
  const geometry = { points, ratio: Math.abs(area) / 2 / 4 };
  geometryCache.set(kind, geometry);
  return geometry;
}

export const shapeKind = (band: number | null) => band === null ? "unknown" : FIT_SHAPES[Math.max(0, Math.min(FIT_SHAPES.length - 1, band))];

export interface PackItem { id: string; area: number; kind: ShapeKind }
export interface PackedShape extends PackItem { x: number; y: number; side: number }
/** Box units: the box is BOX × BOX, rasterised one cell per unit for collisions. */
export const BOX = 100;
/** Clear cells kept around every shape. */
const GAP = 1;

function inside(points: [number, number][], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i], [xj, yj] = points[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Cells (dx, dy) a shape of this side covers from an integer origin, grown by `grow`; conservative at edges. */
function cellMask(kind: ShapeKind, side: number, grow: number): [number, number][] {
  const { points } = shapeGeometry(kind);
  const cells = Math.ceil(side);
  const covered = new Set<number>();
  const stride = cells + 2 * grow + 2;
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
    const samples: [number, number][] = [[i + 0.5, j + 0.5], [i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]];
    if (!samples.some(([sx, sy]) => inside(points, (sx / side) * 2 - 1, (sy / side) * 2 - 1))) continue;
    for (let dy = -grow; dy <= grow; dy++) for (let dx = -grow; dx <= grow; dx++) covered.add((j + dy + grow) * stride + (i + dx + grow));
  }
  return [...covered].map(key => [(key % stride) - grow, Math.floor(key / stride) - grow] as [number, number]);
}

/** A shape's outline (marked once placed) and its outline grown by GAP (checked before placing). */
const masks = (kind: ShapeKind, side: number) => ({ core: cellMask(kind, side, 0), grown: cellMask(kind, side, GAP) });

class Grid {
  cells = new Uint8Array(BOX * BOX);
  fits(mask: [number, number][], x: number, y: number) {
    return mask.every(([dx, dy]) => { const cx = x + dx, cy = y + dy; return cx < 0 || cy < 0 || cx >= BOX || cy >= BOX || !this.cells[cy * BOX + cx]; });
  }
  mark(mask: [number, number][], x: number, y: number) {
    for (const [dx, dy] of mask) { const cx = x + dx, cy = y + dy; if (cx >= 0 && cy >= 0 && cx < BOX && cy < BOX) this.cells[cy * BOX + cx] = 1; }
  }
}

/**
 * Packs shapes into the box. Each shape's drawn area is its share of the box (its footprint square
 * has side √(area ÷ shape ratio)). Largest first, each goes to the top-most, then left-most spot
 * where its outline, kept GAP cells clear, touches no other outline, so spiky shapes can nest into
 * each other's corners. If one does not fit anywhere, every shape shrinks 3% and packing restarts
 * (`scale` reports it). The cluster is then spread across the box when that keeps every outline clear.
 * A sparse roster whose shapes fit in even rows is laid out in those rows instead, largest in the
 * middle, as Databallr draws its emptier boxes.
 */
export function packShapes(items: PackItem[]): { shapes: PackedShape[]; scale: number } {
  const sized = items.filter(item => item.area > 0)
    .map(item => ({ ...item, side: Math.sqrt(item.area / shapeGeometry(item.kind).ratio) }))
    .sort((a, b) => b.side - a.side || a.id.localeCompare(b.id));
  const grid = gridLayout(sized);
  if (grid) return { shapes: grid, scale: 1 };
  for (let scale = 1; scale > 0.2; scale *= 0.97) {
    const scaled = sized.map(item => ({ ...item, side: Math.min(BOX, item.side * scale) }));
    const placed = place(scaled);
    if (placed) return { shapes: spread(placed), scale: Math.round(scale * 1000) / 1000 };
  }
  return { shapes: [], scale: 0 };
}

/**
 * Even rows for sparse rosters: shapes dealt round-robin across rows (middle row first), each row
 * centred-out (its largest shape in the middle), rows and shapes spaced evenly. Used when every row's
 * footprints fit side by side and the rows fit top to bottom; otherwise the packer runs.
 */
function gridLayout(items: (PackItem & { side: number })[]): PackedShape[] | null {
  if (items.length === 0) return [];
  for (let cols = Math.ceil(Math.sqrt(items.length)); cols <= items.length; cols++) {
    const count = Math.ceil(items.length / cols);
    const order = Array.from({ length: count }, (_, i) => i).sort((a, b) => Math.abs(a - (count - 1) / 2) - Math.abs(b - (count - 1) / 2) || a - b);
    const rows: (PackItem & { side: number })[][] = Array.from({ length: count }, () => []);
    items.forEach((item, i) => rows[order[i % count]].push(item));
    const heights = rows.map(row => Math.max(...row.map(item => item.side)));
    const fits = rows.every(row => row.reduce((sum, item) => sum + item.side + 4 * GAP, 0) <= BOX)
      && heights.reduce((sum, h) => sum + h + 4 * GAP, 0) <= BOX;
    if (!fits) continue;
    const vSpace = (BOX - heights.reduce((sum, h) => sum + h, 0)) / count;
    const placed: PackedShape[] = [];
    let y = vSpace / 2;
    rows.forEach((row, r) => {
      // Centre-out: largest in the middle, the rest alternating either side.
      const line: typeof row = [];
      row.forEach((item, i) => { if (i % 2) line.unshift(item); else line.push(item); });
      const hSpace = (BOX - line.reduce((sum, item) => sum + item.side, 0)) / line.length;
      let x = hSpace / 2;
      for (const item of line) { placed.push({ ...item, x, y: y + (heights[r] - item.side) / 2 }); x += item.side + hSpace; }
      y += heights[r] + vSpace;
    });
    return placed;
  }
  return null;
}

function place(items: (PackItem & { side: number })[]): PackedShape[] | null {
  const grid = new Grid();
  const placed: PackedShape[] = [];
  for (const item of items) {
    const { core, grown } = masks(item.kind, item.side);
    const span = BOX - Math.ceil(item.side);
    let spot: [number, number] | null = null;
    for (let y = 0; y <= span && !spot; y++) for (let x = 0; x <= span; x++) if (grid.fits(grown, x, y)) { spot = [x, y]; break; }
    if (!spot) return null;
    grid.mark(core, spot[0], spot[1]);
    placed.push({ ...item, x: spot[0], y: spot[1] });
  }
  return placed;
}

/** Spreads the packed cluster over the box: centres scale apart per axis, the most that keeps every outline clear. */
function spread(shapes: PackedShape[]): PackedShape[] {
  if (shapes.length === 0) return shapes;
  const target = (pos: (s: PackedShape) => number) => {
    const centres = shapes.map(s => pos(s) + s.side / 2);
    let k = Infinity;
    for (let i = 0; i < shapes.length; i++) for (let j = 0; j < shapes.length; j++) {
      const d = centres[j] - centres[i];
      if (d > 1e-9) k = Math.min(k, (BOX - (Math.ceil(shapes[i].side) + Math.ceil(shapes[j].side)) / 2) / d);
    }
    k = Number.isFinite(k) ? Math.max(1, k) : 1;
    const low = Math.max(...shapes.map((s, i) => Math.ceil(s.side) / 2 - k * centres[i]));
    const high = Math.min(...shapes.map((s, i) => BOX - Math.ceil(s.side) / 2 - k * centres[i]));
    return centres.map((c, i) => (low + high) / 2 + k * c - shapes[i].side / 2);
  };
  const xs = target(s => s.x), ys = target(s => s.y);
  const outlines = shapes.map(s => masks(s.kind, s.side));
  for (const t of [1, 0.75, 0.5, 0.25]) {
    const moved = shapes.map((s, i) => ({ ...s, x: Math.round(s.x + t * (xs[i] - s.x)), y: Math.round(s.y + t * (ys[i] - s.y)) }));
    const grid = new Grid();
    if (moved.every((s, i) => {
      const ok = grid.fits(outlines[i].grown, s.x, s.y) && s.x >= 0 && s.y >= 0 && s.x + Math.ceil(s.side) <= BOX && s.y + Math.ceil(s.side) <= BOX;
      grid.mark(outlines[i].core, s.x, s.y);
      return ok;
    })) return moved;
  }
  return shapes;
}

/** SVG path for a packed shape in box units. */
export function shapePath(shape: Pick<PackedShape, "kind" | "x" | "y" | "side">): string {
  const half = shape.side / 2, cx = shape.x + half, cy = shape.y + half;
  return `${shapeGeometry(shape.kind).points.map(([x, y], i) => `${i ? "L" : "M"}${(cx + x * half).toFixed(2)} ${(cy + y * half).toFixed(2)}`).join("")}Z`;
}
