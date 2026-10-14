"use client";

import { useEffect, useState } from "react";
import { useExampleSubject } from "./example-subject";
import { PairedBars, RankedBars } from "./charts";
import { comparePeriods, getRankOperation } from "@/lib/workbench-api";
import { formatDate } from "@/lib/format-date";
import type { ComparePeriodsResponse, PeriodMode, PeriodSummary, RankOperationResponse } from "@/lib/types";
import { ContextBar } from "./context-bar";
import { TeamLogo } from "./team-logo";
import { DatePicker } from "./ui/date-picker";
import { Field } from "./ui/field";
import { GatedNote } from "./ui/gated-note";
import { PlayerIdentity } from "./ui/identity";
import { PageShell, ResearchLayout } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { Select } from "./ui/select";
import { StatTile } from "./ui/stat-tile";
import { PlayerLookup, ResearchBodySkeleton, deltaClass, downloadCsv, evidenceRows, signed, useInvestigationScope, useShareLink } from "./research-investigation";
import { Button, ButtonLink, Segmented } from "./ui/kit";

type View = "player" | "rank";
const KEY_DELTAS = ["pts_per_game", "min_per_game", "ts_pct", "fg3_pct", "ast_per_game", "pts"];
const RANK_METRICS = [["pts", "Total points"], ["pts_per_game", "Points per game"], ["min_per_game", "Minutes per game"], ["reb_per_game", "Rebounds per game"], ["ast_per_game", "Assists per game"]] as const;
// Shooting percentages arrive as fractions; their changes are percentage points.
const isPct = (key: string) => key.endsWith("_pct");
const value = (v: number | null, key: string) => v === null ? "—" : isPct(key) ? `${(v * 100).toFixed(1)}%` : String(v);
const change = (v: number | null, key: string) => v === null || !isPct(key) ? signed(v) : signed(Number((v * 100).toFixed(1)), " pp");

function PeriodCard({ title, period }: { title: string; period: PeriodSummary }) {
  const dates = period.start_date ? `${formatDate(period.start_date)} – ${formatDate(period.end_date)}` : "No dated appearances";
  return <div className="research-period">
    <span className="research-period-kicker">{title}</span>
    <strong>{period.label}</strong>
    <span>{dates}</span>
    <span>{period.appearances_count} games · {period.total_minutes} min ({period.min_per_game ?? "—"} MPG){period.stints.length ? ` · ${period.stints.join(", ")}` : ""}</span>
  </div>;
}

