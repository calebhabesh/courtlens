"use client";

import Link from "next/link";
import { useState, useTransition, useId } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "./ui/input";
import { Select } from "./ui/select";
import { Field } from "./ui/field";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { ContextBar } from "./context-bar";
import { TeamLogoStack } from "./team-logo";
import { SortHeader } from "./table-ui";
import { PercentileCell } from "./charts/percentile-cell";
import { TablePercentileLegend } from "./table-percentile-legend";
import { ALL_CATALOG_METRICS, NBA_TEAMS, formatColumnValue } from "@/lib/stats-presets";
import { buildPreservedContextUrl } from "@/lib/query-url";
import type { PlayerResearchResponse, WorkbenchCatalog } from "@/lib/types";

const COLUMNS = ["gp", "min_per_game", "pts_per_game", "reb_per_game", "ast_per_game", "ts_pct"];

export function PlayerDirectory({ data, catalog }: { data: PlayerResearchResponse; catalog: WorkbenchCatalog }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startNavigation] = useTransition();
  const name = params.get("name") ?? "";
  const [draft, setDraft] = useState({ name, value: name });
  const search = draft.name === name ? draft.value : name;
  function update(updates: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    next.delete("cursor");
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value); else next.delete(key);
    }
    startNavigation(() => router.push(`${pathname}?${next}`));
  }
  const query = data.query;
  const sort = (field: string) => update({ sortMetric: field, sortDirection: query.sort_metric === field ? query.sort_direction === "asc" ? "desc" : "asc" : field === "player_name" ? "asc" : "desc", sort_metric: null, sort_direction: null });
  return <section className="player-directory">
    <ContextBar catalog={catalog} initialReleaseId={query.release_id} initialSeason={query.season} initialPhase={query.phase} initialBeforeDate={query.before_date} initialWindow={query.window} sampleNoun="eligible players" sampleSize={data.total_eligible_players}
      detailRows={data.table_cohort ? [{ label: "Percentile reference", value: data.table_cohort.reference }, { label: "Percentile scope hash", value: data.table_cohort.scope_hash }] : []}
      filters={<DirectoryFilters search={search} team={query.team_id ?? ""} hasName={Boolean(name)}
        onSearchChange={value => setDraft({ name, value })} onSearch={() => update({ name: search.trim() })}
        onTeamChange={value => update({ teamId: value, team_id: null })} onClear={() => update({ name: null })} />} />
    <TablePercentileLegend cohort={data.table_cohort} />
    <div className="table-wrapper research-table-scroll" role="region" aria-label="Player directory scroll area" tabIndex={0} aria-busy={pending}>
      <table className="data-table percentile-table directory-table" aria-label="Player directory">
        <thead>
          <tr className="table-column-groups"><th scope="colgroup">Players</th><th scope="colgroup" colSpan={2}>Participation</th><th scope="colgroup" colSpan={3}>Production per game</th><th scope="colgroup">Shooting</th></tr>
          <tr><SortHeader label="Player" metric="player_name" active={query.sort_metric === "player_name"} direction={query.sort_direction === "asc" ? "asc" : "desc"} onSort={sort} />{COLUMNS.map(key => <SortHeader key={key} className="num" label={ALL_CATALOG_METRICS[key].label} metric={key} active={query.sort_metric === key} direction={query.sort_direction === "asc" ? "asc" : "desc"} onSort={sort} />)}</tr>
        </thead>
        <tbody>
          {pending ? Array.from({ length: data.items.length || 8 }, (_, index) => <tr key={index}>{Array.from({ length: 7 }, (_, column) => <td key={column}><Skeleton variant="text" width={column ? 60 : 160} /></td>)}</tr>) : data.items.length ? data.items.map(player => <tr key={player.player_id} data-player-id={player.player_id}>
            <th scope="row" className="directory-player"><div className="directory-identity"><TeamLogoStack teams={player.teams} /><div><Link href={buildPreservedContextUrl(`/players/${player.player_id}`, params)}>{player.player_name}</Link><small>{player.teams.join(" / ") || "Team unknown"}</small>{player.table_qualified === false && <span className="table-small-sample">Small sample</span>}</div></div></th>
            {COLUMNS.map(key => <td key={key} className="num"><PercentileCell compact value={player.metrics[key] == null ? null : formatColumnValue(ALL_CATALOG_METRICS[key], player)} percentile={player.table_percentiles?.[key] ?? null} qualified={player.table_qualified === true} label={ALL_CATALOG_METRICS[key].label} cohort={`${player.table_cohort_sample_sizes?.[key] ?? "Unknown"} valid league players; 500+ season minutes`} /></td>)}
          </tr>) : <tr><td colSpan={7}>No players match. <button className="button" onClick={() => update({ name: null, teamId: null, team_id: null })}>Clear filters</button></td></tr>}
        </tbody>
      </table>
    </div>
    {data.has_more && data.next_cursor && <Link className="button" href={`${pathname}?${new URLSearchParams({ ...Object.fromEntries(params), cursor: data.next_cursor })}`}>Next players</Link>}
  </section>;
}

function DirectoryFilters({ search, team, hasName, onSearchChange, onSearch, onTeamChange, onClear }: {
  search: string; team: string; hasName: boolean; onSearchChange: (value: string) => void;
  onSearch: () => void; onTeamChange: (value: string) => void; onClear: () => void;
}) {
  // The filter bar renders desktop controls and a phone sheet independently.
  const nameId = useId();
  return <form className="directory-filters" onSubmit={event => { event.preventDefault(); onSearch(); }}>
    <Field label="Find player" htmlFor={nameId} layout="inline"><Input id={nameId} type="search" value={search} placeholder="Name" onChange={event => onSearchChange(event.target.value)} /></Field>
    <Button type="submit" variant="secondary">Search</Button>
    <Field label="Team" layout="inline"><Select aria-label="Directory team" value={team} onChange={event => onTeamChange(event.target.value)}><option value="">All teams</option>{NBA_TEAMS.map(team => <option key={team.tricode} value={team.tricode}>{team.name}</option>)}</Select></Field>
    {hasName && <Button variant="ghost" onClick={onClear}>Clear search</Button>}
  </form>;
}
