"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Donut, Sankey, ThresholdBar, TimelineGrid } from "./charts";
import { PayrollBoard, thresholdLines } from "./contracts-payroll-board";
import { PageShell, ProfileLayout, ResearchLayout } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { StatTile } from "./ui/stat-tile";
import { GatedNote } from "./ui/gated-note";
import { DataDetailsButton, type DataDetailRow } from "./ui/data-details";
import { TeamIdentity } from "./ui/identity";
import { Field } from "./ui/field";
import { Select } from "./ui/select";
import { Skeleton } from "./ui/skeleton";
import { TeamLogo } from "./team-logo";
import { getSharedCatalog } from "@/lib/route-availability";
import { FINANCE_TEAMS } from "@/lib/finance-teams";
import { formatDate } from "@/lib/format-date";
import { Button, ButtonLink } from "./ui/kit";
import {
  POSITION_LABELS, UNKNOWN_REASONS, centsMoney, dollars, earnerDonut, getLeaguePayrolls, getTeamContracts, money,
  nextOption, payrollFlow, positionDonut, resolveRefresh, timelineRows, yearsListed,
  type ContractPlayer, type LeaguePayrolls, type RefreshContext, type TeamContracts,
} from "@/lib/contracts";

const SOURCE = "Basketball-Reference contracts · NBA player index · NBA salary cap release";
const one = (value: number | null | undefined) => value === null || value === undefined ? "—" : value.toFixed(1);
const signed = (value: number | null | undefined) => value === null || value === undefined ? "—" : `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(1)}`;

/** Pins the resolved refresh in the URL (C3) so a shared link reproduces the same book. */
function useRefresh() {
  const params = useSearchParams();
  const pinned = params.get("refresh");
  const [resolved, setResolved] = useState<{ id: string | null; error: string } | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    resolveRefresh(pinned, abort.signal).then(id => {
      if (abort.signal.aborted) return;
      setResolved({ id, error: id ? "" : "No finance refresh has been admitted for 2026-27." });
      if (id && !pinned) {
        const next = new URLSearchParams(window.location.search); next.set("refresh", id);
        window.history.replaceState(null, "", `${window.location.pathname}?${next}`);
      }
    }).catch(error => { if (!abort.signal.aborted) setResolved({ id: null, error: (error as Error).message }); });
    return () => abort.abort();
  }, [pinned]);
  return { refresh: pinned ?? resolved?.id ?? null, error: resolved?.error ?? "", params };
}

function contextRows(context: RefreshContext): DataDetailRow[] {
  const t = context.thresholds;
  return [
    { label: "Scope", value: context.label },
    { label: "Refresh observed", value: formatDate(context.observed_at) },
    { label: "Stored refresh state", value: context.state === "partial" ? "Partial coverage" : "Verification blocked at admission (verified later; admitted records are immutable)" },
    { label: "Refresh UUID", value: context.refresh_id, mono: true },
    { label: "Book UUID", value: context.book_id ?? "No book", mono: true },
    { label: "Player index dataset", value: context.roster_dataset_id, mono: true },
    { label: "Thresholds", value: t ? `${t.season} official release · effective ${formatDate(t.effective_date)}` : "Not pinned" },
    { label: "Threshold source", value: t?.source_url ?? "—" },
  ];
}

function Limitations({ items }: { items: string[] }) {
  return <ul className="contracts-limitations">{items.map(item => <li key={item}>{item}</li>)}</ul>;
}

function Loading() {
  return <div role="status" aria-label="Loading contracts" aria-busy="true" className="contracts-loading"><Skeleton height={96} /><Skeleton height={320} /></div>;
}

function Failure({ error }: { error: string }) {
  return <div role="alert"><GatedNote why={error} action={<Button size="lg" onClick={() => window.location.reload()}>Retry</Button>}>Contracts are unavailable right now.</GatedNote></div>;
}

