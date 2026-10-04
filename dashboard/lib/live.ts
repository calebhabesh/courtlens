export interface LiveTeam { source_id: string; canonical_id: string | null; identity_status: string; name: string; side: "home" | "away"; score: number | null; statistics?: Record<string, number | null> }
export interface LiveGame { source_id: string; canonical_id: string | null; identity_status: string; namespace: string; slate_date: string; event_time: string | null; status: string; period: number | null; clock: string | null; teams: LiveTeam[]; provisional: boolean }
export interface LivePlayer { source_id: string; team_source_id: string; name: string; canonical_id: string | null; identity_status: string; reported_nonappearance: boolean | null; appearance_label?: string; statistics: Record<string, string | null> }
export interface LiveData { games?: LiveGame[]; game?: LiveGame; players?: LivePlayer[] | null; team_sections?: { team: { id: string; displayName?: string }; statistics?: { name?: string; label?: string; displayValue?: string | null }[] }[] | null }
export interface LiveCache { namespace: string; provisional: boolean; client_poll_seconds: 60; capability: string; status: string; paused: boolean; active_leases: number; stale: boolean; age_seconds: number | null; last_success_at: string | null; last_poll_at: string | null; next_poll_at: string | null; error: string | null; observation_id: string | null; acquired_at: string | null; source_time: string | null; http_date: string | null; content_sha256: string | null; data: LiveData | null }
export interface LiveLease { id: string; expires_at: string; heartbeat_seconds: 60 }
export interface LiveSelection { slate_date: string; game_id?: string | null }
export interface HistoricalSlate { context: Record<string, string>; games: LiveGame[]; players: LivePlayer[] | null; status: string; warnings: string[] }

export function validSlate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}
export function easternToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function shiftSlate(value: string, days: number): string { return new Date(Date.parse(`${value}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10); }
export function acceptsDemand(value: string, today = easternToday()): boolean { return Math.abs(Date.parse(value) - Date.parse(today)) <= 7 * 86400000; }
export function gameStatus(game: LiveGame): string {
  if (game.status === "in_progress") return `${game.period == null ? "Period unknown" : game.period > 4 ? `OT ${game.period - 4}` : `Q${game.period}`} · ${game.clock ?? "Clock unknown"}`;
  return ({ scheduled: "Scheduled", final: "Final", postponed: "Postponed", cancelled: "Cancelled", unknown: "Status unknown" } as Record<string, string>)[game.status] ?? "Status unknown";
}
export class LiveRequestError extends Error { constructor(public status: number) { super(({403:"Live activation requires the local operator service",404:"Live lease expired",429:"Live view capacity reached; retrying in 60 seconds",422:"This date or selection cannot activate Live"} as Record<number,string>)[status] ?? "Live service unavailable; last observation retained"); } }
export async function liveRequest<T>(path: string, method = "GET", body?: LiveSelection, keepalive = false): Promise<T> {
  const response = await fetch(`/api/live${path}`, { method, cache: "no-store", keepalive, signal: AbortSignal.timeout(10000), headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  if (!response.ok) throw new LiveRequestError(response.status);
  return response.status === 204 ? undefined as T : response.json();
}

// A generation owns its lease. Late activation responses are released, including after unmount.
export function createLiveSession(selection: LiveSelection, read: () => Promise<void>, report: (message: string | null) => void, request = liveRequest) {
  let stopped = false;
  let lease: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const release = (id: string) => { void request(`/subscriptions/${id}`, "DELETE", undefined, true).catch(() => {}); };
  async function tick() {
    if (stopped) return;
    const demand = async () => {
      try {
        const next = await request<LiveLease>(lease ? `/subscriptions/${lease}/heartbeat` : "/subscriptions", "POST", selection);
        if (stopped) release(next.id); else { lease = next.id; report(null); }
      } catch (error) {
        if (stopped) return;
        if (error instanceof LiveRequestError && error.status === 404) lease = null;
        report(error instanceof Error ? error.message : "Live demand unavailable");
      }
    };
    await Promise.allSettled([read(), demand()]);
    if (!stopped) timer = setTimeout(tick, 60000);
  }
  void tick();
  return () => { stopped = true; clearTimeout(timer); if (lease) release(lease); };
}
