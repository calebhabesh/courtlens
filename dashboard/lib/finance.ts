import { FINANCE_TEAMS } from "./finance-teams";
import { browserApi } from "./api";

export const FINANCE_STATUSES = ["unknown_review", "unsigned", "signed", "returned", "option_pending", "two_way"] as const;
export type FinanceStatus = typeof FINANCE_STATUSES[number];
export const STATUS_LABELS: Record<FinanceStatus, string> = { unknown_review: "Review / unknown", unsigned: "Unsigned", signed: "Signed", returned: "Returned", option_pending: "Option pending", two_way: "Two-way" };
export const AMOUNT_KINDS = ["base_salary", "cash", "cap_hit", "cap_hold", "dead_money", "tax_component"] as const;
export type FinanceQuery = {
  operation_version: "finance-query-v1"; book_id: string; financial_season: string;
  known_at: string; effective_on: string; unknown_dates: "include_labelled" | "exclude";
  team_id: string | null; player_ids: string[]; statuses: FinanceStatus[];
  amount_kind: typeof AMOUNT_KINDS[number]; small_big_threshold_cents: number;
  scenario: "reported-v1" | "include-unexercised-options-v1";
};
export type FinanceBook = { book_id: string; book_sha256: string; parent_book_id: string | null; created_at: string; coverage_note: string };
export type FinanceBookDetail = FinanceBook & { financial_seasons: string[]; latest_observed_at: string; player_labels: Record<string,string>; label_scope: string };
export type FinanceObservation = {
  observation_id: string; origin_book_id: string; content_sha256: string; supersedes_id: string | null;
  temporal_label: "dated_report" | "unknown_effective_date" | "future_effective";
  terms: {
    row_id: string; kind: "contract" | "amount" | "option" | "guarantee" | "status" | "association";
    nba_player_id: string; contract_id: string; financial_season: string | null; team_id: string | null;
    effective_date: string | null; announced_at: string | null; observed_at: string;
    source_locator: string; original_label: string; amount_kind: string | null; currency: string | null;
    value: string | null; status: FinanceStatus | null; option: string | null; option_state: string | null;
    guarantee: string | null; years: number | null; correction_reason: string | null;
  };
  source: { sha256: string; url: string; observed_at: string; attribution: string; use_basis: string };
};
export type FinanceContract = {
  player_id: string; contract_id: string; team_id: string | null; team_status: string;
  status: FinanceStatus; status_scope: "source_book_contract_observation";
  observations: FinanceObservation[]; scenario_amount_cents: string | null; known_amount_cents: string | null;
  amount_status: string; size_group: "small" | "big" | "unknown"; derived_aav_usd: string | null; aav_definition: string;
};
export type FinanceResult = {
  operation_version: "finance-query-v1"; context: FinanceQuery; book_sha256: string; coverage_note: string;
  source_scope: "historical_source_observations_not_current_market"; timeline: FinanceObservation[];
  historical_reconstruction: boolean;
  subtotal: { amount_kind: string; scenario_subtotal_cents: string | null; scenario_contracts: number;
    known_subtotal_cents: string | null; expected_book_contracts: number; known_contracts: number; unknown_contracts: number;
    known_player_ids: string[]; unknown_player_ids: string[]; expected_roster_identities: null;
    coverage: "bounded_book_incomplete"; threshold_status: "threshold_status_pending"; position_allocations_cents: Record<string,string | null> };
  contracts: FinanceContract[]; status_groups_unfiltered: Record<FinanceStatus,number>; status_groups_filtered: Record<FinanceStatus,number>;
  unfiltered_contract_count: number; filtered_contract_count: number; excluded_observations: Record<string,number>;
  external_value_status: "source_blocked"; limitations: string[]; analytical_content_sha256: string; result_sha256: string;
};