export function ContractsLeague() {
  const { refresh, error: refreshError } = useRefresh();
  const [data, setData] = useState<LeaguePayrolls | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!refresh) return;
    const abort = new AbortController();
    getLeaguePayrolls(refresh, abort.signal).then(value => { if (!abort.signal.aborted) { setData(value); setError(""); } })
      .catch(err => { if (!abort.signal.aborted) setError((err as Error).message); });
    return () => abort.abort();
  }, [refresh]);
  const query = refresh ? `?refresh=${encodeURIComponent(refresh)}` : "";
  const failure = refreshError || error;
  const top = data && [...data.teams].sort((a, b) => (dollars(b.source_page_known_cents) ?? 0) - (dollars(a.source_page_known_cents) ?? 0))[0];
  const total = data?.teams.reduce((sum, t) => sum + (dollars(t.source_page_known_cents) ?? 0), 0) ?? null;
  return <PageShell template="research" className="contracts-page">
    <PageHeader title="Contracts & Payroll" subtitle={data ? `${data.context.label} · as of ${formatDate(data.context.observed_at)}` : "2026-27 · reported salaries"}
      actions={data && <DataDetailsButton rows={[...contextRows(data.context), { label: "Unresolved source rows", value: String(data.unresolved_source_rows) }]}>
        <Limitations items={data.limitations} />
        <p><Link href={`/contracts/books${query}`}>Retained source books (advanced)</Link></p>
      </DataDetailsButton>} />
    {failure && <Failure error={failure} />}
    {!data && !failure && <Loading />}
    {data && <ResearchLayout findings={<>
      <StatTile size="lg" label="League known salary, 2026-27" value={money(total)} footnote="Sum of reported base salaries; a lower bound" />
      <StatTile label="Players with a reported salary" value={`${data.salary_observed_players} / ${data.expected_players}`} footnote="Active players in the NBA index" />
      <StatTile label="Highest known payroll" value={top ? `${top.team_tricode} ${centsMoney(top.source_page_known_cents)}` : null} footnote={top ? `${top.roster_known_players}/${top.roster_players} roster salaries known` : undefined} />
      <StatTile label="Salary cap" value={centsMoney(data.context.thresholds?.cap_cents)} footnote="Official 2026-27 marker" />
    </>}>
      <PayrollBoard title="Known payroll by team" source={SOURCE} sample={`30 teams · ${data.salary_observed_players} of ${data.expected_players} salaries known`} teams={data.teams} thresholds={data.context.thresholds} query={query} />
      <GatedNote why={<Limitations items={data.limitations} />}>{data.expected_players - data.salary_observed_players} active players have no reported 2026-27 salary. They are excluded from totals, never counted as $0.</GatedNote>
      <div className="table-wrapper" role="region" aria-label="Team payroll table" tabIndex={0}><table className="data-table contracts-table">
        <thead><tr><th scope="col">Team</th><th scope="col" className="num">Known salary</th><th scope="col" className="num">Roster salaries known</th><th scope="col">Highest reported salary</th><th scope="col" className="num">Other source-listed</th></tr></thead>
        <tbody>{[...data.teams].sort((a, b) => (dollars(b.source_page_known_cents) ?? 0) - (dollars(a.source_page_known_cents) ?? 0)).map(team => <tr key={team.team_id}>
          <th scope="row"><Link className="contracts-team-link" href={`/contracts/${team.team_tricode}${query}`}><TeamLogo team={team.team_id} size={20} />{team.team_name}</Link></th>
          <td className="num">{centsMoney(team.source_page_known_cents)}</td>
          <td className="num">{team.roster_known_players} / {team.roster_players}</td>
          <td>{team.top_player_name ? `${team.top_player_name} · ${centsMoney(team.top_salary_cents)}` : "—"}</td>
          <td className="num">{team.other_source_rows}</td>
        </tr>)}</tbody>
      </table></div>
    </ResearchLayout>}
  </PageShell>;
}

function salaryCell(player: ContractPlayer) {
  if (player.current_salary_cents !== null) return <>{centsMoney(player.current_salary_cents)}{nextOption(player) && <small>{nextOption(player)}</small>}</>;
  return <span className="contracts-unknown">—<small>{UNKNOWN_REASONS[player.unknown_reason ?? ""] ?? "Unknown"}</small></span>;
}

