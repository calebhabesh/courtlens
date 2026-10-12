import { browserApi } from "./api";
import type { ContractStatus, DonutItem, FlowLink, FlowNode, TimelineRow, ChartTone } from "@/components/charts";

// PC08 Contracts: one pinned finance refresh (BRef salaries, NBA index, official thresholds).
export type PositionGroup = "G" | "F" | "C" | "unlisted";
export type ContractSeason = { season: string; salary_cents: string | null; option: "player" | "team" | null };
export type ReferenceImpact = {
  season: string; games: number | null; minutes_per_game: number | null; points_per_game: number | null;
  rebounds_per_game: number | null; assists_per_game: number | null; rapm: number | null;
};
export type ContractPlayer = {
  player_id: string; name: string; on_index_roster: boolean; listed_position: string | null; position_group: PositionGroup;
  current_salary_cents: string | null; unknown_reason: string | null; remaining_guaranteed_cents: string | null;
  seasons: ContractSeason[]; source_url: string | null; source_locator: string | null; reference: ReferenceImpact | null;
};
export type Thresholds = {
  threshold_id: string; season: string; source_url: string; effective_date: string; observed_at: string; content_sha256: string;
  cap_cents: string; tax_cents: string; first_apron_cents: string; second_apron_cents: string; minimum_cents: string; limitation: string;
};
export type RefreshContext = {
  refresh_id: string; season: string; observed_at: string; state: "partial" | "verification_blocked";
  book_id: string | null; roster_dataset_id: string; thresholds: Thresholds | null; source: string; label: string;
};
export type TeamContracts = {
  context: RefreshContext; team_id: string; team_tricode: string; team_name: string; seasons: string[];
  roster_players: number; roster_known_players: number; roster_known_cents: string;
  other_source_rows: number; other_source_known_cents: string; source_page_known_cents: string;
  players: ContractPlayer[]; reference_season: string; statistics_release_id: string | null; impact_version: string | null;
  limitations: string[];
};
export type TeamPayroll = {
  team_id: string; team_tricode: string; team_name: string; roster_players: number; roster_known_players: number;
  source_page_known_cents: string; other_source_rows: number; top_player_name: string | null; top_salary_cents: string | null;
};
export type LeaguePayrolls = {
  context: RefreshContext; teams: TeamPayroll[]; expected_players: number; salary_observed_players: number;
  unresolved_source_rows: number; limitations: string[];
};
export type RefreshSummary = { refresh_id: string; season: string; observed_at: string };

export const CONTRACT_SEASON = "2026-27";
export const POSITION_LABELS: Record<PositionGroup, string> = { G: "Guards", F: "Forwards", C: "Centers", unlisted: "Position unlisted" };
export const POSITION_TONES: Record<PositionGroup, ChartTone> = { G: "category-1", F: "category-2", C: "category-3", unlisted: "category-6" };
export const UNKNOWN_REASONS: Record<string, string> = {
  salary_blank_in_source: "Blank on source page",
  salary_missing_or_identity_unresolved: "Not on source page",
  team_salary_source_unavailable: "Team source unavailable",
};