// Format cents without converting through binary floating-point money.
export function formatCents(value: string | null): string {
  if (value === null) return "Unknown";
  const cents = BigInt(value);
  const sign = cents < 0n ? "−" : "";
  const absolute = cents < 0n ? -cents : cents;
  return `${sign}$${(absolute / 100n).toLocaleString("en-US")}.${String(absolute % 100n).padStart(2,"0")}`;
}
export function dollarsToCents(value: string): number {
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(value)) throw new Error("Threshold must be nonnegative USD with at most two decimals.");
  const [whole, fraction = ""] = value.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2,"0"));
  if (cents > 99999999999999n) throw new Error("Threshold exceeds the supported bound.");
  return Number(cents);
}
export function financeParams(query: FinanceQuery, source = new URLSearchParams()): URLSearchParams {
  const params = new URLSearchParams(source);
  for (const [key,value] of Object.entries(query)) {
    const name = `finance_${key}`;
    if (value === null || (Array.isArray(value) && !value.length)) params.delete(name);
    else params.set(name, Array.isArray(value) ? value.join(",") : String(value));
  }
  return params;
}
export function readFinanceParams(params: URLSearchParams, team?: string): FinanceQuery {
  const get = (name: string) => params.get(`finance_${name}`);
  const kind = get("amount_kind"); const threshold = get("small_big_threshold_cents");
  return {
    operation_version: "finance-query-v1", book_id: get("book_id") ?? "", financial_season: get("financial_season") ?? "2025-26",
    known_at: get("known_at") ?? "", effective_on: get("effective_on") ?? "", team_id: team ?? get("team_id"),
    player_ids: (get("player_ids") ?? "").split(",").filter(Boolean),
    statuses: (get("statuses") ?? "").split(",").filter((s): s is FinanceStatus => FINANCE_STATUSES.includes(s as FinanceStatus)),
    amount_kind: AMOUNT_KINDS.includes(kind as FinanceQuery["amount_kind"]) ? kind as FinanceQuery["amount_kind"] : "base_salary",
    small_big_threshold_cents: threshold && /^\d+$/.test(threshold) && Number(threshold) <= 99999999999999 ? Number(threshold) : 1200000000,
    unknown_dates: get("unknown_dates") === "exclude" ? "exclude" : "include_labelled",
    scenario: get("scenario") === "include-unexercised-options-v1" ? "include-unexercised-options-v1" : "reported-v1",
  };
}
export function filterFinanceContracts(rows: FinanceContract[], labels: Record<string,string>, search: string, type: string, size: string, sort: string) {
  const needle = search.trim().toLocaleLowerCase();
  return rows.filter(row => (size === "all" || row.size_group === size) && (type === "all" || row.observations.some(o => o.terms.kind === type)) &&
    [labels[row.player_id] ?? row.player_id,row.team_id ?? "",FINANCE_TEAMS.find(t => t.id === row.team_id)?.name ?? "",FINANCE_TEAMS.find(t => t.id === row.team_id)?.tricode ?? "",row.contract_id,...row.observations.flatMap(o => [o.terms.original_label,o.terms.source_locator,o.source.attribution])].join(" ").toLocaleLowerCase().includes(needle)
  ).sort((a,b) => {
    if (sort === "amount") {
      if (a.known_amount_cents === null) return b.known_amount_cents === null ? a.contract_id.localeCompare(b.contract_id) : 1;
      if (b.known_amount_cents === null) return -1;
      const delta = BigInt(b.known_amount_cents)-BigInt(a.known_amount_cents);
      if (delta !== 0n) return delta > 0n ? 1 : -1;
    }
    if (sort === "status") { const delta = a.status.localeCompare(b.status); if (delta) return delta; }
    return (labels[a.player_id] ?? a.player_id).localeCompare(labels[b.player_id] ?? b.player_id) || a.contract_id.localeCompare(b.contract_id);
  });
}
export function financeSizeGroups(contracts: FinanceContract[]) {
  return (["small", "big", "unknown"] as const).map(group => {
    const rows=contracts.filter(c => c.size_group === group);
    const known=rows.filter(c => c.known_amount_cents !== null);
    return {group, contracts:rows.length, known_contracts:known.length, known_cents:known.length ? known.reduce((sum,c) => sum+BigInt(c.known_amount_cents!),0n).toString() : null};
  });
}
export async function financeFetch<T>(path: string, signal: AbortSignal, query?: FinanceQuery): Promise<T> {
  const response = await fetch(`${browserApi}/api/workbench/operations/finance${path}`, {
    cache: "no-store", signal,
    ...(query ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(query) } : {}),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.detail === "string" ? body.detail : `Finance request failed (${response.status}). Check the financial context.`);
  }
  return response.json();
}