function RosterTable({ players, reference, query }: { players: ContractPlayer[]; reference: string; query: string }) {
  return <div className="table-wrapper" role="region" aria-label="Roster contracts and impact" tabIndex={0}><table className="data-table contracts-table">
    <caption>Contract terms from the source page; {reference} references are prior-season numbers, not forecasts.</caption>
    <thead><tr><th scope="col">Player</th><th scope="col">Pos</th><th scope="col" className="num">2026-27 salary</th><th scope="col" className="num">Years listed</th><th scope="col" className="num">Remaining guaranteed</th>
      <th scope="col" className="num">{reference} GP</th><th scope="col" className="num">MPG</th><th scope="col" className="num">PTS</th><th scope="col" className="num">REB</th><th scope="col" className="num">AST</th><th scope="col" className="num">RAPM</th></tr></thead>
    <tbody>{players.map(p => <tr key={p.player_id}>
      <th scope="row"><Link href={`/players/${p.player_id}${query}`}>{p.name}</Link></th>
      <td>{p.listed_position ?? "—"}</td>
      <td className="num">{salaryCell(p)}</td>
      <td className="num">{p.seasons.length ? yearsListed(p) : "—"}</td>
      <td className="num">{centsMoney(p.remaining_guaranteed_cents)}</td>
      <td className="num">{p.reference?.games ?? "—"}</td>
      <td className="num">{one(p.reference?.minutes_per_game)}</td>
      <td className="num">{one(p.reference?.points_per_game)}</td>
      <td className="num">{one(p.reference?.rebounds_per_game)}</td>
      <td className="num">{one(p.reference?.assists_per_game)}</td>
      <td className="num">{signed(p.reference?.rapm)}</td>
    </tr>)}</tbody>
  </table></div>;
}