async function contractsFetch<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${browserApi}/api/workbench/operations/finance${path}`, { cache: "no-store", signal });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.detail === "string" ? body.detail : `Contracts request failed (${response.status}).`);
  }
  return response.json();
}
/** The pinned refresh from the URL, else the latest observed refresh for the season (ordered by the API). */
export async function resolveRefresh(pinned: string | null, signal?: AbortSignal): Promise<string | null> {
  if (pinned) return pinned;
  const refreshes = await contractsFetch<RefreshSummary[]>(`/refreshes?season=${CONTRACT_SEASON}`, signal);
  return refreshes[0]?.refresh_id ?? null;
}
export const getLeaguePayrolls = (refresh: string, signal?: AbortSignal) => contractsFetch<LeaguePayrolls>(`/refreshes/${encodeURIComponent(refresh)}/teams`, signal);
export function getTeamContracts(refresh: string, team: string, statisticsRelease: string | null, signal?: AbortSignal) {
  const query = statisticsRelease ? `?statisticsReleaseId=${encodeURIComponent(statisticsRelease)}` : "";
  return contractsFetch<TeamContracts>(`/refreshes/${encodeURIComponent(refresh)}/teams/${encodeURIComponent(team)}${query}`, signal);
}

/** Integer-cent strings to whole dollars for chart geometry; null stays unknown. */
export function dollars(cents: string | null | undefined): number | null {
  return cents === null || cents === undefined ? null : Number(BigInt(cents) / 100n);
}
export function money(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = value < 0 ? "−" : "";
  const absolute = Math.abs(value);
  if (absolute >= 1e6) return `${sign}$${(absolute / 1e6).toFixed(1)}M`;
  if (absolute >= 1e3) return `${sign}$${Math.round(absolute / 1e3)}K`;
  return `${sign}$${absolute.toLocaleString("en-US")}`;
}
export const centsMoney = (cents: string | null | undefined) => money(dollars(cents));

export function seasonStatus(season: ContractSeason): ContractStatus {
  if (season.option === "player") return "player-option";
  if (season.option === "team") return "team-option";
  return season.salary_cents === null ? "unknown" : "reported";
}
/** Current season always gets a cell (blank = Unknown); later blank seasons with no option are "Not listed". */
export function timelineRows(players: ContractPlayer[], current = CONTRACT_SEASON): TimelineRow[] {
  return players.filter(p => p.seasons.length > 0).map(p => ({
    id: p.player_id,
    label: p.name,
    cells: p.seasons.filter(s => s.season === current || s.salary_cents !== null || s.option !== null)
      .map(s => ({ period: s.season, value: dollars(s.salary_cents), status: seasonStatus(s) })),
  }));
}
export function nextOption(player: ContractPlayer): string | null {
  const season = player.seasons.find(s => s.option);
  return season ? `${season.option === "player" ? "Player" : "Team"} option ${season.season}` : null;
}
export function yearsListed(player: ContractPlayer): number {
  return player.seasons.filter(s => s.salary_cents !== null).length;
}

const known = (players: ContractPlayer[]) => players.filter(p => p.current_salary_cents !== null);
const sum = (players: ContractPlayer[]) => players.reduce((total, p) => total + (dollars(p.current_salary_cents) ?? 0), 0);

/** Known salary → position group → player. Unknown salaries stay out of the flow and in the table. */
export function payrollFlow(players: ContractPlayer[]): { nodes: FlowNode[]; links: FlowLink[] } {
  const roster = known(players.filter(p => p.on_index_roster));
  const groups = (["G", "F", "C", "unlisted"] as const).filter(g => roster.some(p => p.position_group === g));
  const nodes: FlowNode[] = [{ id: "total", label: "Known roster salary", tone: "status-reported" },
    ...groups.map(g => ({ id: `group:${g}`, label: POSITION_LABELS[g], tone: POSITION_TONES[g] })),
    ...roster.map(p => ({ id: `player:${p.player_id}`, label: p.name, tone: POSITION_TONES[p.position_group] }))];
  const links: FlowLink[] = [
    ...groups.map(g => ({ source: "total", target: `group:${g}`, value: sum(roster.filter(p => p.position_group === g)) })),
    ...roster.map(p => ({ source: `group:${p.position_group}`, target: `player:${p.player_id}`, value: dollars(p.current_salary_cents) })),
  ];
  return { nodes, links };
}
export function positionDonut(players: ContractPlayer[]): DonutItem[] {
  const roster = players.filter(p => p.on_index_roster);
  return (["G", "F", "C", "unlisted"] as const).filter(g => roster.some(p => p.position_group === g)).map(g => {
    const group = roster.filter(p => p.position_group === g);
    return { id: g, label: `${POSITION_LABELS[g]} · ${known(group).length}/${group.length} known`, value: sum(known(group)), tone: POSITION_TONES[g] };
  });
}
/** Top five reported salaries, the rest of known salary, and one Unknown row that never becomes a slice. */
export function earnerDonut(players: ContractPlayer[]): DonutItem[] {
  const roster = players.filter(p => p.on_index_roster);
  const ordered = known(roster).sort((a, b) => (dollars(b.current_salary_cents) ?? 0) - (dollars(a.current_salary_cents) ?? 0));
  const items: DonutItem[] = ordered.slice(0, 5).map(p => ({ id: p.player_id, label: p.name, value: dollars(p.current_salary_cents) }));
  const rest = ordered.slice(5);
  if (rest.length) items.push({ id: "rest", label: `Other ${rest.length} known`, value: sum(rest), tone: "status-reported" });
  const unknown = roster.length - ordered.length;
  if (unknown) items.push({ id: "unknown", label: `${unknown} unknown salaries`, value: null, tone: "status-unknown" });
  return items;
}
