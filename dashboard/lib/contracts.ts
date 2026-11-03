import { browserApi } from "./api";

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
  darko_value_dollars?: number | null; darko_dpm?: number | null;
};
export type DarkoValueContext = { season: string; as_of: string; data_date: string; source: string; raw_sha256: string };
export type Thresholds = {
  threshold_id: string; season: string; source_url: string; effective_date: string; observed_at: string; content_sha256: string;
  cap_cents: string; tax_cents: string; first_apron_cents: string; second_apron_cents: string; minimum_cents: string; limitation: string;
};
export type RefreshContext = {
  refresh_id: string; season: string; observed_at: string; checked_at?: string | null; state: "partial" | "verification_blocked";
  book_id: string | null; roster_dataset_id: string; thresholds: Thresholds | null; source: string; label: string;
};
export type TeamContracts = {
  context: RefreshContext; team_id: string; team_tricode: string; team_name: string; seasons: string[];
  roster_players: number; roster_known_players: number; roster_known_cents: string;
  other_source_rows: number; other_source_known_cents: string; source_page_known_cents: string;
  players: ContractPlayer[]; reference_season: string; statistics_release_id: string | null; impact_version: string | null;
  darko?: DarkoValueContext | null; limitations: string[];
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

/** Seasons after the book's first with any listed salary: later years are projected from the same book. */
export function bookYears(data: TeamContracts): string[] {
  return data.seasons.filter((season, index) => index === 0 || data.players.some(p => p.on_index_roster && p.seasons.some(s => s.season === season && s.salary_cents !== null)));
}
export const seasonOf = (player: ContractPlayer, year: string) => player.seasons.find(s => s.season === year) ?? null;
/** Salary in whole dollars for one season; null is unknown (current season) or not listed (later). */
export function salaryIn(player: ContractPlayer, year: string, current: string): number | null {
  if (year === current) return dollars(player.current_salary_cents);
  return dollars(seasonOf(player, year)?.salary_cents);
}
/** Roster for a book year: the whole index roster now; later, only players with a listed salary. */
export function yearRoster(data: TeamContracts, year: string): ContractPlayer[] {
  const current = data.seasons[0];
  const roster = data.players.filter(p => p.on_index_roster);
  return year === current ? roster : roster.filter(p => salaryIn(p, year, current) !== null);
}
export const knownPayroll = (players: ContractPlayer[], year: string, current: string) =>
  players.reduce((total, p) => total + (salaryIn(p, year, current) ?? 0), 0);

export type ThresholdLine = { key: "cap" | "tax" | "first_apron" | "second_apron"; label: string; value: number };
export function thresholdLines(thresholds: Thresholds | null): ThresholdLine[] {
  if (!thresholds) return [];
  return ([["cap", "Cap", thresholds.cap_cents], ["tax", "Tax", thresholds.tax_cents], ["first_apron", "1st Apron", thresholds.first_apron_cents], ["second_apron", "2nd Apron", thresholds.second_apron_cents]] as const)
    .map(([key, label, cents]) => ({ key, label, value: dollars(cents)! }));
}
/** Databallr's "Below 1st Apron · Below by $7.8M" on known salaries; unknown salaries make it a lower bound. */
export function lineStatus(known: number, line: ThresholdLine): { below: boolean; label: string; by: number } {
  const below = known < line.value;
  return { below, label: `${below ? "Below" : "Above"} ${line.label}`, by: Math.abs(line.value - known) };
}

export const POSITION_ORDER: PositionGroup[] = ["G", "F", "C", "unlisted"];
export type PayrollSlice = { player: ContractPlayer; group: PositionGroup; value: number };
/** Known salaries by position group then salary (Databallr's Payroll Flow and pie order). */
export function payrollSlices(players: ContractPlayer[], year: string, current: string): PayrollSlice[] {
  return players.flatMap(player => { const value = salaryIn(player, year, current); return value === null ? [] : [{ player, group: player.position_group, value }]; })
    .sort((a, b) => POSITION_ORDER.indexOf(a.group) - POSITION_ORDER.indexOf(b.group) || b.value - a.value || a.player.player_id.localeCompare(b.player.player_id));
}
export function groupTotals(slices: PayrollSlice[]): { group: PositionGroup; value: number; players: number }[] {
  return POSITION_ORDER.map(group => ({ group, value: slices.filter(s => s.group === group).reduce((t, s) => t + s.value, 0), players: slices.filter(s => s.group === group).length }))
    .filter(g => g.players > 0);
}
export const HIGH_EARNER_DOLLARS = 8_000_000;

/** Small vs Big (DARKO market value): split at the threshold; surplus and ROI only over players DARKO lists. */
export type ValueRow = { player: ContractPlayer; salary: number; value: number | null; surplus: number | null };
export type ValueGroup = { rows: ValueRow[]; salary: number; mappedSalary: number; value: number; surplus: number; mapped: number; roi: number | null };
export function valueGroup(rows: ValueRow[]): ValueGroup {
  const mapped = rows.filter(r => r.value !== null);
  const mappedSalary = mapped.reduce((t, r) => t + r.salary, 0);
  const value = mapped.reduce((t, r) => t + r.value!, 0);
  return { rows, salary: rows.reduce((t, r) => t + r.salary, 0), mappedSalary, value, surplus: value - mappedSalary, mapped: mapped.length,
    roi: mappedSalary > 0 ? (value - mappedSalary) / mappedSalary : null };
}
export function smallVsBig(players: ContractPlayer[], threshold: number): { small: ValueGroup; big: ValueGroup; all: ValueGroup } {
  const rows: ValueRow[] = players.filter(p => p.current_salary_cents !== null).map(player => {
    const salary = dollars(player.current_salary_cents)!;
    const value = player.darko_value_dollars ?? null;
    return { player, salary, value, surplus: value === null ? null : value - salary };
  }).sort((a, b) => (b.surplus ?? -Infinity) - (a.surplus ?? -Infinity) || b.salary - a.salary);
  return { small: valueGroup(rows.filter(r => r.salary < threshold)), big: valueGroup(rows.filter(r => r.salary >= threshold)), all: valueGroup(rows) };
}

export type TimelineMark = "guaranteed" | "player-option" | "team-option" | "free-agent" | "none";
/** One mark per season: a listed salary (or option), then FA in the first season after the last listed one. */
export function timelineMarks(player: ContractPlayer, years: string[], current: string): { year: string; mark: TimelineMark; value: number | null }[] {
  const listed = years.map(year => { const season = seasonOf(player, year); const value = salaryIn(player, year, current);
    return { year, value, option: season?.option ?? null }; });
  const last = listed.reduce((at, cell, index) => cell.value !== null || cell.option ? index : at, -1);
  return listed.map((cell, index) => ({ year: cell.year, value: cell.value,
    mark: index <= last ? (cell.option === "player" ? "player-option" : cell.option === "team" ? "team-option" : cell.value !== null ? "guaranteed" : "none") : index === last + 1 && last >= 0 ? "free-agent" : "none" }));
}
export const shortName = (name: string) => { const parts = name.split(" "); return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(" ")}` : name; };
export function nextOption(player: ContractPlayer): string | null {
  const season = player.seasons.find(s => s.option);
  return season ? `${season.option === "player" ? "Player" : "Team"} option ${season.season}` : null;
}