export function ContractsTeam({ team }: { team: string }) {
  const { refresh, error: refreshError, params } = useRefresh();
  const router = useRouter();
  const releaseParam = params.get("releaseId");
  // Keyed by request so a team switch never shows the previous team's numbers.
  const key = `${refresh}:${team}:${releaseParam}`;
  const [loaded, setLoaded] = useState<{ key: string; data: TeamContracts | null; error: string } | null>(null);
  useEffect(() => {
    if (!refresh) return;
    const abort = new AbortController();
    getSharedCatalog(releaseParam ?? undefined).then(catalog => catalog.release_id).catch(() => null)
      .then(release => getTeamContracts(refresh, team, release, abort.signal))
      .then(value => { if (!abort.signal.aborted) setLoaded({ key, data: value, error: "" }); })
      .catch(err => { if (!abort.signal.aborted) setLoaded({ key, data: null, error: (err as Error).message }); });
    return () => abort.abort();
  }, [refresh, team, releaseParam, key]);
  const data = loaded?.key === key ? loaded.data : null;
  const error = loaded?.key === key ? loaded.error : "";
  const query = refresh ? `?refresh=${encodeURIComponent(refresh)}` : "";
  const failure = refreshError || error;
  const roster = data?.players.filter(p => p.on_index_roster) ?? [];
  const other = data?.players.filter(p => !p.on_index_roster) ?? [];
  const lines = thresholdLines(data?.context.thresholds ?? null);
  const known = dollars(data?.source_page_known_cents);
  const topPaid = roster.find(p => p.current_salary_cents !== null);
  const flow = data ? payrollFlow(data.players) : null;
  const sample = data ? `${data.roster_known_players} of ${data.roster_players} roster salaries known` : "Resolving";
  const switcher = <Field label="Team" layout="inline"><Select aria-label="Choose team" value={data?.team_tricode ?? team.toUpperCase()} onChange={e => router.push(`/contracts/${e.target.value}${query}`)}>
    {FINANCE_TEAMS.map(t => <option key={t.id} value={t.tricode}>{t.tricode} · {t.name}</option>)}
  </Select></Field>;
  return <PageShell template="profile" className="contracts-page">
    <PageHeader title="Contracts & Payroll" subtitle={data ? `${data.team_name} · ${data.context.label} · as of ${formatDate(data.context.observed_at)}` : "2026-27 · reported salaries"}
      actions={<>{switcher}<ButtonLink size="lg" href={`/contracts${query}`}>All teams</ButtonLink>{data && <DataDetailsButton rows={[...contextRows(data.context),
        { label: "Reference statistics release", value: data.statistics_release_id ?? "Unavailable", mono: true },
        { label: "Impact model", value: data.impact_version ?? "Unavailable" }]}>
        <Limitations items={data.limitations} />
        <p><Link href={`/contracts/books${query}`}>Retained source books (advanced)</Link></p>
      </DataDetailsButton>}</>} />
    {failure && <Failure error={failure} />}
    {!data && !failure && <Loading />}
    {data && <ProfileLayout headline={<ThresholdBar title="Cap utilization" source={SOURCE} sample={sample} value={known} maximum={Math.max(known ?? 0, ...lines.map(l => l.value)) * 1.08 || 1}
      thresholds={lines.map(l => ({ label: l.label, value: l.value }))} format={money} note="Known salaries only; official markers, not compliance" />} hero={<div className="contracts-hero">
      <TeamIdentity team={data.team_id} name={data.team_name} size="xl" subtitle={`${data.roster_players} players on the 2026-27 index roster`} />
      <div className="contracts-tiles">
        <StatTile size="lg" label="Known salary, 2026-27" value={money(known)} footnote="Reported base salaries; a lower bound" />
        <StatTile label="Roster salaries known" value={`${data.roster_known_players} / ${data.roster_players}`} footnote={`${data.roster_players - data.roster_known_players} unknown, never $0`} />
        <StatTile label="Highest reported salary" value={topPaid ? centsMoney(topPaid.current_salary_cents) : null} footnote={topPaid?.name} />
        <StatTile label="Known salary minus cap" value={known !== null && lines[0] ? `${known > lines[0].value ? "+" : ""}${money(known - lines[0].value)}` : null} footnote="Arithmetic on known salaries; not cap room" />
      </div>
    </div>}>
      {data.roster_known_players < data.roster_players && <GatedNote why={<Limitations items={data.limitations} />}>{data.roster_players - data.roster_known_players} roster salaries are unknown and excluded from every total and chart.</GatedNote>}
      <div className="contracts-grid">
        {flow && <Sankey title="Where the known salary goes" source={SOURCE} sample={sample} nodes={flow.nodes} links={flow.links} format={money} note="Top five known roster salaries named; Others grouped by first listed NBA position. Full roster and exact flows below." />}
        <div className="contracts-donuts">
          <Donut title="Known salary by position" source={SOURCE} sample={sample} items={positionDonut(data.players)} format={money} />
          <Donut title="High earners' share" source={SOURCE} sample={sample} items={earnerDonut(data.players)} format={money} />
        </div>
      </div>
      <TimelineGrid title="Contract timeline" source="Basketball-Reference contracts page" sample={`${timelineRows(data.players).length} source-listed players · ${data.seasons[0]} to ${data.seasons.at(-1)}`}
        periods={data.seasons} rows={timelineRows(data.players)} format={money} absent="not-listed"
        note="Options are reported markers; exercise and guarantee state are unknown" />
      <section aria-labelledby="contracts-roster-heading" className="contracts-section">
        <h2 id="contracts-roster-heading">Roster</h2>
        <RosterTable players={roster} reference={data.reference_season} query={query} />
      </section>
      {other.length > 0 && <section aria-labelledby="contracts-other-heading" className="contracts-section">
        <h2 id="contracts-other-heading">Also on {data.team_tricode}&apos;s source page</h2>
        <p className="chart-note">These players are on another team in the NBA index (for example after a waiver). Their {money(dollars(data.other_source_known_cents))} is included in the known salary above, as the source page lists it.</p>
        <ul className="contracts-other">{other.map(p => <li key={p.player_id}><Link href={`/players/${p.player_id}${query}`}>{p.name}</Link><span>{p.current_salary_cents === null ? "Blank on source page" : centsMoney(p.current_salary_cents)}</span></li>)}</ul>
      </section>}
      <p className="chart-provenance">Positions: {Object.values(POSITION_LABELS).join(", ")}. RAPM is the sealed {data.reference_season} regular-season estimate, descriptive only.</p>
    </ProfileLayout>}
  </PageShell>;
}
