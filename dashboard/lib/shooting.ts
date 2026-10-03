import type { ShootingInput, ShootingOperation, ShootingResponse, ShotFact } from "./shooting-types";

export const shootingNumber = (value: number | null | undefined) => value == null ? "—" : String(value);
export const shootingPercent = (value: number | null | undefined) => value == null ? "—" : `${(value * 100).toFixed(1)}%`;
export function validateShooting(req: ShootingInput): string | null {
  if (!req.player_id || !/^\S{1,100}$/.test(req.player_id) || (req.defender_id != null && !/^\S{1,100}$/.test(req.defender_id))) return "Enter a canonical player ID without spaces (up to 100 characters).";
  for (const [value, max, name] of [[req.min_attempts, 10000, "Attempts"], [req.min_games, 100, "Games"], [req.limit, 25, "Peer limit"]] as const) {
    if (!Number.isInteger(value) || value < 1 || value > max) return `${name} must be an integer from 1–${max}.`;
  }
  if (req.lower_date && req.before_date && req.lower_date >= req.before_date) return "The lower date must precede the exclusive cutoff.";
  return null;
}
export function resolvedShooting(result: ShootingResponse): ShootingInput {
  const request = { ...result.request };
  for (const key of ["release_id", "season", "phase", "before_date"] as const) {
    const value = result.context[key];
    if (typeof value === "string") Object.assign(request, { [key]: value });
  }
  return request;
}
export function shootingUrl(path: string, operation: ShootingOperation, request: ShootingInput): string {
  const params = new URLSearchParams({ operation });
  for (const [key, value] of Object.entries(request)) if (value != null && value !== "") params.set(key, String(value));
  return `${path}?${params}`;
}
// Null coordinates never become zero; off-court points stay in the fact table.
export function courtPosition(shot: ShotFact): { x: number; y: number } | null {
  const x = shot.x_feet, y = shot.y_feet;
  return x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 25 || y < -5.25 || y > 88.75 ? null : { x: x + 25, y: 88.75 - y };
}
export function shootingCsv(result: ShootingResponse): string {
  const rows: unknown[][] = [["evidence_hash", "operation", "record_type", "record_json"]];
  for (const [kind, records] of Object.entries({ request: [result.request], context: [result.context], coverage: [{ status: result.coverage_status, expected_games: result.expected_games, observed_games: result.observed_games, excluded_rows: result.excluded_rows, input_counts: result.input_counts }], profile: result.profile ? [result.profile] : [], shot: result.shots, peer: result.peers, assignment: result.assignments, anchor: result.anchors, branch: result.aftermath_summary, provenance: result.provenance, policy: [{ version: result.operation_version, input_hash: result.input_hash, disclosures: result.disclosures, branch_counts: result.branch_counts }] })) {
    for (const record of records) rows.push([result.evidence_hash, result.operation, kind, JSON.stringify(record)]);
  }
  return rows.map(row => row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
}
