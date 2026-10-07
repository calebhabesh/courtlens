"use client";
import { EntityField } from "./entity-picker";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { browserApi } from "@/lib/api";
import type { LookupItem, Plan, PrivatePlayer, Scenario } from "@/lib/types";
import { Metric } from "./metric";
import { PlanTable } from "./plan-table";

type League = { id: string; name: string; timezone: string; lineup_slots: Record<string, number> };

async function api<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${browserApi}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers
    }
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      body && typeof body === "object" && "detail" in body
        ? JSON.stringify(body.detail)
        : `HTTP ${response.status}`;
    throw new Error(detail);
  }
  return body as T;
}

function plannerCandidates(players: PrivatePlayer[]): LookupItem[] {
  return players.map(player=>({id:String(player.player_id),canonical_id:String(player.player_id),kind:"player",display_name:player.name,subtitle:`${player.team ?? "Unknown team"} · Selected league roster/watchlist`,match_basis:"suggestion",match_score:1,availability:{has_current_season:false,status:"available",seasons:[]},destination_url:"",metadata:{identity_namespace:"planner"}}));
}

export function PlannerClient({ fixtureMode }: { fixtureMode: boolean }) {
  const [email, setEmail] = useState(fixtureMode ? "demo@courtlens.dev" : "");
  const [password, setPassword] = useState(fixtureMode ? "CourtLens-demo-2026" : "");
  const [token, setToken] = useState("");
  const [leagues, setLeagues] = useState<League[]>([]);
  const [leagueId, setLeagueId] = useState("");
  const [weekStart, setWeekStart] = useState(fixtureMode ? "2025-02-03" : "");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [roster, setRoster] = useState<PrivatePlayer[]>([]);
  const [watchlist, setWatchlist] = useState<PrivatePlayer[]>([]);
  const [dropId, setDropId] = useState("");
  const [addId, setAddId] = useState("");
  const [addEligibleSlots, setAddEligibleSlots] = useState("UTIL");
  const [effectiveDate, setEffectiveDate] = useState(fixtureMode ? "2025-02-03" : "");
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [message, setMessage] = useState(fixtureMode ? "Loading the labeled fixture workspace…" : "Sign in to load your private leagues.");
  const [busy, setBusy] = useState(false);

  const loadWorkspace = useCallback(async (accessToken: string, selectedLeague?: string) => {
    const loadedLeagues = await api<League[]>("/api/fantasy/leagues", {}, accessToken);
    setLeagues(loadedLeagues);
    const id = selectedLeague ?? loadedLeagues[0]?.id;
    if (!id) {
      setMessage("No league exists yet. Create one through the API docs, then add your roster.");
      return;
    }
    setLeagueId(id);
    const [loadedRoster, loadedWatchlist] = await Promise.all([
      api<PrivatePlayer[]>(`/api/fantasy/leagues/${id}/roster`, {}, accessToken),
      api<PrivatePlayer[]>(`/api/fantasy/leagues/${id}/watchlist`, {}, accessToken)
    ]);
    setRoster(loadedRoster);
    setWatchlist(loadedWatchlist);
    setDropId(String(loadedRoster[0]?.player_id ?? ""));
    setAddId(String(loadedWatchlist[0]?.player_id ?? ""));
    setMessage("Workspace ready. Scheduled never means healthy or available.");
  }, []);

  const signIn = useCallback(async (event?: FormEvent) => {
    event?.preventDefault();
    setBusy(true);
    try {
      const result = await api<{ access_token: string }>("/api/auth/token", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      setToken(result.access_token);
      await loadWorkspace(result.access_token);
    } catch (error) {
      setMessage(`Could not sign in: ${error instanceof Error ? error.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  }, [email, loadWorkspace, password]);

  useEffect(() => {
    if (!fixtureMode) return;
    const task = window.setTimeout(() => void signIn(), 0);
    return () => window.clearTimeout(task);
  }, [fixtureMode, signIn]);

  const loadPlan = useCallback(async () => {
    if (!token || !leagueId || !weekStart) return;
    setBusy(true);
    setScenario(null);
    try {
      const loaded = await api<Plan>(
        `/api/fantasy/leagues/${leagueId}/planner?weekStart=${weekStart}`,
        {},
        token
      );
      setPlan(loaded);
      setEffectiveDate(weekStart);
      setMessage("Plan reconciled to the visible daily assignments.");
    } catch (error) {
      setMessage(`Could not build plan: ${error instanceof Error ? error.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  }, [leagueId, token, weekStart]);

  useEffect(() => {
    if (!token || !leagueId || !weekStart) return;
    const task = window.setTimeout(() => void loadPlan(), 0);
    return () => window.clearTimeout(task);
  }, [leagueId, loadPlan, token, weekStart]);

  async function runScenario(event: FormEvent) {
    event.preventDefault();
    if (!dropId || !addId) return;
    setBusy(true);
    try {
      const created = await api<Scenario>(
        `/api/fantasy/leagues/${leagueId}/scenarios`,
        {
          method: "POST",
          body: JSON.stringify({
            week_start: weekStart,
            effective_date: effectiveDate,
            dropped_player_id: Number(dropId),
            added_player_id: Number(addId),
            added_eligible_slots: addEligibleSlots
              .split(",")
              .map((slot) => slot.trim().toUpperCase())
              .filter(Boolean)
          })
        },
        token
      );
      setScenario(created);
      setMessage("Scenario persisted against the same source snapshot and league versions.");
    } catch (error) {
      setMessage(`Scenario is invalid: ${error instanceof Error ? error.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="auth-card">
        <div>
          <p className="kicker">Private configuration</p>
          <h2>Open your planner</h2>
          <p>League settings, roster, watchlist, and scenarios are owner-scoped.</p>
        </div>
        <form onSubmit={signIn}>
          <label>Email<input autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>
          <label>Password<input autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>
          <button className="button" disabled={busy} type="submit">{busy ? "Opening…" : "Sign in"}</button>
          {fixtureMode ? <small>These are local demo credentials for fictional fixture records.</small> : null}
        </form>
        <p className="form-hint" role="status">{message}</p>
      </div>
    );
  }

  return (
    <div className="planner-workspace">
      <div className="planner-toolbar">
        <label>League<select onChange={(event) => void loadWorkspace(token, event.target.value)} value={leagueId}>{leagues.map((league) => <option key={league.id} value={league.id}>{league.name}</option>)}</select></label>
        <label>Week starts<input onChange={(event) => setWeekStart(event.target.value)} type="date" value={weekStart} /></label>
        <button className="button button-dark" disabled={busy} onClick={() => void loadPlan()} type="button">{busy ? "Calculating…" : "Recalculate"}</button>
        <p role="status">{message}</p>
      </div>

      {plan ? (
        <>
          <div className="snapshot-strip">
            <span className={`data-badge ${plan.data_snapshot.classification}`}><span className="status-dot" />{plan.data_snapshot.classification === "fixture" ? "Fixture snapshot" : "Operational snapshot"}</span>
            <span>Roster v{plan.league.roster_version}</span>
            <span>Rules {plan.league.scoring_rules_version.slice(0, 8)}</span>
            <span>{plan.week_state.acquisitions_remaining}/{plan.league.acquisition_limit} moves left</span>
            <span>Snapshot {plan.data_snapshot.id?.slice(0, 8) ?? "none"}</span>
          </div>
          <div className="metrics-grid planner-metrics">
            <Metric value={plan.summary.scheduled_player_games} label="scheduled games" note="team has a game" />
            <Metric value={plan.summary.startable_player_games} label="startable games" note="compatible slot found" />
            <Metric value={plan.summary.lineup_conflicts} label="lineup conflicts" note="productive bench risk" />
            <Metric value={Object.values(plan.league.lineup_slots).reduce((a, b) => a + b, 0)} label="daily slots" note="configured capacity" />
          </div>
          <PlanTable plan={plan} />

          <section className="scenario-builder">
            <div>
              <p className="kicker">One transaction · no autopilot</p>
              <h2>Add/drop what-if</h2>
              <p>Watchlist means “compare this player,” not “available in my league.”</p>
            </div>
            <form onSubmit={runScenario}>
              <EntityField label="Drop" value={dropId} onChange={setDropId} candidates={plannerCandidates(roster)} required />
              <EntityField label="Add candidate" value={addId} onChange={setAddId} candidates={plannerCandidates(watchlist)} required />
              <label>Candidate slots<input aria-label="Candidate eligible slots" onChange={(event) => setAddEligibleSlots(event.target.value)} placeholder="G, UTIL" required value={addEligibleSlots} /></label>
              <label>Effective date<input min={weekStart} max={plan.week_end} onChange={(event) => setEffectiveDate(event.target.value)} type="date" value={effectiveDate} /></label>
              <button className="button" disabled={busy || !watchlist.length} type="submit">Compare scenario →</button>
            </form>
          </section>

          {scenario ? (
            <section className="scenario-result">
              <div className="delta-heading">
                <div><p className="kicker">Component delta</p><h2>What actually changes</h2></div>
                <span className="scenario-id">Scenario {scenario.id.slice(0, 8)}</span>
              </div>
              <div className="delta-grid">
                <Delta value={scenario.delta.scheduled_player_games} label="scheduled games" />
                <Delta value={scenario.delta.startable_player_games} label="startable games" primary />
                <Delta value={scenario.delta.lineup_conflicts} label="lineup conflicts" invert />
                <Delta value={scenario.delta.recent_fantasy_points_per_game} label="recent FP / game" />
              </div>
              <PlanTable plan={scenario.after} title="After the selected effective date" />
              <p className="method-note compact">{scenario.explanation}</p>
            </section>
          ) : null}
        </>
      ) : (
        <div className="empty-state tall"><span className="empty-icon">⌁</span><h3>No plan loaded</h3><p>Select a league and scoring week.</p></div>
      )}
    </div>
  );
}

function Delta({ value, label, primary, invert }: { value: number | null; label: string; primary?: boolean; invert?: boolean }) {
  const favorable = value === null ? false : invert ? value < 0 : value > 0;
  return (
    <div className={`delta ${primary ? "primary" : ""} ${favorable ? "favorable" : ""}`}>
      <strong>{value === null ? "—" : `${value > 0 ? "+" : ""}${value}`}</strong><span>{label}</span>
    </div>
  );
}
