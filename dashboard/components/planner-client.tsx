"use client";
import { EntityField } from "./entity-picker";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { browserApi } from "@/lib/api";
import { formatDate, parseIsoDate } from "@/lib/format-date";
import type { LookupItem, Plan, PrivatePlayer, Scenario } from "@/lib/types";
import { PlanTable } from "./plan-table";
import { BoardLayout } from "./ui/page-shell";
import { Button } from "./ui/button";
import { DataDetailsButton } from "./ui/data-details";
import { DatePicker } from "./ui/date-picker";
import { Field } from "./ui/field";
import { CountChip, FilterBar } from "./ui/filter-bar";
import { GatedNote } from "./ui/gated-note";
import { Input } from "./ui/input";
import { Select } from "./ui/select";
import { Skeleton } from "./ui/skeleton";
import { StatTile } from "./ui/stat-tile";

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

/**
 * Planner (FO13, Board template): sign in, then the shared filter bar holds League and Week, which
 * apply immediately and live in the URL. The weekly plan is the main surface; the one-transaction
 * what-if sits in the rail. Snapshot, roster and rules versions are in Data details.
 */
export function PlannerClient({ fixtureMode, defaultWeek }: { fixtureMode: boolean; defaultWeek: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const urlWeek = params.get("week");
  const weekStart = urlWeek && parseIsoDate(urlWeek) ? urlWeek : defaultWeek;
  const [email, setEmail] = useState(fixtureMode ? "demo@courtlens.dev" : "");
  const [password, setPassword] = useState(fixtureMode ? "CourtLens-demo-2026" : "");
  const [token, setToken] = useState("");
  const [leagues, setLeagues] = useState<League[]>([]);
  const requestedLeague = params.get("league");
  const leagueId = leagues.find(league => league.id === requestedLeague)?.id ?? leagues[0]?.id ?? "";
  const [loadedPlan, setPlan] = useState<Plan | null>(null);
  // Results always describe the visible URL scope, including while a replacement is pending.
  const plan = loadedPlan?.league.id === leagueId && loadedPlan.week_start === weekStart ? loadedPlan : null;
  const [roster, setRoster] = useState<PrivatePlayer[]>([]);
  const [watchlist, setWatchlist] = useState<PrivatePlayer[]>([]);
  const [dropId, setDropId] = useState("");
  const [addId, setAddId] = useState("");
  const [addEligibleSlots, setAddEligibleSlots] = useState("UTIL");
  const [effectiveDate, setEffectiveDate] = useState(weekStart);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [message, setMessage] = useState(fixtureMode ? "Opening the labeled fixture workspace…" : "Sign in to open your private leagues.");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const setQuery = useCallback((key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(key, value);
    router.replace(`${pathname}?${next}`, { scroll: false });
  }, [params, pathname, router]);

  const signIn = useCallback(async (event?: FormEvent) => {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ access_token: string }>("/api/auth/token", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      const loadedLeagues = await api<League[]>("/api/fantasy/leagues", {}, result.access_token);
      setLeagues(loadedLeagues);
      if (!loadedLeagues.length) setError("No league exists yet. Create one through the API docs, then add your roster.");
      setToken(result.access_token);
    } catch (cause) {
      setMessage(`Could not sign in: ${cause instanceof Error ? cause.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  }, [email, password]);

  useEffect(() => {
    if (!fixtureMode) return;
    const task = window.setTimeout(() => void signIn(), 0);
    return () => window.clearTimeout(task);
  }, [fixtureMode, signIn]);

  useEffect(() => {
    if (!token || !leagueId || !weekStart) return;
    let active = true;
    const task = window.setTimeout(async () => {
      setBusy(true);
      setScenario(null);
      setError(null);
      try {
        const [loaded, loadedRoster, loadedWatchlist] = await Promise.all([
          api<Plan>(`/api/fantasy/leagues/${leagueId}/planner?weekStart=${weekStart}`, {}, token),
          api<PrivatePlayer[]>(`/api/fantasy/leagues/${leagueId}/roster`, {}, token),
          api<PrivatePlayer[]>(`/api/fantasy/leagues/${leagueId}/watchlist`, {}, token),
        ]);
        if (!active) return;
        setPlan(loaded);
        setRoster(loadedRoster);
        setWatchlist(loadedWatchlist);
        setDropId(String(loadedRoster[0]?.player_id ?? ""));
        setAddId(String(loadedWatchlist[0]?.player_id ?? ""));
        setEffectiveDate(weekStart);
      } catch (cause) {
        if (active) setError(`Could not build the plan: ${cause instanceof Error ? cause.message : "unknown error"}`);
      } finally {
        if (active) setBusy(false);
      }
    }, 0);
    return () => { active = false; window.clearTimeout(task); };
  }, [leagueId, token, weekStart]);

  async function runScenario(event: FormEvent) {
    event.preventDefault();
    if (!dropId || !addId) return;
    setBusy(true);
    setError(null);
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
    } catch (cause) {
      setError(`The scenario is invalid: ${cause instanceof Error ? cause.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <section className="planner-auth" aria-labelledby="planner-sign-in">
        <h2 id="planner-sign-in">Open your planner</h2>
        <p>League settings, roster, watchlist and scenarios are private to your account.</p>
        <form onSubmit={signIn} className="planner-auth-form">
          <Field label="Email"><Input autoComplete="email" aria-label="Email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></Field>
          <Field label="Password"><Input autoComplete="current-password" aria-label="Password" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></Field>
          <Button variant="primary" loading={busy} type="submit">{busy ? "Opening…" : "Sign in"}</Button>
        </form>
        {fixtureMode ? <p className="planner-note">These are local demo credentials for fictional fixture records.</p> : null}
        <p className="planner-note" role="status">{message}</p>
      </section>
    );
  }

  const fixture = plan?.data_snapshot.classification === "fixture";
  const details = plan ? [
    { label: "Data", value: fixture ? "Fixture snapshot (fictional records)" : "Operational snapshot" },
    { label: "Snapshot ID", value: plan.data_snapshot.id ?? "None", mono: true },
    { label: "Roster version", value: String(plan.league.roster_version) },
    { label: "Scoring rules version", value: plan.league.scoring_rules_version, mono: true },
    { label: "League time zone", value: plan.league.timezone, mono: true },
    { label: "Week", value: `${formatDate(plan.week_start)} – ${formatDate(plan.week_end)}` },
    { label: "Meaning", value: "Scheduled never means healthy or available. A watchlist player is one to compare, not one available in your league." },
  ] : [];

  const main = (
    <div className="planner-main">
      {error && <GatedNote tone="warning">{error}</GatedNote>}
      {plan ? (
        <>
          <section className="ui-findings" aria-label="Key findings">
            <StatTile label="Scheduled Games" value={plan.summary.scheduled_player_games} footnote="Team has a game" />
            <StatTile label="Startable Games" value={plan.summary.startable_player_games} footnote="A compatible slot is free" />
            <StatTile label="Lineup Conflicts" value={plan.summary.lineup_conflicts} footnote="Productive bench risk" />
            <StatTile label="Daily Slots" value={Object.values(plan.league.lineup_slots).reduce((a, b) => a + b, 0)} footnote="Configured capacity" />
          </section>
          <PlanTable plan={plan} />
          {scenario ? (
            <section className="scenario-result" aria-labelledby="planner-delta">
              <h2 id="planner-delta">What actually changes</h2>
              <div className="delta-grid">
                <Delta value={scenario.delta.scheduled_player_games} label="scheduled games" />
                <Delta value={scenario.delta.startable_player_games} label="startable games" primary />
                <Delta value={scenario.delta.lineup_conflicts} label="lineup conflicts" invert />
                <Delta value={scenario.delta.recent_fantasy_points_per_game} label="recent FP / game" />
              </div>
              <PlanTable plan={scenario.after} title="After the selected effective date" />
              <p className="planner-note">{scenario.explanation}</p>
            </section>
          ) : null}
        </>
      ) : busy ? (
        <div className="planner-loading" role="status" aria-busy="true" aria-label="Loading plan"><div className="ui-findings">{[0, 1, 2, 3].map(i => <Skeleton key={i} height={88} />)}</div><Skeleton height={320} /></div>
      ) : !error ? (
        <GatedNote>No plan for this week yet.</GatedNote>
      ) : null}
    </div>
  );

  const rail = plan ? (
    <section className="scenario-builder" aria-labelledby="planner-what-if">
      <h2 id="planner-what-if">Add/drop what-if</h2>
      <p className="planner-note">One transaction, no autopilot.</p>
      <form onSubmit={runScenario}>
        <EntityField label="Drop" value={dropId} onChange={setDropId} candidates={plannerCandidates(roster)} required />
        <EntityField label="Add candidate" value={addId} onChange={setAddId} candidates={plannerCandidates(watchlist)} required />
        <Field label="Candidate slots"><Input aria-label="Candidate eligible slots" onChange={(event) => setAddEligibleSlots(event.target.value)} placeholder="G, UTIL" required value={addEligibleSlots} /></Field>
        <Field label="Effective date"><DatePicker label="Effective date" value={effectiveDate} min={weekStart} max={plan.week_end} onChange={setEffectiveDate} /></Field>
        <Button variant="primary" loading={busy} disabled={!watchlist.length} type="submit">Compare scenario</Button>
      </form>
    </section>
  ) : undefined;

  return (
    <>
      <FilterBar
        label="Planner scope"
        summary={`${leagues.find(item => item.id === leagueId)?.name ?? "League"} · Week of ${formatDate(weekStart)}`}
        scope={<>
          <Field label="League" layout="inline"><Select aria-label="League" value={leagueId} onChange={(event) => setQuery("league", event.target.value)}>{leagues.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
          <Field label="Week" layout="inline"><DatePicker label="Week starts" value={weekStart} onChange={(value) => setQuery("week", value)} /></Field>
        </>}
        count={plan ? <CountChip>{plan.week_state.acquisitions_remaining}/{plan.league.acquisition_limit} moves left{fixture ? " · Fixture" : ""}</CountChip> : undefined}
        details={plan ? <DataDetailsButton rows={details} /> : undefined}
      />
      <BoardLayout main={main} rail={rail} />
    </>
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