/** Workload Trends on the Research template: two disjoint windows for one player, or league shifts. */
export function TrendsInvestigationView() {
  const { params, catalog, releaseId, season, phase, beforeDate, set } = useInvestigationScope();
  const view: View = params.get("view") === "rank" ? "rank" : "player";
  const exampleState = useExampleSubject("playerId", ["player_id"], "player", view === "player");
  const playerId = params.get("playerId") || params.get("player_id") || "";
  const mode: PeriodMode = params.get("mode") === "date_range" ? "date_range" : "appearances";
  const periodAN = Number(params.get("periodAN") || params.get("period_a_n") || 10);
  const periodBN = Number(params.get("periodBN") || params.get("period_b_n") || 10);
  const range = { aFrom: params.get("periodAFrom") || "", aTo: params.get("periodATo") || "", bFrom: params.get("periodBFrom") || "", bTo: params.get("periodBTo") || "" };
  const rankMetric = params.get("rankMetric") || "pts";
  const rankDirection = params.get("rankDirection") === "asc" ? "asc" : "desc";
  const share = useShareLink();

  const [data, setData] = useState<{ key: string; value?: ComparePeriodsResponse; error?: string } | null>(null);
  const [rank, setRank] = useState<{ key: string; value?: RankOperationResponse; error?: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const playerKey = JSON.stringify([playerId, season, phase, releaseId, beforeDate, mode, periodAN, periodBN, range, retry]);
  const rankKey = JSON.stringify([rankMetric, rankDirection, season, phase, releaseId, beforeDate, retry]);
  useEffect(() => {
    if (view !== "player" || !playerId || !season) return;
    let active = true;
    comparePeriods({
      player_id: playerId, season, phase, release_id: releaseId, before_date: beforeDate, mode,
      period_a_n: mode === "appearances" ? periodAN : undefined, period_b_n: mode === "appearances" ? periodBN : undefined,
      period_a_from: mode === "date_range" ? range.aFrom || undefined : undefined, period_a_to: mode === "date_range" ? range.aTo || undefined : undefined,
      period_b_from: mode === "date_range" ? range.bFrom || undefined : undefined, period_b_to: mode === "date_range" ? range.bTo || undefined : undefined
    }).then(value => { if (active) setData({ key: playerKey, value }); })
      .catch(err => { if (active) setData({ key: playerKey, error: err instanceof Error ? err.message : "Failed to load period comparison" }); });
    return () => { active = false; };
    // playerKey covers every request input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, playerKey]);
  useEffect(() => {
    if (view !== "rank" || !season) return;
    let active = true;
    getRankOperation({ operation_type: "compare_periods", metric: rankMetric, season, phase, release_id: releaseId, before_date: beforeDate, sort_direction: rankDirection, limit: 25, min_games: 10 })
      .then(value => { if (active) setRank({ key: rankKey, value }); })
      .catch(err => { if (active) setRank({ key: rankKey, error: err instanceof Error ? err.message : "Failed to load cohort ranking" }); });
    return () => { active = false; };
    // rankKey covers every request input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, rankKey]);
  const current = data?.key === playerKey ? data : null;
  const ranked = rank?.key === rankKey ? rank : null;
  const result = current?.value;

  const exportCsv = () => result && downloadCsv(`courtlens_trends_${result.player_name.toLowerCase().replace(/\s+/g, "_")}_${result.season}.csv`,
    ["Metric", "Display Name", `Period A (${result.period_a.label})`, `Period B (${result.period_b.label})`, "Absolute Delta", "Percentage Delta (%)", "Period A Sample", "Period B Sample"],
    result.deltas.map(d => [d.metric_key, d.display_name, d.period_a_value ?? "", d.period_b_value ?? "", d.absolute_delta ?? "", d.percentage_delta ?? "", d.period_a_n, d.period_b_n]));
  const periodSelect = (label: string, key: "periodAN" | "periodBN", current: number, prefix: string) => <Field label={label} layout="inline"><Select aria-label={label} value={String(current)} onChange={e => set({ [key]: e.target.value })}>{[5, 10, 15, 20].map(n => <option key={n} value={n}>{prefix} {n} games</option>)}</Select></Field>;
  const rangePicker = (label: string, from: "periodAFrom" | "periodBFrom", to: "periodATo" | "periodBTo") => <>
    <Field label={`${label} from`} layout="inline"><DatePicker label={`${label} from`} value={range[from === "periodAFrom" ? "aFrom" : "bFrom"]} onChange={v => set({ [from]: v })} placeholder="Start" /></Field>
    <Field label="to" layout="inline"><DatePicker label={`${label} to`} value={range[to === "periodATo" ? "aTo" : "bTo"]} onChange={v => set({ [to]: v })} placeholder="End" /></Field>
  </>;
  const filters = view === "player" ? <>
    <PlayerLookup label="Target player" prefix="Target" name={data?.value?.player_name} releaseId={releaseId} season={season} phase={phase} beforeDate={beforeDate} onSelect={id => { exampleState.cancelDefault(); set({ playerId: id, player_id: null, exampleSubject: null }); }} />
    <Field label="Windows" layout="inline"><Select aria-label="Slicing mode" value={mode} onChange={e => set({ mode: e.target.value })}><option value="appearances">Consecutive appearances</option><option value="date_range">Calendar dates</option></Select></Field>
    {mode === "appearances" ? <>{periodSelect("Period A", "periodAN", periodAN, "Last")}{periodSelect("Period B", "periodBN", periodBN, "Prior")}</> : <>{rangePicker("Period A", "periodAFrom", "periodATo")}{rangePicker("Period B", "periodBFrom", "periodBTo")}</>}
  </> : <>
    <Field label="Metric" layout="inline"><Select aria-label="Metric" value={rankMetric} onChange={e => set({ rankMetric: e.target.value })}>{RANK_METRICS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></Field>
    <Field label="Order" layout="inline"><Select aria-label="Direction" value={rankDirection} onChange={e => set({ rankDirection: e.target.value })}><option value="desc">Largest increases</option><option value="asc">Largest drops</option></Select></Field>
  </>;
  const highlights = result?.deltas.filter(d => KEY_DELTAS.includes(d.metric_key)).sort((a, b) => KEY_DELTAS.indexOf(a.metric_key) - KEY_DELTAS.indexOf(b.metric_key)).slice(0, 4) ?? [];
  const leader = ranked?.value?.items[0];
  const team = result?.period_a.stints.at(-1) ?? result?.period_b.stints.at(-1);

  return <PageShell template="research" className="research-view trends-view">
    <PageHeader title="Workload Trends" subtitle="A player's recent stretch against the one before it, or the league's largest shifts." actions={<>
      <Button size="lg" onClick={share}>Share Link</Button>
      {view === "player" && result && <Button size="lg" onClick={exportCsv}>Export CSV</Button>}
      <ButtonLink size="lg" variant="primary" href="/stats">Open in Stats</ButtonLink>
    </>} />
    <ContextBar initialReleaseId={releaseId ?? undefined} initialSeason={season || undefined} initialPhase={phase} initialBeforeDate={beforeDate ?? undefined} showWindow={false}
      filters={filters}
      modes={<Segmented<View> size="lg" label="Trends view" value={view} onChange={next => set({ view: next === "player" ? null : next })} options={[{ value: "player", label: "Player Periods" }, { value: "rank", label: "League Shifts" }]} />}
      detailRows={view === "player" ? evidenceRows(result, "Period comparison") : evidenceRows(ranked?.value, "Cohort ranking")} />
    {catalog === null && <div role="status"><GatedNote>Context catalog unavailable. Explicit URL scope is retained; reload to retry.</GatedNote></div>}
    {view === "player" ? <>
      {(!current && playerId || exampleState.loading) && <ResearchBodySkeleton />}
      {exampleState.error && <GatedNote why={exampleState.error} action={<Button size="lg" onClick={() => window.location.reload()}>Retry</Button>}>Example unavailable. Choose a player.</GatedNote>}
      {current?.error && <div role="alert"><GatedNote tone="warning" action={<Button size="lg" onClick={() => setRetry(v => v + 1)}>Retry</Button>}>Period comparison unavailable: {current.error}</GatedNote></div>}
      {result && <ResearchLayout headline={<>
        {exampleState.example && <div className="pc12-example-label"><PlayerIdentity playerId={result.player_id} name={`Example: ${result.player_name}`} team={team} size="sm" subtitle="Season minutes rule" />
          <Button size="lg" onClick={() => {
            const toggle = document.querySelector<HTMLButtonElement>(".filter-bar-toggle-slot > button");
            const focusLookup = () => Array.from(document.querySelectorAll<HTMLInputElement>('input[aria-label="Target player"]')).find(input => input.checkVisibility())?.focus();
            if (toggle?.checkVisibility()) {
              toggle.click();
              // The drawer focuses its panel on its first frame; focus its visible lookup after that.
              requestAnimationFrame(() => requestAnimationFrame(focusLookup));
            } else focusLookup();
          }}>Change</Button>
        </div>}
        <PairedBars title={`${result.player_name} · target against baseline`} source="CourtLens admitted player box scores"
        sample={`${result.period_a.appearances_count} target / ${result.period_b.appearances_count} baseline games · ${result.period_a.total_minutes} / ${result.period_b.total_minutes} minutes`}
        names={["Period A · target", "Period B · baseline"]} note="Amber = target, blue = baseline. Each metric has its own scale; differences are descriptive, not causal."
        rows={highlights.map(d => ({key: d.metric_key, label: d.display_name, a: isPct(d.metric_key) && d.period_a_value != null ? d.period_a_value * 100 : d.period_a_value, b: isPct(d.metric_key) && d.period_b_value != null ? d.period_b_value * 100 : d.period_b_value, formattedA: value(d.period_a_value, d.metric_key), formattedB: value(d.period_b_value, d.metric_key), direction: "high"}))} /></>} findings={highlights.map(d => <StatTile key={d.metric_key} label={d.display_name} value={d.period_a_value === null ? null : value(d.period_a_value, d.metric_key)}
        footnote={<>from {value(d.period_b_value, d.metric_key)} · <span className="pc12-trend-change">{change(d.absolute_delta, d.metric_key)}</span></>} />)}>
        <section className="research-periods" aria-label="Compared periods">
          <PlayerIdentity playerId={result.player_id} name={result.player_name} team={team} subtitle={`${result.season}`} size="lg" href={`/players/${result.player_id}`} />
          <PeriodCard title="Period A · Target" period={result.period_a} />
          <PeriodCard title="Period B · Baseline" period={result.period_b} />
        </section>
        {result.has_calendar_overlap && <GatedNote tone="warning" why={<p>Period A and Period B contain overlapping calendar dates. Games in the intersection are reflected in both periods.</p>}>The two periods overlap on the calendar.</GatedNote>}
        <div className="table-wrapper research-table" role="region" aria-label="Metric variance" tabIndex={0}>
          <table className="data-table"><caption>All {result.deltas.length} metrics · {result.player_name}</caption>
            <thead><tr><th>Metric</th><th className="num">Period A</th><th className="num">Period B</th><th className="num">Change</th><th className="num">Change %</th><th className="num">Sample (A / B)</th></tr></thead>
            <tbody>{result.deltas.map(row => <tr key={row.metric_key}>
              <th scope="row">{row.display_name}</th>
              <td className="num">{value(row.period_a_value, row.metric_key)}</td><td className="num">{value(row.period_b_value, row.metric_key)}</td>
              <td className="num"><span className={deltaClass(row.absolute_delta)}>{change(row.absolute_delta, row.metric_key)}</span></td>
              <td className="num">{row.percentage_delta === null ? <span title="Unavailable when the baseline value is zero">—</span> : <span className={deltaClass(row.percentage_delta)}>{signed(row.percentage_delta, "%")}</span>}</td>
              <td className="num">{row.period_a_n} / {row.period_b_n}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <GatedNote why={<ul>{result.disclosures.map((text, index) => <li key={index}>{text}</li>)}</ul>}>Descriptive changes between two windows; not a forecast or a cause.</GatedNote>
      </ResearchLayout>}
    </> : <>
      {!ranked && <ResearchBodySkeleton tiles={3} />}
      {ranked?.error && <div role="alert"><GatedNote tone="warning" action={<Button size="lg" onClick={() => setRetry(v => v + 1)}>Retry</Button>}>Cohort ranking unavailable: {ranked.error}</GatedNote></div>}
      {ranked?.value && <ResearchLayout headline={<RankedBars title="Largest period shifts" source="CourtLens admitted player box scores" sample={`${ranked.value.total_eligible} eligible players · at least 10 appearances`}
        measure={RANK_METRICS.find(([key]) => key === rankMetric)?.[1] ?? rankMetric} tone="identity-b" note="Blue = signed recent-minus-prior change; zero baseline. Descriptive, not causal."
        items={ranked.value.items.slice(0, 5).map(item => ({key: item.player_id, name: item.player_name, label: item.player_name, value: item.delta_value, detail: `${item.games_played} games`}))} />} findings={<>
        <StatTile label="Eligible Players" value={ranked.value.total_eligible} footnote="At least 10 appearances" />
        <StatTile label={rankDirection === "desc" ? "Largest Increase" : "Largest Drop"} value={leader ? signed(leader.delta_value) : null} footnote={leader?.player_name} />
        <StatTile label="Windows" value="Last 10 vs prior 10" footnote={RANK_METRICS.find(([key]) => key === rankMetric)?.[1]} />
      </>}>
        <div className="table-wrapper research-table" role="region" aria-label="League shifts" tabIndex={0}>
          <table className="data-table"><caption>{RANK_METRICS.find(([key]) => key === rankMetric)?.[1]} · last 10 games against the prior 10</caption>
            <thead><tr><th className="num">Rank</th><th>Player</th><th>Team</th><th className="num">Games</th><th className="num">Prior 10</th><th className="num">Last 10</th><th className="num">Change</th><th className="num">Change %</th><th><span className="sr-only">Action</span></th></tr></thead>
            <tbody>{ranked.value.items.map(item => {
              const pctDelta = (item.details?.percentage_delta as number | undefined) ?? null;
              return <tr key={item.player_id}>
                <td className="num">{item.rank}</td>
                <th scope="row">{item.player_name}</th>
                <td>{item.team_tricode ? <span className="research-team"><TeamLogo team={item.team_tricode} size={16} />{item.team_tricode}</span> : "—"}</td>
                <td className="num">{item.games_played}</td>
                <td className="num">{item.baseline_value ?? "—"}</td><td className="num">{item.comparison_value ?? "—"}</td>
                <td className="num"><span className={deltaClass(item.delta_value)}>{signed(item.delta_value)}</span></td>
                <td className="num">{pctDelta === null ? "—" : <span className={deltaClass(pctDelta)}>{signed(pctDelta, "%")}</span>}</td>
                <td><Button size="lg" onClick={() => set({ view: null, playerId: item.player_id, player_id: null })}>Investigate</Button></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        <GatedNote why={<ul>{ranked.value.disclosures.map((text, index) => <li key={index}>{text}</li>)}</ul>}>Ranked across {ranked.value.total_eligible} eligible players; descriptive only.</GatedNote>
      </ResearchLayout>}
    </>}
  </PageShell>;
}
