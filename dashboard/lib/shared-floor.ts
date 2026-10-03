export type FloorOperation = "wowy" | "on-off" | "stat-shift";
export interface FloorRequest {
  team_id: string;
  release_id?: string | null;
  season?: string | null;
  phase?: string | null;
  before_date?: string | null;
  lower_date?: string | null;
  together: string[];
  apart: string[];
  exact_unit: string[];
  player_id?: string | null;
  min_possessions: number;
  min_games: number;
}
export interface FloorInterval {
  lower: number | null; upper: number | null; level: number;
  method: string; games: number; reason: string | null;
}
export interface FloorCell {
  key: string; present: string[]; absent: string[]; games: number; stints: number;
  seconds: number; minutes: number; offensive_possessions: number; defensive_possessions: number;
  points: number | null; points_allowed: number | null;
  sample_status: "available" | "insufficient_sample" | "empty"; reason: string | null;
  event_totals: Record<string, number | null>; raw_metrics: Record<string, number | null>;
  metric_denominators: Record<string, number>; metric_valid_stints: Record<string, number>;
  intervals: Record<string, FloorInterval>;
}
export interface FloorResponse {
  operation: FloorOperation; operation_version: string; context: Record<string, unknown>;
  request: FloorRequest; coverage_status: "available" | "partial" | "source_blocked";
  expected_games: number; observed_games: number; excluded_stints: number;
  cells: FloorCell[]; partitions: FloorCell[];
  shifts: { metric: string; selected_value: number | null; complement_value: number | null;
    difference: number | null; interval: FloorInterval }[];
  input_hash: string; evidence_hash: string; disclosures: string[];
}
export const floorNumber = (value: number | null | undefined) => value == null ? "—" : value.toFixed(2);
export function floorInterval(interval?: FloorInterval): string {
  if (!interval) return "Unavailable";
  return interval.lower == null || interval.upper == null
    ? interval.reason ?? "Unavailable"
    : `${floorNumber(interval.lower)} to ${floorNumber(interval.upper)}`;
}
export function validateFloorRequest(operation: FloorOperation, req: FloorRequest): string | null {
  const ids = [...req.together, ...req.apart, ...req.exact_unit];
  if (!req.team_id.trim()) return "Select a team.";
  if (!ids.length || ids.length > 5 || new Set(ids).size !== ids.length || ids.some(id => !id.trim())) return "Choose one to five distinct player conditions.";
  if (req.exact_unit.length && (req.exact_unit.length < 2 || req.together.length || req.apart.length)) return "Units require two to five players and cannot mix with together/apart conditions.";
  if (operation === "on-off" && (req.together.length !== 1 || req.apart.length || req.exact_unit.length)) return "On/off requires one together player.";
  if (operation === "stat-shift" && (!req.player_id?.trim() || ids.includes(req.player_id))) return "Choose a focal player separate from the teammate conditions.";
  if (!Number.isFinite(req.min_possessions) || req.min_possessions < 1 || req.min_possessions > 10000 || !Number.isInteger(req.min_games) || req.min_games < 1 || req.min_games > 82) return "Possessions must be 1–10,000 and games an integer from 1–82.";
  if (req.lower_date && req.before_date && req.lower_date >= req.before_date) return "The lower date must precede the exclusive cutoff.";
  return null;
}
export function resolvedFloorRequest(result: FloorResponse): FloorRequest {
  const req = { ...result.request };
  for (const key of ["release_id", "season", "phase", "before_date"] as const) {
    const value = result.context[key];
    if (typeof value === "string") req[key] = value;
  }
  return req;
}
export function floorUrl(path: string, operation: FloorOperation, req: FloorRequest): string {
  const params = new URLSearchParams({ operation });
  for (const [key, value] of Object.entries(req)) {
    if (Array.isArray(value)) { if (value.length) params.set(key, value.join(",")); }
    else if (value != null && value !== "") params.set(key, String(value));
  }
  return `${path}?${params}`;
}
export function comparableFloorResults(a: FloorResponse, b: FloorResponse): boolean {
  const x = resolvedFloorRequest(a), y = resolvedFloorRequest(b);
  return a.operation === b.operation && a.operation_version === b.operation_version &&
    ["release_id", "season", "phase", "before_date", "lower_date", "team_id", "min_possessions", "min_games", "player_id"].every(key => x[key as keyof FloorRequest] === y[key as keyof FloorRequest]);
}
export function floorCsv(results: FloorResponse[]): string {
  const rows: unknown[][] = [["evidence_hash", "operation", "coverage", "cell", "present", "absent", "games", "stints", "minutes", "off_possessions", "def_possessions", "sample", "metric", "value", "valid_possessions", "valid_stints", "interval_lower", "interval_upper", "interval_reason"]];
  for (const result of results) for (const cell of [...result.cells, ...result.partitions]) for (const [metric, value] of Object.entries(cell.raw_metrics)) {
    const interval = cell.intervals[metric];
    rows.push([result.evidence_hash, result.operation, result.coverage_status, cell.key, cell.present.join("|"), cell.absent.join("|"), cell.games, cell.stints, cell.minutes, cell.offensive_possessions, cell.defensive_possessions, cell.sample_status, metric, value, cell.metric_denominators[metric], cell.metric_valid_stints[metric], interval?.lower, interval?.upper, interval?.reason]);
  }
  return rows.map(row => row.map(v => `"${String(v ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
}
